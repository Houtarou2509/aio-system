# AIO-System — Full System Map & AI Agent Reference

> **PURPOSE:** Feed this file into any AI coding agent to give it complete understanding of the application — every file, every endpoint, every page, every database model, and how they connect.
> Last updated: 2026-05-05

---

## 1. What Is This Application?

**AIO-System** is a full-stack Office Asset Inventory and Accountability Tracking System. It manages physical assets (hardware, equipment, furniture, peripherals), tracks who they're issued to, handles maintenance schedules, generates barcode labels, creates legal accountability agreements (PDFs), and maintains a full audit trail of every change.

**Primary use case:** A university research office (UPPI / DRDF) managing loaned-out equipment, tracking which personnel has what, with formal signed-accountability agreements.

**Key workflows:**
- **Asset lifecycle:** Create → status tracking (Available/Assigned/Maintenance/Retired/Lost) → soft-delete with `deletedAt`
- **Accountability:** Issue assets to personnel → generate signed agreement PDFs → QR-code return scanning → full history
- **Inventory Management:** Dropdown lookups for asset types, manufacturers, locations, assigned-to entities
- **Personnel Management:** Track staff (employee/contractor), their designations, institutions, projects, and active items
- **Audit Trail:** Every CUD operation is logged with who did it, old/new values, IP address, browser/OS/device info, and severity
- **Label Generation:** PDF barcode labels (Code128/QR/DataMatrix) for asset tagging
- **Automation:** Cron jobs for daily backups (02:00 SGT), depreciation, and notifications (09:00 SGT)
- **Guest Sharing:** Time-limited, access-count-limited, read-only public asset links via tokens

---

## 2. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Runtime** | Node.js v22+ | — |
| **Package Manager** | npm 10.x | npm workspaces monorepo |
| **Server** | Express.js 4.x | REST API, serves built frontend in production |
| **Database** | PostgreSQL 16 | Via Prisma ORM 6.19.x |
| **Auth** | JWT (access + refresh token rotation) + bcryptjs + TOTP 2FA (speakeasy) | Access: 15min, Refresh: 7 days |
| **Frontend** | React 18 + Vite 6 + TypeScript 5 | shadcn/ui + Radix UI + Tailwind CSS 3 |
| **Charts** | Chart.js 4 + react-chartjs-2 | Dashboard donut/bar charts |
| **PDF Generation** | PDFKit | Labels (bwip-js barcodes) + Accountability agreements |
| **Image Processing** | Sharp | Resize on upload (800px max) |
| **File Upload** | Multer 2.x | 5MB limit, images only |
| **CSV Import** | csv-parse | Bulk asset import with template download |
| **Cron Jobs** | node-cron | Backup 02:00 SGT, depreciation daily, notifications 09:00 SGT |
| **Backup** | archiver (zip) + AWS S3 SDK | pg_dump → zip → AES-256-GCM encrypt → S3 upload |
| **AI** | OpenAI-compatible API | Asset name → type/manufacturer auto-suggestion |
| **Email** | Google Gmail API | Notification/warranty emails |
| **QR Codes** | html5-qrcode (scan) + bwip-js (generate) | Asset labels + return scanning |
| **Rate Limiting** | express-rate-limit | Login: 5/15min per IP, guest tokens |
| **Security** | helmet 8.x, cors, morgan | CSP/STS/X-Frame relaxed for dev |
| **Process Manager** | PM2 | ecosystem.config.js |
| **Styling** | Tailwind CSS 3 + tw-animate-css + Geist Variable font | Custom navy/orange brand palette |
| **Testing** | Vitest 4.x (unit/integration/security) + Playwright 1.x (E2E) | — |
| **Dev Hot Reload** | ts-node-dev (server) + Vite HMR (client) | concurrently orchestrates both |

---

## 3. Brand & Design System

### Color Palette
| Color | Hex | Usage |
|-------|-----|-------|
| Navy Blue | `#012061` | Headers, primary accents, table headers, sidebar |
| Orange | `#f8931f` | Primary action buttons, highlights, icon accents, KPI values |
| Deep Red | `#7B1113` | Destructive actions, critical alerts, overdue badges |
| Light BG | `#f1f3f5` / `#DEDEDE` | Page background |
| Slate scale | `slate-50` through `slate-900` | Text, borders, secondary surfaces |

### Design Patterns (applied to ALL pages)
Every entity page follows the same component hierarchy:
1. **Sticky Navy Header** — icon + title (left), action buttons (right), orange primary button, bordered secondary buttons
2. **KPI Tiles Row** — 3-column grid of stat cards (icon in orange-tinted circle, orange number, uppercase label)
3. **Horizontal Filter Bar** — white card with search input + dropdown filters in compact `h-8` selects
4. **Bulk Action Toolbar** — appears when items selected, navy-tinted bar with action buttons
5. **White Card Table** — `rounded-lg border` container with navy `bg-[#012061]` header row, white `bg-white` data rows, hover highlight
6. **Empty State** — centered icon in orange-tinted rounded square + CTA button
7. **Pagination** — Prev/Next in white footer bar with border-top

### Typography
- **Font:** Geist Variable (Sans) via `@fontsource-variable/geist`
- **Headings:** `text-lg font-bold tracking-tight` in navy sections
- **Table Headers:** `text-[10px] font-semibold tracking-widest text-white/70 uppercase`
- **KPI Values:** `text-xl font-bold leading-tight text-[#f8931f]`
- **Body:** `text-xs` / `text-sm` in `text-slate-600/700`

### Dark Mode
Controlled by `ThemeContext.tsx` — toggles `.dark` class on `<html>`. All components use `dark:` variants.

---

## 4. Complete Project File Tree

This is the authoritative file listing. **Every file exists at the path shown.** Sub-agent: if you need to modify something, use the path from this tree.

