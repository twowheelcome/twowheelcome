-- Buddy system (MVP): a mutual friendship between two riders.
-- One row per request; status flips to 'accepted' when the addressee accepts.
-- Two riders are buddies when an 'accepted' row exists in either direction.

CREATE TABLE IF NOT EXISTS buddies (
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

ALTER TABLE buddies ENABLE ROW LEVEL SECURITY;

-- Only the two people involved can see a buddy row (no cross-user reads).
DROP POLICY IF EXISTS buddies_select ON buddies;
CREATE POLICY buddies_select ON buddies FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- You can only send a request as yourself.
DROP POLICY IF EXISTS buddies_insert ON buddies;
CREATE POLICY buddies_insert ON buddies FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Only the addressee can accept (update) a pending request.
DROP POLICY IF EXISTS buddies_update ON buddies;
CREATE POLICY buddies_update ON buddies FOR UPDATE
  USING (auth.uid() = addressee_id)
  WITH CHECK (auth.uid() = addressee_id);

-- Either party can remove the relationship / decline.
DROP POLICY IF EXISTS buddies_delete ON buddies;
CREATE POLICY buddies_delete ON buddies FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
