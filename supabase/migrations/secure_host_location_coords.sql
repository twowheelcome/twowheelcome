-- #2 Stop leaking exact host coordinates before a request is accepted.
--
-- The base host_locations table kept exact GPS readable by anyone (public read),
-- so the map "fuzzing" was cosmetic only. We now:
--   * remove the blanket public read on the base table (exact coords stay
--     readable only by the OWNER, via the existing "Owner manages" policy);
--   * expose a public VIEW with COARSE (rounded ~1 km) coordinates that the
--     map / public profile read instead.
-- The exact spot is still shared with the guest the normal way: the host sends
-- it as a chat message once they accept the request.
--
-- Owner editing (become-host), and the host reading their own location to send
-- coordinates, keep working because they go through the base table as the owner.

-- 1) Drop the blanket public read on the base table.
DROP POLICY IF EXISTS "Public read host_locations" ON host_locations;

-- 2) Public view with rounded coordinates (~2 decimals ≈ 1 km). Runs with the
--    view owner's rights so it can read all rows, but only exposes coarse coords.
--    DROP + CREATE (not CREATE OR REPLACE) so column changes/reorders are safe.
DROP VIEW IF EXISTS host_locations_public;
CREATE VIEW host_locations_public
WITH (security_invoker = false) AS
SELECT
  id,
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
  created_at
FROM host_locations;

GRANT SELECT ON host_locations_public TO anon, authenticated;
