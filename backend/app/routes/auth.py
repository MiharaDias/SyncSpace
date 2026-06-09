import re
import threading
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from app import supabase, limiter
from app.utils.auth_helpers import hash_password, check_password, get_current_user
from app.services.notifications import create_notification


def _bg_gcal_sync(user_id: str) -> None:
    """Background thread: sync Google Calendar events after login (fire-and-forget)."""
    try:
        from app.routes.calendar import sync_user_google_calendar
        sync_user_google_calendar(user_id)
    except Exception:
        pass

auth_bp = Blueprint("auth", __name__)

# FIX M2: Maximum field lengths
_MAX_FULL_NAME   = 100
_MAX_USERNAME    = 50
_MAX_EMAIL       = 254  # RFC 5321
_MAX_PASSWORD    = 128
_MAX_DEPARTMENT  = 100

# FIX M1: Password strength — minimum 8 chars, at least one letter and one digit
_PASSWORD_RE = re.compile(r'^(?=.*[A-Za-z])(?=.*\d).{8,}$')

# FIX C3: Fields that must never be sent to the browser
_SENSITIVE_FIELDS = {
    "password_hash",
    "google_access_token",
    "google_refresh_token",
    "google_token_expiry",
}


@auth_bp.route("/departments", methods=["GET"])
def public_departments():
    """Public endpoint — returns the current department list for sign-up forms."""
    from app.routes.admin import _get_departments
    return jsonify(_get_departments())


@auth_bp.route("/invite/<token>", methods=["GET"])
def get_invitation(token):
    """Validate an invitation token and return pre-fill data."""
    from datetime import datetime, timezone as tz
    from app.utils.auth_helpers import q_single
    inv = q_single(supabase.table("invitations").select("*").eq("token", token).eq("status", "pending"))
    if not inv:
        return jsonify({"error": "Invitation not found or already used"}), 404
    expires = inv.get("expires_at")
    if expires:
        # Parse and compare
        try:
            exp_dt = datetime.fromisoformat(expires.replace("Z", "+00:00"))
            if exp_dt < datetime.now(tz.utc):
                return jsonify({"error": "Invitation has expired"}), 410
        except Exception:
            pass
    # Build departments list — prefer the array column, fall back to single dept
    raw_depts = inv.get("departments") or []
    if not raw_depts and inv.get("department"):
        raw_depts = [inv["department"]]
    return jsonify({
        "email":       inv["email"],
        "role":        inv["role"],
        "department":  inv.get("department", ""),
        "departments": raw_depts,
    })


