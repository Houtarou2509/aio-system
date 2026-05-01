# AIO-System — Full System Map & AI Agent Reference

> **PURPOSE:** Feed this file into any AI coding agent to give it complete understanding of the application — every file, every endpoint, every page, every database model, and how they connect.
> Last updated: 2026-05-01

---

## 1. What Is This Application?

**AIO-System** is a full-stack asset management and accountability tracking web application. It manages physical assets (hardware, equipment, furniture, etc.), tracks who they're issued to, handles maintenance schedules, generates barcode labels, creates legal accountability agreements (PDFs), and maintains a full audit trail of every change.

**Key workflows:**
- **Asset lifecycle:** Create → assign/issue to personnel → maintain → retire/delete
- **Accountability:** Issue assets to personnel, generate legal agreement PDFs they sign, QR-code return scanning
- **Inventory management:** Dropdown lookups for types/manufacturers/locations/personnel/projects/institutions
- **Audit trail:** Every CUD operation is logged with who did it, old/new values, and IP address
- **Label generation:** PDF barcode labels with custom templates via a visual designer
- **Automation:** Cron jobs for daily backups (02:00 SGT) and notifications (09:00 SGT)

---

## 2. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Runtime** | Node.js v22+ | — |
| **Server** | Express.js 4.x | REST API, serves frontend in production |
| **Database** | PostgreSQL | Via Prisma ORM 6.x |
| **Auth** | JWT (jsonwebtoken) + bcryptjs + TOTP 2FA | Refresh token rotation |
| **Frontend** | React 18 + Vite 6 + TypeScript | shadcn/ui + Tailwind CSS |
| **Charts** | Chart.js + react-chartjs-2 | Dashboard widgets |
| **PDF Generation** | PDFKit | Labels (bwip-js barcodes) + Accountability agreements |
| **Image Processing** | Sharp | Resize on upload (800px max) |
| **File Upload** | Multer | 5MB limit, images only |
| **CSV Import** | csv-parse | Bulk asset import |
| **Cron Jobs** | node-cron | Backup 02:00 SGT, notifications 09:00 SGT |
| **Backup** | archiver (zip) + AWS S3 SDK | Encrypted backup archives |
| **AI** | Google Gemini API | Asset detail auto-suggestion |
| **Email** | Google Gmail API | Notification emails |
| **QR Codes** | html5-qrcode (scan) + bwip-js (generate) | Asset labels + return scanning |
| **Rate Limiting** | express-rate-limit | Login 5/15min, guest tokens |
| **Security** | helmet, cors, morgan | — |
| **Process Manager** | PM2 | ecosystem.config.js |
| **Testing** | Vitest (unit/integration/security) + Playwright (E2E) | — |

---

## 3. Complete Project File Tree

This is the authoritative file listing. **Every file exists at the path shown.** Sub-agent: if you need to modify something, use the path from this tree.

