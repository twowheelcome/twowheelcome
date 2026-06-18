-- Expose the host's rider-facing description (notes) on the public view so riders can
-- read it before they knock. notes is a PUBLIC place description — unlike the private
-- location_name (owner-only, deliberately NOT in this view) and unlike the exact
-- coordinates (still rounded here for privacy).
DROP VIEW IF EXISTS host_locations_public;
CREATE VIEW host_locations_public
WITH (security_invoker = false) AS
SELECT
  id, user_id,
  round(location_lat::numeric, 2)::double precision AS location_lat,
  round(location_lng::numeric, 2)::double precision AS location_lng,
  location_city, location_country, parking, parkings, sleep_types, amenities,
  pricing, pricings, vehicle_types, max_guests, notes, created_at
FROM host_locations;
GRANT SELECT ON host_locations_public TO anon, authenticated;
