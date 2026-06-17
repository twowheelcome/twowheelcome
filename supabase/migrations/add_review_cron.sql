-- pg_cron: daily review reminder notifications
-- Requires: pg_cron and pg_net extensions (both available in Supabase)
--
-- Before applying this migration run once in SQL Editor:
--   SELECT vault.create_secret('your-secret-here', 'cron_secret');
-- And add the same secret to Edge Function env:
--   supabase secrets set CRON_SECRET=your-secret-here

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'notify-review-daily',
  '0 10 * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://igrmxzvnadqckxjachdc.supabase.co/functions/v1/notify-review',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $cron$
);
