ALTER TABLE stay_requests
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES host_locations(id);

CREATE INDEX IF NOT EXISTS stay_requests_location_id_idx
  ON stay_requests(location_id);
