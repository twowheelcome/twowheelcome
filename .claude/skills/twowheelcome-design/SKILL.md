---
name: twowheelcome-design
description: Use this skill to generate well-branded interfaces and assets for TWOWHEELCOME, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick orientation
- **Brand:** TWOWHEELCOME — a Czech-language community app where motorcycle
  & bicycle travelers host each other (garages, yards, couches). Rugged,
  warm, vintage-adventure feel. Mobile (iOS + Android).
- **Tokens:** link `styles.css` for all CSS custom properties
  (`--twc-*`). Palette, type, spacing, radii, gradients live in `tokens/`.
- **Fonts:** Rye (wordmark/display), Oswald (headings/labels/buttons),
  system sans (body). Load via the Google Fonts `<link>` in any HTML.
- **Components:** React primitives under `components/` (Button, Input, Chip,
  Counter, OptionCard, Card, Tag, Badge, Avatar). Reach them at
  `window.<Namespace>` after loading `_ds_bundle.js` — run
  `check_design_system` for the exact namespace.
- **UI kit:** `ui_kits/app/` is a full interactive recreation of the app —
  the best reference for assembling real screens.

## Non-negotiables
- Dark warm canvas `#100C08`; terracotta `#C47050` is the only primary action color.
- Pill (radius 100) buttons/chips/tags/inputs; cards radius 20.
- Flat UI: hairline borders, not shadows.
- Czech, informal "ty", warm tone, emoji as meaningful glyphs.
- Feather icons for UI; emoji for categories. Never hand-draw SVG icons.
