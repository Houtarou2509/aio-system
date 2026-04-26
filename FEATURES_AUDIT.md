# AIO-System — Feature Audit

> Audit date: 2026-04-24
> Branch: `main`
> Commit range: `origin/main` up to latest (`52ac7d0`)
> Unstaged changes: `client/src/pages/DashboardPage.tsx` (UI enhancement)

---

## Tech Stack

| Layer | Tech |
|-------|------|
| **Frontend** | React 18 + Vite + TypeScript + TailwindCSS + shadcn/ui |
| **Backend** | Express 4 + TypeScript |
| **Database** | Prisma ORM (schema targets PostgreSQL, dev uses SQLite) |
| **Auth** | JWT (access + refresh tokens) + TOTP 2FA |
| **Charts** | Chart.js (react-chartjs-2) |
| **QR Scan** | html5-qrcode |
| **CSV** | csv-parse + custom validation |
| **PWA** | vite-plugin-pwa + workbox-window |
| **Testing** | Vitest (server) + Playwright (UI) |
| **Cron** | node-cron |

---

## ✅ Fully Implemented Features

### 1. Authentication & Authorization
- **JWT auth** — Access token (short-lived) + Refresh token (long-lived)
- **TOTP 2FA** — Setup via QR code, verify on login
- **Role-based access** — ADMIN, STAFF_ADMIN, STAFF, GUEST
- **ProtectedRoute** — Blocks unauthenticated access
- **RoleGate** — Conditionally renders UI by role
- **LoginPage** — Email/password + optional 2FA
- **Setup2FaPage** — First-time 2FA enrollment

### 2. Asset Management (Core)
- **Full CRUD** — Create, read, update, soft-delete (`deletedAt`)
- **Image upload** — File picker + preview on create/edit
- **Search** — Name/serial/location fuzzy search
- **Filter** — By status, type, manufacturer, location, assignedTo (with saved filter chips)
- **Sort** — Clickable column headers (asc/desc toggle)
- **Pagination** — Page + limit with metadata
- **Bulk operations** — Select multiple → delete or change status
- **Soft delete** — Assets hidden but recoverable
- **AI Suggestions** — Suggests type + manufacturer from asset name (local keyword fallback + OpenAI-compatible API)

### 3. Asset Detail Modal
- **Overview tab** — Full asset info, warranty status, maintenance warning flags
- **Financials tab** — Depreciation chart (Line), book value, salvage value, schedule table
- **History tab** — Assignment history (checkout/return)
- **Maintenance tab** — Logs + upcoming schedules + recurring schedule support
- **Audit tab** — Per-asset audit timeline
- **Guest Access** — Token manager inline (create/revoke guest links)

### 4. Checkout / Return / Request Workflow
- **Checkout** — Assign to user with condition + notes
- **Return** — Mark returned with condition + notes
- **Request system** — Staff can request assets; ADMIN/STAFF_ADMIN approve/deny
- **Pending Requests modal** — Tabbed view (Pending/Approved/Denied)

### 5. Maintenance
- **Maintenance logs** — Technician, description, cost, date
- **Scheduled maintenance** — One-time or recurring (3mo / 6mo / yearly)
- **Mark done** — Completes schedule → optional auto-prefill log
- **Overdue detection** — Schedules past due date flagged
- **Frequent repair flag** — >3 maintenance events in 12 months
- **Upcoming maintenance widget** — Dashboard view

### 6. Depreciation
- **Straight-line calculation** — With salvage floor (10% of purchase price)
- **Useful life by type** — Configurable per asset type
- **Financials tab** — Line chart (book value + cumulative depreciation)
- **Cron job** — Daily recalculation at 01:00 UTC

### 7. Audit Trail
- **Field-level tracking** — Every CREATE/UPDATE/DELETE logged with old→new values
- **Revert** — Restore old value (ADMIN only)
- **CSV Export** — Filtered audit logs to CSV
- **Activity feed** — Dashboard widget showing recent changes
- **Cleanup cron** — Periodic audit log pruning

### 8. Labels & Barcodes
- **PDF generation** — 6 label formats (DYMO, BROTHER, AVERY)
- **Barcode types** — CODE128, QR, DataMatrix
- **Batch generation** — ZIP download with multiple label PDFs
- **Template designer** — Create/save/delete label templates with field selection

### 9. Guest Access
- **Token-based public view** — Shareable URL with unique token
- **Expiry + access limit** — Configurable per token
- **Rate limiting** — Built-in per-token
- **Access counting** — Tracks views
- **GuestTokenManager** — Inline component in asset detail

### 10. Dashboard
- **Summary cards** — Total, Assigned, Maintenance, Available
- **Charts** — Status (doughnut), Type (bar), Location (horizontal bar), Age (doughnut)
- **Upcoming Maintenance** — Top 5 upcoming schedules
- **Warranties Expiring** — Top 5 expiring within 90 days
- **Activity Feed** — Recent audit log entries
- **Quick Actions** — View Assets, Scan QR, Add Asset, Audit Trail, Settings

### 11. Notifications
- **Notification bell** — Unread badge count, popover panel
- **Warranty expiring** — Auto-generated for warranties within 30 days
- **Maintenance overdue** — Auto-generated for overdue schedules
- **Auto-refresh** — Every 60 seconds
- **Dismiss** — Mark as read (removes from list)

