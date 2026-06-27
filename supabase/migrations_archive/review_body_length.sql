-- Defense-in-depth server-side cap on review free-text (the client already limits to
-- 500 chars; this stops a direct API call from inserting an abusive payload).
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_body_length;
ALTER TABLE reviews ADD CONSTRAINT reviews_body_length
  CHECK (body IS NULL OR char_length(body) <= 2000);
