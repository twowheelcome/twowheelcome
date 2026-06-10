# twowheelcome

Warmshowers pro dvě kola. Komunita motorkářů a cyklistů, kteří si navzájem otvírají garáže, dvory a gauče.

ADV, enduro, gravel, MTB, cestovní. Bez reklam. Zdarma.

## Stack

- Expo v56 + React Native
- Expo Router (file-based routing)
- Supabase (auth, DB, RLS)

## Start

```bash
npm install
npx expo start
```

## Struktura

```
src/
  app/
    (tabs)/     # hlavní navigace (mapa, žádosti, profil)
    index.tsx   # auth gate
    become-host.tsx
  components/
    HostMap.tsx
    LocationPicker.tsx
  lib/
    supabase.ts
supabase/
  migrations/
```
