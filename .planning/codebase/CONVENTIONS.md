# Coding Conventions

**Analysis Date:** 2026-06-10

## Naming Patterns

**Files:**
- React components: PascalCase with `.tsx` extension (e.g., `HostMap.tsx`, `BecomeHostScreen`)
- Layout files: Use underscore prefix for special routing files (e.g., `_layout.tsx`, `(tabs)/_layout.tsx`)
- Utility files: camelCase (e.g., `supabase.ts`)
- Screen files: Named descriptively with screen suffix convention (e.g., `AuthScreen`, `MapScreen`)

**Functions:**
- Component functions: PascalCase (exported as default)
- Helper functions: camelCase (e.g., `fetchHosts`, `sendRequest`, `injectLeafletCSS`, `useGPS`)
- Handler functions: Prefix with `handle` or verb (e.g., `handleAuth`, `sendRequest`, `respond`)
- Event handlers: Follow React pattern with `on` prefix (e.g., `onHostSelect`, `onPress`, `onChangeText`)

**Variables:**
- State variables: camelCase (e.g., `loading`, `selected`, `message`, `requesting`)
- Constants: UPPER_SNAKE_CASE for configuration objects (e.g., `PARKING`, `PRICING`, `SUPABASE_URL`)
- Regular variables: camelCase (e.g., `city`, `country`, `maxGuests`, `finalLat`)
- Type/interface instances: camelCase (e.g., `parkingMeta`, `pricingMeta`, `statusConfig`)

**Types:**
- Interfaces: PascalCase (e.g., `Host`)
- Generic types: PascalCase (e.g., `Session`)
- Type aliases: Use `any` liberally in local state (not enforced to strict types in this codebase)
- Record/map types: Use `Record<string, T>` for lookups (e.g., `Record<string, string>` for color maps)

## Code Style

**Formatting:**
- 2-space indentation (observed throughout)
- No semicolons at end of statements (Expo default)
- Single quotes for strings (`'string'` not `"string"`)
- Arrow functions preferred for callbacks and handlers
- Ternary operators used for conditional rendering

**Linting:**
- No ESLint config in project root (uses Expo's built-in linting via `expo lint` command)
- TypeScript strict mode enabled in `tsconfig.json`
- Import organization handled naturally by code, no strict convention enforced

## Import Organization

**Order:**
1. React and React Native imports (e.g., `import { useEffect, useState } from 'react'`)
2. Expo Router and navigation (e.g., `import { Stack, router } from 'expo-router'`)
3. React Native components (e.g., `import { View, Text, StyleSheet } from 'react-native'`)
4. Third-party packages (e.g., `import { supabase } from '../lib/supabase'`)
5. Local utilities and components (e.g., `import { supabase } from '../../lib/supabase'`)

**Path Aliases:**
- `@/*` maps to `./src/*` (defined in `tsconfig.json`)
- `@/assets/*` maps to `./assets/*`
- Imports use relative paths in practice (e.g., `../../lib/supabase`)

## Error Handling

**Patterns:**
- Destructure error from async responses: `const { error } = await supabase.from(...)`
- Check error truthiness and respond accordingly
- Use `Alert.alert()` for user-facing error messages (React Native pattern)
- Show both error title and message to user: `Alert.alert('Title', error.message)`
- Catch loose errors with try-catch for external APIs (e.g., GPS geolocation, Nominatim reverse lookup)
- Errors from database operations logged with `console.error()` only in development (`src/app/(tabs)/map.tsx:44`)

**Example from `src/app/index.tsx`:**
```typescript
const { error } = await supabase.auth.signInWithPassword({ email, password })
if (error) Alert.alert('Chyba', error.message)
```

**Example from `src/app/become-host.tsx`:**
```typescript
try {
  const res = await fetch(...)
  const d = await res.json()
  // process response
} catch (_) {
  // silently fail, don't alert user
}
```

## Logging

**Framework:** Console (no structured logging library used)

**Patterns:**
- Minimal logging in production code (observed only once: `console.error()` in map.tsx)
- Errors logged to console for debugging
- No console.log for tracing (not observed in codebase)
- Errors shown to users via `Alert.alert()` instead of console

## Comments

**When to Comment:**
- Used sparingly, only where logic is non-obvious
- Section dividers with emoji and text (e.g., `// --- Formulář žádosti ---`) to separate UI sections
- Inline comments explaining non-standard patterns (e.g., "keeps latest hosts accessible from async callbacks without stale closure" in `HostMap.tsx`)

**JSDoc/TSDoc:**
- Not used in this codebase
- Function signatures are self-documenting

## Function Design

**Size:** Functions range from 10-20 lines for simple handlers to 60+ lines for complex screens (see `map.tsx` at 247 lines, but this includes styles)

**Parameters:**
- Prefer destructuring in component props: `({ hosts, onHostSelect }: { hosts: Host[]; onHostSelect: (host: Host) => void })`
- React hooks use useState pattern: `const [state, setState] = useState(initialValue)`
- Callback props explicitly typed with function signature

**Return Values:**
- Components return JSX.Element
- Async functions use destructuring pattern: `const { data, error } = await supabase.method()`
- Early returns used for guards: `if (!city.trim()) { Alert.alert(...); return }`

## Module Design

**Exports:**
- All screens exported as `export default function ComponentName()`
- No named exports for screens
- Utility files (e.g., `supabase.ts`) export instance: `export const supabase = createClient(...)`
- Configuration objects defined inline near usage: `const parkingMeta: Record<string, ...> = { ... }`

**Barrel Files:**
- Not used (no index.ts re-exports observed)
- Direct imports from specific files preferred

**Code Organization:**
- Styles defined inline at end of file using `StyleSheet.create()` (React Native pattern)
- State hooks grouped at top of component function
- useEffect hooks follow state declarations
- Handler functions defined in middle section
- JSX render logic at bottom
- Style object at end of file

## React Patterns

**Hooks:**
- `useState` for local component state
- `useEffect` for side effects (data fetching, subscriptions)
- No custom hooks (not observed in codebase)
- Refs used for DOM/component references: `useRef<HTMLDivElement>(null)`, `useRef<any>(null)`

**Event Handling:**
- Arrow function handlers: `onPress={() => setSelected(null)}`
- Async handlers: `async function sendRequest() { ... }` then `onPress={sendRequest}`
- Callback props for parent-child communication: `onHostSelect: (host: Host) => void`

**Conditional Rendering:**
- Ternary operators for simple conditions: `{loading ? 'Moment...' : 'PŘIHLÁSIT SE'}`
- Early returns for complex conditional sections (e.g., request form vs. main screen in `map.tsx`)
- Logical AND for optional rendering: `{host.notes ? <Text>{host.notes}</Text> : null}`

## Type Checking

**TypeScript:**
- Strict mode enabled in `tsconfig.json`
- Generic types used for React state: `useState<Host[]>([])`, `useState<Session | null>(null)`
- Component prop interfaces defined inline: `{ hosts: Host[]; onHostSelect: (host: Host) => void }`
- Database response types use `any` for flexibility: `useState<any[]>([])`, `const [profile, setProfile] = useState<any>(null)`
- Interface definitions minimal (one observed: `Host` interface in `HostMap.tsx`)

---

*Convention analysis: 2026-06-10*
