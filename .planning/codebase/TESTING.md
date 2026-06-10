# Testing Map
<!-- last_mapped: 2026-06-10 -->

## Summary

**No automated testing exists in this codebase.** All testing is manual via Expo CLI / Expo Go.

## Framework

| Item | Status |
|------|--------|
| Test framework | None configured |
| Test files | 0 found |
| CI/CD test step | Not set up |
| Coverage tooling | None |

## Current Testing Approach

- Manual testing via `expo start` + Expo Go app on device/simulator
- No unit tests, integration tests, or E2E tests
- No test scripts in `package.json`

## Test File Locations

None exist. Standard Expo convention if tests are added:

| Type | Location |
|------|---------|
| Unit / component tests | `src/__tests__/` or co-located `*.test.ts(x)` |
| E2E tests | `e2e/` (Detox or Maestro) |

## Recommended Setup (for future phases)

| Tool | Use case |
|------|---------|
| Jest + jest-expo | Unit and component tests |
| React Native Testing Library | UI component behavior |
| Maestro | E2E flows on device |

## Risks

- Zero test coverage means regressions are invisible
- Supabase calls are untested — any schema change breaks silently
- Auth flow has no regression protection
