from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from dateutil import parser as dateparser
import pytz


def generate_recurring_instances(meeting_data, recurrence_type, recurrence_end_date_str):
    """Generate list of (start_time, end_time) pairs for recurring meeting instances"""
    instances = []

    start = dateparser.parse(meeting_data["start_time"])
    end = dateparser.parse(meeting_data["end_time"])
    duration = end - start

    end_date = dateparser.parse(recurrence_end_date_str)
    # Cap at 1 year from start.
    # Normalize both sides to naive before comparing: start may be offset-aware
    # (ISO string with tz), recurrence_end_date_str may be a bare date (offset-naive),
    # and Python raises TypeError if you compare the two directly.
    max_end = start + timedelta(days=365)
    if end_date.replace(tzinfo=None) > max_end.replace(tzinfo=None):
        end_date = max_end

    current_start = start
    # Skip first occurrence (it's the parent meeting)
    while True:
        if recurrence_type == "daily":
            current_start += timedelta(days=1)
        elif recurrence_type == "weekly":
            current_start += timedelta(weeks=1)
        elif recurrence_type == "monthly":
            current_start += relativedelta(months=1)
        else:
            break

        if current_start.replace(tzinfo=None) > end_date.replace(tzinfo=None):
            break

        current_end = current_start + duration
        instances.append({
            "start_time": current_start.isoformat(),
            "end_time": current_end.isoformat()
        })

    return instances
