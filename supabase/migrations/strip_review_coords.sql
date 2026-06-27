-- Backstop: strip obvious GPS coordinate pairs from a review body on write, so a review
-- can't leak the host's exact location even via a direct API call. The client does the same
-- for UX. Requires 3+ decimals, so prices like "20.50" are untouched. Safe to re-run.
CREATE OR REPLACE FUNCTION public.strip_review_coords()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.body IS NOT NULL THEN
    NEW.body := btrim(regexp_replace(
      regexp_replace(NEW.body,
        '[0-9]{1,3}\.[0-9]{3,}[[:space:],;]+[0-9]{1,3}\.[0-9]{3,}', '', 'g'),
      '[[:space:]]{2,}', ' ', 'g'));
    IF NEW.body = '' THEN NEW.body := NULL; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS strip_review_coords_trigger ON reviews;
CREATE TRIGGER strip_review_coords_trigger
  BEFORE INSERT OR UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION strip_review_coords();
