from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import supabase
from app.utils.auth_helpers import require_approved, get_current_user, q_single
from app.services.conflict_detection import check_conflicts_for_users, get_suggested_slots
from app.services.recurring import generate_recurring_instances
from app.services.notifications import create_notification
from app.services.google_calendar import create_google_event, update_google_event, cancel_google_event, is_system_calendar_configured
from datetime import datetime, timedelta, timezone
from dateutil import parser as dateparser

meetings_bp = Blueprint("meetings", __name__)


@meetings_bp.route("/capabilities", methods=["GET"])
@jwt_required()
@require_approved()
def meeting_capabilities():
    """Return feature flags available to any authenticated user."""
    return jsonify({"google_meet": is_system_calendar_configured()})


@meetings_bp.route("/", methods=["GET"])
@jwt_required()
@require_approved()
def list_meetings():
    user_id = get_jwt_identity()
    start = request.args.get("start")
    end = request.args.get("end")

    # Meetings where user is organizer
    org_q = supabase.table("meetings").select("*").eq("organizer_id", user_id).eq("status", "active")
    if start:
        org_q = org_q.gte("start_time", start)
    if end:
        org_q = org_q.lte("start_time", end)
    organizer_meetings = org_q.execute().data

    # Meetings where user is attendee
    attendee_res = supabase.table("meeting_attendees").select(
        "meeting_id, attendance_type, response_status"
    ).eq("user_id", user_id).execute()

    attendee_meeting_ids = [a["meeting_id"] for a in attendee_res.data]
    attendee_map = {a["meeting_id"]: a for a in attendee_res.data}

    attendee_meetings = []
    if attendee_meeting_ids:
        att_q = supabase.table("meetings").select("*").in_(
            "id", attendee_meeting_ids
        ).eq("status", "active").neq("organizer_id", user_id)
        if start:
            att_q = att_q.gte("start_time", start)
        if end:
            att_q = att_q.lte("start_time", end)
        attendee_meetings = att_q.execute().data

    # Combine and add attendee info
    all_meetings = []
    for m in organizer_meetings:
        m["user_role"] = "organizer"
        all_meetings.append(m)
    for m in attendee_meetings:
        att_info = attendee_map.get(m["id"], {})
        m["user_role"] = "attendee"
        m["attendance_type"] = att_info.get("attendance_type")
        m["response_status"] = att_info.get("response_status")
        all_meetings.append(m)

    return jsonify(all_meetings)


