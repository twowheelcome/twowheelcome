# Technology Stack

**Analysis Date:** 2026-06-10

## Languages

**Primary:**
- TypeScript 6.0.3 - All application code (React components, screens, services)
- JavaScript - Configuration files (app.json, babel, etc.)

**Secondary:**
- CSS - Inline React Native StyleSheet definitions (no external CSS files)

## Runtime

**Environment:**
- Node.js (version not specified in project, inferred from package-lock.json)

**Package Manager:**
- npm - Dependency management
- Lockfile: Present (`package-lock.json`)

## Frameworks

**Core:**
- Expo 56.0.9 - Cross-platform mobile runtime (iOS, Android, Web)
- expo-router 56.2.9 - File-based routing for Expo
- React 19.2.3 - UI framework
- React Native 0.85.3 - Mobile framework
- React DOM 19.2.3 - Web rendering

**Testing:**
- Not detected

**Build/Dev:**
- TypeScript 6.0.3 - Type checking and compilation
- expo-lint - Code linting (available via `npm run lint`)

## Key Dependencies

**Critical:**
- @supabase/supabase-js 2.108.0 - Database and authentication
- expo-router 56.2.9 - Navigation and routing layer
- react-native-maps 1.27.2 - Native map display (primarily Android/iOS)
- leaflet 1.9.4 - Web map rendering library
- react-leaflet 5.0.0 - React wrapper for Leaflet

**Infrastructure:**
- @react-native-async-storage/async-storage 3.1.1 - Client-side session persistence
- @react-navigation/bottom-tabs 7.17.2 - Tab-based navigation UI
- @react-navigation/native 7.3.0 - React Navigation core
- react-native-gesture-handler 2.31.1 - Gesture recognition
- react-native-reanimated 4.3.1 - Animation library
- react-native-safe-area-context 5.7.0 - Safe area layout
- react-native-screens 4.25.2 - Native screen optimization
- react-native-web 0.21.0 - React Native for web browsers

**UI & Media:**
- @expo/ui ~56.0.16 - Expo UI component library
- expo-font ~56.0.5 - Font loading
- expo-image ~56.0.10 - Image handling
- expo-symbols ~56.0.6 - iOS symbol support
- expo-glass-effect ~56.0.4 - Glass morphism effects
- expo-status-bar ~56.0.4 - Status bar management
- expo-system-ui ~56.0.5 - System UI integration

**Utilities:**
- expo-constants ~56.0.17 - Access app constants
- expo-device ~56.0.4 - Device information
- expo-linking ~56.0.13 - Deep linking
- expo-splash-screen ~56.0.10 - Splash screen control
- expo-web-browser ~56.0.5 - Web browser integration
- react-native-worklets 0.8.3 - Background computation (for Reanimated)

## Configuration

**Environment:**
- Supabase URL and Anon Key hardcoded in `src/lib/supabase.ts` (SECURITY ISSUE - see CONCERNS.md)
- No `.env` file detected in repo
- App configuration via `app.json` (Expo manifest)

**Build:**
- TypeScript configuration: `tsconfig.json`
  - Extends `expo/tsconfig.base`
  - Strict mode enabled
  - Path aliases configured: `@/*` → `src/*`, `@/assets/*` → `assets/*`
- App configuration: `app.json`
  - Slug: `twowheelcome`
  - Orientation: Portrait
  - Web output: Static export
  - Experiments: Typed routes, React Compiler enabled
  - Plugins: expo-router, expo-splash-screen

## Platform Requirements

**Development:**
- Node.js (version not pinned)
- npm or yarn
- Expo CLI (`expo` package)
- TypeScript 6.0.3+

**Production:**
- Deployment target: Expo-managed iOS, Android, and Web
- Web hosting: Static file hosting (HTML/CSS/JS output from web build)
- Mobile distribution: Apple App Store, Google Play Store (via Expo)

## Scripts

```bash
npm start           # Start Expo dev server (prompts for platform)
npm run android     # Run on Android emulator/device
npm run ios         # Run on iOS simulator/device
npm run web         # Run in web browser
npm run lint        # Run Expo linter
```

---

*Stack analysis: 2026-06-10*
