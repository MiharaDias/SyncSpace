# SyncSpace — Development Plan

## Feasibility Assessment
- **Status:** Fully buildable as a functional prototype
- **Timeline estimate:** Large project — core features first, then extended features
- **Architecture:** React (Vite) SPA + Flask REST API + Supabase PostgreSQL

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| UI Library | shadcn/ui + Tailwind CSS |
| Backend | Python Flask (REST API) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (simple JWT) |
| Google Calendar | Google Calendar API (service account) |
| Frontend Deploy | Vercel |
| Backend Deploy | Railway |

---

## Project Structure

```
SyncSpace2/
├── frontend/                    # React Vite app
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/              # shadcn/ui components
│   │   │   ├── calendar/        # Calendar views
│   │   │   ├── meetings/        # Meeting components
│   │   │   ├── tasks/           # Task management
│   │   │   ├── notifications/   # Notification center
│   │   │   └── layout/          # Layout components
│   │   ├── pages/
│   │   │   ├── auth/            # Login, Register
│   │   │   ├── dashboard/       # Main dashboard
│   │   │   ├── calendar/        # Calendar page
│   │   │   ├── meetings/        # Meetings page
│   │   │   ├── tasks/           # Task management
│   │   │   ├── manager/         # Manager dashboard
│   │   │   └── admin/           # Admin panel
│   │   ├── lib/
│   │   │   ├── api.ts           # API client (Axios)
│   │   │   ├── auth.ts          # Auth utilities
│   │   │   └── utils.ts         # Helpers
│   │   ├── hooks/               # Custom React hooks
│   │   ├── store/               # Zustand state management
│   │   ├── types/               # TypeScript types
│   │   └── App.tsx
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── vercel.json
│
├── backend/                     # Flask API
│   ├── app/
│   │   ├── __init__.py          # Flask app factory
│   │   ├── config.py            # Configuration
│   │   ├── models/              # SQLAlchemy models (mirrors Supabase)
│   │   ├── routes/
│   │   │   ├── auth.py          # /api/auth/*
│   │   │   ├── users.py         # /api/users/*
│   │   │   ├── meetings.py      # /api/meetings/*
│   │   │   ├── calendar.py      # /api/calendar/*
│   │   │   ├── tasks.py         # /api/tasks/*
│   │   │   ├── notifications.py # /api/notifications/*
│   │   │   ├── admin.py         # /api/admin/*
│   │   │   └── manager.py       # /api/manager/*
│   │   ├── services/
│   │   │   ├── google_calendar.py # Google Calendar API
│   │   │   ├── conflict_detection.py
│   │   │   ├── recurring.py     # Recurring meeting generator
│   │   │   └── notifications.py
│   │   └── utils/
│   │       ├── auth_helpers.py
│   │       └── validators.py
│   ├── run.py
│   ├── requirements.txt
│   ├── .env.example
│   └── Procfile                 # Railway deploy
│
└── plan.md
```

---

## Database Schema (Supabase PostgreSQL)

### Table: `users`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
full_name       TEXT NOT NULL
username        TEXT UNIQUE NOT NULL
email           TEXT UNIQUE NOT NULL
password_hash   TEXT NOT NULL
department      TEXT NOT NULL
role            TEXT NOT NULL CHECK (role IN ('user', 'manager', 'administrator'))
is_approved     BOOLEAN DEFAULT FALSE
is_active       BOOLEAN DEFAULT TRUE
avatar_url      TEXT
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
```

### Table: `meetings`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
title           TEXT NOT NULL
purpose         TEXT
location        TEXT
organizer_id    UUID REFERENCES users(id)
start_time      TIMESTAMPTZ NOT NULL
end_time        TIMESTAMPTZ NOT NULL
duration_minutes INTEGER NOT NULL
recurrence_type TEXT CHECK (recurrence_type IN ('none', 'daily', 'weekly', 'monthly'))
recurrence_end_date DATE
parent_meeting_id UUID REFERENCES meetings(id)  -- for recurring instances
google_event_id TEXT   -- Google Calendar event ID
status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled'))
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
```

### Table: `meeting_attendees`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
meeting_id      UUID REFERENCES meetings(id) ON DELETE CASCADE
user_id         UUID REFERENCES users(id)
attendance_type TEXT NOT NULL CHECK (attendance_type IN ('required', 'optional'))
response_status TEXT DEFAULT 'pending' CHECK (response_status IN ('pending', 'accepted', 'rejected'))
rejection_reason TEXT
responded_at    TIMESTAMPTZ
created_at      TIMESTAMPTZ DEFAULT NOW()
```

### Table: `busy_slots`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID REFERENCES users(id)
start_time      TIMESTAMPTZ NOT NULL
end_time        TIMESTAMPTZ NOT NULL
reason          TEXT
is_all_day      BOOLEAN DEFAULT FALSE
created_at      TIMESTAMPTZ DEFAULT NOW()
```

### Table: `notifications`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID REFERENCES users(id)
type            TEXT NOT NULL  -- 'meeting_invite', 'meeting_update', 'meeting_cancelled', 
                               --  'response_accepted', 'response_rejected', 'task_assigned',
                               --  'task_due_soon', 'approval_status'