@meetings_bp.route("/", methods=["POST"])
@jwt_required()
@require_approved()
def create_meeting():
    user_id = get_jwt_identity()
    data = request.json or {}
    task_ids = [tid for tid in data.get("task_ids", []) if tid]

    required = ["title", "start_time"]
    for f in required:
        if not data.get(f):
            return jsonify({"error": f"{f} is required"}), 400

    if len(str(data["title"])) > 200:
        return jsonify({"error": "title too long (max 200 chars)"}), 400
    if len(str(data.get("purpose", ""))) > 2000:
        return jsonify({"error": "purpose too long (max 2000 chars)"}), 400
    if len(str(data.get("location", ""))) > 500:
        return jsonify({"error": "location too long (max 500 chars)"}), 400

    required_attendees = data.get("required_attendees", [])
    optional_attendees = data.get("optional_attendees", [])
    if len(required_attendees) + len(optional_attendees) > 100:
        return jsonify({"error": "Too many attendees (max 100)"}), 400

    start = dateparser.parse(data["start_time"])

    # Reject meetings scheduled in the past (IST = UTC+5:30, but backend compares in UTC)
    start_aware = start if start.tzinfo else start.replace(tzinfo=timezone.utc)
    if start_aware < datetime.now(timezone.utc):
        return jsonify({"error": "Cannot schedule meetings in the past"}), 400

    # duration_minutes is optional when end_time is explicitly provided.
    # If both are absent, default to 60 minutes.
    if data.get("duration_minutes") is not None:
        try:
            duration = int(data["duration_minutes"])
            if duration < 1 or duration > 1440:
                return jsonify({"error": "duration_minutes must be between 1 and 1440"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "duration_minutes must be a number"}), 400
        end = start + timedelta(minutes=duration)
    elif data.get("end_time"):
        end = dateparser.parse(data["end_time"])
        duration = max(1, int((end - start).total_seconds() / 60))
    else:
        duration = 60
        end = start + timedelta(minutes=duration)

    meeting_data = {
        "title": data["title"],
        "purpose": data.get("purpose", ""),
        "location": data.get("location", ""),
        "organizer_id": user_id,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "duration_minutes": duration,
        "recurrence_type": data.get("recurrence_type", "none"),
        "recurrence_end_date": data.get("recurrence_end_date") or None,
        "status": "active"
    }

    result = supabase.table("meetings").insert(meeting_data).execute()
    meeting = result.data[0]
    meeting_id = meeting["id"]

    # Add organizer as required attendee
    supabase.table("meeting_attendees").insert({
        "meeting_id": meeting_id,
        "user_id": user_id,
        "attendance_type": "required",
        "response_status": "accepted"
    }).execute()

    attendee_emails = []

    for uid in required_attendees:
        if uid == user_id:
            continue
        supabase.table("meeting_attendees").insert({
            "meeting_id": meeting_id,
            "user_id": uid,
            "attendance_type": "required",
            "response_status": "pending"
        }).execute()
        _notify_attendee(uid, meeting, "required")
        u = q_single(supabase.table("users").select("email").eq("id", uid))
        if u:
            attendee_emails.append(u["email"])

    for uid in optional_attendees:
        if uid == user_id:
            continue
        supabase.table("meeting_attendees").insert({
            "meeting_id": meeting_id,
            "user_id": uid,
            "attendance_type": "optional",
            "response_status": "pending"
        }).execute()
        _notify_attendee(uid, meeting, "optional")
        u = q_single(supabase.table("users").select("email").eq("id", uid))
        if u:
            attendee_emails.append(u["email"])

    # Google Calendar — system calendar creates the event and invites all attendees.
    # Per-user personal calendar sync is NOT done here; Google sends email invites
    # to all attendees automatically. Per-user OAuth is used only for conflict detection.
    organizer = q_single(supabase.table("users").select("email,google_connected").eq("id", user_id))
    if organizer:
        attendee_emails.append(organizer["email"])
    with_google_meet = bool(data.get("with_google_meet"))
    google_id, meet_link = create_google_event(meeting_data, list(set(attendee_emails)), with_meet=with_google_meet)
    if google_id:
        update_fields = {"google_event_id": google_id}
        if meet_link:
            update_fields["location"] = meet_link
        supabase.table("meetings").update(update_fields).eq("id", meeting_id).execute()
        meeting["google_event_id"] = google_id
        if meet_link:
            meeting["location"] = meet_link

        # Auto-accept for the meeting creator — they created it so no need to RSVP.
        # If their personal Google Calendar is connected, patch their response directly.
        if organizer and organizer.get("google_connected"):
            try:
                from app.routes.google_oauth import get_user_calendar_service
                creator_service = get_user_calendar_service(user_id)
                if creator_service:
                    creator_service.events().patch(
                        calendarId="primary",
                        eventId=google_id,
                        body={"attendees": [{"email": organizer["email"], "responseStatus": "accepted"}]},
                        sendUpdates="none",
                    ).execute()
            except Exception:
                pass

    # Audit log
    try:
        supabase.table("meeting_audit_log").insert({
            "meeting_id": meeting_id,
            "user_id": user_id,
            "action": "created",
            "details": f"Meeting '{data['title']}' created"
        }).execute()
    except Exception:
        pass

    # Handle recurring
    if meeting_data["recurrence_type"] != "none" and data.get("recurrence_end_date"):
        instances = generate_recurring_instances(meeting_data, meeting_data["recurrence_type"], data["recurrence_end_date"])
        for inst in instances:
            inst_data = {**meeting_data, **inst, "parent_meeting_id": meeting_id}
            inst_result = supabase.table("meetings").insert(inst_data).execute()
            inst_meeting = inst_result.data[0]
            for uid in [user_id] + required_attendees + optional_attendees:
                att_type = "required" if uid == user_id or uid in required_attendees else "optional"
                status = "accepted" if uid == user_id else "pending"
                supabase.table("meeting_attendees").insert({
                    "meeting_id": inst_meeting["id"],
                    "user_id": uid,
                    "attendance_type": att_type,
                    "response_status": status
                }).execute()
            for tid in task_ids:
                try:
                    supabase.table("meeting_task_links").insert({
                        "meeting_id": inst_meeting["id"], "task_id": tid
                    }).execute()
                except Exception:
                    pass

    # Link tasks to this meeting
    for tid in task_ids:
        try:
            supabase.table("meeting_task_links").insert({
                "meeting_id": meeting_id, "task_id": tid
            }).execute()
        except Exception:
            pass

    return jsonify(meeting), 201


