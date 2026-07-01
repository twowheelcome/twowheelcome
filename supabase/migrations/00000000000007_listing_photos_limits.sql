-- Guardrails on the listing-photos bucket: cap file size and restrict to image types, so an
-- oversized or wrong file fails fast with a clear error instead of a long upload that hangs.
-- Uploads are compressed to JPEG client-side (~150–400 KB); 8 MB is generous headroom for the
-- best-effort "upload original" fallback. The limits are also folded into the baseline
-- storage.buckets insert for listing-photos, so a fresh deploy gets the same guardrails.

UPDATE storage.buckets
SET file_size_limit = 8388608,   -- 8 MB
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
WHERE id = 'listing-photos';
