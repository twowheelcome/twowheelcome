-- Stop anonymous ENUMERATION of bike photos. Anyone could list (and thus download)
-- every object in request-photos via the storage list API, because the public SELECT
-- policy covered both buckets. A public bucket serves individual objects through its
-- public object URL WITHOUT consulting RLS, so the chat's <img src=getPublicUrl(...)>
-- keeps working; only the bucket-listing/enumeration is removed. Avatars (public
-- profile pictures) stay listable.
DROP POLICY IF EXISTS storage_public_media_read ON storage.objects;
CREATE POLICY storage_public_media_read ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
