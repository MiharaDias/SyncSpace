-- SyncSpace Database Schema for Supabase
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       TEXT NOT NULL,
    username        TEXT UNIQUE NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    department      TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('user', 'manager', 'administrator')),
    is_approved     BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Meetings ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meetings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title               TEXT NOT NULL,
    purpose             TEXT,
    location            TEXT,
    organizer_id        UUID REFERENCES users(id),
    start_time          TIMESTAMPTZ NOT NULL,
    end_time            TIMESTAMPTZ NOT NULL,
    duration_minutes    INTEGER NOT NULL,
    recurrence_type     TEXT DEFAULT 'none' CHECK (recurrence_type IN ('none', 'daily', 'weekly', 'monthly')),
    recurrence_end_date DATE,
    parent_meeting_id   UUID REFERENCES meetings(id),
    google_event_id     TEXT,
    status              TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Meeting Attendees ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meeting_attendees (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id      UUID REFERENCES meetings(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    attendance_type TEXT NOT NULL CHECK (attendance_type IN ('required', 'optional')),
    response_status TEXT DEFAULT 'pending' CHECK (response_status IN ('pending', 'accepted', 'rejected')),
    rejection_reason TEXT,
    responded_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Busy Slots ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS busy_slots (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id),
    start_time  TIMESTAMPTZ NOT NULL,
    end_time    TIMESTAMPTZ NOT NULL,
    reason      TEXT DEFAULT 'Busy',
    is_all_day  BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    type            TEXT NOT NULL,
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    reference_id    TEXT,
    reference_type  TEXT,
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Tasks ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title                 TEXT NOT NULL,
    description           TEXT,
    created_by            UUID REFERENCES users(id),
    assigned_to           UUID REFERENCES users(id),
    due_date              DATE,
    priority              TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status                TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
    department            TEXT,
    estimated_hours       DECIMAL(5,2),
    actual_hours          DECIMAL(5,2),
    tags                  TEXT[],
    -- AI-ready fields (reserved for future AI model integration)
    ai_suggested_assignee UUID REFERENCES users(id),
    ai_priority_score     DECIMAL(3,2),
    ai_complexity_score   DECIMAL(3,2),
    ai_notes              TEXT,
    completed_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Task Comments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id),
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Task Audit Log ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id),
    action      TEXT NOT NULL,
    old_value   TEXT,
    new_value   TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Meeting Audit Log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meeting_audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id  UUID REFERENCES meetings(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id),
    action      TEXT NOT NULL,
    details     TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── System Settings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_meetings_organizer ON meetings(organizer_id);
CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON meetings(start_time);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting ON meeting_attendees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_user ON meeting_attendees(user_id);
CREATE INDEX IF NOT EXISTS idx_busy_slots_user ON busy_slots(user_id);
CREATE INDEX IF NOT EXISTS idx_busy_slots_time ON busy_slots(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_audit_task ON task_audit_log(task_id);
CREATE INDEX IF NOT EXISTS idx_meeting_audit_meeting ON meeting_audit_log(meeting_id);

-- ─── Disable Row Level Security (prototype — enable for production) ────────────
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE meetings DISABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendees DISABLE ROW LEVEL SECURITY;
ALTER TABLE busy_slots DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_audit_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_audit_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings DISABLE ROW LEVEL SECURITY;
