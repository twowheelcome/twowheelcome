ALTER TABLE host_locations
  ADD COLUMN IF NOT EXISTS pricings text[] DEFAULT '{}';
