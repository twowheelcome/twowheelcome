-- Expose profiles.created_at for reading ("member since"). The column existed but had no
-- column-scoped SELECT grant, so any select that included it failed for anon/authenticated
-- (the whole row read errored). Account creation date is non-sensitive and already shown on
-- profiles, so grant SELECT like the other public identity columns.

GRANT SELECT (created_at) ON profiles TO anon;
GRANT SELECT (created_at) ON profiles TO authenticated;
