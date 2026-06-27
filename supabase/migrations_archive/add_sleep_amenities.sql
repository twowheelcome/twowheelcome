ALTER TABLE host_locations
  ADD COLUMN IF NOT EXISTS sleep_types text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS amenities text[] DEFAULT '{}';