```
aio-system/
├── package.json                          # Monorepo root (workspaces: server, client, shared)
├── ecosystem.config.js                   # PM2 config (port 3001 dev / 3000 prod)
├── playwright.config.ts                  # Playwright E2E config
│
├── 📁 server/                            # ═══ BACKEND ═══
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env                              # Environment variables (DATABASE_URL, JWT_SECRET, etc.)
│   ├── vitest.config.ts
│   ├── prisma/
│   │   ├── schema.prisma                 # ★ DATABASE: All models, enums, relations
│   │   ├── seed.ts                       # DB seed script
│   │   └── seed-lookups.ts              # Lookup value seed
│   ├── uploads/                          # User-uploaded asset images (served at /aio-system/uploads)
│   ├── backups/                          # Local backup .enc files before S3 upload
│   ├── public/                           # Built frontend (Vite output) + static assets
│   │   ├── index.html                    # SPA entry
│   │   ├── manifest.json                 # PWA manifest
│   │   ├── favicon.svg, pwa-*.png        # PWA icons
│   │   ├── logo-uppi.png, logo-drdf.png  # Org logos
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
│       │   ├── validate.ts              # Zod schema validation middleware
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
│       │   ├── maintenanceSchedules.ts   # CRUD /api/assets/maintenance-schedules
│       │   ├── maintenanceUpcoming.ts    # GET /api/maintenance/upcoming
│       │   ├── label.routes.ts           # PDF label generation, template CRUD
│       │   ├── label.schema.ts           # Zod schemas for label payloads
│       │   ├── dashboard.routes.ts       # GET /api/dashboard (stats, warranties, locations, age)
│       │   ├── guest.routes.ts           # Public /api/guest/a/:token, token CRUD
│       │   ├── ai.routes.ts              # POST /api/ai/suggest (Gemini)
│       │   ├── ai.schema.ts              # Zod schema for AI payload
│       │   ├── backup.routes.ts          # POST /api/backups/now, GET list
│       │   ├── backup.schema.ts          # Zod schema for backup requests
│       │   ├── notification.routes.ts    # GET /api/notifications, PATCH mark-read
│       │   ├── user.routes.ts            # CRUD /api/users (Admin only)
│       │   ├── lookup.routes.ts          # CRUD /api/lookups/:category (asset types, mfrs, locations, assigned-to)
│       │   ├── personnel.routes.ts       # CRUD /api/personnel
│       │   ├── issuance.routes.ts        # CRUD /api/issuances (issue/return assets to personnel)
│       │   ├── agreement.routes.ts       # CRUD /api/agreement/templates, logo upload, PDF generation
│       │   ├── institution.routes.ts     # GET /api/institutions (list)
│       │   ├── project.routes.ts         # GET /api/projects (list)
│       │   └── accountabilityLookup.routes.ts  # CRUD /api/lookup/accountability (designations, institutions, projects)
│       ├── services/                     # ★ BUSINESS LOGIC (one per resource)
│       │   ├── auth.service.ts           # Login, JWT signing, 2FA setup, refresh tokens
│       │   ├── asset.service.ts          # Asset CRUD, CSV import, bulk ops, assignment history
│       │   ├── audit.service.ts          # Query, export CSV, revert field changes, cleanup old logs
│       │   ├── maintenance.service.ts    # Maintenance log CRUD
│       │   ├── dashboard.service.ts      # Aggregated stats, warranty checks, age distribution
│       │   ├── label.service.ts          # PDF generation (PDFKit + bwip-js), template CRUD
│       │   ├── guest.service.ts          # Guest token management, rate-limited public access
│       │   ├── depreciation.service.ts   # Straight-line depreciation calculations
│       │   ├── notification.service.ts   # Warranty/maintenance alert generation
│       │   ├── backup.service.ts         # pg_dump + zip + encrypt + S3 upload
│       │   ├── ai.service.ts             # Gemini API integration for asset suggestions
│       │   ├── personnel.service.ts      # Personnel CRUD + audit logging
│       │   ├── issuance.service.ts       # Issue assets, return assets, QR return, agreement text generation
│       │   └── agreement.service.ts      # Template CRUD, agreement PDF generation (PDFKit)
│       └── utils/
│           ├── response.ts              # success(data, meta) / error(message, code) helpers
│           ├── env.ts                    # ENV validation (DATABASE_URL, JWT_SECRET, etc.)
│           ├── guestFilter.ts           # Strips sensitive fields (price, serial#) for GUEST role
│           ├── auditHelpers.ts          # Shared audit logging utilities
│           └── templateParser.ts        # Agreement template placeholder reference
│
├── 📁 client/                            # ═══ FRONTEND ═══
│   ├── package.json
│   ├── vite.config.ts                    # Vite config (base: /aio-system, proxy /api → :3001)
│   ├── components.json                   # shadcn/ui configuration
│   └── src/
│       ├── main.tsx                      # React entry point
│       ├── App.tsx                       # ★ ROUTER — all frontend routes defined here (BrowserRouter basename=/aio-system)
│       ├── App.css                       # Root-level styles
│       ├── index.css                     # Global styles + Tailwind directives
│       ├── vite-env.d.ts                # Vite type declarations
│       ├── assets/                       # Static assets
│       │   ├── hero.png, react.svg, vite.svg
│       ├── context/
│       │   └── AuthContext.tsx           # ★ Auth state, login/logout, token refresh, user info, role
│       ├── pages/                        # ★ ALL PAGE COMPONENTS (one per route)
│       │   ├── LoginPage.tsx             # /login
│       │   ├── Setup2FaPage.tsx          # /setup-2fa
│       │   ├── GuestAssetPage.tsx        # /guest/:token (public)
│       │   ├── DashboardPage.tsx         # / (home)
│       │   ├── AssetsPage.tsx            # /assets
│       │   ├── AuditPage.tsx             # /audit
│       │   ├── SettingsPage.tsx          # /settings
│       │   ├── UserManagementPage.tsx    # /users (Admin)
│       │   ├── InventoryLookupPage.tsx   # /lookup (Admin/StaffAdmin) — asset dropdown values
│       │   ├── AccountabilityLookupPage.tsx  # /accountability-lookup (Admin/StaffAdmin) — designations, institutions, projects
│       │   ├── AccountabilityTemplatesPage.tsx # /accountability/templates (Admin) — agreement template editor
│       │   ├── ProfilesPage.tsx          # /profiles (Admin/StaffAdmin) — personnel management
│       │   └── IssuancesPage.tsx         # /issuances (Admin/StaffAdmin) — issue/return tracking
│       ├── components/
│       │   ├── AppLayout.tsx            # Sidebar + top nav shell (wraps all authenticated routes)
│       │   ├── assets/                  # Asset table, forms, modals
│       │   │   ├── AssetTable.tsx       # Sortable/filterable asset list table
│       │   │   ├── AssetFormModal.tsx   # Create/edit asset modal form
│       │   │   ├── AssetDetailModal.tsx # Full asset detail view with tabs
│       │   │   ├── AssetFilterSidebar.tsx # Filter panel (type, status, location, search)
│       │   │   ├── ImportAssetsModal.tsx # CSV bulk import modal
│       │   │   ├── QRScannerModal.tsx   # Camera-based QR code scanner
│       │   │   └── index.ts
│       │   ├── audit/
│       │   │   ├── AuditTimeline.tsx    # Per-entity audit history timeline
│       │   │   └── index.ts
│       │   ├── auth/
│       │   │   ├── ProtectedRoute.tsx   # Route guard (redirects to /login if unauthenticated)
│       │   │   ├── RoleGate.tsx         # Conditional render by user role
│       │   │   └── index.ts
│       │   ├── dashboard/
│       │   │   ├── DashboardWidgets.tsx # KPI cards + charts
│       │   │   └── index.ts
│       │   ├── depreciation/
│       │   │   ├── FinancialsTab.tsx    # Depreciation calculator + schedule
│       │   │   ├── DepreciationBar.tsx  # Visual depreciation progress bar
│       │   │   └── index.ts
│       │   ├── guest/
│       │   │   ├── GuestTokenManager.tsx # Create/revoke guest share tokens
│       │   │   └── index.ts
│       │   ├── issuances/              # Issuance workflow components
│       │   │   ├── QRReturnScanner.tsx  # QR scanner for returning assets
│       │   │   └── PDFPreviewModal.tsx  # Embedded PDF preview for agreement + labels
│       │   ├── labels/
│       │   │   ├── TemplateDesigner.tsx # Visual label template editor (drag fields)
│       │   │   └── index.ts
│       │   ├── lookup/
│       │   │   └── LookupTab.tsx        # Lookup value CRUD table
│       │   ├── maintenance/
│       │   │   ├── MaintenanceTab.tsx   # Maintenance log list + CRUD
│       │   │   ├── ScheduleMaintenanceModal.tsx # Schedule creation modal
│       │   │   └── index.ts
│       │   ├── notifications/
│       │   │   └── NotificationBell.tsx # Unread notification count badge
│       │   ├── users/
│       │   │   ├── AddUserModal.tsx     # Create user modal
│       │   │   ├── EditUserModal.tsx    # Edit user modal
│       │   │   └── index.ts
│       │   └── ui/                     # shadcn/ui primitives (Radix-based)
│       │       ├── badge.tsx, button.tsx, checkbox.tsx, dialog.tsx,
│       │       │   input.tsx, label.tsx, popover.tsx, scroll-area.tsx,
│       │       │   select.tsx, table.tsx, tabs.tsx
│       ├── hooks/                      # Custom React hooks
│       │   ├── useAssets.ts            # Asset data fetching + caching
│       │   ├── useLookup.ts            # Lookup data fetching
│       │   ├── useLookupOptions.ts     # Dropdown option formatting
│       │   └── useSavedFilters.ts      # Persisted filter state (localStorage)
│       ├── lib/                        # Shared library code
│       │   ├── api.ts                  # ★ CENTRAL API CLIENT — apiFetch() wrapper, all endpoints, AUTH_EXPIRED_EVENT
│       │   ├── labels-api.ts           # Label-specific API calls
│       │   ├── utils.ts                # cn() classname helper + misc utilities
│       │   └── warranty.ts             # Warranty status calculator
│       ├── utils/                      # Frontend business logic
│       │   ├── csvTemplate.ts          # CSV template generator for bulk import
│       │   ├── depreciation.ts         # Depreciation math functions
│       │   └── maintenanceUtils.ts     # Maintenance helper functions
│       ├── types/
│       │   └── lookup.ts              # Lookup-related TypeScript types
│       └── __tests__/
│           └── Login.test.tsx          # Login page unit test
│
├── 📁 shared/                           # ═══ SHARED TYPES ═══
│   ├── package.json
│   └── types/
│       └── index.ts                     # TypeScript types shared between server & client
│
├── 📁 tests/                            # ═══ TEST SUITES ═══
│   ├── smoke/
│   │   └── smoke.test.ts               # Basic app health
│   ├── functional/                      # Functionality tests
│   │   ├── assets.test.ts
│   │   ├── audit.test.ts
│   │   ├── auth.test.ts
│   │   ├── depreciation.test.ts
│   │   ├── guest-tokens.test.ts
│   │   ├── labels.test.ts
│   │   └── maintenance.test.ts
│   ├── integration/                     # Integration tests
│   │   ├── ai-suggest.test.ts
│   │   ├── assets-db.test.ts
│   │   ├── audit-integrity.test.ts
│   │   ├── cron-backup.test.ts
│   │   └── cron-depreciation.test.ts
│   ├── security/                        # Security tests
│   │   ├── auth-bypass.test.ts
│   │   ├── data-exposure.test.ts
│   │   ├── input-validation.test.ts
│   │   └── role-escalation.test.ts
│   ├── ui/                             # Playwright E2E tests
│   │   ├── assets.spec.ts
│   │   ├── audit.spec.ts
│   │   ├── global-setup.ts
│   │   ├── labels.spec.ts
│   │   ├── login.spec.ts
│   │   └── role-gates.spec.ts
│   ├── helpers/
│   │   └── mocks.ts
│   └── fixtures/
│       └── assets.ts
│
└── 📁 docs/                             # ═══ DOCUMENTATION ═══
    ├── FLOWCHART.md                     # ★ THIS FILE — complete system reference for AI agents
    ├── ASSIGNEDTO_FLOW.md              # Analysis of assignedTo field (free-text vs FK)
    ├── login-redesign-recommendations.md
    ├── security-checklist.md
    └── test-strategy.md
```

