-- Add a free-text "motorcycle" field to profiles (e.g. "BMW GS"). Optional, public — it's
-- a trust/colour signal a host sees on a rider's stay request. Column-scoped grants mirror
-- the rest of profiles: readable by anon/authenticated, writable only by the owner.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS motorcycle text DEFAULT ''::text;

GRANT SELECT (motorcycle) ON profiles TO anon;
GRANT SELECT (motorcycle) ON profiles TO authenticated;
GRANT INSERT (motorcycle) ON profiles TO authenticated;
GRANT UPDATE (motorcycle) ON profiles TO authenticated;
