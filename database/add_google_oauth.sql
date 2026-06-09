-- Run this in Supabase SQL Editor to add Google OAuth support

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_access_token  TEXT,
  ADD COLUMN IF NOT EXISTS google_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS google_token_expiry  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_email         TEXT,
  ADD COLUMN IF NOT EXISTS google_connected     BOOLEAN DEFAULT FALSE;
