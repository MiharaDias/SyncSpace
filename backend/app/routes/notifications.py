from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import supabase
from app.utils.auth_helpers import require_approved, q_single
from datetime import datetime

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.route("/", methods=["GET"])
@jwt_required()
@require_approved()
def list_notifications():
    user_id = get_jwt_identity()
    search   = request.args.get("search", "").strip().lower()
    filter_t = request.args.get("filter", "")   # unread|read|tasks|projects|meetings|assignments|overdue

    result = supabase.table("notifications").select("*").eq(
        "user_id", user_id
    ).order("created_at", desc=True).limit(100).execute()

    notifs = result.data or []

    # Filter
    if filter_t == "unread":
        notifs = [n for n in notifs if not n.get("is_read")]
    elif filter_t == "read":
        notifs = [n for n in notifs if n.get("is_read")]
    elif filter_t == "tasks":
        notifs = [n for n in notifs if n.get("reference_type") == "task"
                  or n.get("type", "").startswith("task")]
    elif filter_t == "projects":
        notifs = [n for n in notifs if n.get("reference_type") == "project"
                  or n.get("type", "").startswith("project")]
    elif filter_t == "meetings":
        notifs = [n for n in notifs if n.get("reference_type") == "meeting"
                  or n.get("type", "").startswith("meeting") or n.get("type") == "response_accepted"
                  or n.get("type") == "response_rejected"]
    elif filter_t == "assignments":
        notifs = [n for n in notifs if n.get("type") in ("task_assigned", "project_assigned", "meeting_invite")]
    elif filter_t == "overdue":
        # Overdue = task-related notifications where the task is past due
        task_notif_ids = [n["reference_id"] for n in notifs
                         if n.get("reference_type") == "task" and n.get("reference_id")]
        if task_notif_ids:
            now_str = str(datetime.utcnow().date())
            overdue_tasks = supabase.table("tasks").select("id").in_(
                "id", task_notif_ids
            ).lt("due_date", now_str).not_.in_("status", ["completed", "done", "cancelled"]).execute().data or []
            overdue_ids = {t["id"] for t in overdue_tasks}
            notifs = [n for n in notifs if n.get("reference_id") in overdue_ids]
        else:
            notifs = []

    # Search by title/message
    if search:
        notifs = [n for n in notifs
                  if search in n.get("title", "").lower()
                  or search in n.get("message", "").lower()]

    # Enrich all meeting-related notifications with meeting data
    MEETING_TYPES = {"meeting_invite", "meeting_update", "meeting_cancelled",
                     "response_accepted", "response_rejected"}
    for n in notifs:
        if n.get("type") in MEETING_TYPES and n.get("reference_id"):
            mtg = q_single(supabase.table("meetings").select(
                "id,title,start_time,end_time,status,location"
            ).eq("id", n["reference_id"]))
            if mtg:
                att = q_single(supabase.table("meeting_attendees").select(
                    "response_status,attendance_type"
                ).eq("meeting_id", n["reference_id"]).eq("user_id", user_id))
                n["meeting"] = {**mtg, "my_response": att.get("response_status") if att else "pending"}

    return jsonify(notifs)


@notifications_bp.route("/unread-count", methods=["GET"])
@jwt_required()
@require_approved()
def unread_count():
    user_id = get_jwt_identity()
    result = supabase.table("notifications").select("id").eq(
        "user_id", user_id
    ).eq("is_read", False).execute()
    return jsonify({"count": len(result.data)})


@notifications_bp.route("/<notif_id>/read", methods=["PUT"])
@jwt_required()
@require_approved()
def mark_read(notif_id):
    user_id = get_jwt_identity()
    supabase.table("notifications").update({"is_read": True}).eq(
        "id", notif_id
    ).eq("user_id", user_id).execute()
    return jsonify({"message": "Marked as read"})


@notifications_bp.route("/read-all", methods=["PUT"])
@jwt_required()
@require_approved()
def mark_all_read():
    user_id = get_jwt_identity()
    supabase.table("notifications").update({"is_read": True}).eq(
        "user_id", user_id
    ).eq("is_read", False).execute()
    return jsonify({"message": "All marked as read"})


# ── Notification email preferences ────────────────────────────────────────────

