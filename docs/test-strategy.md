# AIO-System Test Strategy

## Test Suites

| Suite | Command | When to Run | Duration |
|-------|---------|-------------|----------|
| Smoke | `npm run test:smoke` | Every deploy | ~10s |
| Functional | `npm run test:functional` | Every feature change | ~1-2min |
| Integration | `npm run test:integration` | Before any release | ~2-3min |
| Security | `npm run test:security` | Once before launch, then on auth/role changes only | ~1min |
| UI (Playwright) | `npm run test:ui` | Before release | ~3-5min |

## Run Order

```
Fast ──────────────────────────────────────────────► Slow
smoke → functional → integration → security → ui
  10s      1-2min       2-3min       1min      3-5min
```

## Recommended Workflow

- **Every deploy:** `npm run test:smoke`
- **Every PR / feature change:** `npm run test:smoke && npm run test:functional`
- **Before release:** `npm run test:all` (smoke + functional + integration + security)
- **Before release with UI:** `npm run test:all:with-ui` (all above + Playwright)
- **After auth/role changes:** `npm run test:security`

## Prerequisites

- Backend tests (smoke, functional, integration, security): PostgreSQL test DB running, `VITEST=1` env var
- UI tests: dev server running (`npm run dev`), Playwright Chromium installed