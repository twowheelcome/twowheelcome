ALTER TABLE host_locations
  ADD COLUMN IF NOT EXISTS parkings text[] DEFAULT '{}';

ALTER TABLE stay_requests
  ADD COLUMN IF NOT EXISTS guest_vehicle text;
