ALTER TABLE stay_requests
  ADD COLUMN IF NOT EXISTS arrival_time text;
