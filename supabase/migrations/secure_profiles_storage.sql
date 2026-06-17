-- Keep private profile fields (especially push_token) out of public API reads,
-- and restrict upload buckets to each authenticated user's own folder.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE policy_name text;
BEGIN
  FOR policy_name IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', policy_name);
  END LOOP;
END $$;

CREATE POLICY profiles_public_read ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_insert_own ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update_own ON profiles FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- RLS protects rows, while column privileges prevent a public SELECT from ever
-- returning push_token or future private columns.
REVOKE SELECT, INSERT, UPDATE, DELETE ON profiles FROM anon, authenticated;
GRANT SELECT (id, full_name, bio, bike_model, avatar_url) ON profiles TO anon, authenticated;
GRANT INSERT (id, full_name, bio, bike_model, avatar_url, push_token),
      UPDATE (full_name, bio, bike_model, avatar_url, push_token)
ON profiles TO authenticated;

-- Remove any older policies that mention these buckets; permissive policies are
-- ORed together, so leaving one behind would bypass the owner-folder check.
DO $$
DECLARE policy_name text;
BEGIN
  FOR policy_name IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (
        coalesce(qual, '') ILIKE '%avatars%'
        OR coalesce(with_check, '') ILIKE '%avatars%'
        OR coalesce(qual, '') ILIKE '%request-photos%'
        OR coalesce(with_check, '') ILIKE '%request-photos%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_name);
  END LOOP;
END $$;

CREATE POLICY storage_public_media_read ON storage.objects FOR SELECT
  USING (bucket_id IN ('avatars', 'request-photos'));

CREATE POLICY storage_owner_media_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('avatars', 'request-photos')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY storage_owner_media_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('avatars', 'request-photos')
    AND owner_id = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN ('avatars', 'request-photos')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY storage_owner_media_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('avatars', 'request-photos')
    AND owner_id = auth.uid()::text
  );
