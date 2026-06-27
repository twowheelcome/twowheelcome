-- Operational (not schema): the weekly support-interest digest cron. Reuses the pg_cron +
-- pg_net extensions and the Vault secret 'cron_secret' (same as the review reminder; must
-- match the CRON_SECRET env var of the support-digest edge function). Safe to re-run.
-- The URL is this project's; change it for another project ref.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'support-digest-weekly') THEN
    PERFORM cron.unschedule('support-digest-weekly');
  END IF;
END $$;

-- Mondays at 09:00 UTC.
SELECT cron.schedule('support-digest-weekly', '0 9 * * 1', $cron$
  SELECT net.http_post(
    url     := 'https://igrmxzvnadqckxjachdc.supabase.co/functions/v1/support-digest',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
$cron$);
