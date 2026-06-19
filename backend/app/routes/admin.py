import json
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import supabase
from app.utils.auth_helpers import require_roles, q_single, get_current_user
from app.services.notifications import create_notification
from app.services.google_calendar import cancel_google_event

admin_bp = Blueprint("admin", __name__)


# ── Generic system_settings helper ────────────────────────────────────────────

def _save_setting(key: str, value: str) -> None:
    existing = q_single(supabase.table("system_settings").select("key").eq("key", key))
    if existing:
        supabase.table("system_settings").update({"value": value}).eq("key", key).execute()
    else:
        supabase.table("system_settings").insert({"key": key, "value": value}).execute()

_DEFAULT_DEPARTMENTS = [
    'Engineering', 'Product', 'Design', 'Marketing', 'Sales', 'Finance',
    'HR', 'Operations', 'Legal', 'Customer Success', 'Executive',
]


def _get_departments() -> list:
    row = q_single(supabase.table("system_settings").select("value").eq("key", "departments"))
    if row and row.get("value"):
        try:
            return json.loads(row["value"])
        except Exception:
            pass
    # No DB row yet — seed defaults so departments are always DB-managed
    _save_departments(list(_DEFAULT_DEPARTMENTS))
    return list(_DEFAULT_DEPARTMENTS)


def _save_departments(depts: list) -> None:
    existing = q_single(supabase.table("system_settings").select("key").eq("key", "departments"))
    payload = {"key": "departments", "value": json.dumps(depts)}
    if existing:
        supabase.table("system_settings").update({"value": json.dumps(depts)}).eq("key", "departments").execute()
    else:
        supabase.table("system_settings").insert(payload).execute()


# ── Department management ──────────────────────────────────────────────────────

@admin_bp.route("/departments", methods=["GET"])
@jwt_required()
@require_roles("administrator")
def get_departments():
    return jsonify(_get_departments())


@admin_bp.route("/departments", methods=["POST"])
@jwt_required()
@require_roles("administrator")
def add_department():
    data = request.json or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400
    depts = _get_departments()
    if name in depts:
        return jsonify({"error": "Department already exists"}), 409
    depts.append(name)
    _save_departments(depts)
    return jsonify({"departments": depts}), 201


@admin_bp.route("/departments/<name>", methods=["DELETE"])
@jwt_required()
@require_roles("administrator")
def remove_department(name):
    depts = _get_departments()
    if name not in depts:
        return jsonify({"error": "Department not found"}), 404

    depts = [d for d in depts if d != name]
    _save_departments(depts)

    # For users whose departments array becomes empty after removal → clear their department
    users_res = supabase.table("users").select("id,department,departments").execute().data or []
    for u in users_res:
        user_depts = u.get("departments") or []
        if not user_depts and u.get("department"):
            user_depts = [u["department"]]
        new_depts = [d for d in user_depts if d != name]
        new_primary = new_depts[0] if new_depts else u.get("department", "")
        if new_depts != user_depts:
            supabase.table("users").update({
                "departments": new_depts,
                "department": new_primary,
            }).eq("id", u["id"]).execute()

    return jsonify({"departments": depts})


# ── Pending / approve / reject ────────────────────────────────────────────────

@admin_bp.route("/pending-users", methods=["GET"])
@jwt_required()
@require_roles("administrator")
def pending_users():
    result = supabase.table("users").select(
        "id,full_name,username,email,department,departments,role,created_at"
    ).eq("is_approved", False).eq("is_active", True).execute()
    return jsonify(result.data)


@admin_bp.route("/approve-user/<user_id>", methods=["POST"])
@jwt_required()
@require_roles("administrator")
def approve_user(user_id):
    res = q_single(supabase.table("users").select("id,full_name,email").eq("id", user_id))
    if not res:
        return jsonify({"error": "User not found"}), 404

    data = request.json or {}
    update = {"is_approved": True}
    # Allow admin to override role and departments before approving
    if data.get("role") in ("user", "manager", "administrator"):
        update["role"] = data["role"]
    if isinstance(data.get("departments"), list) and data["departments"]:
        update["departments"] = data["departments"]
        update["department"] = data["departments"][0]

    supabase.table("users").update(update).eq("id", user_id).execute()

    create_notification(
        user_id, "approval_status",
        "Account Approved",
        "Your SyncSpace account has been approved. You can now log in.",
        user_id, "user"
    )

    return jsonify({"message": "User approved"})


@admin_bp.route("/reject-user/<user_id>", methods=["POST"])
@jwt_required()
@require_roles("administrator")
def reject_user(user_id):
    supabase.table("users").update({"is_active": False}).eq("id", user_id).execute()
    return jsonify({"message": "User rejected"})


# ── Users ─────────────────────────────────────────────────────────────────────