# Canonical list of types that have email opt-in
PREF_TYPES = [
    "meeting_invite",
    "meeting_update",
    "meeting_cancelled",
    "task_assigned",
    "project_assigned",
    "approval_status",
]


@notifications_bp.route("/preferences", methods=["GET"])
@jwt_required()
@require_approved()
def get_preferences():
    """Return a dict of {notif_type: email_enabled} for the current user."""
    user_id = get_jwt_identity()
    rows = supabase.table("notification_preferences") \
        .select("type,email_enabled") \
        .eq("user_id", user_id) \
        .execute().data or []

    # Start with defaults (all False) then overlay stored values
    prefs: dict = {t: False for t in PREF_TYPES}
    for row in rows:
        if row["type"] in prefs:
            prefs[row["type"]] = bool(row["email_enabled"])

    return jsonify(prefs)


@notifications_bp.route("/preferences", methods=["PUT"])
@jwt_required()
@require_approved()
def update_preferences():
    """
    Accept {notif_type: bool, ...} and upsert each pair.
    Unknown types are silently ignored.
    """
    user_id = get_jwt_identity()
    data = request.json or {}

    for notif_type, enabled in data.items():
        if notif_type not in PREF_TYPES:
            continue
        if not isinstance(enabled, bool):
            continue

        existing = supabase.table("notification_preferences") \
            .select("id") \
            .eq("user_id", user_id) \
            .eq("type", notif_type) \
            .execute().data

        if existing:
            supabase.table("notification_preferences").update({
                "email_enabled": enabled,
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("user_id", user_id).eq("type", notif_type).execute()
        else:
            supabase.table("notification_preferences").insert({
                "user_id":       user_id,
                "type":          notif_type,
                "email_enabled": enabled,
            }).execute()

    return jsonify({"message": "Preferences saved"})


@notifications_bp.route("/<notif_id>/meeting-response", methods=["POST"])
@jwt_required()
@require_approved()
def meeting_response_from_notif(notif_id):
    """Accept or reject a meeting directly from the notification."""
    user_id = get_jwt_identity()
    data = request.json or {}
    response = data.get("response")
    if response not in ("accepted", "rejected"):
        return jsonify({"error": "response must be 'accepted' or 'rejected'"}), 400
    if response == "rejected" and not data.get("rejection_reason", "").strip():
        return jsonify({"error": "rejection_reason required when rejecting"}), 400

    # Get notification to find meeting_id
    notif = q_single(supabase.table("notifications").select("*").eq("id", notif_id).eq(
        "user_id", user_id))
    if not notif:
        return jsonify({"error": "Notification not found"}), 404
    meeting_id = notif.get("reference_id")
    if not meeting_id:
        return jsonify({"error": "No meeting linked to this notification"}), 400

    # Check attendee record
    att = q_single(supabase.table("meeting_attendees").select("*").eq(
        "meeting_id", meeting_id).eq("user_id", user_id))
    if not att:
        return jsonify({"error": "You are not invited to this meeting"}), 404

    upd = {"response_status": response, "responded_at": datetime.utcnow().isoformat()}
    if response == "rejected":
        upd["rejection_reason"] = data["rejection_reason"]
    supabase.table("meeting_attendees").update(upd).eq(
        "meeting_id", meeting_id).eq("user_id", user_id).execute()

    # Mark notification as read
    supabase.table("notifications").update({"is_read": True}).eq("id", notif_id).execute()

    # Notify organiser
    mtg_row = q_single(supabase.table("meetings").select("organizer_id,title").eq("id", meeting_id))
    if mtg_row:
        user_row = q_single(supabase.table("users").select("full_name").eq("id", user_id))
        name = user_row["full_name"] if user_row else "Someone"
        from app.services.notifications import create_notification
        msg = f"{name} has {response} the meeting '{mtg_row['title']}'"
        if response == "rejected":
            msg += f". Reason: {data['rejection_reason']}"
        create_notification(mtg_row["organizer_id"],
            "response_accepted" if response == "accepted" else "response_rejected",
            f"Meeting {response.capitalize()}", msg, meeting_id, "meeting")

    return jsonify({"message": f"Meeting {response}"})