@meetings_bp.route("/check-conflicts", methods=["POST"])
@jwt_required()
@require_approved()
def check_conflicts():
    data = request.json
    user_ids = data.get("user_ids", [])
    start_time = data.get("start_time")
    end_time = data.get("end_time")

    if not user_ids or not start_time or not end_time:
        return jsonify({"error": "user_ids, start_time, end_time required"}), 400

    conflicts = check_conflicts_for_users(user_ids, start_time, end_time)

    conflict_details = []
    for uid, user_conflicts in conflicts.items():
        u = q_single(supabase.table("users").select("id,full_name,email").eq("id", uid))
        if u:
            conflict_details.append({"user": u, "conflicts": user_conflicts})

    return jsonify({
        "has_conflicts": len(conflicts) > 0,
        "conflict_count": len(conflicts),
        "conflict_details": conflict_details
    })


@meetings_bp.route("/check-availability", methods=["POST"])
@jwt_required()
@require_approved()
def check_availability():
    data = request.json
    required_ids = data.get("required_ids", [])
    optional_ids = data.get("optional_ids", [])
    start_time = data.get("start_time")
    end_time = data.get("end_time")

    if not start_time or not end_time:
        return jsonify({"error": "start_time and end_time required"}), 400

    def _check_syncspace(uid):
        conflicts = []
        att_res = supabase.table("meeting_attendees").select("meeting_id").eq(
            "user_id", uid).neq("response_status", "rejected").execute()
        meeting_ids = [a["meeting_id"] for a in att_res.data]
        if meeting_ids:
            mtgs = supabase.table("meetings").select("id,title,start_time,end_time").in_(
                "id", meeting_ids).eq("status", "active").execute().data
            for m in mtgs:
                if m["start_time"] < end_time and m["end_time"] > start_time:
                    conflicts.append({"source": "syncspace", "title": m["title"],
                                      "start": m["start_time"], "end": m["end_time"]})
        busy = supabase.table("busy_slots").select("*").eq("user_id", uid).execute().data
        for b in busy:
            if b["start_time"] < end_time and b["end_time"] > start_time:
                conflicts.append({"source": "busy", "title": b.get("reason", "Busy"),
                                  "start": b["start_time"], "end": b["end_time"]})
        return conflicts

    def _check_google_calendar(uid):
        from app.routes.google_oauth import get_user_calendar_service
        service = get_user_calendar_service(uid)
        if not service:
            return [], False
        try:
            def _to_rfc3339(ts):
                ts = ts.rstrip('Z').split('+')[0]
                return ts + 'Z' if 'T' in ts else ts + 'T00:00:00Z'

            result = service.events().list(
                calendarId="primary",
                timeMin=_to_rfc3339(start_time),
                timeMax=_to_rfc3339(end_time),
                singleEvents=True,
                maxResults=50,
            ).execute()
            conflicts = []
            for gev in result.get("items", []):
                title = gev.get("summary", "")
                if title.endswith("(SyncSpace)") or gev.get("status") == "cancelled":
                    continue
                ev_start = gev["start"].get("dateTime") or gev["start"].get("date")
                ev_end   = gev["end"].get("dateTime")   or gev["end"].get("date")
                conflicts.append({"source": "google_calendar", "title": "Busy (Google Calendar)",
                                  "start": ev_start, "end": ev_end})
            return conflicts, True
        except Exception as e:
            print(f"Google Calendar check error for {uid}: {e}")
            return [], True

    required_results = []
    for uid in required_ids:
        u = q_single(supabase.table("users").select("id,full_name,email,department").eq("id", uid))
        if not u:
            continue
        ss_conflicts = _check_syncspace(uid)
        gcal_conflicts, gcal_connected = _check_google_calendar(uid)
        all_conflicts = ss_conflicts + gcal_conflicts
        required_results.append({
            "user": u,
            "available": len(all_conflicts) == 0,
            "conflicts": all_conflicts,
            "google_calendar_checked": gcal_connected,
        })

    optional_results = []
    for uid in optional_ids:
        u = q_single(supabase.table("users").select("id,full_name,email,department").eq("id", uid))
        if not u:
            continue
        ss_conflicts = _check_syncspace(uid)
        gcal_conflicts, gcal_connected = _check_google_calendar(uid)
        all_conflicts = ss_conflicts + gcal_conflicts
        optional_results.append({
            "user": u,
            "available": len(all_conflicts) == 0,
            "conflicts": all_conflicts,
            "google_calendar_checked": gcal_connected,
        })

    required_busy = [r for r in required_results if not r["available"]]
    return jsonify({
        "all_required_free": len(required_busy) == 0,
        "required": required_results,
        "optional": optional_results,
        "required_busy_count": len(required_busy),
    })