```
aio-system/
├── package.json                          # Monorepo root (workspaces: server, client, shared)
├── ecosystem.config.js                   # PM2 config (port 3001 dev / 3000 prod)
├── playwright.config.ts                  # Playwright E2E config
├── start-dev.sh                          # Auto-start script (background)
│
├── 📁 server/                            # ═══ BACKEND ═══
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env                              # ★ Environment variables (DATABASE_URL, JWT_SECRET, PORT=3001, etc.)
│   ├── vitest.config.ts
│   ├── prisma/
│   │   ├── schema.prisma                 # ★ DATABASE: All models, enums, relations (PostgreSQL)
│   │   ├── seed.ts                       # DB seed script (creates admin user)
│   │   ├── seed-lookups.ts               # Lookup value seed
│   │   └── migrations/                   # Prisma migration history
│   ├── scripts/
│   │   └── seed-dashboard.ts             # Dashboard demo data seeder (10 assets + assignments + maintenance)
│   ├── uploads/                          # User-uploaded asset images (served at /uploads and /aio-system/uploads)
│   ├── backups/                          # Local backup .enc files before S3 upload
│   ├── public/                           # Built frontend (Vite output) + static assets
│   │   ├── index.html                    # SPA entry
│   │   ├── manifest.json                 # PWA manifest
│   │   ├── favicon.svg, pwa-*.png        # PWA icons
│   │   ├── logo-uppi.png, logo-drdf.png  # Org logos (shown on login page)
│   │   ├── icons.svg                     # SVG sprite
│   │   ├── uploads/logos/                # Agreement template header logos
│   │   └── assets/                       # Vite-built JS/CSS bundles
│   ├── dist/                             # Compiled TypeScript output (mirrors src/)
│   └── src/
│       ├── index.ts                      # ★ EXPRESS APP ENTRY — mounts all routes, middleware, starts server
│       ├── __tests__/
│       │   └── smoke.test.ts             # Basic server smoke test
│       ├── jobs/
│       │   └── cron.ts                   # Scheduled jobs (backup @02:00, notifications @09:00 SGT)
│       ├── middleware/
│       │   ├── auth.ts                   # JWT verification, role authorization (authenticate, requireRole, authorize)
│       │   ├── audit.ts                  # Auto-audit middleware (logs changes on write ops)
│       │   ├── validate.ts               # Zod schema validation middleware
│       │   ├── errorHandler.ts           # Global Express error handler
│       │   └── index.ts                  # Re-exports all middleware
│       ├── routes/                       # ★ ALL API ENDPOINTS (one file per resource)
│       │   ├── auth.routes.ts            # POST /api/auth/login, /refresh, /logout, /2fa/*, GET /me
│       │   ├── auth.schema.ts            # Zod schemas for auth payloads
│       │   ├── asset.routes.ts           # CRUD /api/assets, import, bulk ops, image upload, history
│       │   ├── asset.schema.ts           # Zod schemas for asset payloads
│       │   ├── audit.routes.ts           # GET /api/audit (list, export CSV, cleanup), revert
│       │   ├── audit.schema.ts           # Zod schemas for audit queries
│       │   ├── maintenance.routes.ts     # CRUD /api/assets/:id/maintenance
│       │   ├── maintenance.schema.ts     # Zod schemas for maintenance payloads
│       │   ├── label.routes.ts           # PDF label generation, template CRUD
│       │   ├── label.schema.ts           # Zod schemas for label payloads
│       │   ├── dashboard.routes.ts       # GET /api/dashboard (stats, warranties, locations, age)
│       │   ├── guest.routes.ts           # Public /api/guest/a/:token, token CRUD
│       │   ├── ai.routes.ts              # POST /api/ai/suggest (OpenAI)
│       │   ├── ai.schema.ts              # Zod schema for AI payload
│       │   ├── backup.routes.ts          # POST /api/backups/now, GET list
│       │   ├── backup.schema.ts          # Zod schema for backup requests
│       │   ├── notification.routes.ts    # GET /api/notifications, PATCH mark-read
│       │   ├── user.routes.ts            # CRUD /api/users (Admin only)
│       │   ├── user.schema.ts            # Zod schemas for user payloads
│       │   ├── lookup.routes.ts          # CRUD /api/lookups/:category
│       │   ├── personnel.routes.ts       # CRUD /api/personnel
│       │   ├── personnel.schema.ts       # Zod schemas for personnel payloads
│       │   ├── issuance.routes.ts        # CRUD /api/issuances (issue/return, available assets, active personnel, bulk)
│       │   ├── issuance.schema.ts        # Zod schemas for issuance payloads
│       │   ├── agreement.routes.ts       # CRUD /api/agreement/templates, logo upload, PDF generation
│       │   ├── agreement.schema.ts       # Zod schemas for agreement payloads
│       │   ├── institution.routes.ts     # GET /api/institutions (list)
│       │   ├── project.routes.ts         # GET /api/projects (list)
│       │   └── accountabilityLookup.routes.ts  # CRUD /api/lookup/accountability/* (designations, institutions, projects)
│       ├── services/                     # ★ BUSINESS LOGIC (one per resource)
│       │   ├── auth.service.ts           # Login, JWT signing, 2FA setup, refresh tokens
│       │   ├── asset.service.ts          # Asset CRUD, CSV import, bulk ops, image processing, assignment history
│       │   ├── audit.service.ts          # Query, export CSV, revert field changes, cleanup old logs
│       │   ├── maintenance.service.ts    # Maintenance log CRUD
│       │   ├── dashboard.service.ts      # Aggregated stats, warranty checks, age distribution, location breakdown
│       │   ├── label.service.ts          # PDF generation (PDFKit + bwip-js), template CRUD
│       │   ├── guest.service.ts          # Guest token management, rate-limited public access
│       │   ├── depreciation.service.ts   # Straight-line depreciation with salvage floor
│       │   ├── notification.service.ts   # Warranty/maintenance alert generation
│       │   ├── backup.service.ts         # pg_dump + zip + encrypt (AES-256-GCM) + S3 upload
│       │   ├── ai.service.ts             # OpenAI API integration for asset suggestions
│       │   ├── personnel.service.ts      # Personnel CRUD + audit logging + profile history tracking
│       │   ├── issuance.service.ts       # Issue assets, return assets, QR return, resolve agreement text, bulk issuance
│       │   └── agreement.service.ts      # Template CRUD, agreement PDF generation (PDFKit)
│       └── utils/
│           ├── response.ts               # success(data, meta) / error(message, code) JSON helpers
│           ├── env.ts                     # ENV validation (DATABASE_URL, JWT_SECRET, etc.)
│           ├── guestFilter.ts             # Strips sensitive fields for GUEST role (price, serial#, warranty)
│           ├── auditHelpers.ts            # Shared audit logging utilities
│           └── templateParser.ts          # Agreement template placeholder reference ({{fullName}}, {{assetName}}, etc.)
│
├── 📁 client/                            # ═══ FRONTEND ═══
│   ├── package.json
│   ├── vite.config.ts                    # Vite config (base: /aio-system, proxy /api → :3001)
│   ├── tailwind.config.cjs               # Tailwind CSS config
│   ├── postcss.config.cjs                # PostCSS config
│   ├── components.json                   # shadcn/ui configuration
│   ├── vitest.config.ts
│   └── src/
│       ├── main.tsx                      # React entry point (StrictMode + ErrorBoundary + ThemeProvider)
│       ├── App.tsx                       # ★ ROUTER — all frontend routes (BrowserRouter basename=/aio-system)
│       ├── index.css                     # Global styles + Tailwind directives + shadcn theming + Geist font
│       ├── vite-env.d.ts                 # Vite type declarations
│       ├── context/
│       │   ├── AuthContext.tsx            # ★ Auth state (login, logout, token refresh, cached user, 2FA)
│       │   └── ThemeContext.tsx           # ★ Dark/light mode toggle (adds .dark class on <html>)
│       ├── pages/                        # ★ ALL PAGE COMPONENTS (one per route)
│       │   ├── LoginPage.tsx             # /login — split-screen, navy brand panel, orange accents
│       │   ├── Setup2FaPage.tsx          # /setup-2fa — QR scan or manual code TOTP setup
│       │   ├── GuestAssetPage.tsx        # /guest/:token — public read-only asset view
│       │   ├── DashboardPage.tsx         # ★ / (home) — Command Center with bento analytics grid
│       │   ├── AssetsPage.tsx            # /assets — table + CRUD + import + bulk ops + QR scan
│       │   ├── AuditPage.tsx             # /audit — full audit trail with filters, export, revert
│       │   ├── SettingsPage.tsx          # /settings — backup trigger, guest tokens, preferences
│       │   ├── UserManagementPage.tsx    # /users (Admin) — user CRUD + activate/deactivate
│       │   ├── InventoryLookupPage.tsx   # /lookup (Admin/StaffAdmin) — asset dropdown values
│       │   ├── AccountabilityLookupPage.tsx  # /accountability-lookup — designations, institutions, projects
│       │   ├── AccountabilityTemplatesPage.tsx # /accountability/templates — agreement template editor
│       │   ├── ProfilesPage.tsx          # /profiles — personnel management + active items count
│       │   └── IssuancesPage.tsx         # /issuances — issue/return wizards, QR return, bulk issuance
│       ├── components/
│       │   ├── AppLayout.tsx            # Sidebar + top nav shell (wraps all authenticated routes)
│       │   ├── ErrorBoundary.tsx        # React error boundary
│       │   ├── assets/                  # Asset table, forms, modals
│       │   │   ├── AssetTable.tsx       # ★ Sortable asset table with navy header, checkboxes, image thumbnails
│       │   │   ├── AssetFormModal.tsx   # Create/edit asset modal (JSON + multipart image)
│       │   │   ├── AssetDetailModal.tsx # Full asset view with tabs (details, assignments, maintenance, depreciation)
│       │   │   ├── AssetFilterSidebar.tsx # Filter panel
│       │   │   ├── ImportAssetsModal.tsx # CSV bulk import modal with template download
│       │   │   ├── QRScannerModal.tsx   # html5-qrcode camera-based scanner
│       │   │   ├── BulkActionModal.tsx  # Bulk assign/update modal
│       │   │   └── index.ts
│       │   ├── audit/                   # Audit timeline for entity detail views
│       │   │   ├── AuditTimeline.tsx
│       │   │   └── index.ts
│       │   ├── auth/                    # Auth guards
│       │   │   ├── ProtectedRoute.tsx   # Route guard (redirects to /login)
│       │   │   ├── RoleGate.tsx         # Conditional render by role (Admin/StaffAdmin/Staff/Guest)
│       │   │   └── index.ts
│       │   ├── dashboard/
│       │   │   ├── DashboardWidgets.tsx # KPI cards + chart widgets
│       │   │   └── index.ts
│       │   ├── depreciation/
│       │   │   ├── FinancialsTab.tsx    # Depreciation calculator + schedule table
│       │   │   ├── DepreciationBar.tsx  # Visual progress bar
│       │   │   └── index.ts
│       │   ├── guest/
│       │   │   ├── GuestTokenManager.tsx # Create/revoke guest share tokens
│       │   │   └── index.ts
│       │   ├── issuances/               # ★ Issuance workflow components
│       │   │   ├── NewIssuanceWizard.tsx # LEGACY / not used — unified wizard uses BulkIssuanceWizard.tsx
│       │   │   ├── BulkIssuanceWizard.tsx # ★ Unified 1 -> N issue wizard (single or multi-asset, preselected personnel support)
│       │   │   ├── QRReturnScanner.tsx  # QR scan → find active issuance → return
│       │   │   └── PDFPreviewModal.tsx  # Embedded PDF iframe preview (agreements + labels)
│       │   ├── labels/
│       │   │   ├── TemplateDesigner.tsx # Visual label template editor
│       │   │   └── index.ts
│       │   ├── lookup/
│       │   │   └── LookupTab.tsx        # Lookup value CRUD table (emerald ACTIVE badges)
│       │   ├── maintenance/
│       │   │   ├── MaintenanceTab.tsx   # Maintenance log CRUD list
│       │   │   ├── ScheduleMaintenanceModal.tsx # Schedule creation modal
│       │   │   └── index.ts
│       │   ├── notifications/
│       │   │   └── NotificationBell.tsx # Unread count badge in header
│       │   ├── users/
│       │   │   ├── AddUserModal.tsx     # Create user modal form
│       │   │   ├── EditUserModal.tsx    # Edit user modal form
│       │   │   └── index.ts
│       │   └── ui/                     # shadcn/ui primitives (Radix-based, ~12 components)
│       │       ├── badge.tsx, button.tsx, checkbox.tsx, dialog.tsx,
│       │       │   input.tsx, label.tsx, popover.tsx, scroll-area.tsx,
│       │       │   select.tsx, table.tsx, tabs.tsx
│       ├── hooks/                      # Custom React hooks
│       │   ├── useAssets.ts            # Asset data fetching + filters
│       │   ├── useLookup.ts            # Lookup value CRUD operations
│       │   ├── useLookupOptions.ts     # Dropdown option formatting
│       │   ├── useDebounce.ts          # Debounced value hook (300ms default)
│       │   ├── useSavedFilters.ts      # Persisted filter state (localStorage)
│       │   └── useKeyboardShortcuts.ts # Global keyboard shortcuts
│       ├── lib/                        # Frontend shared code
│       │   ├── api.ts                  # ★ CENTRAL API CLIENT + all endpoint wrappers + AUTH_EXPIRED_EVENT
│       │   ├── labels-api.ts           # Label-specific API calls
│       │   ├── utils.ts                # cn() classname helper + misc
│       │   └── warranty.ts             # Warranty status calculator
│       ├── utils/                      # Frontend business logic
│       │   ├── csvTemplate.ts          # CSV template generator
│       │   ├── depreciation.ts         # Depreciation math functions
│       │   └── maintenanceUtils.ts     # Maintenance helper functions
│       ├── types/
│       │   └── lookup.ts              # Lookup TypeScript types
│       └── __tests__/
│           └── Login.test.tsx          # Login page unit test
│
├── 📁 shared/                           # ═══ SHARED TYPES ═══
│   ├── package.json
│   └── types/
│       └── index.ts                     # TypeScript types shared between server & client
│
├── 📁 tests/                            # ═══ TEST SUITES ═══
│   ├── smoke/                           # Basic app health
│   ├── functional/                      # Feature tests (assets, audit, auth, depreciation, guest, labels, maintenance)
│   ├── integration/                     # Integration tests (AI, DB, audit integrity, cron)
│   ├── security/                        # Security tests (auth bypass, data exposure, input validation, role escalation)
│   ├── ui/                              # Playwright E2E tests (assets, audit, labels, login, role gates)
│   ├── helpers/mocks.ts                 # Test mocks
│   └── fixtures/assets.ts              # Test data fixtures
│
└── 📁 docs/                             # ═══ DOCUMENTATION ═══
    ├── FLOWCHART.md                     # ★ THIS FILE — complete system reference for AI agents
    ├── ASSIGNEDTO_FLOW.md               # Analysis of assignedTo field
    ├── login-redesign-recommendations.md
    ├── security-checklist.md
    └── test-strategy.md
```

