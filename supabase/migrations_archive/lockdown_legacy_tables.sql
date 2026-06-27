-- host_profiles and bikes are leftovers from an earlier schema and are unused by the
-- app (the live model is profiles + host_locations). host_profiles had RLS DISABLED
-- and full anon/authenticated grants, exposing a test host's EXACT GPS + notes to any
-- anonymous client (and allowing writes/deletes). Lock both down (deny-all) without
-- dropping, so nothing references a missing table.
REVOKE ALL PRIVILEGES ON public.host_profiles FROM anon, authenticated;
ALTER TABLE public.host_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON public.bikes FROM anon, authenticated;
ALTER TABLE public.bikes ENABLE ROW LEVEL SECURITY;
