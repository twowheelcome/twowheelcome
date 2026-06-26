-- Narrow the price currency to well-known global majors (default still EUR). Fixes the
-- earlier European-only set that wrongly blocked USD. Safe to re-run.
ALTER TABLE host_locations DROP CONSTRAINT IF EXISTS host_locations_price_currency_chk;
ALTER TABLE host_locations ADD CONSTRAINT host_locations_price_currency_chk
  CHECK (price_currency IS NULL OR price_currency IN
    ('EUR','USD','GBP','CHF','JPY','CAD','AUD','CZK'));
