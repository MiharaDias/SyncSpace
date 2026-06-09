-- ─── SyncSpace — v3 Feature Migrations ─────────────────────────────────────
-- Run this in Supabase SQL Editor AFTER schema.sql and add_projects_system.sql
-- All statements use IF EXISTS / IF NOT EXISTS — safe to run multiple times.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CRITICAL: Drop the hardcoded task-status check constraint
--
--    schema.sql defined:
--      status TEXT DEFAULT 'todo' CHECK (status IN ('todo','in_progress','review','done'))
--
--    add_projects_system.sql did:
--      ALTER TABLE tasks ALTER COLUMN status TYPE TEXT
--    but ALTER COLUMN TYPE does NOT drop check constraints in PostgreSQL —
--    the constraint silently survives and blocks every custom status write.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

-- Confirm the default is the open-text value used by the project board
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'Not Started';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DATA FIX: Rename visibility value 'users' → 'members'
--
--    add_projects_system.sql used the comment "department, users, private".
--    The backend _is_accessible() now checks `vis == "members"`, and the
--    frontend ProjectFormDialog also sends "members".  Any project previously
--    saved with visibility='users' is effectively invisible to non-admins.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE projects
SET    visibility = 'members'
WHERE  visibility = 'users';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PERFORMANCE: Index tasks by project_id
--
--    add_projects_system.sql added the project_id column but no index.
--    Every project board load does a full tasks scan without it.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_project   ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Invitations: make sure the token column has a random default
--    (Already present in add_projects_system.sql but included defensively)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE invitations
  ALTER COLUMN token SET DEFAULT gen_random_uuid()::text;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Disable RLS on new tables (matches the rest of the schema)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE projects              DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_members       DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_custom_statuses DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_audit_log     DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_sub_deadlines    DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignees        DISABLE ROW LEVEL SECURITY;
ALTER TABLE invitations           DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Notification email preferences
--
--    Per-user, per-type opt-in for email delivery.
--    Defaults to FALSE (email off) — users enable types they care about.
--    In-app notifications are always on; only email is togglable.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL,
  email_enabled BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, type)
);
ALTER TABLE notification_preferences DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Multi-department invitations
--
--    The invitations table originally only stored a single department text
--    column.  Admin can now assign multiple departments at invite time.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS departments TEXT[] DEFAULT '{}';
