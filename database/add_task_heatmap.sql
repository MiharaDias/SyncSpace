-- Add time tracking to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS time_spent_minutes INTEGER DEFAULT 0;
