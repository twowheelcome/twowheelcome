---
name: project-twowheelcome
description: Stav projektu TWOWHEELCOME — kompletní přehled co je hotovo a co je na řadě
metadata:
  type: project
---

Projekt: TWOWHEELCOME — mobilní appka pro motorkáře/cyklisty (Warmshowers-style hospitality)
Petr je úplný začátečník, rozhoduje za něj Claude, Petr jen schvaluje směr.

## Hotová struktura souborů

```
src/app/
  _layout.tsx          ← Stack navigace (auth → tabs, become-host jako modal)
  index.tsx            ← přihlašovací obrazovka (funguje)
  become-host.tsx      ← formulář "stát se hostitelem" (nový)
  (tabs)/
    _layout.tsx        ← spodní navigace se 3 záložkami
    map.tsx            ← mapa + seznam hostitelů (funguje)
    requests.tsx       ← doručená pošta — poslaté/přijaté žádosti (nová)
    profile.tsx        ← profil + stát se hostitelem + odhlášení (nová)
src/components/
  HostMap.tsx          ← Leaflet mapa, web-only, absolute positioning fix
src/lib/
  supabase.ts          ← Supabase klient
```

## Co funguje (potvrzeno Petrem)

- Přihlášení a registrace (Supabase Auth)
- Spodní záložková navigace: 🗺 Mapa | 📬 Žádosti | 👤 Profil
- Seznam hostitelů se živými daty z DB
- KLEPU NA DVEŘE flow (odesílání žádostí)
- Obrazovka Žádosti (poslaté/přijaté, přijmout/odmítnout)
- Obrazovka Profil (editace jména, stát se hostitelem, odhlášení)
- Formulář "Stát se hostitelem" (GPS poloha + geocoding Nominatim)

## Co nebylo ještě otestováno (Petr zavřel chat před testem)

- "Stát se hostitelem" flow — formulář → uložení → pin na mapě
- Zobrazení mapy (Leaflet) v záložce 🗺 Mapa → Mapa
- Přijmout/odmítnout žádost v záložce Žádosti

## Supabase

- URL: https://igrmxzvnadqckxjachdc.supabase.co
- Anon key: sb_publishable__9ut7dzGoOq3ZabRwoDabg_Rznv47CA
- Tabulky: profiles, host_profiles, stay_requests, bikes
- V DB: 1 testovací hostitel (Brno, 49.19, 16.61, garage_locked, user: Petr M.)
- 2 uživatelé: Petr M. a Jakub K.

## DB schema host_profiles (klíčová pole)

location_lat, location_lng, location_city, location_country,
parking (garage_locked/carport/yard/street),
pricing (free/tip/fixed), max_guests, notes, is_active

## Co je na řadě (navrhovaný postup)

1. Otestovat "Stát se hostitelem" → pin na mapě
2. Opravit případné bugy z testování
3. Přidat výběr dat v žádosti (teď hardcoded na dnes + zítra)
4. Přidat fotku profilu / avatar
5. Filtry na mapě (podle země, typu motorky)

## Dev server

- Příkaz: npx expo start --web (nebo npm run web)
- URL: http://localhost:8081
- Metro bundler, hot reload funguje

## Why

Petr chce vidět jestli dokáže/eme postavit reálnou appku. Motivace = učení + MVP produktu.

## How to apply

Petr je úplný začátečník — nevysvětlovat technické detaily, rozhodovat za něj, dávat přesné instrukce "klikni sem", "napiš tohle".