---

## 4. Database Schema (Prisma — complete, authoritative)

```
┌──────────────────────────────────────────────────────────────────────┐
│                          PostgreSQL                                   │
│                                                                      │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│  │    User       │     │  Personnel   │     │    Asset      │        │
│  ├──────────────┤     ├──────────────┤     ├──────────────┤        │
│  │ id ⭑ (uuid)  │     │ id ⭑ (uuid)  │     │ id ⭑ (uuid)  │        │
│  │ username     │     │ fullName      │     │ name         │        │
│  │ email        │     │ designation   │     │ type         │        │
│  │ passwordHash │     │ project       │     │ manufacturer │        │
│  │ role (enum)  │     │ projectYear   │     │ serialNumber (uniq)   │
│  │ fullName     │     │ email (uniq)  │     │ purchasePrice│        │
│  │ status       │     │ phone         │     │ purchaseDate │        │
│  │ twoFactorSec │     │ hiredDate     │     │ status (enum)│        │
│  │ twoFactorEn  │     │ employHistory │     │ location     │        │
│  │ backupCodes  │     │ status        │     │ imageUrl     │        │
│  │ lastLogin    │     │ institutionId │     │ propertyNumber│       │
│  │ createdAt     │     │ projectId     │     │ remarks      │        │
│  │ updatedAt     │     │ designationId │     │ assignedTo   │        │
│  └──────┬───────┘     │ createdAt     │     │ warrantyExpiry│       │
│         │             │ updatedAt     │     │ warrantyNotes│        │
│         │             └──────┬────────┘     │ deletedAt    │        │
│         │                    │              │ createdAt    │        │
│         ▼                    │              │ updatedAt    │        │
│  ┌──────────────┐           │              └──────┬───────┘        │
│  │  AuditLog    │           │                     │                │
│  ├──────────────┤           │                     │                │
│  │ id ⭑ (uuid)  │           │                     │                │
│  │ entityType   │           │                     │                │
│  │ entityId     │           │                     │                │
│  │ action       │           │         ┌───────────▼───────────┐    │
│  │ field        │           │         │     Assignment        │    │
│  │ oldValue     │           │         ├───────────────────────┤    │
│  │ newValue     │           │         │ id ⭑ (uuid)           │    │
│  │ summary      │           │         │ assetId (FK→Asset)    │    │
│  │ severity     │  (enum)   │         │ userId (FK→User)      │    │
│  │ userAgent    │           │         │ personnelId (FK→Personnel)│
│  │ oldImageUrl  │           │         │ assignedTo            │    │
│  │ performedById├──► User   │         │ assignedAt            │    │
│  │ performedAt  │           │         │ returnedAt            │    │
│  │ ipAddress    │           │         │ condition             │    │
│  └──────────────┘           │         │ notes                 │    │
│                             │         └───────────────────────┘    │
│  ┌──────────────┐           │                                      │
│  │  GuestToken  │           │         ┌───────────────────────┐    │
│  ├──────────────┤           │         │  MaintenanceSchedule  │    │
│  │ id ⭑ (uuid)  │           │         ├───────────────────────┤    │
│  │ assetId ─────┼──► Asset  │         │ id ⭑ (uuid)           │    │
│  │ token (uniq) │           │         │ assetId (FK→Asset)    │    │
│  │ expiresAt    │           │         │ title                 │    │
│  │ maxAccess    │           │         │ scheduledDate         │    │
│  │ accessCount  │           │         │ notes                 │    │
│  │ createdAt    │           │         │ status (pending/done)  │    │
│  └──────────────┘           │         │ completedAt           │    │
│                             │         │ frequency (none/daily/ │    │
│  ┌──────────────┐           │         │   weekly/monthly/yearly│   │
│  │ LookupValue  │           │         │ createdById           │    │
│  ├──────────────┤           │         │ createdAt             │    │
│  │ id ⭑ (int)   │           │         │ updatedAt             │    │
│  │ category     │ (enum)    │         └───────────────────────┘    │
│  │ value        │           │                                      │
│  │ isActive     │           │         ┌───────────────────────┐    │
│  │ createdAt    │           │         │  MaintenanceLog       │    │
│  │ updatedAt    │           │         ├───────────────────────┤    │
│  └──────────────┘           │         │ id ⭑ (uuid)           │    │
│                             │         │ assetId (FK→Asset)    │    │
│  ┌──────────────┐           │         │ technicianName        │    │
│  │  Notification│           │         │ description           │    │
│  ├──────────────┤           │         │ cost (Decimal)        │    │
│  │ id ⭑ (uuid)  │           │         │ date                  │    │
│  │ type         │ (enum)    │         │ createdAt             │    │
│  │ message      │           │         └───────────────────────┘    │
│  │ assetId ─────┼──► Asset  │                                      │
│  │ isRead       │           │         ┌───────────────────────┐    │
│  │ createdAt    │           │         │  BackupLog            │    │
│  └──────────────┘           │         ├───────────────────────┤    │
│                             │         │ id ⭑ (uuid)           │    │
│  ┌──────────────┐           │         │ status (enum)         │    │
│  │LabelTemplate │           │         │ destination           │    │
│  ├──────────────┤           │         │ filePath              │    │
│  │ id ⭑ (uuid)  │           │         │ encryptedSize         │    │
│  │ name         │           │         │ createdAt             │    │
│  │ format       │           │         └───────────────────────┘    │
│  │ config (JSON)│           │                                      │
│  │ createdById ─┼──► User   │         ┌───────────────────────┐    │
│  │ createdAt    │           │         │  AgreementTemplate    │    │
│  └──────────────┘           │         ├───────────────────────┤    │
│                             │         │ id ⭑ (uuid)           │    │
│  ┌──────────────────┐       │         │ name                  │    │
│  │ InstitutionLookup│       │         │ title                 │    │
│  ├──────────────────┤       │         │ content (HTML)        │    │
│  │ id ⭑ (int)       │       │         │ headerLogo (path)     │    │
│  │ name (uniq)      │       │         │ defaultLogo (path)    │    │
│  │ status            │       │         │ isDefault (bool)     │    │
│  │ createdAt        │       │         │ defaultPropertyOfficer│   │
│  └───────┬──────────┘       │         │ defaultAuthorizedRep  │    │
│          │ FK→Personnel     │         │ createdAt             │    │
│          ▼                  │         │ updatedAt             │    │
│  ┌──────────────────┐       │         └───────────────────────┘    │
│  │   ProjectLookup  │       │                                      │
│  ├──────────────────┤       │         ┌───────────────────────┐    │
│  │ id ⭑ (int)       │       │         │  ProfileHistory       │    │
│  │ name (uniq)      │       │         ├───────────────────────┤    │
│  │ status            │       │         │ id ⭑ (int, autoinc)   │    │
│  │ createdAt        │       │         │ profileId (FK→Personnel) │  │
│  └───────┬──────────┘       │         │ designation           │    │
│          │ FK→Personnel     │         │ institutionName       │    │
│          ▼                  │         │ projectName           │    │
│  ┌──────────────────┐       │         │ projectYear           │    │
│  │ DesignationLookup│       │         │ hiredDate             │    │
│  ├──────────────────┤       │         │ loggedAt              │    │
│  │ id ⭑ (int)       │       │         └───────────────────────┘    │
│  │ name (uniq)      │       │                                      │
│  │ status            │       │                                      │
│  │ createdAt        │       │                                      │
│  └──────────────────┘       │                                      │
│                                                                      │
│  ── ENUMS ────────────────────────────────────────────────────────  │
│  Role:          ADMIN | STAFF_ADMIN | STAFF | GUEST                 │
│  AssetStatus:   AVAILABLE | ASSIGNED | MAINTENANCE | RETIRED | LOST │
│  LookupCategory: ASSET_TYPE | MANUFACTURER | LOCATION | ASSIGNED_TO │
│  BackupStatus:  PENDING | IN_PROGRESS | COMPLETED | FAILED          │
│  NotificationType: WARRANTY_EXPIRING | MAINTENANCE_OVERDUE          │
│  AuditSeverity: LOW | MEDIUM | HIGH                                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Key relationships:
- **Asset → Assignment:** One-to-many (an asset can be issued/returned multiple times)
- **User → Assignment:** One-to-many (a user can request/hold multiple assets)
- **Personnel → Assignment:** One-to-many (a personnel record can have multiple active issuances)
- **Personnel → InstitutionLookup/ProjectLookup/DesignationLookup:** Optional FK (personnel can be linked to one of each)
- **Asset → MaintenanceLog/MaintenanceSchedule/GuestToken/Notification:** One-to-many cascade delete
- **Asset.assignedTo:** Free-text string field, NOT a foreign key — see `docs/ASSIGNEDTO_FLOW.md`

---

## 5. Complete API Reference — Every Endpoint

### Authentication — `server/src/routes/auth.routes.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | Public | Login (rate limited: 5/15min per IP) |
| POST | `/api/auth/refresh` | Public | Refresh access token with refresh token |
| POST | `/api/auth/logout` | Authenticated | Invalidate refresh token |
| POST | `/api/auth/2fa/setup` | Authenticated | Generate TOTP secret + QR code |
| POST | `/api/auth/2fa/verify` | Authenticated | Verify TOTP code & enable 2FA |
| POST | `/api/auth/2fa/validate` | Public | Validate 2FA code during login flow |
| GET | `/api/auth/me` | Authenticated | Get current user profile |

