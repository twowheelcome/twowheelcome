@AGENTS.md

# Pokračování práce

Než začneš, přečti **[HANDOFF.md](HANDOFF.md)** — celý kontext projektu pro novou session:
co je twowheelcome, klíčová produktová rozhodnutí, pracovní konvence (Petr), bezpečnostní
model a otevřené úkoly.

Nejdůležitější: app = seznamka host↔motorkář (NE booking, zdarma); **poloha je core** —
veřejně jen ~1 km, přesné coords v owner-only `host_location_coords`, `host_locations_public`
je `security_invoker` view. **Migrace vždy živě I do baseline** (`supabase/migrations/00000000000000_baseline.sql`),
DB ověřovat naostro, každá změna tsc+eslint zelené. Vizuál Road&Trail (krémová/grafit +
terakota, Oswald+Inter) — nezavádět nové barvy. Reporty: REVIEW.md, AUDIT.md, PERF.md, DEADCODE.md.
