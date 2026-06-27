CREATE TABLE IF NOT EXISTS host_locations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  location_lat double precision NOT NULL,
  location_lng double precision NOT NULL,
  location_city text DEFAULT '',
  location_country text DEFAULT '',
  parking text DEFAULT 'yard',
  max_guests integer DEFAULT 2,
  pricing text DEFAULT 'free',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE host_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read host_locations"
  ON host_locations FOR SELECT USING (true);

CREATE POLICY "Owner manages host_locations"
  ON host_locations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