### Assets — `server/src/routes/asset.routes.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/assets` | Authenticated | List assets (filter by type/status/location/search, sort, paginate) |
| GET | `/api/assets/stats` | Authenticated | Aggregated stats (by status, type, location) |
| POST | `/api/assets` | Admin/StaffAdmin | Create asset (JSON or multipart with image) |
| POST | `/api/assets/import` | Admin/StaffAdmin | Bulk CSV import |
| GET | `/api/assets/bulk-status` | — | — |
| PATCH | `/api/assets/bulk-status` | Admin/StaffAdmin | Change status for multiple assets |
| DELETE | `/api/assets/bulk-delete` | Admin | Soft-delete (retire) multiple assets |
| GET | `/api/assets/:id` | Authenticated | Get single asset (guest-filtered if GUEST role) |
| PUT | `/api/assets/:id` | Admin/StaffAdmin/Staff | Update asset (JSON or multipart) |
| DELETE | `/api/assets/:id` | Admin | Soft-delete (set deletedAt) |
| POST | `/api/assets/:id/image` | Admin/StaffAdmin/Staff | Upload + resize image (Sharp, 800px max) |
| GET | `/api/assets/:id/history` | Authenticated | Full assignment history for this asset |

### Maintenance Logs — `server/src/routes/maintenance.routes.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/assets/:id/maintenance` | Authenticated | List maintenance logs for asset |
| POST | `/api/assets/:id/maintenance` | Admin/StaffAdmin | Create maintenance log |
| PUT | `/api/assets/:id/maintenance/:logId` | Admin/StaffAdmin | Update maintenance log |
| DELETE | `/api/assets/:id/maintenance/:logId` | Admin/StaffAdmin | Delete maintenance log |

