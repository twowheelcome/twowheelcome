-- Operational (not schema): the daily review-reminder cron. Needs the pg_cron + pg_net
-- extensions and a Vault secret named 'cron_secret' that matches the CRON_SECRET env var of
-- the notify-review edge function. Create the secret once per project:
--   SELECT vault.create_secret('<your-secret>', 'cron_secret');
-- Safe to re-run. The URL is this project's; change it for another project ref.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-review-daily') THEN
    PERFORM cron.unschedule('notify-review-daily');
  END IF;
END $$;

SELECT cron.schedule('notify-review-daily', '0 10 * * *', $cron$
  SELECT net.http_post(
    url     := 'https://igrmxzvnadqckxjachdc.supabase.co/functions/v1/notify-review',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
$cron$);
