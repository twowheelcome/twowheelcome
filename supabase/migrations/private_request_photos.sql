-- Make request-photos private. These are photos riders attach to a knock; while the
-- bucket was public=true they were readable by anyone holding the URL. Now:
--   * the bucket is private (no public URL access),
--   * stay_requests.photo_url stores the object PATH (not a public URL),
--   * a storage SELECT policy lets only the two participants of the stay request that
--     references an object read/sign it — so access tracks "can you see this request"
--     (same participants as the request's RLS), and the client renders via signed URLs.
-- Safe to re-run.

-- 1) Convert any stored public URLs to bare object paths (idempotent: a bare path has no
--    '/request-photos/' marker and is left unchanged). validate_stay_request_write makes
--    stay_requests immutable except status, so this one-time data fix skips triggers.
DO $$
BEGIN
  SET LOCAL session_replication_role = replica;
  UPDATE stay_requests
     SET photo_url = regexp_replace(photo_url, '^.*/request-photos/', '')
   WHERE photo_url LIKE '%/request-photos/%';
END $$;

-- 2) Flip the bucket to private.
UPDATE storage.buckets SET public = false WHERE id = 'request-photos';

-- 3) Participants of the referencing stay request may SELECT (and therefore sign) the
--    object. No row for anon (auth.uid() is null) or any non-participant.
DROP POLICY IF EXISTS "storage_request_photo_participant_read" ON storage.objects;
CREATE POLICY "storage_request_photo_participant_read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'request-photos'
    AND EXISTS (
      SELECT 1 FROM public.stay_requests s
      WHERE s.photo_url = storage.objects.name
        AND (s.guest_id = auth.uid() OR s.host_id = auth.uid())
    )
  );
