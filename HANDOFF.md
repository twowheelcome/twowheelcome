# TWOWHEELCOME — Handoff (aktualizováno 2026-06-28)

Zápis pro pokračování v nové session bez paměti předchozí konverzace. Stručně a fakticky.

## 1) Co je twowheelcome

Seznamka **hostitel ↔ motorkář**: host nabídne bezpečné parkování pro motorku + nocleh,
jezdec na cestě si najde místo na přespání. **Není to booking** (žádné platby/rezervační
engine), je to **zdarma** — případný příspěvek („beer/tip") se řeší přímo mezi lidmi v chatu.
**Ochrana polohy je core:** veřejně (mapa) jen **zaokrouhlená poloha ~1 km**, přesný bod
host sdílí až **po akceptaci** žádosti v chatu.

**Stack:** Expo / React Native (Expo Router, SDK 56, web target) + **Supabase** (Postgres,
RLS, edge funkce). Web hostován na **Vercelu** (`www.twowheelcome.com`), repo lokálně.
Jazyk aplikace je **angličtina**.

### Přístup k živé DB / edge funkcím
- Supabase project ref: **`igrmxzvnadqckxjachdc`**.
- Access token v macOS Keychain: `security find-generic-password -s "Supabase CLI" -w`.
- SQL naostro: `POST https://api.supabase.com/v1/projects/<ref>/database/query` (Bearer token).
- Security advisor: `GET https://api.supabase.com/v1/projects/<ref>/advisors/security`.
- Deploy edge fn (bez Dockeru): `SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy <fn> --project-ref <ref> --use-api`.
- Edge funkce: `delete-account`, `notify-request`, `notify-review` (běží přes **service_role**).

## 2) Klíčová produktová rozhodnutí

- **Konverzace = per-location:** jedna konverzace = dvojice jezdců × jedno konkrétní
  `host_location`. Vynuceno triggery + RLS. Recenze vázané na konkrétní pobyt.
- Sekce v detailu místa: **„Where to sleep"** i **„Bike safety"** řazené **nejlepší nahoře**.
- **Profil vpravo nahoře, zvoneček vedle něj** — profil NEpatří do spodní lišty.
- **Messages = konverzace; zvoneček = události** (žádosti přijato/odmítnuto/zrušeno…). Oddělené.
- **Report konverzace zůstává** (DSA / bezpečnost) —capture + e-mail, žádná moderační UI.
- **„Beer welcome" (host vibe na listingu) a dev-tip na profilu ZŮSTÁVAJÍ.**
  **Tip z flow psaní recenze byl ODEBRÁN** (kdo chce dát tip, dá osobně).
- **Expirace pending** žádostí podle data **příjezdu**, překlápí o **lokální půlnoci**.

## 3) Konvence / pracovní preference (Petr)

- **Stručně a věcně**, žádný balast/motivační řeči. Odpovídat **česky**.
- **Vizuál Road&Trail:** krémová/grafit, **terakota** akcent, fonty **Oswald** (nadpisy/tlačítka)
  + **Inter** (text), hairline linky. **Nezavádět nové barvy** ani komponenty bez důvodu.
- **Neměnit nad rámec zadání / ptát se na úpravy.** Stabilní řešení před experimentem.
- **DB ověřovat naostro** (grep kódu + dotazy na živou DB) PŘED i PO změně.
- Každá změna: **commit/push** (na pokyn) + **tsc + eslint zelené**; u buildu ověřit `expo export`.
- **Migrace vždy živě I do baseline:** `supabase/migrations/00000000000000_baseline.sql`
  (kanonický celý schema; staré inkrementální migrace jsou v `migrations_archive/`).

## 4) Bezpečnostní model

- **RLS všude, owner-only** politiky jako default; žádné blanket „ALL" pro veřejnost.
- **Přesné souřadnice izolované:** tabulka **`host_location_coords`** (owner-only RLS;
  anon = 0 práv, authenticated = jen SELECT vlastních; zápis jen přes definer RPC
  `save_host_location`). `host_locations` drží **už jen zaokrouhlené** coords + nedůvěrná pole.
- **`host_locations_public`** = **`security_invoker` view** (ne SECURITY DEFINER) — řídí ho RLS
  volajícího; na veřejném povrchu nejsou žádné přesné coords, není co uniknout.
- Veřejné čtení listingů: RLS policy `host_locations_public_read` (jen nepauznuté řádky).
- Citlivá pole mimo veřejný surface: `profiles.push_token` nečitelné; notes server-side
  scrubnuté (`strip_location_notes`), recenze scrubnuté (`strip_review_coords`).
- Edge funkce přes **service_role** (má `bypassrls`); destruktivní RPC (`delete_account_data`)
  odebrané z anon/authenticated.
- **Reporty/audit v repu:** `REVIEW.md` (code review), `AUDIT.md` (security audit),
  `PERF.md` (výkon), `DEADCODE.md` (nepoužitý kód).

## 5) Otevřené / odložené úkoly

- **Právní texty** Podmínek + Zásad (`terms.tsx`, `privacy.tsx`): teď jen **předběžné znění
  + placeholdery**; finál je na Petrovi (po založení s.r.o.). Neměnit bez podkladů.
- **Překlady** EN/ES/FR/CZ/PL — až blíž launchi (app je zatím EN-only).
- **Perf** z `PERF.md`: **A** = virtualizace dlouhých seznamů, **F** = zúžení realtime
  odběrů, + drobnosti.
- **LOW nálezy L1–L7** z `REVIEW.md` (nízká priorita).
- Cleanup: žádné kritické zbytky nezůstaly (bike/vehicle balík i nepoužité npm deps už
  odebrané; DB sloupce pročištěné).
