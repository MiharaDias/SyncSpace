from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import supabase
from app.utils.auth_helpers import require_approved, get_current_user

users_bp = Blueprint("users", __name__)


@users_bp.route("/", methods=["GET"])
@jwt_required()
@require_approved()
def list_users():
    query = supabase.table("users").select(
        "id,full_name,username,email,department,role,is_approved,is_active,created_at"
    ).eq("is_approved", True).eq("is_active", True)

    search = request.args.get("search", "").strip()
    department = request.args.get("department", "").strip()

    result = query.execute()
    users = result.data

    if department:
        users = [u for u in users if u.get("department", "").lower() == department.lower()]

    if search:
        s = search.lower()
        users = [
            u for u in users
            if s in u.get("full_name", "").lower()
            or s in u.get("email", "").lower()
            or s in u.get("username", "").lower()
        ]

    return jsonify(users)


@users_bp.route("/departments", methods=["GET"])
@jwt_required()
@require_approved()
def list_departments():
    result = supabase.table("users").select("department").eq("is_approved", True).execute()
    departments = sorted(set(u["department"] for u in result.data if u.get("department")))
    return jsonify(departments)


@users_bp.route("/<user_id>", methods=["GET"])
@jwt_required()
@require_approved()
def get_user(user_id):
    res = supabase.table("users").select(
        "id,full_name,username,email,department,role,created_at"
    ).eq("id", user_id).execute()
    if not res.data:
        return jsonify({"error": "User not found"}), 404
    return jsonify(res.data[0])


@users_bp.route("/me", methods=["PUT"])
@jwt_required()
@require_approved()
def update_profile():
    user_id = get_jwt_identity()
    data = request.json or {}
    allowed = ["full_name", "department", "departments"]
    update_data = {k: v for k, v in data.items() if k in allowed}
    if not update_data:
        return jsonify({"error": "No valid fields to update"}), 400
    # If departments array updated, keep primary department in sync
    if "departments" in update_data and update_data["departments"]:
        update_data["department"] = update_data["departments"][0]
    res = supabase.table("users").update(update_data).eq("id", user_id).execute()
    return jsonify(res.data[0])


@users_bp.route("/<user_id>/availability", methods=["GET"])
@jwt_required()
@require_approved()
def check_availability(user_id):
    start = request.args.get("start")
    end = request.args.get("end")
    if not start or not end:
        return jsonify({"error": "start and end required"}), 400

    # Get meetings where user is attendee
    attendee_res = supabase.table("meeting_attendees").select(
        "meeting_id, attendance_type, response_status"
    ).eq("user_id", user_id).neq("response_status", "rejected").execute()

    meeting_ids = [a["meeting_id"] for a in attendee_res.data]

    conflicts = []
    if meeting_ids:
        meetings_res = supabase.table("meetings").select(
            "id,title,start_time,end_time,status"
        ).in_("id", meeting_ids).eq("status", "active").execute()

        for m in meetings_res.data:
            if m["start_time"] < end and m["end_time"] > start:
                conflicts.append(m)

    # Get busy slots
    busy_res = supabase.table("busy_slots").select("*").eq("user_id", user_id).execute()
    busy_conflicts = []
    for b in busy_res.data:
        if b["start_time"] < end and b["end_time"] > start:
            busy_conflicts.append(b)

    return jsonify({
        "available": len(conflicts) == 0 and len(busy_conflicts) == 0,
        "meeting_conflicts": conflicts,
        "busy_conflicts": busy_conflicts
    })