@admin_bp.route("/users", methods=["GET"])
@jwt_required()
@require_roles("administrator")
def all_users():
    result = supabase.table("users").select(
        "id,full_name,username,email,department,departments,role,is_approved,is_active,created_at"
    ).execute()
    return jsonify(result.data)


@admin_bp.route("/users/<user_id>", methods=["GET"])
@jwt_required()
@require_roles("administrator")
def get_user_detail(user_id):
    user = q_single(supabase.table("users").select(
        "id,full_name,username,email,department,departments,role,is_approved,is_active,created_at"
    ).eq("id", user_id))
    if not user:
        return jsonify({"error": "User not found"}), 404

    # All tasks assigned to user (stats + list)
    all_tasks = supabase.table("tasks").select(
        "id,title,status,priority,due_date,completed_at,time_spent_minutes,project:project_id(id,name)"
    ).eq("assigned_to", user_id).order("created_at", desc=True).execute().data or []
    completed = [t for t in all_tasks if t.get("completed_at")]
    now_str = __import__("datetime").date.today().isoformat()
    overdue = [t for t in all_tasks if t.get("due_date") and t.get("due_date", "")[:10] < now_str
               and t.get("status", "").lower() not in ("completed", "done", "cancelled")]

    # Projects user is a member of
    user_projects = []
    try:
        pm_res = supabase.table("project_members").select(
            "role, project:project_id(id,name,status,progress,total_tasks,completed_tasks)"
        ).eq("user_id", user_id).execute().data or []
        user_projects = [
            {**pm["project"], "member_role": pm["role"]}
            for pm in pm_res if pm.get("project")
        ]
    except Exception:
        pass

    # Audit log unique to this user (all entries)
    audit_log = []
    try:
        audit_log = supabase.table("task_audit_log").select(
            "*, task:task_id(title)"
        ).eq("user_id", user_id).order("created_at", desc=True).limit(100).execute().data or []
    except Exception:
        pass

    user["task_stats"] = {
        "total": len(all_tasks),
        "completed": len(completed),
        "overdue": len(overdue),
        "total_hours": round(sum(t.get("time_spent_minutes") or 0 for t in completed) / 60, 1),
    }
    user["assigned_tasks"] = all_tasks[:30]
    user["projects"] = user_projects
    user["audit_log"] = audit_log
    return jsonify(user)


@admin_bp.route("/users/<user_id>", methods=["PUT"])
@jwt_required()
@require_roles("administrator")
def update_user(user_id):
    caller_id = get_jwt_identity()
    data = request.json or {}
    update: dict = {}

    if "role" in data:
        if data["role"] not in ("user", "manager", "administrator"):
            return jsonify({"error": "Invalid role"}), 400
        update["role"] = data["role"]

    if "departments" in data:
        depts = data["departments"]
        if not isinstance(depts, list):
            return jsonify({"error": "departments must be a list"}), 400
        update["departments"] = depts
        update["department"] = depts[0] if depts else ""

    if "is_active" in data:
        if not isinstance(data["is_active"], bool):
            return jsonify({"error": "is_active must be a boolean"}), 400
        if not data["is_active"] and caller_id == user_id:
            return jsonify({"error": "Cannot deactivate your own account"}), 400
        update["is_active"] = data["is_active"]

    if not update:
        return jsonify({"error": "Nothing to update"}), 400

    supabase.table("users").update(update).eq("id", user_id).execute()

    # Log admin action in task_audit_log as a user-level audit entry
    try:
        changes = []
        if "role" in update:
            changes.append(f"role → {update['role']}")
        if "departments" in update:
            changes.append(f"departments → {', '.join(update['departments'])}")
        if "is_active" in update:
            changes.append("deactivated" if not update["is_active"] else "activated")
        supabase.table("task_audit_log").insert({
            "user_id": user_id,
            "action": "admin_updated",
            "new_value": "; ".join(changes),
            "old_value": f"by admin {caller_id[:8]}",
        }).execute()
    except Exception:
        pass

    return jsonify({"message": "User updated"})


@admin_bp.route("/users/<user_id>/role", methods=["PUT"])
@jwt_required()
@require_roles("administrator")
def update_role(user_id):
    data = request.json or {}
    role = data.get("role")
    if role not in ["user", "manager", "administrator"]:
        return jsonify({"error": "Invalid role"}), 400
    supabase.table("users").update({"role": role}).eq("id", user_id).execute()
    return jsonify({"message": "Role updated"})


@admin_bp.route("/users/<user_id>/deactivate", methods=["POST"])
@jwt_required()
@require_roles("administrator")
def deactivate_user(user_id):
    caller_id = get_jwt_identity()
    if caller_id == user_id:
        return jsonify({"error": "Cannot deactivate your own account"}), 400
    supabase.table("users").update({"is_active": False}).eq("id", user_id).execute()
    return jsonify({"message": "User deactivated"})


