-- Add a coarse "district" (suburb/neighbourhood) to listings so the public place name can
-- read "Garage in Prague (Smíchov), CZ". District is coarser than the already-public ~1km
-- coords, so nothing precise leaks; the exact street/coords stay owner-only in
-- host_location_coords. Filled from the geocoder when a host sets the location.

-- 1) Column on the base table.
ALTER TABLE public.host_locations
  ADD COLUMN IF NOT EXISTS location_district text DEFAULT ''::text;

-- 2) Expose it on the public (security_invoker) view. DROP + CREATE (not REPLACE) because the
--    new column is inserted mid-list, which REPLACE forbids. No DB object depends on the view
--    (app queries only), so dropping is safe; grants are reapplied below.
DROP VIEW IF EXISTS host_locations_public;
CREATE VIEW host_locations_public WITH (security_invoker=on) AS
 SELECT id,
    user_id,
    round(location_lat::numeric, 2)::double precision AS location_lat,
    round(location_lng::numeric, 2)::double precision AS location_lng,
    location_city,
    location_country,
    location_district,
    parking,
    parkings,
    sleep_types,
    amenities,
    pricing,
    pricings,
    max_guests,
    notes,
    created_at,
    photos,
    price_amount,
    price_currency
   FROM host_locations
  WHERE (NOT COALESCE(paused, false));

GRANT SELECT ON host_locations_public TO anon;
GRANT SELECT ON host_locations_public TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON host_locations_public TO service_role;

-- 3) save_host_location: accept and persist p_district. The argument list changes, so the
--    old signature is dropped and recreated (everything else identical to baseline).
DROP FUNCTION IF EXISTS public.save_host_location(uuid,double precision,double precision,text,text,text[],text,text[],text[],integer,text[],text,text,text[],numeric,text,boolean);

CREATE OR REPLACE FUNCTION public.save_host_location(
  p_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_city text,
  p_country text,
  p_district text,
  p_parkings text[],
  p_parking text,
  p_sleep_types text[],
  p_amenities text[],
  p_max_guests integer,
  p_pricings text[],
  p_pricing text,
  p_notes text,
  p_photos text[],
  p_price_amount numeric,
  p_price_currency text,
  p_paused boolean
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING errcode = '28000'; END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION 'Missing location id'; END IF;
  IF p_lat IS NULL OR p_lng IS NULL THEN RAISE EXCEPTION 'Missing coordinates'; END IF;

  SELECT user_id INTO v_owner FROM host_locations WHERE id = p_id;
  IF v_owner IS NOT NULL AND v_owner <> v_uid THEN
    RAISE EXCEPTION 'Not allowed to edit another user''s location';
  END IF;

  INSERT INTO host_locations (
    id, user_id, paused, location_lat, location_lng, location_city, location_country, location_district,
    parkings, parking, sleep_types, amenities, max_guests, pricings, pricing,
    notes, photos, price_amount, price_currency
  ) VALUES (
    p_id, v_uid, COALESCE(p_paused, false),
    round(p_lat::numeric, 2)::double precision, round(p_lng::numeric, 2)::double precision,
    p_city, p_country, p_district, p_parkings, p_parking, p_sleep_types, p_amenities, p_max_guests,
    p_pricings, p_pricing, p_notes, p_photos, p_price_amount, p_price_currency
  )
  ON CONFLICT (id) DO UPDATE SET
    paused = excluded.paused,
    location_lat = excluded.location_lat,
    location_lng = excluded.location_lng,
    location_city = excluded.location_city,
    location_country = excluded.location_country,
    location_district = excluded.location_district,
    parkings = excluded.parkings,
    parking = excluded.parking,
    sleep_types = excluded.sleep_types,
    amenities = excluded.amenities,
    max_guests = excluded.max_guests,
    pricings = excluded.pricings,
    pricing = excluded.pricing,
    notes = excluded.notes,
    photos = excluded.photos,
    price_amount = excluded.price_amount,
    price_currency = excluded.price_currency
  WHERE host_locations.user_id = v_uid;

  INSERT INTO host_location_coords (location_id, user_id, lat, lng)
  VALUES (p_id, v_uid, p_lat, p_lng)
  ON CONFLICT (location_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng;
END
$function$
;
REVOKE EXECUTE ON FUNCTION public.save_host_location(uuid,double precision,double precision,text,text,text,text[],text,text[],text[],integer,text[],text,text,text[],numeric,text,boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.save_host_location(uuid,double precision,double precision,text,text,text,text[],text,text[],text[],integer,text[],text,text,text[],numeric,text,boolean) TO authenticated;
