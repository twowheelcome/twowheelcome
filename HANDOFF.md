# TWOWHEELCOME — Handoff (noční běh, 2026-06-18)

Krátké shrnutí pro Petra je úplně dole („Co ráno otestovat"). Tahle část je technická,
pro navázání v další session.

App běží jako **web** (Expo Router static export → Vercel, doména `www.twowheelcome.com`).
Backend **Supabase** (project ref `igrmxzvnadqckxjachdc`). Migrace v `supabase/migrations/`.
Na živou DB i edge funkce se dostaneš přes **Supabase access token** v macOS Keychain:
`security find-generic-password -s "Supabase CLI" -w`. SQL na živou DB jde přes Management
API `POST https://api.supabase.com/v1/projects/<ref>/database/query`. Edge funkce se
nasazují `SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy <fn> --project-ref <ref> --use-api`
(funguje bez Dockeru).

## Model (důležité)
**Konverzace jsou vázané na konkrétní místo hostitele** (per-location): jedna konverzace =
dvojice jezdců × jedno `host_location`. Vynuceno triggery + RLS (`validate_conversation_write`,
`validate_stay_request_write`, `validate_message_request`). Recenze vázané na konkrétní pobyt.

---

## ✅ Ověřeno NAOSTRO dnes v noci (živá DB, reální přihlášení klienti)

- **CHAT — hlavní cíl — realtime funguje.** Otestováno dvěma reálnými přihlášenými klienty
  přes Node, přesně s tím nastavením kanálu jako appka (jeden kanál `messages-stream`, dvě
  postgres_changes vazby):
  - **Živé naskočení zprávy** od druhého účastníka v otevřené konverzaci → ✅ PASS.
  - **Živá změna stavu** (host přijme/odmítne → druhé straně se v otevřeném chatu změní
    karta) → ✅ PASS.
  - Spuštěno 4×, prošlo 3×; jediné selhání byl úplně první „studený" běh (první událost se
    občas ztratí, než se realtime spojení plně ustaví). V appce je spojení trvale otevřené
    a seznam se navíc obnovuje při přepnutí na záložku, takže je vůči tomu odolná.
  - Regresní test je v repu: `node scripts/chat-realtime-autotest.mjs` (potřebuje token,
    sám si vytvoří i smaže testovací účty). Manuální verze pro dva reálné účty:
    `scripts/chat-realtime-test.mjs`.
  - Pozn.: samotné React vykreslení nejde ověřit z Node, ale append cesta v kódu je
    správně (příchozí zprávu připojuje `useEffect([incomingMsg, selected])` přes živý stav
    otevřené konverzace) a doručení dat je prokázané. Petr ať to přesto proklikne (níže).

- **Klient ↔ DB jsou v souladu.** Zakládání knocku (mapa → konverzace → žádost → zpráva)
  přesně odpovídá novým triggerům (seřazení `user_a < user_b`, `location_id`, status PENDING).
- **Živá DB 100% odpovídá migracím v repu** (ověřeno introspekcí): 3 validační triggery,
  RLS politiky (conversations 3 / messages 2 / stay_requests 3 / reviews 2 / profiles 3 /
  host_locations 1), `conversation_reads` i `request_notification_events` existují, `buddies`
  dropnuté, view `host_locations_public`, cron `notify-review-daily` (10:00).
- **Bezpečnost (anon test):** `host_locations_public` vrací jen zaokrouhlené souřadnice;
  `profiles.push_token` = „permission denied" (nečitelné); veřejné jméno čitelné.
- **Build / typy / lint procházejí.** Žádné polotovary, debug logy ani mrtvá tlačítka.

## ✅ Opraveno / nasazeno dnes v noci

- **Edge funkce NASAZENÉ** (předtím byly podle starého handoffu nenasazené). Nasadil jsem
  aktuální commitnutý kód všech tří: `delete-account`, `notify-request`, `notify-review`.
  Tím odpadlo riziko, že stará `delete-account` nesedí na nový model.
  - ⚠️ Mazání účtu jsem **neinvokoval** (je destruktivní). Petr ať otestuje smazání účtu
    s jednorázovým účtem.
- **NOVÝ FIX — profil se nově zakládá automaticky při registraci.** Našel jsem reálný
  nedostatek: na `auth.users` nebyl žádný trigger, takže nový uživatel s potvrzením e-mailu
  končil **bez profilu a bez jména** (jméno z registrace se ztratilo). 2 z 12 účtů profil
  neměly. Přidal jsem migraci `add_profile_autocreate.sql` (trigger `on_auth_user_created`
  + backfill), **aplikoval na živou DB** a ověřil: registrace „Jan Novák" → profil se jménem
  vznikne sám. Po backfillu má profil všech 12 účtů. (Commitnuto.)

## Body ze zadání
1. Soulad klient ↔ DB (priorita č. 1): ✅ v pořádku.
2. host_locations „id null" blocker: ✅ vyřešeno dřív (klient generuje UUID).
3. Mapa při zakládání místa moc malá: ✅ zvětšená na 400 px přes šířku.
4. Chat živé naskočení + scroll: ✅ realtime ověřen naostro (viz výše).

---

## ⚠️ JEDINÝ otevřený launch blocker (musí vyřešit Petr — není to kód)
**Potvrzování e-mailu je zapnuté → bez funkčního odesílání e-mailů (SMTP) se nový uživatel
nepřihlásí.** Při registraci appka říká „Check your email to confirm your account". Když SMTP
není nastavené, e-mail nedorazí. Možnosti (rozhodnutí na Petrovi):
- **A) Nastavit SMTP** v Supabase (Auth → Emails) — doporučeno; fungují i resety hesla.
- **B) Dočasně vypnout potvrzování e-mailu** (Auth → Providers → Email → „Confirm email" off)
  — lidé se přihlásí hned, ale bez ověření e-mailu.
- Související: v Auth povolit redirect URL `…/reset-password` (jinak reset míří jinam).

## Menší TODO (nízká priorita)
- **Legal stránky** (`privacy.tsx`, `terms.tsx`) — doplnit firemní/GDPR údaje (čeká na Petrovy
  podklady; neměnit bez nich).
- Jeden nepotvrzený testovací účet `nighttest_…@example.com` zůstal z mého prvního zkoušení
  (neškodný, nejde se s ním přihlásit) — případně smazat v Supabase → Auth → Users.

## Co ráno otestovat pod dvěma účty
1. **Chat:** otevřít stejnou konverzaci na dvou účtech, napsat z jednoho → u druhého musí
   zpráva naskočit živě a okno odscrollovat dolů; tečka „nepřečteno" svítí a po otevření zhasne.
2. **Accept/reject živě:** host přijme/odmítne → druhé straně se v otevřeném chatu změní stav.
3. **Become a host:** uložit první místo, přidat druhé, pohodlně napíchnout bod na (větší) mapě.
4. **Knock:** zaklepat na konkrétní místo → konverzace vázaná na to místo, štítek místa sedí.
5. **Jméno:** nový registrovaný uživatel má po přihlášení rovnou své jméno (ne „Rider").
6. **Recenze:** po přijatém ukončeném pobytu výzva k hodnocení vázaná na ten pobyt.
7. **Mazání účtu** (jednorázovým účtem) — funkce je nově nasazená.