@meetings_bp.route("/suggested-slots", methods=["POST"])
@jwt_required()
@require_approved()
def suggested_slots():
    data = request.json
    user_ids = data.get("user_ids", [])
    duration_minutes = data.get("duration_minutes", 60)
    target_date = data.get("target_date")

    if not user_ids or not target_date:
        return jsonify({"error": "user_ids and target_date required"}), 400

    slots = get_suggested_slots(user_ids, duration_minutes, target_date)
    return jsonify(slots)


@meetings_bp.route("/<meeting_id>", methods=["GET"])
@jwt_required()
@require_approved()
def get_meeting(meeting_id):
    user_id = get_jwt_identity()
    user = get_current_user()

    meeting = q_single(supabase.table("meetings").select("*").eq("id", meeting_id))
    if not meeting:
        return jsonify({"error": "Meeting not found"}), 404

    if meeting["organizer_id"] != user_id and user.get("role") != "administrator":
        att_check = supabase.table("meeting_attendees").select("id").eq(
            "meeting_id", meeting_id
        ).eq("user_id", user_id).execute()
        if not att_check.data:
            return jsonify({"error": "Not authorised to view this meeting"}), 403

    att_res = supabase.table("meeting_attendees").select(
        "*, users(id,full_name,email,department)"
    ).eq("meeting_id", meeting_id).execute()
    meeting["attendees"] = att_res.data

    organizer = q_single(supabase.table("users").select("id,full_name,email").eq(
        "id", meeting["organizer_id"]))
    meeting["organizer"] = organizer

    links = supabase.table("meeting_task_links").select(
        "task_id, tasks(id, title, status, priority)"
    ).eq("meeting_id", meeting_id).execute().data or []
    meeting["task_links"] = [lk["tasks"] for lk in links if lk.get("tasks")]

    return jsonify(meeting)


@meetings_bp.route("/<meeting_id>", methods=["PUT"])
@jwt_required()
@require_approved()
def update_meeting(meeting_id):
    user_id = get_jwt_identity()
    user = get_current_user()

    meeting = q_single(supabase.table("meetings").select("*").eq("id", meeting_id))
    if not meeting:
        return jsonify({"error": "Meeting not found"}), 404
    if meeting["organizer_id"] != user_id and user["role"] != "administrator":
        return jsonify({"error": "Only organizer can update meeting"}), 403

    data = request.json
    update_data = {}
    if "title" in data:
        update_data["title"] = data["title"]
    if "purpose" in data:
        update_data["purpose"] = data["purpose"]
    if "location" in data:
        update_data["location"] = data["location"]
    if "start_time" in data or "duration_minutes" in data:
        start_dt = dateparser.parse(data.get("start_time", meeting["start_time"]))
        duration = int(data.get("duration_minutes", meeting["duration_minutes"]))
        end_dt = start_dt + timedelta(minutes=duration)
        update_data["start_time"] = start_dt.isoformat()
        update_data["end_time"] = end_dt.isoformat()
        update_data["duration_minutes"] = duration

    result = supabase.table("meetings").update(update_data).eq("id", meeting_id).execute()
    updated = result.data[0]

    att_res = supabase.table("meeting_attendees").select("user_id").eq("meeting_id", meeting_id).execute()

    # If start time changed, reset all attendees' responses and notify of rescheduling
    time_changed = "start_time" in update_data
    if time_changed:
        supabase.table("meeting_attendees").update({"response_status": "pending"}).eq(
            "meeting_id", meeting_id).neq("user_id", user_id).execute()

    for att in att_res.data:
        if att["user_id"] != user_id:
            msg = (
                f"'{updated.get('title', meeting['title'])}' has been rescheduled. Please respond again."
                if time_changed
                else f"The meeting '{updated.get('title', meeting['title'])}' has been updated."
            )
            create_notification(
                att["user_id"], "meeting_update",
                "Meeting Rescheduled" if time_changed else "Meeting Updated",
                msg, meeting_id, "meeting"
            )

    if meeting.get("google_event_id"):
        att_emails = []
        for att in att_res.data:
            u = q_single(supabase.table("users").select("email").eq("id", att["user_id"]))
            if u:
                att_emails.append(u["email"])
        update_google_event(meeting["google_event_id"], {**meeting, **update_data}, att_emails)

    try:
        supabase.table("meeting_audit_log").insert({
            "meeting_id": meeting_id, "user_id": user_id,
            "action": "updated", "details": f"Meeting updated: {list(update_data.keys())}"
        }).execute()
    except Exception:
        pass

    return jsonify(updated)


