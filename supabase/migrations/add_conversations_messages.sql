-- Conversations: one per user pair (user_a < user_b lexicographically)
CREATE TABLE IF NOT EXISTS conversations (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_a          uuid REFERENCES auth.users(id) NOT NULL,
  user_b          uuid REFERENCES auth.users(id) NOT NULL,
  last_message_at timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now(),
  UNIQUE(user_a, user_b)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conv_select" ON conversations
  FOR SELECT USING (auth.uid() = user_a OR auth.uid() = user_b);
CREATE POLICY "conv_insert" ON conversations
  FOR INSERT WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);
CREATE POLICY "conv_update" ON conversations
  FOR UPDATE USING (auth.uid() = user_a OR auth.uid() = user_b);

-- Messages: chat messages within a conversation
CREATE TABLE IF NOT EXISTS messages (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id       uuid REFERENCES auth.users(id) NOT NULL,
  body            text,
  photo_url       text,
  request_id      uuid REFERENCES stay_requests(id),
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "msg_select" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );
CREATE POLICY "msg_insert" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );

-- Stay requests: add conversation link + guest photo
ALTER TABLE stay_requests
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id),
  ADD COLUMN IF NOT EXISTS photo_url       text;

-- Enable Realtime for live messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
