import os
import secrets
import threading
from urllib.parse import urlencode
from flask import Blueprint, request, jsonify, redirect
from flask_jwt_extended import jwt_required, get_jwt_identity, create_access_token
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from datetime import datetime, timezone


def _bg_gcal_sync(user_id: str) -> None:
    try:
        from app.routes.calendar import sync_user_google_calendar
        sync_user_google_calendar(user_id)
    except Exception:
        pass

from app import supabase
from app.config import Config
from app.utils.auth_helpers import require_approved, q_single, hash_password

# Allow oauthlib to accept extra scopes Google may add (e.g. userinfo.profile
# is always returned when openid is requested, even if not explicitly listed).
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

google_oauth_bp = Blueprint("google_oauth", __name__)

SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",   # Google always returns this; request it explicitly
]

SIGNIN_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

# OAuth state store backed by the database so it survives container restarts
# and works correctly with multiple gunicorn workers.
# Keys are stored in system_settings as "oauth:{token}" with a 10-min TTL.

import time as _time
import json as _json

def _state_put(token: str, data: dict) -> None:
    """Persist OAuth state to DB with a 10-minute expiry."""
    data["_exp"] = _time.time() + 600
    from app import supabase as _sb
    _sb.table("system_settings").upsert(
        {"key": f"oauth:{token}", "value": _json.dumps(data)},
        on_conflict="key"
    ).execute()

def _state_pop(token: str) -> dict | None:
    """Retrieve and immediately delete OAuth state from DB. Returns None if missing or expired."""
    from app import supabase as _sb
    from app.utils.auth_helpers import q_single as _qs
    key = f"oauth:{token}"
    row = _qs(_sb.table("system_settings").select("value").eq("key", key))
    if not row:
        return None
    # Always delete — one-time use
    _sb.table("system_settings").delete().eq("key", key).execute()
    try:
        data = _json.loads(row["value"])
        if data.get("_exp", 0) < _time.time():
            return None
        data.pop("_exp", None)
        return data
    except Exception:
        return None


def _make_flow(state=None, scopes=None, redirect_uri=None):
    client_config = {
        "web": {
            "client_id": Config.GOOGLE_CLIENT_ID,
            "client_secret": Config.GOOGLE_CLIENT_SECRET,
            "redirect_uris": [Config.GOOGLE_REDIRECT_URI, Config.GOOGLE_SIGNIN_REDIRECT_URI],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }
    flow = Flow.from_client_config(
        client_config,
        scopes=scopes or SCOPES,
        redirect_uri=redirect_uri or Config.GOOGLE_REDIRECT_URI,
        state=state,
    )
    return flow


def _google_configured():
    return (Config.GOOGLE_CLIENT_ID
            and Config.GOOGLE_CLIENT_ID != "your_client_id_here.apps.googleusercontent.com"
            and Config.GOOGLE_CLIENT_SECRET)


# ── Google Sign In / Sign Up (no JWT required) ────────────────────────────────

@google_oauth_bp.route("/signin", methods=["GET"])
def google_signin():
    """Start Google sign-in/sign-up OAuth flow (no auth required)."""
    if not _google_configured():
        return jsonify({"error": "Google OAuth not configured"}), 503

    csrf_token = secrets.token_urlsafe(32)
    _state_put(csrf_token, {"type": "signin"})

    flow = _make_flow(scopes=SIGNIN_SCOPES, redirect_uri=Config.GOOGLE_SIGNIN_REDIRECT_URI)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        prompt="select_account",
        state=csrf_token,
    )
    return jsonify({"auth_url": auth_url})


