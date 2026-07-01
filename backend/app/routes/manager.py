from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import supabase
from app.utils.auth_helpers import require_roles, get_current_user, q_single

manager_bp = Blueprint("manager", __name__)


@manager_bp.route("/team-calendar", methods=["GET"])
@jwt_required()
@require_roles("manager", "administrator")
def team_calendar():
    current_user = get_current_user()
    user_ids = request.args.getlist("user_ids")
    start = request.args.get("start")
    end = request.args.get("end")

    if not user_ids:
        return jsonify({"error": "user_ids required"}), 400

    # FIX H3: Managers can only view their own department's users.
    # Administrators have no restriction.
    if current_user["role"] == "manager":
        dept = current_user.get("department")
        dept_user_res = supabase.table("users").select("id").eq("department", dept).execute()
        allowed_ids = {u["id"] for u in dept_user_res.data}
        user_ids = [uid for uid in user_ids if uid in allowed_ids]
        if not user_ids:
            return jsonify([])

    all_events = []

    for uid in user_ids:
        # Get user info
        user_info = q_single(supabase.table("users").select("id,full_name,department").eq("id", uid))
        if not user_info:
            continue

        # Get meetings
        org_q = supabase.table("meetings").select("*").eq("organizer_id", uid).eq("status", "active")
        if start:
            org_q = org_q.gte("start_time", start)
        if end:
            org_q = org_q.lte("start_time", end)
        org_meetings = org_q.execute().data

        att_res = supabase.table("meeting_attendees").select("meeting_id, attendance_type, response_status").eq("user_id", uid).execute()
        att_ids = [a["meeting_id"] for a in att_res.data]
        att_map = {a["meeting_id"]: a for a in att_res.data}

        att_meetings = []
        if att_ids:
            att_q = supabase.table("meetings").select("*").in_("id", att_ids).eq("status", "active").neq("organizer_id", uid)
            if start:
                att_q = att_q.gte("start_time", start)
            if end:
                att_q = att_q.lte("start_time", end)
            att_meetings = att_q.execute().data

        for m in org_meetings + att_meetings:
            att_info = att_map.get(m["id"], {})
            all_events.append({
                "id": f"{uid}-{m['id']}",
                "meeting_id": m["id"],
                "user_id": uid,
                "user_name": user_info["full_name"],
                "type": "meeting",
                "title": m["title"],
                "start": m["start_time"],
                "end": m["end_time"],
                "response_status": att_info.get("response_status", "accepted"),
            })

        # Busy slots
        busy_q = supabase.table("busy_slots").select("*").eq("user_id", uid)
        if start:
            busy_q = busy_q.gte("start_time", start)
        if end:
            busy_q = busy_q.lte("start_time", end)
        busy = busy_q.execute().data

        for b in busy:
            all_events.append({
                "id": f"{uid}-busy-{b['id']}",
                "user_id": uid,
                "user_name": user_info["full_name"],
                "type": "busy",
                "title": b.get("reason", "Busy"),
                "start": b["start_time"],
                "end": b["end_time"],
            })

    return jsonify(all_events)


@manager_bp.route("/sync-user", methods=["POST"])
@jwt_required()
@require_roles("manager", "administrator")
def sync_team_user():
    from app.routes.calendar import sync_user_google_calendar
    current = get_current_user()
    data = request.get_json() or {}
    target_id = data.get("user_id")
    if not target_id:
        return jsonify({"error": "user_id required"}), 400

    if current["role"] == "manager":
        dept = current.get("department")
        user_row = q_single(supabase.table("users").select("department").eq("id", target_id))
        if not user_row or user_row.get("department") != dept:
            return jsonify({"error": "Not authorised"}), 403

    count = sync_user_google_calendar(target_id, force=False)
    return jsonify({"synced": count, "cached": count == -1})


@manager_bp.route("/department-users", methods=["GET"])
@jwt_required()
@require_roles("manager", "administrator")
def department_users():
    user = get_current_user()
    # FIX H3: Managers can only query their own department
    if user["role"] == "manager":
        dept = user.get("department")
    else:
        dept = request.args.get("department", user.get("department"))

    result = supabase.table("users").select(
        "id,full_name,email,department,role"
    ).eq("department", dept).eq("is_approved", True).eq("is_active", True).execute()
    return jsonify(result.data)


@manager_bp.route("/meeting-stats", methods=["GET"])
@jwt_required()
@require_roles("manager", "administrator")
def meeting_stats():
    user = get_current_user()
    # FIX H3: Managers can only view their own department's stats
    if user["role"] == "manager":
        dept = user.get("department")
    else:
        dept = request.args.get("department", user.get("department"))

    dept_users = supabase.table("users").select("id,full_name").eq(
        "department", dept
    ).eq("is_approved", True).execute().data
    dept_ids = [u["id"] for u in dept_users]

    stats = []
    for u in dept_users:
        att_res = supabase.table("meeting_attendees").select(
            "response_status, attendance_type"
        ).eq("user_id", u["id"]).execute().data

        total = len(att_res)
        accepted = sum(1 for a in att_res if a["response_status"] == "accepted")
        rejected = sum(1 for a in att_res if a["response_status"] == "rejected")
        pending = sum(1 for a in att_res if a["response_status"] == "pending")

        stats.append({
            "user": u,
            "total_invitations": total,
            "accepted": accepted,
            "rejected": rejected,
            "pending": pending,
            "rejection_rate": round(rejected / total * 100, 1) if total > 0 else 0
        })

    # Sort by rejection rate descending
    stats.sort(key=lambda x: x["rejection_rate"], reverse=True)
    return jsonify(stats)


@manager_bp.route("/task-overview", methods=["GET"])
@jwt_required()
@require_roles("manager", "administrator")
def task_overview():
    user = get_current_user()
    # FIX H3: Managers locked to their own department
    if user["role"] == "manager":
        dept = user.get("department")
    else:
        dept = request.args.get("department", user.get("department"))

    dept_users = supabase.table("users").select("id,full_name").eq("department", dept).execute().data
    dept_ids = [u["id"] for u in dept_users]

    tasks = supabase.table("tasks").select("*").in_("assigned_to", dept_ids).execute().data

    from datetime import datetime
    now = str(datetime.utcnow().date())

    return jsonify({
        "total": len(tasks),
        "todo": sum(1 for t in tasks if t["status"] == "todo"),
        "in_progress": sum(1 for t in tasks if t["status"] == "in_progress"),
        "done": sum(1 for t in tasks if t["status"] == "done"),
        "overdue": sum(1 for t in tasks if t.get("due_date") and
                      t["status"] not in ["done"] and str(t["due_date"]) < now),
    })