### 12. Inventory Lookup (Settings)
- **Categories** — asset-types, manufacturers, locations, assigned-to
- **Full CRUD** — Add, edit, soft-toggle active/inactive
- **Dynamic dropdowns** — Asset form uses these via `useLookupOptions` hook
- **Role-gated** — ADMIN / STAFF_ADMIN only

### 13. Backup & Settings
- **AES-256-GCM encrypted backups** — Local + optional S3 / Google Drive
- **Manual trigger** — Settings page button
- **Daily cron** — 02:00 Asia/Singapore
- **Backup log history** — Status, size, timestamp

### 14. User Management
- **Add user** — Username, email, role, password
- **Edit user** — Role change, status toggle
- **User listing** — ADMIN-only page

### 15. QR Scanner
- **Camera-based scanning** — html5-qrcode
- **Auto-navigate** — Scans guest URL → navigates to guest view
- **Light theme modal** — Not dark/unreadable

### 16. CSV Import
- **Template download** — CSV with headers
- **Upload + preview** — Validates each row before import
- **Validation** — Required fields, status values, date formats
- **Import result** — Count of imported vs skipped + error details

### 17. Testing
- **Smoke tests** — Server startup + basic connectivity
- **Functional tests** — Auth, Assets, Audit, Depreciation, Guest, Labels, Maintenance
- **Integration tests** — AI suggestions, DB integrity, Cron jobs
- **Security tests** — Auth bypass, data exposure, input validation, role escalation
- **UI tests (Playwright)** — Assets, Audit, Labels, Login, Role gates
- **Test fixtures** — Seeded assets + users for repeatable tests

---

## 🟡 Partially Implemented / Stubbed

| Item | Status | Detail |
|------|--------|--------|
| **DepreciationBar** | Stub | Component returns `null`; deprecation note says fields removed from Asset model |
| **PWA** | Basic | Manifest present, vite-plugin-pwa configured; no deep service worker customization audited |
| **Client logging** | 9 `console.*` calls | Mostly in QR scanner and maintenance components; not cleaned up |
| **DashboardPage** | Unstaged change | Enhanced header bar + date display exists in working tree but not committed |

---

## ❌ Missing / Not Implemented

| Feature | Why Missing | Impact |
|---------|-------------|--------|
| **Reports page** | API route `/api/assets/depreciation-report` exists, but no dedicated Reports UI page | Low — data available via Dashboard |
| **Notifications page** | Only bell popover; no full-page notification history | Low — popover is functional |
| **Maintenance page** | Only per-asset maintenance tab + dashboard widget; no global maintenance calendar | Low — all data accessible |
| **Email notifications** | Only in-app notifications; no email/SMS alerts | Medium — user must open app to see warnings |
| **Asset reservations** | No booking/future-checkout system; only immediate request/approve | Medium — staff can't reserve upcoming assets |
| **Multi-tenancy** | Single organization; no multi-company support | Low — out of scope for current use case |
| **Asset category hierarchy** | Flat lookup values only; no nested categories | Low — types are simple enough |
| **Mobile layout** | Desktop-first; responsive but not mobile-optimized | Low — works on tablets |
| **Advanced analytics** | No trend forecasting, cost analysis, or custom report builder | Low — dashboard covers basics |
| **Bulk import images** | CSV import handles text fields only; no batch image upload | Low — images added per-asset |

---

## 📊 Code Stats

| Metric | Count |
|--------|-------|
| **Server routes** | 18 files (~1,767 LOC) |
| **Server services** | 11 files |
| **Server middleware** | 5 files |
| **Client pages** | 10 files |
| **Client components** | 25+ files |
| **Client hooks** | 4 files |
| **Test files** | 22 files (smoke + functional + integration + security + UI) |
| **Prisma models** | 10 + 5 enums |

---

## 🏗️ Database Schema

### Models
- `User` — Accounts with roles, 2FA, backup codes
- `Asset` — Core asset data with soft-delete
- `Assignment` — Checkout/return history + request workflow
- `MaintenanceLog` — Maintenance records
- `MaintenanceSchedule` — Upcoming/recurring maintenance
- `AuditLog` — Change tracking
- `GuestToken` — Public access tokens
- `LabelTemplate` — Saved label configurations
- `BackupLog` — Backup history
- `LookupValue` — Dynamic dropdown values
- `Notification` — In-app notifications

### Enums
- `Role` — ADMIN, STAFF_ADMIN, STAFF, GUEST
- `AssetStatus` — AVAILABLE, ASSIGNED, MAINTENANCE, RETIRED, LOST
- `LookupCategory` — ASSET_TYPE, MANUFACTURER, LOCATION, ASSIGNED_TO
- `BackupStatus` — PENDING, IN_PROGRESS, COMPLETED, FAILED
- `RequestStatus` — PENDING, APPROVED, DENIED
- `NotificationType` — WARRANTY_EXPIRING, MAINTENANCE_OVERDUE

---

## 🔄 Cron Jobs

| Schedule | Job | Status |
|----------|-----|--------|
| Daily 02:00 SGT | Backup | ✅ Implemented |
| Daily 09:00 SGT | Notification scan (warranty + maintenance) | ✅ Implemented |
| Daily 01:00 UTC | Depreciation recalculation | ✅ Implemented |

---

## 📋 Summary

**Total Features: 17 fully implemented**
**Partial/Stubs: 4**
**Missing: 10 (mostly enhancements, not blockers)**

The application is **production-ready for core asset inventory management**. All Priority 1 and Priority 2 features from the original roadmap are complete. The remaining gaps are enhancement-level (email alerts, mobile optimization, advanced reporting) rather than core functionality gaps.