@google_oauth_bp.route("/signin-callback", methods=["GET"])
def google_signin_callback():
    """Handle Google sign-in callback — creates or logs in a user."""
    code  = request.args.get("code")
    state = request.args.get("state")
    error = request.args.get("error")

    if error or not code or not state:
        return redirect(f"{Config.FRONTEND_URL}/login?google_error=access_denied")

    state_data = _state_pop(state)
    if not state_data or state_data.get("type") != "signin":
        return redirect(f"{Config.FRONTEND_URL}/login?google_error=invalid_state")

    try:
        flow = _make_flow(state=state, scopes=SIGNIN_SCOPES, redirect_uri=Config.GOOGLE_SIGNIN_REDIRECT_URI)
        flow.fetch_token(code=code)
        creds = flow.credentials

        svc = build("oauth2", "v2", credentials=creds)
        info = svc.userinfo().get().execute()
        google_id    = info.get("id", "")
        google_email = info.get("email", "").lower()
        google_name  = info.get("name", "")
        google_pic   = info.get("picture", "")

        # Find user by google_id first, then by email
        user = None
        by_gid = supabase.table("users").select("*").eq("google_id", google_id).execute()
        if by_gid.data:
            user = by_gid.data[0]
        else:
            by_email = supabase.table("users").select("*").eq("email", google_email).execute()
            if by_email.data:
                user = by_email.data[0]
                # Link google_id to existing account
                supabase.table("users").update({
                    "google_id": google_id,
                    "profile_picture": google_pic or user.get("profile_picture"),
                }).eq("id", user["id"]).execute()
                user["google_id"] = google_id

        if user:
            # Existing user — check status
            if not user.get("is_active"):
                return redirect(f"{Config.FRONTEND_URL}/login?google_error=account_deactivated")
            if not user.get("is_approved"):
                qs = urlencode({"google_error": "pending_approval"})
                return redirect(f"{Config.FRONTEND_URL}/login?{qs}")
            token = create_access_token(identity=user["id"])
            # Fire-and-forget Google Calendar sync on sign-in
            threading.Thread(target=_bg_gcal_sync, args=(user["id"],), daemon=True).start()
            qs = urlencode({"token": token})
            return redirect(f"{Config.FRONTEND_URL}/auth/google-callback?{qs}")
        else:
            # New user — need to complete profile (choose departments, etc.)
            # Store temp signup data in state store (short-lived)
            temp_token = secrets.token_urlsafe(32)
            _state_put(temp_token, {
                "type": "signup",
                "google_id": google_id,
                "email": google_email,
                "name": google_name,
                "picture": google_pic,
            })
            qs = urlencode({"temp": temp_token, "email": google_email, "name": google_name})
            return redirect(f"{Config.FRONTEND_URL}/google-signup?{qs}")

    except Exception as e:
        print(f"Google sign-in callback error: {e}")
        return redirect(f"{Config.FRONTEND_URL}/login?google_error=callback_failed")


