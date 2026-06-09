import os
from google.oauth2 import service_account
from googleapiclient.discovery import build
from app.config import Config

SCOPES = ["https://www.googleapis.com/auth/calendar"]

_service = None


def get_calendar_service():
    global _service
    if _service:
        return _service

    creds_path = Config.GOOGLE_CALENDAR_CREDENTIALS_PATH
    if not os.path.exists(creds_path):
        print(f"Google Calendar credentials not found at {creds_path}")
        return None

    try:
        credentials = service_account.Credentials.from_service_account_file(
            creds_path, scopes=SCOPES
        )
        # Delegate to system email if using service account with domain-wide delegation
        if Config.SYSTEM_EMAIL:
            credentials = credentials.with_subject(Config.SYSTEM_EMAIL)
        _service = build("calendar", "v3", credentials=credentials)
        return _service
    except Exception as e:
        print(f"Google Calendar service error: {e}")
        return None


def create_google_event(meeting_data, attendee_emails):
    """Create event in Google Calendar and invite attendees"""
    service = get_calendar_service()
    if not service:
        return None

    try:
        event = {
            "summary": f"{meeting_data['title']} (SyncSpace)",
            "description": meeting_data.get("purpose", ""),
            "location": meeting_data.get("location", ""),
            "start": {
                "dateTime": meeting_data["start_time"],
                "timeZone": "Asia/Kolkata"
            },
            "end": {
                "dateTime": meeting_data["end_time"],
                "timeZone": "Asia/Kolkata"
            },
            "attendees": [{"email": email} for email in attendee_emails],
            "sendUpdates": "all",
            "guestsCanSeeOtherGuests": True,
        }

        created = service.events().insert(
            calendarId="primary",
            body=event,
            sendNotifications=True
        ).execute()

        return created.get("id")
    except Exception as e:
        print(f"Google Calendar create event error: {e}")
        return None


def update_google_event(event_id, meeting_data, attendee_emails):
    service = get_calendar_service()
    if not service or not event_id:
        return None

    try:
        event = service.events().get(calendarId="primary", eventId=event_id).execute()
        event["summary"] = meeting_data["title"]
        event["description"] = meeting_data.get("purpose", "")
        event["location"] = meeting_data.get("location", "")
        event["start"] = {"dateTime": meeting_data["start_time"], "timeZone": "Asia/Kolkata"}
        event["end"] = {"dateTime": meeting_data["end_time"], "timeZone": "Asia/Kolkata"}
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