---

## 5. Database Schema (Prisma — complete, authoritative)

### Entity Models

**User** (table: `users`) — System login accounts
- `id` (uuid PK), `username` (unique), `email` (unique), `passwordHash`
- `role` (enum: ADMIN | STAFF_ADMIN | STAFF | GUEST)
- `fullName`, `status` (active/inactive), `lastLogin`
- `twoFactorSecret`, `twoFactorEnabled`, `backupCodes`
- Relations: assignments[], auditLogs[], labelTemplates[]
- `createdAt`, `updatedAt`

**Asset** (table: `assets`) — Inventory items
- `id` (uuid PK), `name`, `type` (enum: DESKTOP | LAPTOP | FURNITURE | EQUIPMENT | PERIPHERAL | OTHER), `manufacturer`
- `serialNumber` (unique), `propertyNumber`, `purchasePrice` (Decimal), `purchaseDate`
- `status` (enum: AVAILABLE | ASSIGNED | MAINTENANCE | RETIRED | LOST)
- `location`, `imageUrl`, `assignedTo` (free-text string), `remarks`
- `warrantyExpiry`, `warrantyNotes`, `deletedAt` (soft delete)
- Relations: assignments[], maintenanceLogs[], maintenanceSchedules[], guestTokens[], notifications[]
- `createdAt`, `updatedAt`

