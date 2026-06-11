# Session záloha — 2026-06-10

## Co bylo hotovo dnes

### Kód
- Formulář hostitele: typ spaní (stan/střecha/pokoj), vybavení (11 chipů), termín dostupnosti
- Filtry na mapě: parkování / spaní / cena — chip toggle panel
- Logo: **TWO**WHEEL**COME** (TWO + COME oranžově)
- Mapa jako default view po přihlášení (web)
- Fuzzy poloha hostitelů ~500m (deterministická, chrání soukromí)
- Fix "Klepu na dveře" v mapě — UUID pomlčky rozbíjely onclick
- Geolokace: `map.locate({ setView: true, maxZoom: 11 })` + tlačítko "Kde jsem?" jako fallback
- Tab bar: explicitní `tabBarLabel` render funkce — popisky viditelné na webu
- Tab bar: bílé popisky, aktivní oranžová

### Infrastruktura
- GitHub: https://github.com/twowheelcome/twowheelcome (public)
- Vercel: twowheelcome.vercel.app (auto-deploy z main)
- Doména: twowheelcome.com ✅ live
- vercel.json: `buildCommand`, `outputDirectory: dist`, `cleanUrls: true` — refresh na mobilu funguje
- SSH klíč nastaven — `git push` funguje bez hesel

### Supabase migrace (spuštěny ručně v SQL editoru)
- `add_sleep_amenities.sql` — sleep_types[], amenities[]
- `add_availability.sql` — available_from date, available_to date

## Kde pokračovat příště
1. Typ kola (moto/cyklo/ADV/enduro/gravel) — přidat do profilu hostitele a filtru na mapě
2. Zobrazit spaní + vybavení v popup kartičkách hostitelů na mapě
3. Approval flow žádostí (schválit/odmítnout) — zatím jen základní

## Stack
- Expo v56 + React Native + Expo Router
- Supabase (auth, DB, RLS)
- Leaflet (web mapa)
- Vercel (deploy) + twowheelcome.com (doména)
- GitHub SSH: git@github.com:twowheelcome/twowheelcome.git
