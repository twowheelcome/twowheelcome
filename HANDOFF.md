# TWOWHEELCOME — Handoff (2026-06-18)

Stav pro navázání v čerstvé session. App běží jako **web** (Expo Router static export → Vercel, doména `www.twowheelcome.com`). Backend Supabase (project ref `igrmxzvnadqckxjachdc`). DB se spravuje migracemi v `supabase/migrations/`; na živou DB je lze pustit přes Supabase **access token** uloženy v macOS Keychain (`security find-generic-password -s "Supabase CLI" -w`) a Management API `POST https://api.supabase.com/v1/projects/<ref>/database/query`.

## Tip pro novou session
- Reálnou app UI mezi dvěma účty v prohlížeči **nelze spolehlivě reprodukovat** (vstříknutá session nedostává realtime; localhost je v browser MCP blokovaný; heslo do formuláře zadávat nesmím). Ověřuj přes **Node s reálnými přihlášenými klienty** proti živé DB (vytvoř testovací účty přes token, signUp + confirm `email_confirmed_at`, signIn). Testovací data jsou jednorázová, ukliď po sobě.

## Aktuální model (DŮLEŽITÁ ZMĚNA)
**Konverzace jsou nově vázané na konkrétní místo hostitele** (per-location): jedna konverzace = dvojice jezdců × jedno `host_location`. `conversations.location_id`, štítek místa v seznamu i v hlavičce chatu, recenze vázané na konkrétní pobyt (`reviewRequest` param).

DB to vynucuje **triggery + RLS**:
- `validate_conversation_write` — seřazení userů (`user_a < user_b`), místo patří jednomu z účastníků, neměnnost účastníků/místa.
- `validate_stay_request_write` — INSERT jen PENDING, guest≠host, validní data, místo patří hostiteli, konverzace sedí; UPDATE jen status PENDING→ACCEPTED/REJECTED a **jen hostitelem**.
- `validate_message_request` — zpráva se request_id musí být ve stejné konverzaci.

## Hotové a ověřené (na živé DB)
- **Per-místo model funguje end-to-end** (Node, reálné účty): místo → konverzace → žádost → zpráva → host přijme; cizí nemůže přijmout (RLS).
- **Realtime doručování jede** na novém modelu: host s otevřenou konverzací dostane živě zprávy od guesta (i dvě po sobě). Ověřeno `messages-stream` kanálem.
- **Bezpečnost (anon test):** žádosti/zprávy/konverzace = prázdno; `profiles.push_token` = 401 (column-level grant); přesné GPS skryté; veřejný profil + přibližná poloha čitelné.
- **Host_locations „id null" blocker** opraven (klient generuje UUID nové lokaci) — uložení prvního i druhého místa OK i pod novou RLS.
- **Mapa pro výběr polohy** zvětšena na 400 px.
- **Chat append fix (render):** příchozí zprávu připojuje `useEffect([incomingMsg, selected])` přes živý stav `selected` (ne přes ref). Realtime + logika ověřené; **vizuálně v reálném UI neověřeno** (viz limit nahoře).
- **Realtime publication:** `messages` i `stay_requests` v `supabase_realtime` (živý append i živý accept/reject).

## Migrace — APLIKOVANÉ na živou DB
- `secure_profiles_storage.sql` — profiles RLS + column-grants (skryt push_token), storage owner-folder politiky.
- `security_location_conversations.sql` — **TRUNCATE testovacích dat** (konverzace/zprávy/recenze/žádosti, schválené), per-location konverzace, triggery, RLS na conversations/messages/stay_requests/reviews/host_locations, nový view `host_locations_public` (bez `notes`), tabulka `request_notification_events`.
- `realtime_publication.sql` — messages + stay_requests do publication.
- (Starší migrace v repu jsou historické; živý stav RLS řídí `security_location_conversations.sql`.)
- `profiles` a `host_locations` se NETRUNCATEovaly — Petrovy účty i jeho inzeráty zůstaly.

## NEAPLIKOVANÉ / TODO pro Petra
- **Edge funkce NEJSOU nasazené** (chybí Supabase CLI / deploy funkcí). Kód je commitnutý, ale na Supabase běží STARÉ verze:
  - `notify-request` (nová = idempotence přes `request_notification_events`),
  - `notify-review` (nová = `reviewRequest` v URL),
  - `delete-account` (nová = anonymizace odcházejícího účastníka + úklid storage; **stará verze nesedí na nový model** — mazání účtu spoléhej až po nasazení nové).
  - Nasadit: `supabase functions deploy notify-request notify-review delete-account` (Supabase CLI + login).
- **Legal stránky** (`privacy.tsx`, `terms.tsx`) — Petr chtěl doplnit firemní/GDPR údaje (správce, adresa, právní základ, retence, dozorový úřad). Neměnit bez jeho podkladů.
- **Reset hesla** — v Supabase Auth povolit redirect URL `…/reset-password` (jinak odkaz z e-mailu míří jinam).

## Chat — co přesně se zkoušelo a co zbývá
Problém: v otevřené konverzaci nová zpráva nenaskakovala živě (tečka nepřečteno ano). Postupně: (1) RLS realtime token, (2) sjednocení dvou kanálů do jednoho `messages-stream`, (3) pojistka proti duplicitnímu subscribe, (4) **přesun append z refu do `useEffect[incomingMsg, selected]`** (nynější stav). Realtime delivery + handler logika prokázané v Node; samotné React vykreslení v reálné app nešlo reprodukovat.
**Zbývá ověřit (Petr, dvě reálné session na NOVÉM modelu):** otevřít stejnou per-místo konverzaci na obou, poslat zprávu → musí naskočit živě + odscrollovat dolů; a živý accept/reject (host přijme → guestovi se v otevřeném chatu změní stav karty). Pokud i teď NE: další podezřelý je React render/instance — doporučený krok je **debug zápis z handleru do DB tabulky** (čte se přes token), aby se zachytily reálné runtime hodnoty z Petrovy session.

## Co musí Petr proklikat pod dvěma účty
1. Chat: živý append nové zprávy + scroll dolů + tečka nepřečteno.
2. Živý accept/reject: hostitel přijme → guest vidí změnu stavu v otevřeném chatu.
3. Become a host: uložit první místo, přidat druhé (id-blocker), použitelnost větší mapy.
4. Knock: zaklepat na konkrétní místo → konverzace vázaná na to místo, štítek místa sedí.
5. Recenze: po přijatém ukončeném pobytu výzva k hodnocení vázaná na ten pobyt.
6. Mazání účtu — až po nasazení nové edge funkce.

## Kde přesně pokračovat
1. Nasadit edge funkce (viz TODO).
2. Po Petrově testu chatu: jestli živý append jede → hotovo; jestli ne → DB-debug capture z handleru + analýza render/instance.
3. Doplnit legal údaje (čeká na Petra).
