---
name: twowheelcome-design
description: Use this skill when designing or editing TWOWHEELCOME product UI, copy, brand details, or visual assets. It captures the current rider-to-rider shelter/community direction, product privacy rules, brand colors, tone, and key app surfaces.
user-invocable: true
---

# TWOWHEELCOME Design

Use this as the current source of truth for brand and product UI decisions. If it conflicts with production code or `CODEX_HANDOFF.md`, prefer the production code and handoff, then update this skill.

## Product

TWOWHEELCOME is a rider-to-rider shelter/community, not a hotel booking app and not a generic travel marketplace.

Core feeling: "I am also a rider. You and your bike are safe with me."

Priorities:
- Bike safety first, rider comfort second.
- Hosts offer garages, covered parking, fenced yards, street parking, tent space, roof/room options, and rider help.
- The app should feel like a trusted community of riders, not accommodation inventory.

Core copy:
- "Safe night for your bike and you."
- "From riders to riders."
- "Knock on the door"
- "Send coordinates"
- "Open navigation"

## Privacy And Flow

- Public map shows approximate host area only, roughly +/-500m.
- Exact location is sent intentionally by the host in chat.
- A stay request must carry `location_id` so hosts with multiple places know which listing the guest selected.
- After accepting, the host can send exact coordinates.
- The guest receives coordinates in chat and can open navigation.
- Navigation should use whatever map/navigation apps the user has available; do not force a single provider.

## Visual Direction

Brand colors:
- Charcoal: `#2F3438`
- Cream: `#F2EBDD`
- Burnt orange: `#C96E2A`

Usage:
- Burnt orange is the primary brand/action accent.
- Charcoal and cream anchor the interface.
- Green is only for status/success, never the brand color.
- Avoid western, saloon, retro poster, overly rugged, or novelty biker styling.
- Keep typography clean, robust, and system/sans.
- Use cards and rounded controls consistently with the existing app, but keep operational screens clear and scannable.

Logo:
- Use `assets/images/mark.png` as the mark with the TWOWHEELCOME wordmark.
- `AppHeader` is the production reference for header lockup.

## UI Tone

- UI language is English.
- Tone is warm, plain, direct, and rider-to-rider.
- Avoid corporate hospitality copy such as "property", "booking", "guest experience", or "inventory".
- Use "host", "rider", "bike", "safe spot", "stay request", and "meeting point".
- Emoji may be used as compact category glyphs where the app already uses them, but do not let them become decorative noise.

## Production References

Important files:
- `src/lib/theme.ts`
- `src/app/index.tsx`
- `src/app/(tabs)/map.tsx`
- `src/app/(tabs)/requests.tsx`
- `src/app/(tabs)/profile.tsx`
- `src/components/AppHeader.tsx`
- `src/components/HostMap.tsx`
- `src/components/SafetyBlock.tsx`
- `supabase/migrations/add_stay_request_location.sql`

Current app state:
- Login/onboarding uses the current brand copy and mark.
- Map/List toggle, ETA, Road/Trail mode, big map plus button, and Leaflet zoom controls were removed.
- `location_id` exists in code and migration.
- `sendCoordinates` prefers `request.location_id`, with fallback to the first host location for old requests.
- `notify-request` no longer says "Address unlocked".

When designing or editing UI, inspect current production files first and match their patterns instead of inventing a parallel design system.