### Maintenance Schedules — `server/src/routes/maintenanceSchedules.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/assets/maintenance-schedules` | Authenticated | List all schedules |
| POST | `/api/assets/maintenance-schedules` | Admin/StaffAdmin | Create schedule (title, date, frequency, notes) |
| PUT | `/api/assets/maintenance-schedules/:id` | Admin/StaffAdmin | Update schedule |
| DELETE | `/api/assets/maintenance-schedules/:id` | Admin | Delete schedule |

### Upcoming Maintenance — `server/src/routes/maintenanceUpcoming.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/maintenance/upcoming` | Authenticated | Upcoming maintenance within next N days |

### Audit Trail — `server/src/routes/audit.routes.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/audit` | Authenticated | List audit logs (filter by entityType/action/date, paginate) |
| GET | `/api/audit/export` | Admin/StaffAdmin | Export filtered logs as CSV download |
| DELETE | `/api/audit/cleanup` | Admin | Delete logs older than N days |
| GET | `/api/audit/:entityId` | Authenticated | Timeline for specific entity |
| POST | `/api/audit/:id/revert` | Admin | Revert a specific field change (undo) |

### Dashboard — `server/src/routes/dashboard.routes.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/dashboard/stats` | Authenticated | KPI stats (total assets, assigned, in maintenance, etc.) |
| GET | `/api/dashboard/warranties-expiring` | Authenticated | Warranties expiring within 30 days |
| GET | `/api/dashboard/location-stats` | Authenticated | Asset counts grouped by location |
| GET | `/api/dashboard/age-stats` | Authenticated | Asset age distribution (buckets) |

### Labels — `server/src/routes/label.routes.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/labels/generate-pdf` | Authenticated | Generate barcode/PDF labels for selected assets |
| GET | `/api/labels/templates` | Admin/StaffAdmin | List label templates |
| POST | `/api/labels/templates` | Admin/StaffAdmin | Create label template |
| PUT | `/api/labels/templates/:id` | Admin/StaffAdmin | Update label template |
| DELETE | `/api/labels/templates/:id` | Admin | Delete label template |