@admin_bp.route("/users/<user_id>/activate", methods=["POST"])
@jwt_required()
@require_roles("administrator")
def activate_user(user_id):
    supabase.table("users").update({"is_active": True}).eq("id", user_id).execute()
    return jsonify({"message": "User activated"})


# ── Invitations ───────────────────────────────────────────────────────────────

@admin_bp.route("/invite", methods=["POST"])
@jwt_required()
@require_roles("administrator")
def invite_user():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    role = data.get("role", "user")
    departments = data.get("departments") or []
    department = departments[0] if departments else data.get("department", "")

    if not email:
        return jsonify({"error": "email required"}), 400
    if role not in ["user", "manager", "administrator"]:
        return jsonify({"error": "Invalid role"}), 400

    # Check if email is already registered
    existing = supabase.table("users").select("id").eq("email", email).execute()
    if existing.data:
        return jsonify({"error": "This email is already registered"}), 409

    # Cancel any prior pending invitations for this email
    supabase.table("invitations").update({"status": "cancelled"}).eq(
        "email", email).eq("status", "pending").execute()

    caller_id = get_jwt_identity()
    # Try inserting with the departments array column (requires migrations_v3.sql section 7).
    # Fall back to single-department insert if the column doesn't exist yet.
    try:
        inv_res = supabase.table("invitations").insert({
            "email":       email,
            "invited_by":  caller_id,
            "role":        role,
            "department":  department,
            "departments": departments,
            "status":      "pending",
        }).execute()
    except Exception as _e:
        if "departments" in str(_e):
            # Column not yet migrated — insert without it
            inv_res = supabase.table("invitations").insert({
                "email":      email,
                "invited_by": caller_id,
                "role":       role,
                "department": department,
                "status":     "pending",
            }).execute()
        else:
            raise

    token = inv_res.data[0]["token"]

    # Derive invite URL (use stored frontend_url, fall back to request origin)
    from app.services.email import send_invitation_email, get_email_config, is_email_configured
    cfg = get_email_config()
    origin = (cfg.get("frontend_url") or request.headers.get("Origin", "http://localhost:5173")).rstrip("/")
    invite_url = f"{origin}/invite/{token}"

    # Get caller name for the email
    caller = get_current_user()
    caller_name = (caller or {}).get("full_name", "A SyncSpace administrator")

    # Always log to console (fallback / audit trail)
    print(f"\n[INVITATION] To: {email} | Role: {role} | Dept: {department}")
    print(f"[INVITATION] Link: {invite_url}\n")

    # Attempt to send real email
    email_sent = False
    email_error = ""
    if is_email_configured():
        email_sent, email_error = send_invitation_email(
            to_email=email,
            invite_token=token,
            invited_by_name=caller_name,
            role=role,
            department=department,
        )
        if not email_sent:
            print(f"[INVITATION] Email send failed: {email_error}")

    return jsonify({
        "message": "Invitation created" + (" and email sent" if email_sent else " (link logged to console)"),
        "token": token,
        "invite_url": invite_url,
        "email_sent": email_sent,
        "email_error": email_error if not email_sent else None,
    }), 201


@admin_bp.route("/invitations", methods=["GET"])
@jwt_required()
@require_roles("administrator")
def list_invitations():
    result = supabase.table("invitations").select(
        "*, invited_by_user:invited_by(full_name,email)"
    ).order("created_at", desc=True).limit(100).execute()
    return jsonify(result.data)


@admin_bp.route("/invitations/<inv_id>", methods=["DELETE"])
@jwt_required()
@require_roles("administrator")
def cancel_invitation(inv_id):
    supabase.table("invitations").update({"status": "cancelled"}).eq("id", inv_id).execute()
    return jsonify({"message": "Invitation cancelled"})


# ── Meetings ──────────────────────────────────────────────────────────────────

@admin_bp.route("/meetings", methods=["GET"])
@jwt_required()
@require_roles("administrator")
def all_meetings():
    result = supabase.table("meetings").select(
        "*, organizer:organizer_id(id,full_name,email)"
    ).order("start_time", desc=True).limit(100).execute()
    return jsonify(result.data)