@meetings_bp.route("/<meeting_id>", methods=["DELETE"])
@jwt_required()
@require_approved()
def cancel_meeting(meeting_id):
    user_id = get_jwt_identity()
    user = get_current_user()

    meeting = q_single(supabase.table("meetings").select("*").eq("id", meeting_id))
    if not meeting:
        return jsonify({"error": "Meeting not found"}), 404
    if meeting["organizer_id"] != user_id and user["role"] != "administrator":
        return jsonify({"error": "Only organizer or admin can cancel"}), 403

    supabase.table("meetings").update({"status": "cancelled"}).eq("id", meeting_id).execute()

    att_res = supabase.table("meeting_attendees").select("user_id").eq("meeting_id", meeting_id).execute()
    for att in att_res.data:
        if att["user_id"] != user_id:
            create_notification(
                att["user_id"], "meeting_cancelled",
                "Meeting Cancelled",
                f"The meeting '{meeting['title']}' has been cancelled.",
                meeting_id, "meeting"
            )

    if meeting.get("google_event_id"):
        cancel_google_event(meeting["google_event_id"])

    try:
        supabase.table("meeting_audit_log").insert({
            "meeting_id": meeting_id, "user_id": user_id,
            "action": "cancelled", "details": "Meeting cancelled"
        }).execute()
    except Exception:
        pass

    return jsonify({"message": "Meeting cancelled"})


@meetings_bp.route("/<meeting_id>/respond", methods=["POST"])
@jwt_required()
@require_approved()
def respond_to_meeting(meeting_id):
    user_id = get_jwt_identity()
    data = request.json

    response = data.get("response")
    if response not in ["accepted", "rejected"]:
        return jsonify({"error": "response must be 'accepted' or 'rejected'"}), 400
    if response == "rejected" and not data.get("rejection_reason", "").strip():
        return jsonify({"error": "Rejection reason is required"}), 400

    att = q_single(supabase.table("meeting_attendees").select("*").eq(
        "meeting_id", meeting_id).eq("user_id", user_id))
    if not att:
        return jsonify({"error": "You are not invited to this meeting"}), 404

    upd = {"response_status": response, "responded_at": datetime.utcnow().isoformat()}
    if response == "rejected":
        upd["rejection_reason"] = data["rejection_reason"]
    supabase.table("meeting_attendees").update(upd).eq(
        "meeting_id", meeting_id).eq("user_id", user_id).execute()

    mtg = q_single(supabase.table("meetings").select("organizer_id,title").eq("id", meeting_id))
    if mtg:
        u = q_single(supabase.table("users").select("full_name").eq("id", user_id))
        user_name = u["full_name"] if u else "Someone"
        notif_type = "response_accepted" if response == "accepted" else "response_rejected"
        msg = f"{user_name} has {response} the meeting '{mtg['title']}'"
        if response == "rejected":
            msg += f". Reason: {data['rejection_reason']}"
        create_notification(mtg["organizer_id"], notif_type,
                            f"Meeting {response.capitalize()}", msg, meeting_id, "meeting")

    return jsonify({"message": f"Meeting {response}"})