### Guest Access — `server/src/routes/guest.routes.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/guest/a/:token` | **Public** | View asset via guest token (rate limited) |
| POST | `/api/guest/tokens` | Admin/StaffAdmin | Create guest share token |
| GET | `/api/guest/tokens` | Admin/StaffAdmin | List all guest tokens |
| DELETE | `/api/guest/tokens/:id` | Admin | Revoke a guest token |

### AI — `server/src/routes/ai.routes.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/ai/suggest` | Authenticated | AI-suggest asset details (name, type, manufacturer) via Gemini |

### Backups — `server/src/routes/backup.routes.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/backups/now` | Admin | Trigger manual backup immediately |
| GET | `/api/backups` | Admin | List backup history/status |

### Notifications — `server/src/routes/notification.routes.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/notifications` | Authenticated | Get unread notifications for current user |
| PATCH | `/api/notifications/:id/read` | Authenticated | Mark notification as read |

### Users — `server/src/routes/user.routes.ts` (Admin only)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users` | Admin | List all users |
| POST | `/api/users` | Admin | Create user (username, email, password, role) |
| PUT | `/api/users/:id` | Admin | Update user details |
| PATCH | `/api/users/:id/status` | Admin | Activate/deactivate user |

### Lookups (Asset-related) — `server/src/routes/lookup.routes.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/lookups/:category` | Authenticated | Active values for category (asset-types, manufacturers, locations, assigned-to) |
| GET | `/api/lookups/:category/all` | Admin/StaffAdmin | All values including inactive |
| POST | `/api/lookups/:category` | Admin/StaffAdmin | Add lookup value |
| PATCH | `/api/lookups/:id` | Admin/StaffAdmin | Edit or toggle active/inactive |
| POST | `/api/lookups/migrate` | Admin | Seed lookups from existing asset data |

### Personnel — `server/src/routes/personnel.routes.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/personnel` | Authenticated | List personnel (search, filter by status/project, paginate) |
| GET | `/api/personnel/:id` | Authenticated | Get single personnel record with assignments count |
| POST | `/api/personnel` | Admin | Create personnel (fullName, email, phone, designationId, institutionId, projectId, hiredDate) |
| PATCH | `/api/personnel/:id` | Admin | Update personnel record |
| DELETE | `/api/personnel/:id` | Admin | Soft-delete (status=inactive) — blocked if still has active issuances |

### Issuances — `server/src/routes/issuance.routes.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/issuances/active/asset/:assetId` | Authenticated | Get active issuance for a specific asset (for QR return) |
| GET | `/api/issuances` | Authenticated | List issuances (filter by status/search/personnelId, paginate) |
| POST | `/api/issuances` | Admin/StaffAdmin | Create issuance (assign asset to personnel — creates Assignment + AuditLog) |
| POST | `/api/issuances/:id/return` | Admin/StaffAdmin | Return asset (mark returnedAt, set condition, viaQR flag) |
| GET | `/api/issuances/assets/available` | Authenticated | Available assets for issuance wizard |
| GET | `/api/issuances/personnel/active` | Authenticated | Active personnel for issuance wizard |
| POST | `/api/issuances/agreement` | Authenticated | Generate accountability agreement text for preview |

### Agreement Templates — `server/src/routes/agreement.routes.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/agreement/templates` | Admin/StaffAdmin | List all agreement templates |
| GET | `/api/agreement/templates/:id` | Admin/StaffAdmin | Get single template |
| POST | `/api/agreement/templates` | Admin | Create template (multipart: name, title, content, isDefault, logo) |
| PATCH | `/api/agreement/templates/:id` | Admin | Update template (multipart with optional logo) |
| DELETE | `/api/agreement/templates/:id` | Admin | Delete template |
| POST | `/api/agreement/upload-logo` | Admin | Upload standalone logo for reuse |
| GET | `/api/agreement/placeholders` | Authenticated | Get available template placeholder reference |
| POST | `/api/agreement/pdf` | Admin/StaffAdmin | Generate agreement PDF (returns PDF binary) |

### Institutions — `server/src/routes/institution.routes.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/institutions` | Authenticated | List all institutions |

### Projects — `server/src/routes/project.routes.ts`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/projects` | Authenticated | List all projects |