@admin_bp.route("/meetings/<meeting_id>", methods=["DELETE"])
@jwt_required()
@require_roles("administrator")
def admin_cancel_meeting(meeting_id):
    from flask_jwt_extended import get_jwt_identity
    admin_id = get_jwt_identity()

    meeting = q_single(supabase.table("meetings").select("*").eq("id", meeting_id))
    if not meeting:
        return jsonify({"error": "Meeting not found"}), 404
    supabase.table("meetings").update({"status": "cancelled"}).eq("id", meeting_id).execute()

    att_res = supabase.table("meeting_attendees").select("user_id").eq("meeting_id", meeting_id).execute()
    for att in att_res.data:
        create_notification(att["user_id"], "meeting_cancelled",
            "Meeting Cancelled by Admin",
            f"The meeting '{meeting['title']}' has been cancelled by an administrator.",
            meeting_id, "meeting")

    if meeting.get("google_event_id"):
        cancel_google_event(meeting["google_event_id"])

    try:
        supabase.table("meeting_audit_log").insert({
            "meeting_id": meeting_id, "user_id": admin_id,
            "action": "cancelled_by_admin", "details": "Cancelled by administrator"
        }).execute()
    except Exception:
        pass

    return jsonify({"message": "Meeting cancelled by admin"})


# ── Email Configuration ───────────────────────────────────────────────────────

@admin_bp.route("/email-config", methods=["GET"])
@jwt_required()
@require_roles("administrator")
def get_email_config_route():
    from app.services.email import get_email_config
    cfg = get_email_config()
    return jsonify({
        "smtp_email":   cfg.get("smtp_email", ""),
        "frontend_url": cfg.get("frontend_url", ""),
        # Never return the password — only indicate whether it is set
        "has_password": bool(cfg.get("smtp_app_password")),
        "configured":   bool(cfg.get("smtp_email") and cfg.get("smtp_app_password")),
    })


@admin_bp.route("/email-config", methods=["POST"])
@jwt_required()
@require_roles("administrator")
def set_email_config_route():
    data = request.json or {}
    smtp_email    = (data.get("smtp_email")        or "").strip()
    # Google shows App Passwords as "xxxx xxxx xxxx xxxx" — strip ALL spaces
    smtp_password = (data.get("smtp_app_password") or "").replace(" ", "").strip()
    frontend_url  = (data.get("frontend_url")      or "").strip()

    if smtp_email:
        _save_setting("smtp_email", smtp_email)
    if smtp_password:
        _save_setting("smtp_app_password", smtp_password)
    if frontend_url:
        _save_setting("frontend_url", frontend_url.rstrip("/"))

    return jsonify({"message": "Email settings saved"})


@admin_bp.route("/email-config/test", methods=["POST"])
@jwt_required()
@require_roles("administrator")
def test_email_route():
    caller = get_current_user()
    if not caller:
        return jsonify({"error": "User not found"}), 404

    from app.services.email import send_email
    ok, err = send_email(
        caller["email"],
        "SyncSpace — Email Configuration Test",
        """<div style="font-family:sans-serif;background:#070d1a;color:#e2e8f0;
                       padding:32px;border-radius:12px;max-width:480px;">
             <h2 style="color:#3b82f6;margin:0 0 12px">✓ It works!</h2>
             <p style="color:#94a3b8;margin:0">
               Your SyncSpace email configuration is working correctly.
               Invitations will now be delivered to recipients.
             </p>
           </div>""",
    )
    if ok:
        return jsonify({"message": f"Test email sent to {caller['email']}"})
    return jsonify({"error": err}), 500


# ── Activity Logs ─────────────────────────────────────────────────────────────

@admin_bp.route("/activity-logs", methods=["GET"])
@jwt_required()
@require_roles("administrator")
def activity_logs():
    try:
        meeting_logs = supabase.table("meeting_audit_log").select(
            "*, user:user_id(full_name), meeting:meeting_id(title)"
        ).order("created_at", desc=True).limit(50).execute().data or []
    except Exception:
        meeting_logs = []

    try:
        task_logs = supabase.table("task_audit_log").select(
            "*, user:user_id(full_name), task:task_id(title)"
        ).order("created_at", desc=True).limit(50).execute().data or []
    except Exception:
        task_logs = []

    return jsonify({"meeting_logs": meeting_logs, "task_logs": task_logs})


# ── Stats ──────────────────────────────────────────────────────────────────────

@admin_bp.route("/stats", methods=["GET"])
@jwt_required()
@require_roles("administrator")
def system_stats():
    all_users_res      = supabase.table("users").select("id,is_approved,is_active", count="exact").execute()
    all_meetings_res   = supabase.table("meetings").select("id,status", count="exact").execute()
    all_tasks_res      = supabase.table("tasks").select("id,status", count="exact").execute()

    users_data    = all_users_res.data or []
    meetings_data = all_meetings_res.data or []
    tasks_data    = all_tasks_res.data or []

    return jsonify({
        "total_users":       len(users_data),
        "pending_approvals": sum(1 for u in users_data if not u.get("is_approved")),
        "active_meetings":   sum(1 for m in meetings_data if m.get("status") == "active"),
        "total_tasks":       len(tasks_data),
        "completed_tasks":   sum(1 for t in tasks_data if t.get("status") == "done"),
    })
