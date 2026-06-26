-- Host listing photos (public, max 3) + a price amount for 'Paid' listings. Safe to re-run.

-- 1) Columns on host_locations.
ALTER TABLE host_locations
  ADD COLUMN IF NOT EXISTS photos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS price_amount numeric,
  ADD COLUMN IF NOT EXISTS price_unit text;

-- At most 3 listing photos.
ALTER TABLE host_locations DROP CONSTRAINT IF EXISTS host_locations_photos_max3;
ALTER TABLE host_locations ADD CONSTRAINT host_locations_photos_max3
  CHECK (array_length(photos, 1) IS NULL OR array_length(photos, 1) <= 3);

-- Keep the price label short if set.
ALTER TABLE host_locations DROP CONSTRAINT IF EXISTS host_locations_price_unit_len;
ALTER TABLE host_locations ADD CONSTRAINT host_locations_price_unit_len
  CHECK (price_unit IS NULL OR char_length(price_unit) <= 40);

-- 2) Expose the new fields on the public view (append-only keeps CREATE OR REPLACE happy).
CREATE OR REPLACE VIEW host_locations_public AS
  SELECT id,
    user_id,
    round(location_lat::numeric, 2)::double precision AS location_lat,
    round(location_lng::numeric, 2)::double precision AS location_lng,
    location_city,
    location_country,
    parking,
    parkings,
    sleep_types,
    amenities,
    pricing,
    pricings,
    vehicle_types,
    max_guests,
    notes,
    created_at,
    photos,
    price_amount,
    price_unit
  FROM host_locations;

-- The view runs as its owner (security_invoker=false), so it must stay read-only to clients.
REVOKE ALL ON public.host_locations_public FROM anon, authenticated;
GRANT SELECT ON public.host_locations_public TO anon, authenticated;

-- 3) Public bucket for listing photos (separate from the private request-photos bucket).
INSERT INTO storage.buckets (id, name, public)
  VALUES ('listing-photos', 'listing-photos', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

-- Owner-only writes (upload into your own folder), public read. Mirrors the avatars rules
-- but scoped to listing-photos so the existing avatars/request-photos policies are untouched.
DROP POLICY IF EXISTS "storage_listing_insert" ON storage.objects;
CREATE POLICY "storage_listing_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'listing-photos' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "storage_listing_update" ON storage.objects;
CREATE POLICY "storage_listing_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'listing-photos' AND owner_id = (auth.uid())::text)
  WITH CHECK (bucket_id = 'listing-photos' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "storage_listing_delete" ON storage.objects;
CREATE POLICY "storage_listing_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'listing-photos' AND owner_id = (auth.uid())::text);

DROP POLICY IF EXISTS "storage_listing_read" ON storage.objects;
CREATE POLICY "storage_listing_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-photos');