### Accountability Lookups — `server/src/routes/accountabilityLookup.routes.ts`
Mounted at `/api/lookup/accountability/*`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/designations` | Authenticated | List designations (optional ?activeOnly=true) |
| GET | `/designations/active` | Authenticated | Active designations only |
| POST | `/designations` | Admin/StaffAdmin | Create designation |
| PATCH | `/designations/:id` | Admin/StaffAdmin | Toggle designation status (active/inactive) |
| GET | `/institutions` | Authenticated | List institutions (optional ?activeOnly=true) |
| GET | `/institutions/active` | Authenticated | Active institutions only |
| POST | `/institutions` | Admin/StaffAdmin | Create institution |
| PATCH | `/institutions/:id` | Admin/StaffAdmin | Toggle institution status (active/inactive) |
| GET | `/projects` | Authenticated | List projects (optional ?activeOnly=true) |
| GET | `/projects/active` | Authenticated | Active projects only |
| POST | `/projects` | Admin/StaffAdmin | Create project |
| PATCH | `/projects/:id` | Admin/StaffAdmin | Toggle project status (active/inactive/completed/archived) |

### Health
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | Public | Health check (status ok + timestamp) |

---

## 6. Frontend Routes Map

| Path | Component | Access | Description |
|------|-----------|--------|-------------|
| `/login` | `LoginPage` | Public | Login form with email/password + optional 2FA |
| `/setup-2fa` | `Setup2FaPage` | Authenticated | 2FA setup wizard (QR scan or manual code) |
| `/guest/:token` | `GuestAssetPage` | Public | Read-only asset view for shared links |
| `/` | `DashboardPage` | Authenticated | KPI dashboard with charts and widgets |
| `/assets` | `AssetsPage` | Authenticated | Asset table, create/edit/import/delete, QR scan |
| `/users` | `UserManagementPage` | Admin only | User CRUD, activate/deactivate |
| `/audit` | `AuditPage` | Authenticated | Full audit trail with filters, export, revert |
| `/lookup` | `InventoryLookupPage` | Admin/StaffAdmin | Asset-related lookup values (types, manufacturers, locations) |
| `/accountability-lookup` | `AccountabilityLookupPage` | Admin/StaffAdmin | Accountability lookups (designations, institutions, projects) |
| `/accountability/templates` | `AccountabilityTemplatesPage` | Admin | Agreement template editor (content + logo + PDF preview) |
| `/profiles` | `ProfilesPage` | Admin/StaffAdmin | Personnel management (list, create, edit, delete, view assignments) |
| `/issuances` | `IssuancesPage` | Admin/StaffAdmin | Issue/return wizard, QR return scanner, agreement PDF generation |
| `/settings` | `SettingsPage` | Authenticated | App settings (backup trigger, guest tokens, notification prefs) |

All authenticated routes (everything except `/login`, `/guest/:token`) are wrapped in `AppLayout` which provides the sidebar + topbar shell.

**Route file:** `client/src/App.tsx` — All routes defined with `<BrowserRouter basename="/aio-system">`

---

## 7. Data Flow Diagrams

### Authentication Flow
```
┌──────────┐     POST /api/auth/login      ┌──────────┐
│  LoginPage│──────────────────────────────►│  Express │
│          │     {email, password, 2FA?}   │          │
│          │◄──────────────────────────────│          │
│          │     {accessToken, refreshToken}│          │
└──────────┘                               └──────────┘
     │                                          │
     │ Store tokens in AuthContext               │ Verify JWT on every request
     ▼                                          ▼
┌──────────┐     Authorization: Bearer <JWT>   ┌──────────┐
│ AuthContext│───────────────────────────────►│  middleware│
│          │                                  │  auth.ts   │
│ • Auto-refresh before expiry               └──────────┘
│ • Redirect to /login on 401                     │
│ • RoleGate / ProtectedRoute                      ▼
│ • Emits AUTH_EXPIRED_EVENT               req.user = {id, role, username}
└──────────┘
```

### Issuance Flow (Admin → Personnel)
```
Admin                            Server                            Database
  │                                │                                │
  │ 1. Open IssuancesPage          │                                │
  │──► GET available assets ──────►│──► SELECT assets WHERE        │
  │──► GET active personnel ───────►│     status=AVAILABLE         │
  │                                │──► SELECT personnel WHERE     │
  │                                │     status=active             │
  │                                │                                │
  │ 2. Select asset + personnel +  │                                │
  │    condition + notes           │                                │
  │──► POST /api/issuances ───────►│                                │
  │    {assetId, personnelId,      │──► CREATE Assignment           │
  │     condition, notes}          │     (assetId, personnelId,     │
  │                                │      assignedAt=now)           │
  │                                │──► UPDATE Asset.status         │
  │                                │     = ASSIGNED                 │
  │                                │──► CREATE AuditLog             │
  │    ◄── 201 {assignment} ──────┤     (action: ISSUE)            │
  │                                │                                │
  │ 3. Generate agreement PDF      │                                │
  │──► POST /api/agreement/pdf ───►│──► agreement.service           │
  │    {personnelName, assetName,  │──► PDFKit → PDF buffer        │
  │     templateId, ...}           │                                │
  │    ◄── PDF binary ────────────┤                                │
  │    (display in PDFPreviewModal)│                                │
  │                                │                                │
  │ 4. Return via QR scan:         │                                │
  │    Scan asset QR code          │                                │
  │──► GET active issuance ───────►│──► Find Assignment WHERE      │
  │    for asset                   │     returnedAt IS NULL         │
  │──► POST /api/issuances/:id    │                                │
  │    /return {condition, viaQR} ──► UPDATE Assignment            │
  │                                │     (returnedAt, condition)    │
  │                                │──► UPDATE Asset.status         │
  │                                │     = AVAILABLE                │
  │                                │──► CREATE AuditLog (RETURN)    │
```

### Audit Trail Flow
```
Any Write Action                         Database
  │                                        │
  ├── Asset CREATE/UPDATE/DELETE ──────────►│ AuditLog
  ├── Assignment ISSUE/RETURN ─────────────►│ AuditLog
  ├── Maintenance CREATE/UPDATE ───────────►│ AuditLog
  ├── Bulk IMPORT/STATUS_CHANGE ───────────►│ AuditLog
  ├── Backup TRIGGER ──────────────────────►│ AuditLog
  ├── Personnel CREATE/UPDATE/DELETE ──────►│ AuditLog
  │                                        │
  │   AuditPage:                            │
  ├── GET /api/audit (filter + paginate) ──►│
  ├── GET /api/audit/export (CSV) ────────►│
  ├── POST /api/audit/:id/revert ─────────►│ field-level undo
  └── DELETE /api/audit/cleanup ───────────►│ purge old logs
```

### Backup Flow
```
┌──────────────┐                          ┌──────────┐
│ Admin clicks │──► POST /api/backups/now │ backup.  │
│ "Backup Now" │                          │ service  │
│ (Settings)   │                          │          │
└──────────────┘                          └────┬─────┘
                                               │
                              ┌── pg_dump → .sql
                              ├── Archive uploads/ → .zip
                              ├── Combine + encrypt → .enc file
                              ├── Save to server/backups/
                              ├── Upload to AWS S3
                              └── CREATE BackupLog + AuditLog
                                               
                         Cron (02:00 SGT daily)
                              └── Same flow, automatic