@google_oauth_bp.route("/complete-signup", methods=["POST"])
def complete_google_signup():
    """Complete Google sign-up with department and role info."""
    data = request.json or {}
    temp_token = data.get("temp_token")
    if not temp_token:
        return jsonify({"error": "temp_token required"}), 400

    state_data = _state_pop(temp_token)
    if not state_data or state_data.get("type") != "signup":
        return jsonify({"error": "Invalid or expired token"}), 400

    google_id    = state_data["google_id"]
    google_email = state_data["email"]
    google_name  = state_data["name"]
    google_pic   = state_data["picture"]

    # ── Invitation token (pre-approved, role + departments come from invite) ──
    from datetime import datetime, timezone as _tz
    from app.utils.auth_helpers import q_single as _qs

    invitation_token = data.get("invitation_token")
    invitation = None
    if invitation_token:
        invitation = _qs(
            supabase.table("invitations").select("*")
                .eq("token", invitation_token)
                .eq("status", "pending")
        )
        if invitation:
            expires = invitation.get("expires_at")
            if expires:
                try:
                    exp_dt = datetime.fromisoformat(expires.replace("Z", "+00:00"))
                    if exp_dt < datetime.now(_tz.utc):
                        invitation = None   # treat expired as non-existent
                except Exception:
                    pass

    # Departments / role — invitation overrides form values
    if invitation:
        inv_depts = invitation.get("departments") or []
        if not inv_depts and invitation.get("department"):
            inv_depts = [invitation["department"]]
        departments = inv_depts or data.get("departments", [])
        final_role  = invitation["role"]
    else:
        departments = data.get("departments", [])
        final_role  = data.get("role", "user")

    if not departments:
        return jsonify({"error": "At least one department is required"}), 400

    # ── Optional password (lets user also log in with email + password) ────────
    import re as _re
    _PW_RE = _re.compile(r'^(?=.*[A-Za-z])(?=.*\d).{8,}$')
    raw_password = data.get("password", "").strip()
    if raw_password:
        if not _PW_RE.match(raw_password):
            return jsonify({"error": "Password must be at least 8 characters and contain at least one letter and one number"}), 400
        pw_hash = hash_password(raw_password)
    else:
        pw_hash = None  # Google-only account

    # Check if email was registered between flow start and now
    existing = supabase.table("users").select("*").eq("email", google_email).execute()
    if existing.data:
        user = existing.data[0]
        supabase.table("users").update({"google_id": google_id,
                                        "profile_picture": google_pic}).eq("id", user["id"]).execute()
        if not user.get("is_approved") or not user.get("is_active"):
            return jsonify({"error": "Account not approved or deactivated"}), 403
        # If user used an invite link and got here, mark the invite used
        if invitation:
            supabase.table("invitations").update({"status": "used"}).eq("id", invitation["id"]).execute()
        token = create_access_token(identity=user["id"])
        threading.Thread(target=_bg_gcal_sync, args=(user["id"],), daemon=True).start()
        return jsonify({"token": token, "user": _safe_user(user)})

    # Check if first user
    all_users = supabase.table("users").select("id").execute()
    is_first = len(all_users.data) == 0

    # Generate a unique username from Google name
    base = google_name.lower().replace(" ", "").strip() or google_email.split("@")[0]
    username = base
    counter = 1
    while True:
        existing_uname = supabase.table("users").select("id").eq("username", username).execute()
        if not existing_uname.data:
            break
        username = f"{base}{counter}"
        counter += 1

    new_user = {
        "full_name":    google_name or google_email.split("@")[0],
        "username":     username,
        "email":        google_email,
        "password_hash": pw_hash,
        "department":   departments[0],
        "departments":  departments,
        "role":         "administrator" if is_first else final_role,
        "is_approved":  is_first or bool(invitation),  # invited users are pre-approved
        "google_id":    google_id,
        "profile_picture": google_pic,
    }

    result = supabase.table("users").insert(new_user).execute()
    user = result.data[0]

    # Mark invitation as used after successful account creation
    if invitation:
        supabase.table("invitations").update({"status": "used"}).eq("id", invitation["id"]).execute()

    # Invited users and the first user get an immediate JWT (pre-approved)
    if is_first or invitation:
        token = create_access_token(identity=user["id"])
        threading.Thread(target=_bg_gcal_sync, args=(user["id"],), daemon=True).start()
        return jsonify({"token": token, "user": _safe_user(user), "is_first": is_first})

    # Regular sign-up (no invite) → pending approval
    from app.services.notifications import create_notification
    admins = supabase.table("users").select("id").eq("role", "administrator").eq("is_approved", True).execute()
    for admin in admins.data:
        create_notification(admin["id"], "user_registration", "New User Registration",
            f"{google_name} ({google_email}) registered via Google and awaits approval.",
            user["id"], "user")

    return jsonify({"pending": True, "message": "Account created and awaiting administrator approval."})


def _safe_user(user: dict) -> dict:
    skip = {"password_hash", "google_access_token", "google_refresh_token", "google_token_expiry"}
    return {k: v for k, v in user.items() if k not in skip}


# ── Google Calendar Connect (per-user, requires auth) ────────────────────────

@google_oauth_bp.route("/connect", methods=["GET"])
@jwt_required()
@require_approved()
def connect_google():
    """Start OAuth flow — returns the Google auth URL."""
    user_id = get_jwt_identity()

    if not _google_configured():
        return jsonify({"error": "Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env"}), 503

    # FIX C2: Use a random, unpredictable state token instead of exposing user_id.
    csrf_token = secrets.token_urlsafe(32)
    _state_put(csrf_token, {"type": "calendar", "user_id": user_id})

    flow = _make_flow()
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=csrf_token,    # random, not user_id
    )
    return jsonify({"auth_url": auth_url})


