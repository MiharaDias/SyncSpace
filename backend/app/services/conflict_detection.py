from app import supabase
from datetime import datetime, timedelta
import pytz


def check_conflicts_for_users(user_ids, start_time, end_time, exclude_meeting_id=None):
    """Returns dict of user_id -> list of conflicts"""
    conflicts = {}

    for user_id in user_ids:
        user_conflicts = []

        # Check meetings
        attendee_res = supabase.table("meeting_attendees").select(
            "meeting_id, response_status"
        ).eq("user_id", user_id).neq("response_status", "rejected").execute()

        meeting_ids = [a["meeting_id"] for a in attendee_res.data]
        if exclude_meeting_id and exclude_meeting_id in meeting_ids:
            meeting_ids.remove(exclude_meeting_id)

        if meeting_ids:
            meetings_res = supabase.table("meetings").select(
                "id,title,start_time,end_time"
            ).in_("id", meeting_ids).eq("status", "active").execute()

            for m in meetings_res.data:
                if m["start_time"] < end_time and m["end_time"] > start_time:
                    user_conflicts.append({"type": "meeting", "title": m["title"],
                                          "start": m["start_time"], "end": m["end_time"]})

        # Check busy slots
        busy_res = supabase.table("busy_slots").select("*").eq("user_id", user_id).execute()
        for b in busy_res.data:
            if b["start_time"] < end_time and b["end_time"] > start_time:
                user_conflicts.append({"type": "busy", "title": b.get("reason", "Busy"),
                                      "start": b["start_time"], "end": b["end_time"]})

        if user_conflicts:
            conflicts[user_id] = user_conflicts

    return conflicts


def get_suggested_slots(user_ids, duration_minutes, target_date_str):
    """Find available slots on target_date and nearby days"""
    from dateutil import parser as dateparser
    import pytz

    tz = pytz.UTC
    target_date = dateparser.parse(target_date_str).replace(tzinfo=tz)

    suggestions = []
    work_start_hour = 8
    work_end_hour = 18
    slot_step = 30  # minutes

    # Check today and next day
    for day_offset in range(2):
        day = target_date + timedelta(days=day_offset)
        day_str = day.strftime("%Y-%m-%d")

        current = day.replace(hour=work_start_hour, minute=0, second=0, microsecond=0)
        end_of_day = day.replace(hour=work_end_hour, minute=0, second=0, microsecond=0)

        day_slots = []
        while current + timedelta(minutes=duration_minutes) <= end_of_day:
            slot_end = current + timedelta(minutes=duration_minutes)
            start_iso = current.isoformat()
            end_iso = slot_end.isoformat()

            conflicts = check_conflicts_for_users(user_ids, start_iso, end_iso)
            if not conflicts:
                day_slots.append({
                    "start": start_iso,
                    "end": end_iso,
                    "date": day_str
                })

            current += timedelta(minutes=slot_step)

        # Merge adjacent/overlapping slots into ranges
        merged = _merge_slots(day_slots, duration_minutes)
        suggestions.extend(merged)

        if len(suggestions) >= 6:
            break

    return suggestions[:6]


def _merge_slots(slots, duration_minutes):
    """Group consecutive slots into larger blocks and return distinct available windows"""
    if not slots:
        return []

    result = []
    seen_starts = set()
    for slot in slots:
        if slot["start"] not in seen_starts:
            seen_starts.add(slot["start"])
            result.append(slot)

    return result
