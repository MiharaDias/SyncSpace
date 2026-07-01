from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import supabase
from app.utils.auth_helpers import require_approved, get_current_user
from app.routes.google_oauth import get_user_calendar_service

calendar_bp = Blueprint("calendar", __name__)

TTL_SECONDS = 60


def _is_recently_synced(user_id: str) -> bool:
    res = supabase.table("users").select("gcal_synced_at").eq("id", user_id).limit(1).execute()
    if not res.data:
        return False
    synced_at = res.data[0].get("gcal_synced_at")
    if not synced_at:
        return False
    last = datetime.fromisoformat(synced_at.replace("Z", "+00:00"))
    return (datetime.now(timezone.utc) - last).total_seconds() < TTL_SECONDS


# ── Google Calendar sync helper (importable by auth.py for login-time sync) ──

def sync_user_google_calendar(user_id: str, days_ahead: int = 90, force: bool = False) -> int:
    """
    Pull events from the user's Google Calendar and persist them as busy_slots
    (reason = 'Google Calendar').

    Returns -1 if skipped due to TTL (data is fresh enough).
    Returns 0 if the user has no Google Calendar connected.
    Returns count of events stored on a successful sync.
    """
    if not force and _is_recently_synced(user_id):
        return -1

    service = get_user_calendar_service(user_id)
    if not service:
        return 0

    # IST = UTC+5:30  (Asia/Kolkata / Sri Lanka Standard Time)
    IST = timezone(timedelta(hours=5, minutes=30))
    now = datetime.now(IST)
    time_min = now.isoformat()
    time_max = (now + timedelta(days=days_ahead)).isoformat()

    try:
        result = service.events().list(
            calendarId="primary",
            timeMin=time_min,
            timeMax=time_max,
            singleEvents=True,
            orderBy="startTime",
            maxResults=500,
        ).execute()
    except Exception as e:
        print(f"Google Calendar API error for user {user_id}: {e}")
        return 0

    # Remove stale Google Calendar busy_slots:
    #   • future window — prevents duplicates after each sync
    #   • past entries  — prevents accumulation of old events
    try:
        supabase.table("busy_slots").delete() \
            .eq("user_id", user_id) \
            .eq("reason", "Google Calendar") \
            .gte("start_time", time_min) \
            .execute()
    except Exception:
        pass
    try:
        supabase.table("busy_slots").delete() \
            .eq("user_id", user_id) \
            .eq("reason", "Google Calendar") \
            .lt("start_time", time_min) \
            .execute()
    except Exception:
        pass

    count = 0
    for gev in result.get("items", []):
        title = gev.get("summary", "")
        # Skip SyncSpace-originated events (already in our DB as meetings)
        if title.endswith("(SyncSpace)") or gev.get("status") == "cancelled":
            continue

        ev_start = gev["start"].get("dateTime") or gev["start"].get("date")
        ev_end   = gev["end"].get("dateTime")   or gev["end"].get("date")
        is_all_day = "dateTime" not in gev["start"]

        try:
            supabase.table("busy_slots").insert({
                "user_id":    user_id,
                "start_time": ev_start,
                "end_time":   ev_end,
                "reason":     "Google Calendar",
                "is_all_day": is_all_day,
            }).execute()
            count += 1
        except Exception:
            pass

    try:
        supabase.table("users").update(
            {"gcal_synced_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", user_id).execute()
    except Exception:
        pass

    return count


# ── Calendar sync endpoint ────────────────────────────────────────────────────

@calendar_bp.route("/sync", methods=["POST"])
@jwt_required()
@require_approved()
def sync_calendar():
    """
    Manually pull the current user's Google Calendar events into busy_slots.
    Called when the user clicks the Sync / Refresh button in CalendarPage.
    """
    user_id = get_jwt_identity()
    count = sync_user_google_calendar(user_id, force=True)
    return jsonify({
        "synced": count,
        "message": f"Synced {count} events from Google Calendar" if count else
                   "No Google Calendar connected or no new events",
    })


@calendar_bp.route("/sync-all", methods=["POST"])
@jwt_required()
@require_approved()
def sync_all_calendars():
    """
    Admin-only: sync Google Calendar for every user that has one connected.
    Intended to be called at midnight via cron / scheduler.
    """
    from app.utils.auth_helpers import get_current_user
    current = get_current_user()
    if not current or current.get("role") != "administrator":
        return jsonify({"error": "Admins only"}), 403

    users = supabase.table("users") \
        .select("id") \
        .eq("google_connected", True) \
        .eq("is_approved", True) \
        .eq("is_active", True) \
        .execute().data or []

    total = 0
    for u in users:
        try:
            total += max(0, sync_user_google_calendar(u["id"], force=True))
        except Exception:
            pass

    return jsonify({"synced_users": len(users), "synced_events": total})


# ── Calendar events (served from DB — no live Google API call) ─────────────

@calendar_bp.route("/events", methods=["GET"])
@jwt_required()
@require_approved()
def get_events():
    user_id = get_jwt_identity()
    current_user = get_current_user()
    start = request.args.get("start")
    end = request.args.get("end")
    requested_target = request.args.get("user_id", user_id)

    # FIX H7: Regular users can only see their own calendar.
    # Managers/admins may specify another user_id to overlay team calendars.
    if requested_target != user_id and current_user.get("role") not in ("manager", "administrator"):
        return jsonify({"error": "Not authorised to view another user's calendar"}), 403

    target_user_id = requested_target

    # URL query strings decode '+' as space; ISO timestamps use '+00:00' for UTC.
    # Restore the '+' so PostgreSQL receives a valid timestamptz string.
    if start:
        start = start.replace(" ", "+")
    if end:
        end = end.replace(" ", "+")

    events = []

    # ── SyncSpace meetings (organizer) ────────────────────────────────────────
    org_q = supabase.table("meetings").select("*").eq(
        "organizer_id", target_user_id
    ).eq("status", "active")
    if start:
        org_q = org_q.gte("start_time", start)
    if end:
        org_q = org_q.lte("start_time", end)
    org_meetings = org_q.execute().data
    for m in org_meetings:
        events.append(_meeting_to_event(m, "organizer"))

    # ── SyncSpace meetings (attendee) ─────────────────────────────────────────
    att_res = supabase.table("meeting_attendees").select(
        "meeting_id, attendance_type, response_status"
    ).eq("user_id", target_user_id).execute()
    att_map = {a["meeting_id"]: a for a in att_res.data}
    att_meeting_ids = [a["meeting_id"] for a in att_res.data]

    if att_meeting_ids:
        att_q = supabase.table("meetings").select("*").in_(
            "id", att_meeting_ids
        ).eq("status", "active").neq("organizer_id", target_user_id)
        if start:
            att_q = att_q.gte("start_time", start)
        if end:
            att_q = att_q.lte("start_time", end)
        att_meetings = att_q.execute().data
        for m in att_meetings:
            att_info = att_map.get(m["id"], {})
            events.append(_meeting_to_event(m, "attendee", att_info))

    # ── Busy slots (includes cached Google Calendar events) ───────────────────
    # Google Calendar events are stored here by sync_user_google_calendar()
    # with reason='Google Calendar'.  They are NOT fetched live on every request.
    busy_q = supabase.table("busy_slots").select("*").eq("user_id", target_user_id)
    if start:
        busy_q = busy_q.gte("start_time", start)
    if end:
        busy_q = busy_q.lte("start_time", end)
    for b in busy_q.execute().data:
        is_gcal = b.get("reason") == "Google Calendar"
        events.append({
            "id": b["id"],
            "type": "busy",
            "title": "Busy" if is_gcal else b.get("reason", "Busy"),
            "start": b["start_time"],
            "end": b["end_time"],
            "color": "#475569" if is_gcal else "#64748b",
            "is_all_day": b.get("is_all_day", False),
            "source": "google_calendar" if is_gcal else "manual",
            "raw": b,
        })

    return jsonify(events)


def _meeting_to_event(meeting, role, att_info=None):
    color = "#1e40af"
    if role == "attendee":
        status = att_info.get("response_status", "pending") if att_info else "pending"
        if status == "accepted":
            color = "#15803d"
        elif status == "rejected":
            color = "#dc2626"
        else:
            color = "#7c3aed"

    return {
        "id": meeting["id"],
        "type": "meeting",
        "title": meeting["title"],
        "start": meeting["start_time"],
        "end": meeting["end_time"],
        "color": color,
        "role": role,
        "attendance_type": att_info.get("attendance_type") if att_info else "required",
        "response_status": att_info.get("response_status") if att_info else "accepted",
        "raw": meeting
    }