@auth_bp.route("/register", methods=["POST"])
@limiter.limit("10 per minute")          # FIX C4
def register():
    data = request.json or {}            # FIX M5: guard None

    # ── Invitation-based registration ─────────────────────────────────────────
    invitation_token = data.get("invitation_token")
    invitation = None
    if invitation_token:
        from datetime import datetime, timezone as tz
        from app.utils.auth_helpers import q_single as _qs
        invitation = _qs(
            supabase.table("invitations").select("*").eq("token", invitation_token).eq("status", "pending")
        )
        if not invitation:
            return jsonify({"error": "Invalid or expired invitation"}), 400
        expires = invitation.get("expires_at")
        if expires:
            try:
                exp_dt = datetime.fromisoformat(expires.replace("Z", "+00:00"))
                if exp_dt < datetime.now(tz.utc):
                    return jsonify({"error": "Invitation has expired"}), 410
            except Exception:
                pass
        # Override email and role from invitation (can't be spoofed)
        data["email"] = invitation["email"]
        data["role"]  = invitation["role"]
        if invitation.get("department") and not data.get("department"):
            data["department"] = invitation["department"]

    required = ["full_name", "username", "email", "password", "department"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"{field} is required"}), 400

    # FIX M2: Input length limits
    if len(data["full_name"]) > _MAX_FULL_NAME:
        return jsonify({"error": "full_name too long"}), 400
    if len(data["username"]) > _MAX_USERNAME:
        return jsonify({"error": "username too long"}), 400
    if len(data["email"]) > _MAX_EMAIL:
        return jsonify({"error": "email too long"}), 400
    if len(data["password"]) > _MAX_PASSWORD:
        return jsonify({"error": "password too long"}), 400
    if len(data["department"]) > _MAX_DEPARTMENT:
        return jsonify({"error": "department too long"}), 400

    # FIX M1: Password strength
    if not _PASSWORD_RE.match(data["password"]):
        return jsonify({
            "error": "Password must be at least 8 characters and contain at least one letter and one digit"
        }), 400

    # FIX H5: Users cannot self-assign privileged roles.
    # Accepted values from the form, but role is always forced to "user" unless first user.
    # Admins can elevate roles post-approval via /api/admin/users/<id>/role.
    requested_role = data.get("role", "user")
    if requested_role not in ["user", "manager", "administrator"]:
        return jsonify({"error": "Invalid role"}), 400

    # Check unique email/username
    existing_email = supabase.table("users").select("id").eq("email", data["email"].lower()).execute()
    if existing_email.data:
        return jsonify({"error": "Email already registered"}), 409

    existing_username = supabase.table("users").select("id").eq("username", data["username"]).execute()
    if existing_username.data:
        return jsonify({"error": "Username already taken"}), 409

    # First user becomes auto-approved admin
    all_users = supabase.table("users").select("id").execute()
    is_first_user = len(all_users.data) == 0

    # Invited users get the role from the invitation; first user is always admin.
    # All other self-registrations are forced to "user" (FIX H5).
    if is_first_user:
        assigned_role = "administrator"
    elif invitation:
        assigned_role = invitation["role"]
    else:
        assigned_role = "user"

    is_auto_approved = is_first_user or bool(invitation)

    departments = data.get("departments") or ([data["department"]] if data.get("department") else [])

    new_user = {
        "full_name":     data["full_name"].strip(),
        "username":      data["username"].strip(),
        "email":         data["email"].lower().strip(),
        "password_hash": hash_password(data["password"]),
        "department":    data["department"],
        "departments":   departments,
        "role":          assigned_role,
        "is_approved":   is_auto_approved,
    }

    result = supabase.table("users").insert(new_user).execute()
    user = result.data[0]

    if is_auto_approved:
        # Mark invitation as accepted
        if invitation:
            supabase.table("invitations").update({"status": "accepted"}).eq(
                "token", invitation_token).execute()

        token = create_access_token(identity=user["id"])
        msg = ("Account created and auto-approved as first administrator"
               if is_first_user else "Account created. You can sign in immediately.")
        return jsonify({"message": msg, "token": token, "user": _safe_user(user)}), 201

    # Notify admins of new registration
    admins = supabase.table("users").select("id").eq("role", "administrator").eq("is_approved", True).execute()
    for admin in admins.data:
        create_notification(
            user_id=admin["id"],
            type="user_registration",
            title="New User Registration",
            message=f"{data['full_name']} ({data['email']}) has registered and is awaiting approval.",
            reference_id=user["id"],
            reference_type="user"
        )

    return jsonify({
        "message": "Registration successful. Awaiting administrator approval.",
        "pending": True
    }), 201


@auth_bp.route("/login", methods=["POST"])
@limiter.limit("20 per minute")          # FIX C4: brute-force protection
def login():
    data = request.json or {}            # FIX M5
    if not data.get("email") or not data.get("password"):
        return jsonify({"error": "Email and password required"}), 400

    res = supabase.table("users").select("*").eq("email", data["email"].lower()).execute()

    # FIX M4: Always run bcrypt to avoid timing oracle revealing registered emails.
    # If user doesn't exist we check against a dummy hash — same wall-clock time.
    # A real bcrypt hash (cost 12) used as a timing-safe dummy when the email
    # does not exist in the DB — prevents revealing registered emails via timing.
    # Must be a valid 60-char bcrypt string; an invalid salt causes ValueError (500).
    _DUMMY_HASH = "$2b$12$.g8DSam6gUh5vR0TjRNRXubdP3Eb7URd.BZmmSV3kxeaqTxIw2UbC"
    user = res.data[0] if res.data else None

    # Google-only accounts have no password_hash (NULL in DB).
    # Calling check_password(pw, None) would crash with AttributeError, so intercept
    # early and return a helpful message instead of "Invalid credentials".
    if user and not user.get("password_hash"):
        return jsonify({
            "error": "This account was created with Google. Please sign in using the \"Continue with Google\" button.",
            "google_only": True,
        }), 401

    password_hash = user["password_hash"] if user else _DUMMY_HASH

    if not check_password(data["password"], password_hash) or not user:
        return jsonify({"error": "Invalid credentials"}), 401

    if not user["is_approved"]:
        return jsonify({"error": "Your account is pending administrator approval.", "pending": True}), 403

    if not user["is_active"]:
        return jsonify({"error": "Account has been deactivated"}), 403

    token = create_access_token(identity=user["id"])
    # Fire-and-forget: pull Google Calendar events into busy_slots so the
    # calendar page works without hitting the Google API on every render.
    threading.Thread(target=_bg_gcal_sync, args=(user["id"],), daemon=True).start()
    return jsonify({
        "token": token,
        "user": _safe_user(user)
    })


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user = get_current_user()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(_safe_user(user))


def _safe_user(user):
    """Return user dict with all sensitive fields removed."""
    # FIX C3: Strip password hash AND all OAuth token fields
    return {k: v for k, v in user.items() if k not in _SENSITIVE_FIELDS}