**Personnel** (table: `personnel`) — People who can be issued assets
- `id` (uuid PK), `fullName`, `designation`, `project`, `projectYear`
- `email` (unique), `phone`, `hiredDate`, `employmentHistory`
- `personnelType` (employee/contractor), `contractDurationMonths`, `contractStartDate`, `contractEndDate`
- `signedAgreementPath` (uploaded PDF)
- `status` (active/inactive/resigned), `isReadyForIssuance` readiness flag
- `institutionId` → InstitutionLookup, `projectId` → ProjectLookup, `designationId` → DesignationLookup
- Relations: assignments[], historyLogs[] (ProfileHistory)

**Assignment** (table: `assignments`) — Issuance/return records (connects Asset ↔ Personnel)
- `id` (uuid PK), `assetId` → Asset, `userId` → User (who performed), `personnelId` → Personnel (who received)
- `assignedTo` (free-text fallback), `assignedAt`, `returnedAt`, `condition`, `notes`
- `agreementText` (resolved agreement at time of issuance), `agreementId` → AgreementTemplate

**AuditLog** (table: `audit_logs`) — Immutable change history
- `id` (uuid PK), `entityType`, `entityId`, `action` (CREATE/UPDATE/DELETE/ISSUE/RETURN/REVERT/etc.)
- `field`, `oldValue`, `newValue`, `summary` (human-readable), `severity` (LOW/MEDIUM/HIGH)
- `userAgent`, `oldImageUrl`
- `performedById` → User, `performedAt`, `ipAddress`

**MaintenanceLog** (table: `maintenance_logs`) — Repair/service records
- `id` (uuid PK), `assetId` → Asset, `technicianName`, `description`
- `cost` (Decimal), `date`, `createdAt`

**MaintenanceSchedule** (table: `maintenance_schedules`) — Planned maintenance
- `id` (uuid PK), `assetId` → Asset, `title`, `scheduledDate`
- `notes`, `status` (pending/completed/overdue), `completedAt`
- `frequency` (none/daily/weekly/monthly/yearly), `createdById`
- `createdAt`, `updatedAt`

**GuestToken** (table: `guest_tokens`) — Public access links
- `id` (uuid PK), `assetId` → Asset, `token` (unique)
- `expiresAt`, `maxAccess`, `accessCount`

**LookupValue** (table: `lookup_values`) — Dropdown options for asset attributes
- `id` (int PK, autoinc), `category` (ASSET_TYPE | MANUFACTURER | LOCATION | ASSIGNED_TO)
- `value` (string), `isActive`, `createdAt`, `updatedAt`
- Unique constraint on (category, value)

**InstitutionLookup** (table: `institution_lookup`) — Institutions for personnel
- `id` (int PK, autoinc), `name` (unique), `status`, `createdAt`
- FK from Personnel

**ProjectLookup** (table: `project_lookup`) — Projects for personnel
- `id` (int PK, autoinc), `name` (unique), `status` (active/inactive/completed/archived), `createdAt`
- FK from Personnel

**DesignationLookup** (table: `designation_lookup`) — Job titles for personnel
- `id` (int PK, autoinc), `name` (unique), `status`, `createdAt`
- FK from Personnel

**AgreementTemplate** (table: `agreement_templates`) — Legal agreement templates
- `id` (uuid PK), `name`, `title`, `content` (HTML with `{{placeholders}}`)
- `headerLogo`, `defaultLogo`, `isDefault`
- `defaultPropertyOfficer`, `defaultAuthorizedRep`
- Relations: assignments[] (via AssignmentAgreement)

**ProfileHistory** (table: `profile_history`) — Personnel change log
- `id` (int PK, autoinc), `profileId` → Personnel
- `designation`, `institutionName`, `projectName`, `projectYear`, `hiredDate`, `loggedAt`

