-- Per-user notification preferences. Two simple switches with room to grow later.
-- Default ON so existing users keep getting notifications until they opt out.
-- Writes are already owner-only via the profiles_update_own RLS policy
-- (auth.uid() = id); the edge functions read these with the service role.
-- Safe to re-run.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_push  boolean NOT NULL DEFAULT true;
