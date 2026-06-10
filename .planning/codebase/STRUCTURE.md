# Structure Map
<!-- last_mapped: 2026-06-10 -->

## Directory Tree

```
twowheelcome/
├── src/
│   ├── app/                        # Expo Router file-based routes
│   │   ├── _layout.tsx             # Root layout — auth guard, session listener
│   │   ├── index.tsx               # Auth screen (signup / signin)
│   │   ├── become-host.tsx         # Host profile modal
│   │   └── (tabs)/                 # Tab navigator (post-auth)
│   │       ├── _layout.tsx         # Tab bar configuration
│   │       ├── map.tsx             # Host discovery map
│   │       └── requests.tsx        # Stay requests (sent + received)
│   ├── components/
│   │   └── HostMap.tsx             # Platform-aware map component
│   └── lib/
│       └── supabase.ts             # Supabase client + session helpers
├── assets/                         # Static assets (images, fonts)
├── app.json                        # Expo app config
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript config
└── .env / .env.local               # Supabase URL + anon key (not in git)
```

## Key Locations

| What | Where |
|------|-------|
| App entry / auth guard | `src/app/_layout.tsx` |
| Auth screen | `src/app/index.tsx` |
| Tab screens | `src/app/(tabs)/` |
| Shared components | `src/components/` |
| Supabase client | `src/lib/supabase.ts` |
| Expo config | `app.json` |

## Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Screen files | kebab-case | `become-host.tsx`, `requests.tsx` |
| Component files | PascalCase | `HostMap.tsx` |
| Route groups | parentheses | `(tabs)/` |
| Lib utilities | camelCase | `supabase.ts` |
| React components | PascalCase | `HostMap`, `RootLayout` |

## Where to Add New Code

| Adding | Location |
|--------|---------|
| New screen/route | `src/app/(tabs)/screen.tsx` or `src/app/screen.tsx` |
| New shared component | `src/components/ComponentName.tsx` |
| New service / API wrapper | `src/lib/services/featureName.ts` |
| New utility / helper | `src/lib/utils/helperName.ts` |
| Platform-specific component | `src/components/Name.tsx` + `Name.web.tsx` |
