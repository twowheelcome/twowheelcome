-- #8 Allow a host to remove a location once it has no active (pending/accepted)
-- requests. Old or rejected requests are kept for history but their (now-deleted)
-- location link is set to NULL instead of blocking the delete at the FK level.

ALTER TABLE stay_requests DROP CONSTRAINT IF EXISTS stay_requests_location_id_fkey;
ALTER TABLE stay_requests
  ADD CONSTRAINT stay_requests_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES host_locations(id) ON DELETE SET NULL;