title           TEXT NOT NULL
message         TEXT NOT NULL
reference_id    UUID   -- meeting_id or task_id
reference_type  TEXT   -- 'meeting' or 'task'
is_read         BOOLEAN DEFAULT FALSE
created_at      TIMESTAMPTZ DEFAULT NOW()
```

### Table: `tasks`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
title           TEXT NOT NULL
description     TEXT
created_by      UUID REFERENCES users(id)
assigned_to     UUID REFERENCES users(id)
due_date        DATE
priority        TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
status          TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done'))
department      TEXT
estimated_hours DECIMAL(5,2)
actual_hours    DECIMAL(5,2)
tags            TEXT[]
-- AI-ready fields (for future AI model integration)
ai_suggested_assignee UUID REFERENCES users(id)
ai_priority_score     DECIMAL(3,2)
ai_complexity_score   DECIMAL(3,2)
ai_notes              TEXT
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
completed_at    TIMESTAMPTZ
```

### Table: `task_comments`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
task_id         UUID REFERENCES tasks(id) ON DELETE CASCADE
user_id         UUID REFERENCES users(id)
content         TEXT NOT NULL
created_at      TIMESTAMPTZ DEFAULT NOW()
```

### Table: `task_audit_log`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
task_id         UUID REFERENCES tasks(id)
user_id         UUID REFERENCES users(id)
action          TEXT NOT NULL  -- 'created', 'status_changed', 'assigned', 'commented', 'priority_changed'
old_value       TEXT
new_value       TEXT
created_at      TIMESTAMPTZ DEFAULT NOW()
```

### Table: `meeting_audit_log`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
meeting_id      UUID REFERENCES meetings(id)
user_id         UUID REFERENCES users(id)
action          TEXT NOT NULL
details         TEXT
created_at      TIMESTAMPTZ DEFAULT NOW()
```

### Table: `system_settings`
```sql
key             TEXT PRIMARY KEY
value           TEXT
updated_at      TIMESTAMPTZ DEFAULT NOW()
```

---

## API Structure

### Auth Routes `/api/auth`
- `POST /register` — Register new user
- `POST /login` — Login, return JWT
- `POST /logout` — Invalidate token
- `GET /me` — Get current user profile

### User Routes `/api/users`
- `GET /` — List users (search by name/email/dept)
- `GET /:id` — Get user profile
- `PUT /:id` — Update profile
- `GET /:id/availability` — Check availability for time range
- `GET /:id/calendar` — Get user's calendar data

### Meeting Routes `/api/meetings`
- `GET /` — List meetings (for current user)
- `POST /` — Create meeting
- `GET /:id` — Get meeting details
- `PUT /:id` — Update meeting
- `DELETE /:id` — Cancel meeting
- `POST /check-conflicts` — Check availability before creating
- `GET /suggested-slots` — Get next available slots
- `POST /:id/respond` — Accept/reject meeting invitation

### Busy Slots `/api/busy`
- `GET /` — Get user's busy slots
- `POST /` — Mark time as busy
- `DELETE /:id` — Remove busy slot

### Calendar Routes `/api/calendar`
- `GET /events` — Get all events for date range (meetings + busy)

### Task Routes `/api/tasks`
- `GET /` — List tasks (filtered by role/user)
- `POST /` — Create task
- `GET /:id` — Get task details
- `PUT /:id` — Update task
- `DELETE /:id` — Delete task
- `POST /:id/comments` — Add comment
- `GET /:id/comments` — Get comments
- `GET /:id/audit` — Get audit log
- `GET /dashboard` — Task dashboard stats

### Notification Routes `/api/notifications`
- `GET /` — Get notifications for current user
- `PUT /:id/read` — Mark as read
- `PUT /read-all` — Mark all as read

### Admin Routes `/api/admin`
- `GET /pending-users` — Users awaiting approval
- `POST /approve-user/:id` — Approve user
- `POST /reject-user/:id` — Reject user
- `GET /meetings` — All meetings
- `DELETE /meetings/:id` — Cancel any meeting
- `GET /activity-logs` — System activity logs
- `GET /stats` — System statistics

### Manager Routes `/api/manager`
- `GET /team-calendar` — Combined team calendar
- `GET /department-users` — Users in department
- `GET /meeting-stats` — Meeting response statistics
- `GET /task-overview` — Team task overview

---

## Build Order (Phases)

### Phase 1 — Foundation
1. Project setup (React + Vite + Tailwind + shadcn/ui)
2. Flask backend setup + Supabase connection
3. Auth system (register/login/JWT)
4. Database schema creation in Supabase
5. Basic routing and layout

### Phase 2 — Core Calendar & Meetings
6. Calendar views (Monthly/Weekly/Daily)
7. Meeting creation with duration
8. Attendee search and selection
9. Conflict detection
10. Busy slot management

### Phase 3 — Attendee Flow
11. Meeting invitations
12. Accept/reject responses
13. Notification system
14. Recurring meetings

### Phase 4 — Manager & Admin
15. Admin approval dashboard
16. Manager team calendar
17. Meeting response statistics
18. System logs

### Phase 5 — Task Management
19. Task creation and assignment
20. Task workflow (status updates)
21. Task dashboard
22. Task notifications and audit trail

### Phase 6 — Google Calendar Integration
23. Google Calendar API service
24. System email event creation
25. Attendee invitations via Google Calendar

### Phase 7 — Polish
26. UI polish and responsive design
27. Error handling
28. Deployment configuration

---

## Google Calendar Setup Requirements

The user will need:
1. A Google Cloud Project
2. Google Calendar API enabled
3. A dedicated Gmail account for the system (e.g., syncspace-system@gmail.com)
4. OAuth2 credentials OR service account with domain-wide delegation
5. `credentials.json` file in backend directory

---

## Environment Variables

### Backend (.env)
```
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_SERVICE_KEY=
JWT_SECRET=
GOOGLE_CALENDAR_CREDENTIALS_PATH=credentials.json
SYSTEM_EMAIL=
FLASK_ENV=development
CORS_ORIGINS=http://localhost:5173
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:5000
```
