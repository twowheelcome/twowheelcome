-- "Clear all" for the notification centre. Notifications are derived (no table), so clearing
-- is a per-user timestamp: the bell hides derived events at/before it. Column-scoped grants
-- mirror notifications_seen_at (owner reads + writes; not exposed to anon).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notifications_cleared_at timestamptz;

GRANT SELECT (notifications_cleared_at) ON profiles TO authenticated;
GRANT UPDATE (notifications_cleared_at) ON profiles TO authenticated;
