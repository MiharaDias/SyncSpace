-- ─── SyncSpace — Projects System Migration ────────────────────────────────────
-- Run in Supabase SQL Editor after the base schema.sql

-- ─── Extend users ─────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS departments   TEXT[]  DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id     TEXT    UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT;
-- password_hash can now be null for Google-only accounts
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Backfill departments array from existing department field
UPDATE users SET departments = ARRAY[department]
WHERE department IS NOT NULL AND (departments IS NULL OR array_length(departments, 1) IS NULL OR array_length(departments, 1) = 0);

-- ─── Projects ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  description             TEXT DEFAULT '',
  creator_id              UUID REFERENCES users(id) ON DELETE SET NULL,
  start_date              DATE,
  end_date                DATE,
  status                  TEXT DEFAULT 'active',   -- active, archived, completed, on_hold
  visibility              TEXT DEFAULT 'department', -- department, users, private
  visibility_departments  TEXT[]  DEFAULT '{}',
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Project Members ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id)    ON DELETE CASCADE,
  role        TEXT DEFAULT 'member',  -- member, manager
  added_by    UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- ─── Project Custom Statuses ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_custom_statuses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT DEFAULT '#6366f1',
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Project Audit Log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  details     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Extend Tasks ─────────────────────────────────────────────────────────────
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id     UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS custom_status  TEXT;
-- Replace status enum with open text so custom statuses work
ALTER TABLE tasks ALTER COLUMN status DROP DEFAULT;
ALTER TABLE tasks ALTER COLUMN status TYPE TEXT;
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'Not Started';
-- Fix assigned_to to be nullable
ALTER TABLE tasks ALTER COLUMN assigned_to DROP NOT NULL;

-- ─── Task Sub-Deadlines (Milestones) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_sub_deadlines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID REFERENCES tasks(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  due_date      DATE NOT NULL,
  is_completed  BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Task Multiple Assignees ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_assignees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID REFERENCES tasks(id)    ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id)    ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, user_id)
);

-- ─── User Invitations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  invited_by  UUID REFERENCES users(id),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  department  TEXT,
  role        TEXT DEFAULT 'user',
  token       TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  status      TEXT DEFAULT 'pending',  -- pending, accepted, revoked
  expires_at  TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