@google_oauth_bp.route("/callback", methods=["GET"])
def google_callback():
    """Handle Google OAuth callback, store tokens, redirect to frontend."""
    code  = request.args.get("code")
    state = request.args.get("state")   # our random CSRF token
    error = request.args.get("error")

    if error or not code or not state:
        return redirect(f"{Config.FRONTEND_URL}/settings?google_error=access_denied")

    # FIX C2: Validate the state token — reject requests we never issued
    state_data = _state_pop(state)
    if not state_data or state_data.get("type") != "calendar":
        return redirect(f"{Config.FRONTEND_URL}/settings?google_error=invalid_state")
    user_id = state_data["user_id"]

    try:
        flow = _make_flow(state=state)
        flow.fetch_token(code=code)
        creds = flow.credentials

        # Get connected Google account email
        user_info_service = build("oauth2", "v2", credentials=creds)
        user_info = user_info_service.userinfo().get().execute()
        google_email = user_info.get("email", "")

        # Store tokens in DB — keyed by the verified user_id, not the state param
        expiry_iso = creds.expiry.replace(tzinfo=timezone.utc).isoformat() if creds.expiry else None
        supabase.table("users").update({
            "google_access_token": creds.token,
            "google_refresh_token": creds.refresh_token,
            "google_token_expiry": expiry_iso,
            "google_email": google_email,
            "google_connected": True,
        }).eq("id", user_id).execute()

        # FIX H8: URL-encode the google_email to prevent parameter injection
        qs = urlencode({"google_connected": "true", "google_email": google_email})
        return redirect(f"{Config.FRONTEND_URL}/settings?{qs}")

    except Exception as e:
        print(f"Google OAuth callback error: {e}")
        return redirect(f"{Config.FRONTEND_URL}/settings?google_error=callback_failed")


@google_oauth_bp.route("/disconnect", methods=["POST"])
@jwt_required()
@require_approved()
def disconnect_google():
    """Revoke tokens and disconnect Google Calendar."""
    user_id = get_jwt_identity()
    supabase.table("users").update({
        "google_access_token": None,
        "google_refresh_token": None,
        "google_token_expiry": None,
        "google_email": None,
        "google_connected": False,
    }).eq("id", user_id).execute()
    return jsonify({"message": "Google Calendar disconnected"})


@google_oauth_bp.route("/status", methods=["GET"])
@jwt_required()
@require_approved()
def google_status():
    """Check if current user has Google Calendar connected."""
    user_id = get_jwt_identity()
    res = q_single(supabase.table("users").select(
        "google_connected,google_email"
    ).eq("id", user_id))
    return jsonify(res or {"google_connected": False, "google_email": None})


def get_user_calendar_service(user_id: str):
    """Get a Google Calendar service for a specific user using their stored tokens."""
    data = q_single(supabase.table("users").select(
        "google_access_token,google_refresh_token,google_token_expiry,google_connected"
    ).eq("id", user_id))

    if not data or not data.get("google_connected"):
        return None
    try:
        creds = Credentials(
            token=data["google_access_token"],
            refresh_token=data["google_refresh_token"],
            token_uri="https://oauth2.googleapis.com/token",
            client_id=Config.GOOGLE_CLIENT_ID,
            client_secret=Config.GOOGLE_CLIENT_SECRET,
            scopes=SCOPES,
        )

        # Refresh if expired
        if creds.expired and creds.refresh_token:
            creds.refresh(GoogleRequest())
            expiry_iso = creds.expiry.replace(tzinfo=timezone.utc).isoformat() if creds.expiry else None
            supabase.table("users").update({
                "google_access_token": creds.token,
                "google_token_expiry": expiry_iso,
            }).eq("id", user_id).execute()

        return build("calendar", "v3", credentials=creds)
    except Exception as e:
        print(f"Error getting calendar service for user {user_id}: {e}")
        return None


def create_event_for_user(user_id: str, meeting_data: dict, attendee_emails: list):
    """Create a Google Calendar event in the user's own calendar."""
    service = get_user_calendar_service(user_id)
    if not service:
        return None
    try:
        event = {
            "summary": f"{meeting_data['title']} (SyncSpace)",
            "description": meeting_data.get("purpose", ""),
            "location": meeting_data.get("location", ""),
            "start": {"dateTime": meeting_data["start_time"], "timeZone": "Asia/Kolkata"},
            "end": {"dateTime": meeting_data["end_time"], "timeZone": "Asia/Kolkata"},
            "attendees": [{"email": e} for e in attendee_emails],
            "sendUpdates": "all",
        }
        result = service.events().insert(calendarId="primary", body=event, sendNotifications=True).execute()
        return result.get("id")
    except Exception as e:
        print(f"Error creating event for user {user_id}: {e}")
        return None
