from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from app.config import Config

SCOPES = ["https://www.googleapis.com/auth/calendar"]

_SETTING_KEYS = {
    "access_token":  "system_calendar_access_token",
    "refresh_token": "system_calendar_refresh_token",
    "expiry":        "system_calendar_token_expiry",
    "email":         "system_calendar_email",
}


def _get_setting(key: str):
    from app import supabase
    from app.utils.auth_helpers import q_single
    row = q_single(supabase.table("system_settings").select("value").eq("key", key))
    return row["value"] if row else None


def _save_setting(key: str, value: str) -> None:
    from app import supabase
    from app.utils.auth_helpers import q_single
    existing = q_single(supabase.table("system_settings").select("key").eq("key", key))
    if existing:
        supabase.table("system_settings").update({"value": value}).eq("key", key).execute()
    else:
        supabase.table("system_settings").insert({"key": key, "value": value}).execute()


def get_calendar_service():
    """Return an authenticated Google Calendar service using the system calendar OAuth tokens."""
    access_token  = _get_setting(_SETTING_KEYS["access_token"])
    refresh_token = _get_setting(_SETTING_KEYS["refresh_token"])

    if not access_token or not refresh_token:
        return None

    try:
        from datetime import datetime, timezone

        expiry_raw = _get_setting(_SETTING_KEYS["expiry"])
        expiry = None
        if expiry_raw:
            try:
                parsed = datetime.fromisoformat(expiry_raw.replace("Z", "+00:00"))
                # google-auth compares expiry with datetime.utcnow() (timezone-naive).
                # Convert to naive UTC so the comparison doesn't raise TypeError.
                if parsed.tzinfo is not None:
                    parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
                expiry = parsed
            except Exception:
                pass

        creds = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=Config.GOOGLE_CLIENT_ID,
            client_secret=Config.GOOGLE_CLIENT_SECRET,
            scopes=SCOPES,
        )
        if expiry:
            creds.expiry = expiry

        if creds.expired and creds.refresh_token:
            creds.refresh(GoogleRequest())
            # creds.expiry after refresh is naive UTC — store as UTC ISO string
            if creds.expiry:
                expiry_iso = creds.expiry.replace(tzinfo=timezone.utc).isoformat()
                _save_setting(_SETTING_KEYS["expiry"], expiry_iso)
            _save_setting(_SETTING_KEYS["access_token"], creds.token)

        return build("calendar", "v3", credentials=creds)
    except Exception as e:
        print(f"System calendar service error: {e}")
        return None


def is_system_calendar_configured() -> bool:
    """Return True if system calendar OAuth tokens are stored."""
    return bool(
        _get_setting(_SETTING_KEYS["access_token"]) and
        _get_setting(_SETTING_KEYS["refresh_token"])
    )


def create_google_event(meeting_data, attendee_emails, with_meet: bool = False):
    """Create event in the system Google Calendar and invite all attendees.

    Returns (google_event_id, meet_link) where meet_link is None unless with_meet=True.
    """
    import secrets as _secrets
    service = get_calendar_service()
    if not service:
        return None, None

    try:
        event = {
            "summary":  f"{meeting_data['title']} (SyncSpace)",
            "description": meeting_data.get("purpose", ""),
            "location":    meeting_data.get("location", ""),
            "start": {"dateTime": meeting_data["start_time"], "timeZone": "Asia/Kolkata"},
            "end":   {"dateTime": meeting_data["end_time"],   "timeZone": "Asia/Kolkata"},
            "attendees": [{"email": email} for email in attendee_emails],
            "sendUpdates": "all",
            "guestsCanSeeOtherGuests": True,
        }
        if with_meet:
            event["conferenceData"] = {
                "createRequest": {
                    "requestId": _secrets.token_hex(8),
                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                }
            }

        created = service.events().insert(
            calendarId="primary",
            body=event,
            sendNotifications=True,
            conferenceDataVersion=1 if with_meet else 0,
        ).execute()

        google_id = created.get("id")
        meet_link = None
        if with_meet:
            for ep in created.get("conferenceData", {}).get("entryPoints", []):
                if ep.get("entryPointType") == "video":
                    meet_link = ep.get("uri")
                    break
            # Fallback: Google Calendar sometimes surfaces the Meet URL here
            if not meet_link:
                meet_link = created.get("hangoutLink")

        return google_id, meet_link
    except Exception as e:
        print(f"Google Calendar create event error: {e}")
        return None, None


def update_google_event(event_id, meeting_data, attendee_emails):
    service = get_calendar_service()
    if not service or not event_id:
        return None

    try:
        event = service.events().get(calendarId="primary", eventId=event_id).execute()
        event["summary"]     = meeting_data["title"]
        event["description"] = meeting_data.get("purpose", "")
        event["location"]    = meeting_data.get("location", "")
        event["start"] = {"dateTime": meeting_data["start_time"], "timeZone": "Asia/Kolkata"}
        event["end"]   = {"dateTime": meeting_data["end_time"],   "timeZone": "Asia/Kolkata"}
        event["attendees"] = [{"email": email} for email in attendee_emails]
        service.events().update(
            calendarId="primary", eventId=event_id, body=event, sendUpdates="all"
        ).execute()
        return event_id
    except Exception as e:
        print(f"Google Calendar update error: {e}")
        return None


def cancel_google_event(event_id):
    service = get_calendar_service()
    if not service or not event_id:
        return

    try:
        service.events().delete(
            calendarId="primary", eventId=event_id, sendUpdates="all"
        ).execute()
    except Exception as e:
        print(f"Google Calendar cancel error: {e}")
