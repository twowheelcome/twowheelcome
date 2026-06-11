ALTER TABLE host_locations
  ADD COLUMN IF NOT EXISTS vehicle_types text[] DEFAULT '{}';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS vehicle_types text[] DEFAULT '{}';
