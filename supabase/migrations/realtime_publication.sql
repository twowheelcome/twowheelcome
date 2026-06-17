-- Ensure the chat's realtime tables are in the publication. messages drives the
-- live message append + unread; stay_requests drives the live accept/reject status
-- update inside an open conversation. Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'stay_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE stay_requests;
  END IF;
END $$;