**Notification** (table: `notifications`) — System alerts
- `id` (uuid PK), `type` (WARRANTY_EXPIRING | MAINTENANCE_OVERDUE)
- `message`, `assetId` → Asset, `isRead`, `createdAt`

**BackupLog** (table: `backup_logs`) — Backup history
- `id` (uuid PK), `status` (PENDING | IN_PROGRESS | COMPLETED | FAILED)
- `destination`, `filePath`, `encryptedSize`, `createdAt`

**LabelTemplate** (table: `label_templates`) — Label format definitions
- `id` (uuid PK), `name`, `format`, `config` (JSON), `createdById` → User, `createdAt`

### Key Relationships
- **Asset → Assignment:** 1-to-many (asset issued/returned multiple times)
- **Personnel → Assignment:** 1-to-many (person can have multiple active issuances)
- **Asset → MaintenanceLog/MaintenanceSchedule/GuestToken/Notification:** 1-to-many cascade delete
- **Personnel → InstitutionLookup/ProjectLookup/DesignationLookup:** Optional FK (can be null)
- **Assignment → AgreementTemplate:** Optional FK (which template was used)
- **ProfileHistory → Personnel:** Cascade delete (history removed when personnel deleted)

### Enums
```
Role:          ADMIN | STAFF_ADMIN | STAFF | GUEST
AssetStatus:   AVAILABLE | ASSIGNED | MAINTENANCE | RETIRED | LOST
AssetType:     DESKTOP | LAPTOP | FURNITURE | EQUIPMENT | PERIPHERAL | OTHER
LookupCategory: ASSET_TYPE | MANUFACTURER | LOCATION | ASSIGNED_TO
BackupStatus:  PENDING | IN_PROGRESS | COMPLETED | FAILED
NotificationType: WARRANTY_EXPIRING | MAINTENANCE_OVERDUE
AuditSeverity: LOW | MEDIUM | HIGH
```

---

## 6. Complete API Reference

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | Public | Login (rate limited: 5/15min per IP). Returns `{accessToken, refreshToken, user, requiresTwoFactor?}` |
| POST | `/api/auth/refresh` | Public | Refresh token rotation. Body: `{refreshToken}` |
| POST | `/api/auth/logout` | Authenticated | Invalidate refresh token |
| POST | `/api/auth/2fa/setup` | Authenticated | Generate TOTP secret + QR code URL |
| POST | `/api/auth/2fa/verify` | Authenticated | Verify TOTP code → enable 2FA |
| POST | `/api/auth/2fa/validate` | Public | Validate 2FA code during login |
| GET | `/api/auth/me` | Authenticated | Current user profile |

### Assets
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/assets` | Any | List (filter: type/status/location/search, sort, paginate, date ranges) |
| GET | `/api/assets/stats` | Any | Aggregated stats by status/type/location |
| GET | `/api/assets/depreciation-report` | Any | Depreciation data |
| POST | `/api/assets` | Admin/StaffAdmin | Create (JSON or multipart with image via Multer) |
| POST | `/api/assets/import` | Admin/StaffAdmin | Bulk CSV import |
| PATCH | `/api/assets/bulk-status` | Admin/StaffAdmin | Change status for multiple assets |
| DELETE | `/api/assets/bulk-delete` | Admin | Soft-delete multiple (sets status=RETIRED) |
| POST | `/api/assets/bulk-assign` | Admin/StaffAdmin | Bulk assign to personnel |
| POST | `/api/assets/bulk-return` | Admin/StaffAdmin | Bulk return by issuance IDs |
| POST | `/api/assets/bulk-update` | Admin/StaffAdmin | Bulk location/status update |
| GET | `/api/assets/:id` | Any | Single asset (guest-filtered if GUEST role) |
| PUT | `/api/assets/:id` | Admin/StaffAdmin/Staff | Update asset (JSON or multipart) |
| DELETE | `/api/assets/:id` | Admin | Soft-delete (sets deletedAt) |
| POST | `/api/assets/:id/image` | Admin/StaffAdmin/Staff | Upload + resize (Sharp, 800px max) |
| GET | `/api/assets/:id/history` | Any | Assignment history for this asset |
| POST | `/api/assets/:id/checkout` | Admin/StaffAdmin | Legacy checkout |
| POST | `/api/assets/:id/return` | Admin/StaffAdmin | Legacy return |

### Maintenance
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/assets/:id/maintenance` | Any | List maintenance logs for asset |
| POST | `/api/assets/:id/maintenance` | Admin/StaffAdmin | Create maintenance log |
| PUT | `/api/assets/:id/maintenance/:logId` | Admin/StaffAdmin | Update log |
| DELETE | `/api/assets/:id/maintenance/:logId` | Admin | Delete log |
| GET | `/api/maintenance/upcoming` | Any | Upcoming maintenance (scheduled within N days) |

### Audit Trail
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/audit` | Any | List (filter: entityType/action/severity/module/date, paginate) |
| GET | `/api/audit/export` | Any | CSV download (opens in new tab) |
| DELETE | `/api/audit/cleanup` | Admin | Purge logs older than N days |
| GET | `/api/audit/:entityId` | Any | Timeline for specific entity |
| POST | `/api/audit/:id/revert` | Admin | Field-level undo |

### Dashboard
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/dashboard/stats` | Any | KPI stats (total, assigned, maintenance, available) + activity feed |
| GET | `/api/dashboard/warranties-expiring` | Any | Warranties expiring within 30 days (with warrantyStatus: expired/expiring/active) |
| GET | `/api/dashboard/location-stats` | Any | Asset counts grouped by location |
| GET | `/api/dashboard/age-stats` | Any | Asset age distribution (buckets) |

### Labels
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/labels/generate-pdf` | Admin/StaffAdmin/Staff | Generate barcode PDF for selected assets |
| GET/POST/PUT/DELETE | `/api/labels/templates` | Admin/StaffAdmin | CRUD label templates |
| POST | `/api/labels/batch` | Admin/StaffAdmin/Staff | Batch label ZIP generation |

### Guest Access
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/guest/a/:token` | **Public** | View asset (rate limited, access count tracked) |
| POST | `/api/guest/tokens` | Admin/StaffAdmin | Create guest token |
| GET | `/api/guest/tokens` | Admin/StaffAdmin | List all tokens |
| DELETE | `/api/guest/tokens/:id` | Admin | Revoke token |

### AI
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/ai/suggest` | Any | AI-suggest type + manufacturer from asset name |

### Backups
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/backups/now` | Admin | Trigger manual backup |
| GET | `/api/backups` | Admin | Backup history |

