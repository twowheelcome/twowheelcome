-- Persistent per-user read state for conversations, so "unread" survives an app
-- restart and is correct (a newer message re-marks a conversation unread).
-- A conversation is unread for a user when last_message_at > their last_read_at.

CREATE TABLE IF NOT EXISTS conversation_reads (
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

ALTER TABLE conversation_reads ENABLE ROW LEVEL SECURITY;

-- Each user only sees and writes their own read markers (no cross-user access).
DROP POLICY IF EXISTS cr_all ON conversation_reads;
CREATE POLICY cr_all ON conversation_reads FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