@meetings_bp.route("/<meeting_id>/attendees", methods=["PUT"])
@jwt_required()
@require_approved()
def update_attendees(meeting_id):
    user_id = get_jwt_identity()
    data = request.json

    mtg = q_single(supabase.table("meetings").select("organizer_id,title").eq("id", meeting_id))
    if not mtg:
        return jsonify({"error": "Meeting not found"}), 404
    if mtg["organizer_id"] != user_id:
        return jsonify({"error": "Only organizer can update attendees"}), 403

    remove_ids = data.get("remove_ids", [])
    for uid in remove_ids:
        supabase.table("meeting_attendees").delete().eq("meeting_id", meeting_id).eq("user_id", uid).execute()
        create_notification(uid, "meeting_update", "Removed from Meeting",
            f"You have been removed from '{mtg['title']}'.", meeting_id, "meeting")

    move_to_optional = data.get("move_to_optional", [])
    for uid in move_to_optional:
        supabase.table("meeting_attendees").update({"attendance_type": "optional"}).eq(
            "meeting_id", meeting_id).eq("user_id", uid).execute()

    # Add new required attendees
    for uid in data.get("add_required", []):
        existing = supabase.table("meeting_attendees").select("id").eq(
            "meeting_id", meeting_id).eq("user_id", uid).execute()
        if not existing.data:
            supabase.table("meeting_attendees").insert({
                "meeting_id": meeting_id, "user_id": uid,
                "attendance_type": "required", "response_status": "pending"
            }).execute()
            _notify_attendee(uid, {"id": meeting_id, "title": mtg["title"]}, "required")

    # Add new optional attendees
    for uid in data.get("add_optional", []):
        existing = supabase.table("meeting_attendees").select("id").eq(
            "meeting_id", meeting_id).eq("user_id", uid).execute()
        if not existing.data:
            supabase.table("meeting_attendees").insert({
                "meeting_id": meeting_id, "user_id": uid,
                "attendance_type": "optional", "response_status": "pending"
            }).execute()
            _notify_attendee(uid, {"id": meeting_id, "title": mtg["title"]}, "optional")

    return jsonify({"message": "Attendees updated"})


@meetings_bp.route("/<meeting_id>/tasks", methods=["GET"])
@jwt_required()
@require_approved()
def list_meeting_tasks(meeting_id):
    links = supabase.table("meeting_task_links").select(
        "task_id, tasks(id, title, status, priority)"
    ).eq("meeting_id", meeting_id).execute().data or []
    return jsonify([lk["tasks"] for lk in links if lk.get("tasks")])


@meetings_bp.route("/<meeting_id>/tasks", methods=["POST"])
@jwt_required()
@require_approved()
def link_task(meeting_id):
    user_id = get_jwt_identity()
    mtg = q_single(supabase.table("meetings").select("organizer_id").eq("id", meeting_id))
    if not mtg:
        return jsonify({"error": "Meeting not found"}), 404
    if mtg["organizer_id"] != user_id:
        return jsonify({"error": "Only organizer can link tasks"}), 403
    task_id = (request.json or {}).get("task_id")
    if not task_id:
        return jsonify({"error": "task_id required"}), 400
    try:
        supabase.table("meeting_task_links").insert({
            "meeting_id": meeting_id, "task_id": task_id
        }).execute()
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"message": "Task linked"})


@meetings_bp.route("/<meeting_id>/tasks/<task_id>", methods=["DELETE"])
@jwt_required()
@require_approved()
def unlink_task(meeting_id, task_id):
    user_id = get_jwt_identity()
    mtg = q_single(supabase.table("meetings").select("organizer_id").eq("id", meeting_id))
    if not mtg:
        return jsonify({"error": "Meeting not found"}), 404
    if mtg["organizer_id"] != user_id:
        return jsonify({"error": "Only organizer can unlink tasks"}), 403
    supabase.table("meeting_task_links").delete().eq(
        "meeting_id", meeting_id).eq("task_id", task_id).execute()
    return jsonify({"message": "Task unlinked"})


def _notify_attendee(user_id, meeting, attendance_type):
    label = "REQUIRED MEETING" if attendance_type == "required" else "OPTIONAL MEETING"
    create_notification(
        user_id, "meeting_invite",
        f"Meeting Invitation: {meeting['title']}",
        f"You have been invited to '{meeting['title']}'. [{label}]",
        meeting["id"], "meeting"
    )