### Notifications
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/notifications` | Any | Unread notifications |
| PATCH | `/api/notifications/:id/read` | Any | Mark as read |

### Users (Admin only)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users` | Admin | List all users |
| POST | `/api/users` | Admin | Create user |
| PUT | `/api/users/:id` | Admin | Update user |
| PATCH | `/api/users/:id/status` | Admin | Activate/deactivate |

### Lookups (Asset-related)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/lookups/:category` | Any | Active values (asset-types, manufacturers, locations, assigned-to) |
| GET | `/api/lookups/:category/all` | Admin/StaffAdmin | All values including inactive |
| POST | `/api/lookups/:category` | Admin/StaffAdmin | Add value |
| PATCH | `/api/lookups/:id` | Admin/StaffAdmin | Toggle active/inactive |
| POST | `/api/lookups/migrate` | Admin | Seed from existing asset data |

### Personnel
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/personnel` | Any | List (search, filter, paginate) |
| GET | `/api/personnel/:id` | Any | Single record with detailed assignments |
| POST | `/api/personnel` | Admin | Create |
| PATCH | `/api/personnel/:id` | Admin | Update |
| PATCH | `/api/personnel/:id/readiness` | Admin/StaffAdmin | Toggle issuance readiness (`isReadyForIssuance`) |
| DELETE | `/api/personnel/:id` | Admin | Soft-delete (blocks if active issuances) |

### Issuances
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/issuances` | Any | List (filter: status/search/personnelId, paginate) |
| POST | `/api/issuances` | `issuances:create` | Legacy single issuance endpoint; backend validates ready personnel and AVAILABLE/PENDING_ASSIGNMENT assets |
| POST | `/api/issuances/bulk` | `issuances:create` | Unified 1 -> N issuance flow (one or many assetIds → one personnel) |
| POST | `/api/issuances/assets/lock` | `issuances:create` | Lock selected AVAILABLE assets as PENDING_ASSIGNMENT while wizard is in progress |
| POST | `/api/issuances/assets/release` | `issuances:create` | Release cancelled/backed-out PENDING_ASSIGNMENT assets back to AVAILABLE |
| POST | `/api/issuances/:id/return` | `issuances:edit` | Return asset (sets returnedAt, condition) |
| POST | `/api/issuances/:id/sign` | `issuances:edit` | Recipient typed digital sign-off; signs whole active batch when the assignment has bulkBatchId |
| GET | `/api/issuances/assets/available` | Any | Available assets for wizard (status=AVAILABLE, no deletedAt) |
| GET | `/api/issuances/personnel/active` | Any | Active personnel for wizard |
| POST | `/api/issuances/resolve-template/bulk` | Any | Resolve agreement text for bulk issuance |

### Agreement Templates
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/agreements/templates` | Admin/StaffAdmin | List templates |
| GET | `/api/agreements/templates/:id` | Admin/StaffAdmin | Single template |
| POST | `/api/agreements/templates` | Admin | Create (multipart with optional logo) |
| PATCH | `/api/agreements/templates/:id` | Admin | Update |
| DELETE | `/api/agreements/templates/:id` | Admin | Delete |
| POST | `/api/agreements/upload-logo` | Admin | Upload logo for reuse |
| GET | `/api/agreements/placeholders` | Any | Template placeholder reference |
| POST | `/api/agreements/pdf` | Admin/StaffAdmin | Generate PDF (returns application/pdf binary) |
| GET | `/api/agreements/documents` | `issuances:view` | List immutable agreement document snapshots |
| POST | `/api/agreements/documents/backfill` | `issuances:edit` | Backfill immutable snapshots for historical assignments (supports dryRun) |
| POST | `/api/agreements/documents/:id/signed-copy` | `issuances:edit` | Attach or replace the signed PDF copy for an agreement document; writes an audit log |

### Institutions / Projects
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/institutions` | Any | List |
| GET | `/api/projects` | Any | List |

### Accountability Lookups (`/api/lookup/accountability/*`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/designations`, `/institutions`, `/projects` | Any | List (optional `?activeOnly=true`) |
| POST | Same paths | Admin/StaffAdmin | Create |
| PATCH | `/:id` | Admin/StaffAdmin | Toggle status |

### Health
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | Public | `{status: "ok", timestamp}` |

---

## 7. Frontend Routes Map

| Path | Component | Access | Description |
|------|-----------|--------|-------------|
| `/login` | `LoginPage` | Public | Split-screen login (navy brand panel + form) with 2FA support |
| `/setup-2fa` | `Setup2FaPage` | Authenticated | TOTP 2FA setup wizard |
| `/guest/:token` | `GuestAssetPage` | Public | Read-only asset view for shared links |
| `/` | `DashboardPage` | Authenticated | Command Center: KPI tiles, bento analytics, activity timeline |
| `/assets` | `AssetsPage` | Authenticated | Asset table + CRUD + CSV import + bulk ops + QR scanner |
| `/lookup` | `InventoryLookupPage` | Admin/StaffAdmin | Asset lookup values (types, mfrs, locations) |
| `/accountability-lookup` | `AccountabilityLookupPage` | Admin/StaffAdmin | Accountability lookups (designations, institutions, projects) |
| `/profiles` | `ProfilesPage` | Admin/StaffAdmin | Personnel management + active items |
| `/issuances` | `IssuancesPage` | Admin/StaffAdmin | Issue/return wizards + QR return + bulk issuance |
| `/accountability/templates` | `AccountabilityTemplatesPage` | Admin | Agreement template editor |
| `/users` | `UserManagementPage` | Admin | User CRUD + activate/deactivate |
| `/audit` | `AuditPage` | Authenticated | Audit trail with filters, CSV export, revert |
| `/settings` | `SettingsPage` | Authenticated | Backup triggers, guest tokens, preferences |

**Route file:** `client/src/App.tsx` — `<BrowserRouter basename="/aio-system">`

---

## 8. Data Flow Diagrams

### Authentication Flow
```
┌──────────┐     POST /api/auth/login      ┌──────────┐
│  LoginPage│──────────────────────────────►│  Express │
│          │     {email, password, 2FA?}   │          │
│          │◄──────────────────────────────│          │
│          │     {accessToken, refreshToken}│          │
└──────────┘                               └──────────┘
     │                                          │
     │ Store in AuthContext + localStorage       │ Verify JWT on every request
     ▼                                          ▼
┌──────────┐     Authorization: Bearer <JWT>   ┌──────────┐
│ AuthContext│───────────────────────────────►│  middleware│
│          │                                  │  auth.ts   │
│ • Auto-refresh token (14 min interval)      └──────────┘
│ • Cache user in localStorage for fast load        │
│ • Decode JWT expiry to skip unnecessary refresh   ▼
│ • Emit AUTH_EXPIRED_EVENT on hard 401       req.user = {id, role, username}
│ • RoleGate / ProtectedRoute gate access
└──────────┘
```

