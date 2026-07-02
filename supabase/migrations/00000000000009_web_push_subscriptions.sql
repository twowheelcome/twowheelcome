-- Web Push (PWA) subscriptions. Separate channel from the native Expo push token on
-- profiles.push_token — additive, nothing existing is touched. One row per browser push
-- endpoint; RLS owner-only. Edge functions read via service_role (bypasses RLS) to fan out.

CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_id_idx ON public.web_push_subscriptions (user_id);

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wps_select_own" ON public.web_push_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "wps_insert_own" ON public.web_push_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wps_update_own" ON public.web_push_subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wps_delete_own" ON public.web_push_subscriptions FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_push_subscriptions TO authenticated;
GRANT ALL ON public.web_push_subscriptions TO service_role;
