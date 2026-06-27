-- Add a currency to the Paid price (default EUR, small European set). Replaces the free
-- price_unit text — the period is implicitly "per night". Safe to re-run.

ALTER TABLE host_locations ADD COLUMN IF NOT EXISTS price_currency text;

ALTER TABLE host_locations DROP CONSTRAINT IF EXISTS host_locations_price_currency_chk;
ALTER TABLE host_locations ADD CONSTRAINT host_locations_price_currency_chk
  CHECK (price_currency IS NULL OR price_currency IN
    ('EUR','CZK','GBP','CHF','PLN','HUF','DKK','SEK','NOK','RON','BGN'));

-- Expose it on the public view (append-only).
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
    price_unit,
    price_currency
  FROM host_locations;

REVOKE ALL ON public.host_locations_public FROM anon, authenticated;
GRANT SELECT ON public.host_locations_public TO anon, authenticated;
