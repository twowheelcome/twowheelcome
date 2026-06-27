-- Auto-create a profile row for every new account.
--
-- Why: the client saves the name into profiles right after sign-up, but with email
-- confirmation ON there is no session yet, so that write runs as `anon` and RLS
-- blocks it. There was no database-side fallback, so confirmed users could end up
-- with no profile row and the name they typed at registration (kept only in
-- auth.users metadata) was lost — they showed up everywhere as "Rider".
--
-- This trigger creates the profile from the sign-up metadata. Owner-privileged
-- (SECURITY DEFINER) so it bypasses the owner-only RLS on profiles. Idempotent.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: existing accounts that never got a profile row.
INSERT INTO public.profiles (id, full_name)
SELECT u.id, NULLIF(trim(u.raw_user_meta_data ->> 'full_name'), '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