```

### Notification Flow
```
┌──────────────┐  Cron 09:00 SGT  ┌──────────────────┐
│  Cron Job    │────────────────►│ notification.     │
│             │                   │ service            │
└──────────────┘                   │                   
                                   ├── Check warranties expiring < 30 days
                                   ├── Check overdue maintenance
                                   ├── CREATE Notification records
                                   └── Return count
                                            │
                                   ┌────────▼─────────┐
                                   │ NotificationBell   │
                                   │ (frontend)        │
                                   │ GET /api/notifications
                                   │ Show unread count  │
                                   └───────────────────┘
```

### Guest Access Flow
```
┌──────────┐  Share link   ┌──────────────┐
│  Admin   │──────────────►│ GuestToken   │
│          │  /guest/:token │ (expires,    │
│          │               │  maxAccess)  │
└──────────┘               └──────┬───────┘
                                  │
                           ┌──────▼───────┐
                           │ Public GET   │
                           │ /api/guest/  │
                           │ a/:token     │
                           │ (rate limited)│
                           └──────┬───────┘
                                  │
                           ┌──────▼───────┐
                           │ guestFilter  │
                           │ strips:      │
                           │ • purchasePr │
                           │ • serial#    │
                           │ • remarks    │
                           │ • warranty   │
                           └──────┬───────┘
                                  │
                           ┌──────▼───────┐
                           │ GuestAsset   │
                           │ Page         │
                           │ (read-only)  │
                           └──────────────┘
```

---

## 8. Key File Quick Reference — "I need to change X, which file?"

| Want to... | Go to |
|------------|-------|
| Change database schema (add model/field/enum) | `server/prisma/schema.prisma` → then run `npx prisma migrate dev` |
| Add a new API endpoint | `server/src/routes/` (pick or create file) + `server/src/services/` (business logic) |
| Add Zod validation to a route | `server/src/routes/*.schema.ts` |
| Change the Express app setup (middleware order, mount paths) | `server/src/index.ts` |
| Change frontend routes / add a new page | `client/src/App.tsx` — add route + `client/src/pages/NewPage.tsx` |
| Change auth behavior (JWT, roles) | `client/src/context/AuthContext.tsx` + `server/src/middleware/auth.ts` |
| Modify API client (how frontend calls backend) | `client/src/lib/api.ts` |
| Modify asset form (create/edit) | `client/src/components/assets/AssetFormModal.tsx` |
| Modify asset detail view | `client/src/components/assets/AssetDetailModal.tsx` |
| Change asset table/filters | `client/src/components/assets/AssetTable.tsx` + `AssetFilterSidebar.tsx` |
| Change audit trail UI | `client/src/pages/AuditPage.tsx` |
| Add a new frontend page | Create `client/src/pages/NewPage.tsx` + add route in `client/src/App.tsx` |
| Change asset dropdowns (type/location/mfr) | `server/src/routes/lookup.routes.ts` + `client/src/hooks/useLookup.ts` |
| Change accountability lookups (designations/institutions/projects) | `server/src/routes/accountabilityLookup.routes.ts` + `client/src/pages/AccountabilityLookupPage.tsx` |
| Change personnel management | `server/src/routes/personnel.routes.ts` + `client/src/pages/ProfilesPage.tsx` |
| Change issuance/return flow | `server/src/routes/issuance.routes.ts` + `client/src/pages/IssuancesPage.tsx` |
| Change agreement PDF generation | `server/src/services/agreement.service.ts` + `server/src/routes/agreement.routes.ts` |
| Change agreement template editor | `client/src/pages/AccountabilityTemplatesPage.tsx` |
| Change dashboard widgets | `client/src/components/dashboard/DashboardWidgets.tsx` |
| Modify label PDF output | `server/src/services/label.service.ts` |
| Modify label template designer | `client/src/components/labels/TemplateDesigner.tsx` |
| Change depreciation calculation | `client/src/utils/depreciation.ts` + `server/src/services/depreciation.service.ts` |
| Change backup logic | `server/src/services/backup.service.ts` |
| Modify cron schedules | `server/src/jobs/cron.ts` |
| Change PM2 config (ports, instances) | `ecosystem.config.js` |
| Change Vite build config (proxy, base path) | `client/vite.config.ts` |
| Add shared TypeScript types | `shared/types/index.ts` |
| Read env variables | `server/src/utils/env.ts` (validates required vars) |

---

## 9. Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3001 dev, 3000 prod) | No |
| `NODE_ENV` | `development` or `production` | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | Access token signing key | Yes |
| `REFRESH_TOKEN_SECRET` | Refresh token signing key | Yes |
| `AWS_ACCESS_KEY_ID` | S3 backup upload credentials | For backups |
| `AWS_SECRET_ACCESS_KEY` | S3 backup upload credentials | For backups |
| `AWS_S3_BUCKET` | S3 bucket name | For backups |
| `AWS_REGION` | S3 bucket region | For backups |
| `GEMINI_API_KEY` | Google Gemini API key | For AI suggest |
| `GMAIL_CLIENT_ID` | Gmail API OAuth client ID | For email |
| `GMAIL_CLIENT_SECRET` | Gmail API OAuth secret | For email |

---

## 10. Commands Quick Reference

```bash
# Development
cd aio-system
npm run dev              # Start both server + client (concurrently)

# Server only
cd aio-system/server
npx prisma generate      # Regenerate Prisma client after schema changes
npx prisma migrate dev   # Run migrations
npx prisma db seed       # Seed database
npm run dev              # Start dev server (ts-node, hot reload)

# Client only
cd aio-system/client
npm run dev              # Vite dev server (port 5173, proxies /api → :3001)

# Build
npm run build            # Build client (Vite) + server (tsc)

# Production
pm2 start ecosystem.config.js --env production
pm2 status
pm2 logs aio-system

# Testing
npm test                 # Run all Vitest tests
cd tests && npx playwright test  # Run E2E tests
```