### Issuance Flow (Admin → Personnel)
```
Admin                            Server                            Database
  │                                │                                │
  │ 1. Open IssuancesPage          │                                │
  │──► GET /api/issuances ────────►│──► SELECT assignments WITH     │
  │    ?status=all&limit=50        │     asset, personnel,          │
  │                                │     designationLookup          │
  │                                │                                │
  │ 2. "New Issuance" wizard:      │                                │
  │──► GET available assets ──────►│──► SELECT assets WHERE         │
  │    (useDebounce search)        │     status=AVAILABLE           │
  │                                │     AND deletedAt IS NULL      │
  │──► GET active personnel ──────►│──► SELECT personnel WHERE      │
  │    (useDebounce search)        │     status=active              │
  │                                │                                │
  │ 3. Select asset + personnel    │                                │
  │    + condition + template      │                                │
  │──► POST /api/issuances ───────►│──► CREATE Assignment           │
  │    {assetId, personnelId,      │     (assetId, personnelId,     │
  │     condition, agreementText}  │      assignedAt=now)           │
  │                                │──► UPDATE Asset.status         │
  │                                │     = ASSIGNED                 │
  │                                │──► CREATE AuditLog (ISSUE)     │
  │    ◄── 201 {assignment} ──────┤                                │
  │                                │                                │
  │ 4. "Bulk Issuance" wizard:     │                                │
  │    Select MULTIPLE assets      │                                │
  │──► POST /api/issuances/bulk ──►│──► Loop: create Assignment     │
  │    {assetIds[], personnelId,   │     per asset → update status  │
  │     condition}                 │──► Resolve agreement text       │
  │                                │──► CREATE AuditLog per asset   │
  │    ◄── {assigned, errors[]} ──┤                                │
  │                                │                                │
  │ 5. Return via QR scan:         │                                │
  │    Scan asset QR code          │                                │
  │──► Search active issuances ───►│──► Find Assignment WHERE      │
  │──► POST /issuances/:id/return ►│     returnedAt IS NULL        │
  │    {condition: "Good"}         │──► UPDATE Assignment           │
  │                                │     (returnedAt, condition)    │
  │                                │──► UPDATE Asset.status         │
  │                                │     = AVAILABLE                │
  │                                │──► CREATE AuditLog (RETURN)    │
```

### Dashboard Data Flow
```
Dashboard Page                                Backend
  │                                            │
  ├── GET /api/dashboard/stats ───────────────►│ dashboard.service
  │   Returns: {totalAssets, totalAssigned,    │  ├── prisma.asset.count()
  │             underMaintenance, available,   │  ├── prisma.asset.groupBy(status)
  │             byStatus{}, byType{},          │  ├── prisma.asset.groupBy(type)
  │             activityFeed[]}                │  ├── AuditLog recent entries
  │                                            │
  ├── GET /api/maintenance/upcoming ──────────►│
  │   Returns: [{id, title, scheduledDate,     │  Upcoming schedules
  │             status, asset{id,name}}]        │  (status: pending/overdue/completed)
  │                                            │
  ├── GET /api/dashboard/warranties-expiring ──►│
  │   Returns: [{id, name, warrantyExpiry,     │  Warranties expiring < 30 days
  │             daysUntilExpiry,               │  warrantyStatus: active/expiring/expired
  │             warrantyStatus}]               │
  │                                            │
  ├── GET /api/dashboard/location-stats ──────►│ Group by location
  ├── GET /api/dashboard/age-stats ───────────►│ Age buckets (0-1yr, 1-3yr, 3-5yr, 5+yr)
```

### Audit Trail Flow
```
Any Write Action                         Database
  │                                        │
  ├── Asset CREATE/UPDATE/DELETE ─────────►│ AuditLog (per-field tracking)
  ├── Assignment ISSUE/RETURN ────────────►│ AuditLog
  ├── Maintenance CREATE/UPDATE/DELETE ───►│ AuditLog
  ├── Bulk IMPORT/STATUS_CHANGE/ASSIGN ───►│ AuditLog (per asset)
  ├── Backup TRIGGER ─────────────────────►│ AuditLog
  ├── Personnel CREATE/UPDATE/DELETE ─────►│ AuditLog
  ├── User CREATE/UPDATE/STATUS_CHANGE ───►│ AuditLog
  │                                        │
  │   AuditPage UI:                         │
  ├── GET /api/audit (filtered + paginated)►│ Query with filters
  ├── GET /api/audit/export (CSV) ────────►│ CSV download (new tab)
  ├── POST /api/audit/:id/revert ─────────►│ Restore old field value
  └── DELETE /api/audit/cleanup ──────────►│ Purge old logs (N days)
```

---

## 9. Key File Quick Reference

| Want to... | Go to |
|------------|-------|
| Change DB schema | `server/prisma/schema.prisma` → `npx prisma migrate dev` |
| Add API endpoint | `server/src/routes/*.routes.ts` + `server/src/services/*.service.ts` |
| Add Zod validation | `server/src/routes/*.schema.ts` |
| Change Express setup | `server/src/index.ts` |
| Add frontend route | `client/src/App.tsx` + `client/src/pages/NewPage.tsx` |
| Change auth (JWT, roles) | `client/src/context/AuthContext.tsx` + `server/src/middleware/auth.ts` |
| Change API client | `client/src/lib/api.ts` |
| Change page layout | Component hierarchy: Header → KPI row → Filter bar → Table → Pagination |
| Change asset table | `client/src/components/assets/AssetTable.tsx` |
| Change dashboard | `client/src/pages/DashboardPage.tsx` |
| Change issuance wizard | `client/src/pages/IssuancesPage.tsx` (inline NewIssuanceWizard) |
| Change bulk issuance | `client/src/components/issuances/BulkIssuanceWizard.tsx` |
| Change personnel mgmt | `client/src/pages/ProfilesPage.tsx` |
| Change user mgmt | `client/src/pages/UserManagementPage.tsx` |
| Change audit trail UI | `client/src/pages/AuditPage.tsx` |
| Change dark mode | `client/src/context/ThemeContext.tsx` |
| Change agreement PDF | `server/src/services/agreement.service.ts` |
| Change label PDF | `server/src/services/label.service.ts` |
| Change cron jobs | `server/src/jobs/cron.ts` |
| Change PM2 config | `ecosystem.config.js` |
| Change Vite config | `client/vite.config.ts` |
| Add shared types | `shared/types/index.ts` |
| Seed demo data | `server/scripts/seed-dashboard.ts` |
| Base seed | `server/prisma/seed.ts` |

