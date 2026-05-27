# QA Bug Report - 2026-05-26

## Scope

QA pass on the local AIO-System workspace using the existing build, unit, API, security, integration, and Playwright UI test entry points.

Environment:
- Workspace: `/home/reggie/.hermes/workspace/aio-system`
- Runtime path used: WSL Ubuntu 24.04
- Date/timezone: 2026-05-26, Asia/Manila

## Commands Run

```bash
npm run build --workspace=client
npm run build --workspace=server
npm run test --workspace=client
npm run test:smoke
npm run test:functional
npm run test:security
npm run test:integration
npm run test:ui
cd server && npx prisma validate
```

Note: Windows PowerShell blocks `npm.ps1`, and `npm.cmd` cannot run from the UNC WSL path, so the commands were run inside WSL.

## Test Summary

| Area | Result |
| --- | --- |
| Client production build | Passed, with a large JS chunk warning |
| Server TypeScript build | Passed |
| Client unit tests | Passed: 1 file, 2 tests |
| Server smoke tests | Failed: 11 failed, 0 passed |
| Server functional tests | Failed: 94 failed, 0 passed |
| Server security tests | Failed: 14 failed, 5 passed |
| Server integration tests | Failed: 20 failed, 8 passed |
| Playwright UI tests | Failed in global setup before browser tests ran |
| Prisma schema validation | Passed when run from `server/` |

## Findings

### 1. Test database cleanup cannot delete assets with maintenance schedules

Severity: High

Evidence:
- `tests/fixtures/assets.ts:125`
- `tests/smoke/smoke.test.ts:65`
- `tests/ui/global-setup.ts:12`
- `server/prisma/schema.prisma:399`

Actual result:
Most API and UI suites fail before their assertions with:

```text
Foreign key constraint violated on the constraint: `maintenance_schedules_assetId_fkey`
```

Root cause:
Cleanup deletes assignments, maintenance logs, audit logs, and assets, but does not delete `maintenance_schedules`. The `MaintenanceSchedule.asset` relation also has no `onDelete: Cascade`, unlike several other asset child tables.

Expected result:
Test cleanup should remove dependent rows in dependency order, or the schema should cascade maintenance schedules when assets are deleted.

Impact:
The automated API and UI suites are currently unreliable because stale schedule rows can block cleanup and cause unrelated tests to fail.

### 2. Shared asset test fixture is out of sync with the current create-asset API

Severity: High

Evidence:
- `tests/fixtures/assets.ts:73`
- `server/src/routes/asset.schema.ts:3`

Actual result:
Some tests fail during setup with `400` responses:

```text
Purchase price is required.
Purchase date is required.
```

Root cause:
The shared `createAsset` helper sends `name`, `type`, `location`, `serialNumber`, and optional `purchasePrice`, but it never sends `purchaseDate`. The API schema currently requires both `purchasePrice` and `purchaseDate`.

Expected result:
Either the fixture should provide default required values, or the API schema should make those fields optional if assets are allowed to be created before purchase details are known.

Impact:
Security, integration, and functional tests can fail before reaching the behavior they are meant to verify.

### 3. Playwright UI test configuration is stale

Severity: High

Evidence:
- `playwright.config.ts:12`
- `tests/ui/global-setup.ts:6`
- `tests/ui/global-setup.ts:49`
- `client/vite.config.ts:46`
- `server/src/index.ts:42`

Actual result:
`npm run test:ui` fails during global setup before launching browser tests.

Additional drift found:
- Playwright uses `http://localhost:5173`, but Vite is configured for port `3000`.
- UI global setup checks API `http://localhost:5001`, but the server default is `3001`.
- UI global setup seeds old fields such as `currentValue`, `depreciationRate`, `assignedToId`, and old audit fields that do not match the current Prisma schema.
- Global setup does not actually start servers when they are missing.

Expected result:
Playwright should target the configured local ports, seed data using the current schema, and either start web servers via Playwright `webServer` config or clearly require them as a precondition.

Impact:
No browser-level regression coverage is currently available.

### 4. Agreement fallback document omits asset names

Severity: Medium

Evidence:
- `tests/integration/agreement-document-hardening.test.ts:154`
- `tests/integration/agreement-document-hardening.test.ts:161`
- `tests/integration/agreement-document-hardening.test.ts:170`

Actual result:
The fallback agreement text mentions receipt of `2 assets`, but the resolved text does not include the asset names `Dell Latitude 5540` or `HP LaserJet Pro`.

Expected result:
A generated accountability agreement should identify the issued assets clearly, especially when no explicit agreement template exists.

Impact:
Printed or signed accountability documents may be too vague to serve as reliable custody evidence.

### 5. Production client bundle is large

Severity: Low

Evidence:
Client build passed, but Vite reported:

```text
Some chunks are larger than 500 kB after minification.
```

Actual result:
Main JS bundle was about `1,608 kB` before gzip and about `430 kB` gzipped.

Expected result:
Large feature areas should be code-split where practical.

Impact:
Initial load can be slower, especially on older devices or weaker office network connections.

## Recommendations

1. Fix test cleanup first: delete `maintenanceSchedule` rows before assets, or add `onDelete: Cascade` to the Prisma relation and migrate.
2. Update `tests/fixtures/assets.ts` to send valid default `purchasePrice` and `purchaseDate`, or relax create-asset validation if those fields should not be mandatory.
3. Refresh Playwright config and global setup to match the current ports and Prisma schema.
4. Re-run all API and UI suites after cleanup and fixture fixes. The current failures are dominated by setup failures, so deeper product bugs may be hidden.
5. Fix or confirm the agreement fallback behavior so issued asset names appear in generated accountability text.
6. Consider route-level lazy loading for large client pages after functional stability is restored.