---

## 10. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3001) |
| `NODE_ENV` | Yes | `development` or `production` |
| `DATABASE_URL` | Yes | PostgreSQL: `postgresql://user:pass@localhost:5432/aio_system` |
| `JWT_SECRET` | Yes | 32+ hex chars for access token signing |
| `REFRESH_TOKEN_SECRET` | Yes | Different 32+ hex chars for refresh token signing |
| `BACKUP_ENCRYPTION_KEY` | Yes | 64 hex chars (32 bytes) for AES-256-GCM |
| `CLIENT_URL` | No | CORS origin, default: `http://localhost:5173` |
| `TWO_FA_ISSUER` | No | TOTP issuer name (default: AIO-System) |
| `AWS_*` | For backups | S3 credentials, bucket, region |
| `GOOGLE_*` | For Google Drive | Drive backup credentials |
| `AI_API_URL` | For AI | OpenAI-compatible endpoint |
| `AI_API_KEY` | For AI | API key |
| `AI_MODEL` | No | Model name (default: gpt-4o-mini) |

---

## 11. Commands Quick Reference

```bash
# ── Development ──
cd aio-system
npm install               # Install all workspace deps
npm run dev               # Start server (ts-node-dev :3001) + client (Vite :3000)
                          # Client proxies /api → :3001, serves at /aio-system/
# Server only
cd server
npx prisma generate       # Regenerate Prisma client
npx prisma migrate dev    # Create & apply migrations
npx prisma migrate deploy # Apply pending migrations (production)
npx prisma db seed        # Seed DB (admin user)
npm run dev               # ts-node-dev hot reload

# Seed demo data (10 assets + assignments + maintenance)
cd server && npx ts-node-dev --transpile-only scripts/seed-dashboard.ts

# Client only
cd client
npm run dev               # Vite HMR on :3000

# ── Build ──
npm run build             # tsc (server) + vite build (client → server/public/)

# ── Production ──
pm2 start ecosystem.config.js --env production
pm2 status
pm2 logs aio-system

# ── Testing ──
npm test                  # Vitest (all suites)
npm run test:smoke        # Fast smoke tests
npm run test:all          # Functional + integration + security
npm run test:ui           # Playwright E2E
npm run test:all:with-ui  # Everything

# ── DB Operations ──
npm run db:migrate        # prisma migrate dev
npm run db:seed           # prisma db seed
```

---

## 12. Quick Facts for AI Agents

- **Working directory:** Project root is `aio-system/`
- **Monorepo:** npm workspaces at `server/`, `client/`, `shared/`
- **Dev server:** Express on port 3001, Vite on port 3000 (proxies /api → 3001)
- **Base path:** Frontend served at `/aio-system/`
- **Database:** PostgreSQL, Prisma ORM. Schema at `server/prisma/schema.prisma`
- **Auth:** JWT access token (15min) + refresh token (7 days). Stored in localStorage.
- **Roles:** ADMIN → STAFF_ADMIN → STAFF → GUEST (hierarchical, ADMIN has all)
- **API response format:** `{success: boolean, data: any, error: {message} | null, meta: {page, limit, total, totalPages} | null}`
- **Soft delete:** Assets have `deletedAt` timestamp. Personnel set `status=inactive`. Never hard-delete.
- **Assets enum values use Prisma Enums:** AVAILABLE, PENDING_ASSIGNMENT, ASSIGNED, MAINTENANCE, RETIRED, LOST
- **Table pattern:** `overflow-x-auto rounded-lg border bg-white` wrapper with `bg-[#012061]` thead, `bg-white` tbody rows
- **Brand colors:** Navy `#012061` (headers, accents), Orange `#f8931f` (buttons, highlights, KPIs), Red `#7B1113` (destructive)
- **Font:** Geist Variable imported at `client/src/index.css`
- **Dark mode:** `ThemeContext` toggles `.dark` on `<html>`, all components use `dark:` variants
- **New Issuance Bug History:** Wizard had shared timer bug causing empty asset list. Fixed by using separate `useDebounce` hooks. If assets don't appear, check that `useDebounce` is called once per search field (not a shared `timerRef`).

### Intelligent Template Engine Notes

Template bodies support standard placeholders plus smart blocks:

- `{{assetSection}}` renders a single-asset paragraph for one asset, or a fixed-width table for multiple assets.
- `{{assetParagraph}}` always renders the paragraph variant.
- `{{assetTable}}` always renders the table variant.
- `{{#ifSingleAsset}}...{{/ifSingleAsset}}` only renders for a one-asset document.
- `{{#ifMultipleAssets}}...{{/ifMultipleAssets}}` only renders for multi-asset documents.

Recipient digital sign-off is stored on assignments via `recipientSignedAt`, `recipientSignatureName`, `recipientSignatureMethod`, and `recipientSignatureIp`. Batch sign-off updates all unsigned active assignments in the same `bulkBatchId`.

## 13. Current Project Roadmap (Issuance System Overhaul)

This section tracks the multi-phase upgrade of the asset issuance flow. (Last Updated: 2026-05-20)

| Phase | Title | Status | Description |
|-------|-------|--------|-------------|
| **1** | **Foundation & Profiles** | ✅ Done | Added isReadyForIssuance flag to Personnel model, migration, backend readiness toggle endpoint, audit logging, and Profile UI readiness badges/toggle. |
| **2** | **Unified Issuance Wizard** | ✅ Done | Consolidated Single vs Bulk issuance into the unified 1 -> N asset wizard. Added PENDING_ASSIGNMENT enum/migration plus lock/release endpoints, wizard-side locking cleanup, batch-row return action, and verified accountability lifecycle states (`PENDING_SIGNATURE` -> `ACTIVE` -> `RETURNED`) with condition/return snapshots. Note: Phase 2 final verification passed on 2026-05-20 via Prisma validate, targeted issuance-accountability tests, and full app build. |
| **3** | **Intelligent Template Engine** | ✅ Done | Added Visual Variable Picker with grouped insert-at-cursor variables, smart asset placeholders, and conditional blocks for 1-asset paragraph vs multi-asset table rendering. |
| **4** | **Final Document & Sign-off** | ✅ Done | Enhanced PDF traceability with document metadata/sign-off status and added recipient typed digital sign-off fields, migration, endpoint, audit log, and issuance UI flow. |
