# AIO System — Full Flow Chart & Context Document

> Generated: May 22, 2026
> Purpose: Complete system architecture, stack, folder map, data flow, and today's changes

---

## 1. SYSTEM OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AIO SYSTEM ARCHITECTURE                       │
│  Unified Asset & Inventory Research Management                      │
│  DRDF — Demographic Research and Development Foundation, Inc.      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐     │
│  │   BROWSER     │──────│   EXPRESS     │──────│  POSTGRESQL   │     │
│  │  :3000 (Vite) │ HTTP │  :3001        │ SQL  │  :5432        │     │
│  │  React 18 SPA │◄────►│  Prisma ORM   │◄────►│  aio_system   │     │
│  │  TailwindCSS  │      │  JWT Auth     │      │  22 tables    │     │
│  │  Radix/shadcn │      │  Multer upload│      │               │     │
│  └──────────────┘       └──────┬───────┘       └──────────────┘     │
│                                │                                    │
│                    ┌───────────┼───────────┐                        │
│                    │           │           │                        │
│              ┌─────▼────┐ ┌────▼────┐ ┌────▼─────┐                  │
│              │ pdfkit   │ │ sharp   │ │ node-cron│                  │
│              │ PDF gen  │ │ image   │ │ scheduled│                  │
│              │ bwip-js  │ │ resize  │ │ jobs     │                  │
│              │ barcodes │ │ convert │ │ warranty │                  │
│              └──────────┘ └─────────┘ │ audit    │                  │
│                                       └──────────┘                  │
│                                │                                    │
│                    ┌───────────┼───────────┐                        │
│              ┌─────▼────┐ ┌────▼────┐ ┌────▼─────┐                  │
│              │ AWS S3   │ │ Gmail   │ │ uploads/ │                  │
│              │ backups  │ │ nodema- │ │ logos/   │                  │
│              │ archiver │ │ iler    │ │ signed-  │                  │
│              │ zip      │ │ notify  │ │ agreemts │                  │
│              └──────────┘ └─────────┘ └──────────┘                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. FULL STACK BREAKDOWN

### CLIENT (React 18 SPA — Vite 6 dev server on :3000)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | React 18.3 | UI rendering |
| Build | Vite 6.3 + @vitejs/plugin-react | Dev server + bundler |
| Routing | react-router-dom 7.5 | Client-side SPA routing |
| Styling | TailwindCSS 3.4 + tw-animate-css | Utility-first CSS |
| Components | Radix UI + shadcn/ui + class-variance-authority | Headless UI primitives + styled components |
| Forms | react-hook-form 7.55 + @hookform/resolvers + zod | Form state + validation |
| Icons | lucide-react 0.503 | Icon library |
| Charts | chart.js 4.5 + react-chartjs-2 5.3 | Dashboard visualizations |
| QR | html5-qrcode 2.3 | QR scanning for Return Station |
| HTTP | native fetch (via `apiFetch` wrapper in `client/src/lib/api.ts`) | API calls |
| Auth | JWT (stored in localStorage via `AuthContext`) | Token-based auth |
| Testing | Vitest 4.1 + @testing-library/react + jsdom | Unit/component tests |
| Type | TypeScript 5.8 | Type safety |

### SERVER (Express 4 — Node.js, port 3001)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js 20 | JS runtime |
| Framework | Express 4.21 | HTTP server |
| ORM | Prisma 6.19 + @prisma/client | Database access |
| DB | PostgreSQL 16 | Persistent storage (aio_system) |
| Auth | bcryptjs + jsonwebtoken + speakeasy | Password hashing, JWT, 2FA |
| Security | helmet 8.1 + cors 2.8 + express-rate-limit 8.3 | Headers, CORS, rate limiting |
| Upload | multer 2.1 | File upload handling |
| Image | sharp 0.33 | Image processing/resizing |
| PDF | pdfkit 0.16 | PDF generation (agreements, letters) |
| Barcode | bwip-js 4.5 | Barcode generation (labels) |
| Email | nodemailer 8.0 + googleapis 144 | Email via Gmail API |
| Storage | @aws-sdk/client-s3 3.775 | S3 backup upload |
| Archive | archiver 7.0 | ZIP file creation (backups) |
| Cron | node-cron 3.0 | Scheduled jobs (warranty alerts, audit logs) |
| Logging | morgan 1.10 | HTTP request logging |
| Validation | zod 3.24 | Request schema validation |
| Type | TypeScript 5.x → compiled to dist/ | Type safety |

---

## 3. FOLDER MAP — EXACT FILE LOCATIONS

```
aio-system/                          ← Project root
├── client/                          ← React SPA
│   ├── public/                      ← Static assets (favicon, etc.)
│   ├── src/
│   │   ├── assets/                  ← Images, logos
│   │   ├── components/
│   │   │   ├── AppLayout.tsx        ← Main layout (sidebar nav + header)
│   │   │   ├── ErrorBoundary.tsx    ← React error boundary
│   │   │   ├── ShortcutsHelpModal.tsx ← Keyboard shortcuts overlay
│   │   │   ├── assets/             ← Asset modals (AssetFormModal, AssetDetailModal)
│   │   │   ├── audit/              ← Audit log components
│   │   │   ├── auth/               ← PermissionGate, LoginGate, ProtectedRoute
│   │   │   │   └── PermissionGate.tsx ← ★ MODIFIED TODAY — ADMIN bypass added
│   │   │   ├── dashboard/           ← Dashboard charts & widgets
│   │   │   ├── depreciation/        ← Depreciation calculator
│   │   │   ├── guest/               ← Guest/public asset lookup
│   │   │   ├── issuances/           ← Issuance wizards & modals
│   │   │   ├── labels/              ← Label printing
│   │   │   ├── lookup/              ← Lookup tables (institution, project, designation)
│   │   │   ├── maintenance/         ← Maintenance log/schedule components
│   │   │   ├── notifications/       ← Notification bell + list
│   │   │   ├── purchase/            ← Purchase request components
│   │   │   ├── search/              ← Global search
│   │   │   ├── suppliers/           ← Supplier management
│   │   │   ├── ui/                  ← shadcn/ui primitives (dialog, button, select, etc.)
│   │   │   └── users/               ← User management modals
│   │   ├── context/
│   │   │   └── AuthContext.tsx       ← Auth state, login/logout, token management
│   │   ├── hooks/                    ← Custom React hooks
│   │   ├── lib/
│   │   │   └── api.ts               ← ★ MODIFIED TODAY — ApiError.errorData, Asset interface expanded
│   │   ├── pages/                   ← 23 page components (see list below)
│   │   │   └── IssuancesPage.tsx     ← ★ MODIFIED TODAY — expandable batch rows + per-item Return
│   │   ├── types/                   ← TypeScript type definitions
│   │   └── utils/                   ← Utility functions
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── tsconfig.json
│
├── server/                          ← Express API
│   ├── prisma/
│   │   ├── schema.prisma            ← 21 models (see section 5)
│   │   └── migrations/             ← DB migration history
│   ├── src/
│   │   ├── index.ts                 ← Express app setup (port 3001, middleware, route registration)
│   │   ├── routes/                  ← API route files (see section 6)
│   │   │   ├── index.ts             ← Route registration barrel
│   │   │   ├── asset.routes.ts     ← ★ MODIFIED TODAY — P2002 catch + image cleanup on PUT
│   │   │   ├── asset.schema.ts     ← ★ MODIFIED TODAY — purchasePrice/Date required, depreciation/supplierId
│   │   │   ├── supplier.routes.ts   ← ★ NEW FILE TODAY — Supplier CRUD
│   │   │   ├── issuance.routes.ts  ← Return/transfer endpoints
│   │   │   ├── ai.routes.ts        ← AI suggest endpoint
│   │   │   ├── auth.routes.ts      ← Login, verify, 2FA
│   │   │   └── ... (36 route+schema files total)
│   │   ├── services/
│   │   │   └── ai.service.ts       ← ★ MODIFIED TODAY — expanded suggest with usefulLife/warranty
│   │   ├── middleware/
│   │   │   ├── auth.ts             ← JWT verification + hasPermission (ADMIN bypass)
│   │   │   └── permissions.ts      ← ALL_PERMISSIONS map + DEFAULT_PERMISSIONS
│   │   ├── jobs/                   ← Cron jobs (warranty alerts, audit log cleanup)
│   │   ├── lib/                    ← Helpers (prisma client, email, etc.)
│   │   └── utils/
│   │       └── response.ts         ← success() / error() helpers
│   ├── uploads/
│   │   ├── logos/                  ← Uploaded organization logos
│   │   └── signed-agreements/      ← Uploaded signed PDFs
│   ├── public/assets/             ← Static public assets
│   ├── scripts/                    ← DB seed/migration scripts
│   ├── backups/                    ← Local backup storage
│   └── dist/                       ← Compiled JS output
│
├── docs/                           ← Feature docs & improvement prompts
│   ├── ADD_ASSET_IMPROVEMENT_PROMPTS.md
│   ├── RETURN_BUTTON_VISIBILITY_BUG_FIX.md
│   └── USERS_MODULE_IMPROVEMENT_PROMPTS.md
│
├── concern/                         ← Context & flow documents
│   ├── add-asset.md
│   ├── accountability.md
│   ├── agreement template.md
│   ├── users.md
│   ├── inventory.md
│   └── flow22.md                    ← ★ THIS FILE
│
├── materials/logo/                  ← Brand logo assets
└── .hermes/plans/                   ← Implementation plans
```

---

## 4. PAGE ROUTES & COMPONENTS MAP

```
┌────────────────────────────────────────────────────────────────┐
│                    CLIENT-SIDE ROUTES                           │
│  (react-router-dom — defined in App.tsx)                       │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  /aio-system/              → DashboardPage.tsx                 │
│  /aio-system/assets        → AssetsPage.tsx                     │
│  /aio-system/maintenance   → MaintenanceCalendarPage.tsx       │
│  /aio-system/reports       → ReportsPage.tsx                    │
│  /aio-system/inventory     → InventoryLookupPage.tsx           │
│  /aio-system/profiles      → ProfilesPage.tsx                   │
│  /aio-system/issuances     → IssuancesPage.tsx  ★ MODIFIED TODAY│
│  /aio-system/acc-lookup    → AccountabilityLookupPage.tsx       │
│  /aio-system/agreements    → AccountabilityTemplatesPage.tsx   │
│  /aio-system/acc-report   → AccountabilityReportPage.tsx      │
│  /aio-system/admin         → UserManagementPage.tsx            │
│  /aio-system/audit         → AuditPage.tsx                     │
│  /aio-system/backups       → BackupManagementPage.tsx          │
│  /aio-system/suppliers     → SuppliersPage.tsx                 │
│  /aio-system/purchase      → PurchaseRequestsPage.tsx          │
│  /aio-system/notifications → NotificationsPage.tsx              │
│  /aio-system/settings      → SettingsPage.tsx                   │
│  /aio-system/login         → LoginPage.tsx                      │
│  /aio-system/forgot        → ForgotPasswordPage.tsx             │
│  /aio-system/reset         → ResetPasswordPage.tsx             │
│  /aio-system/2fa           → Setup2FaPage.tsx                  │
│  /aio-system/change-pass   → ChangePasswordPage.tsx            │
│  /guest/:token             → GuestAssetPage.tsx                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 5. DATABASE SCHEMA — 21 PRISMA MODELS

```
┌──────────────────────────────────────────────────────────────────┐
│                  POSTGRESQL 16 — aio_system DB                   │
│                  22 application tables + _prisma_migrations       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐     ┌──────────────┐     ┌───────────────────┐    │
│  │  users   │     │    assets    │     │   assignments     │    │
│  │──────────│     │──────────────│     │───────────────────│    │
│  │ id (PK)  │     │ id (PK)      │     │ id (PK)          │    │
│  │ email    │     │ name         │     │ assetId (FK→assets│    │
│  │ password │     │ type         │     │ personnelId (FK)  │    │
│  │ role      │     │ serialNumber │     │ assignedTo        │    │
│  │ permi-   │     │ propertyNum  │     │ assignedAt        │    │
│  │  ssions  │     │ status       │     │ returnedAt        │    │
│  │ mustCha- │     │ purchasePrice│★NEW│ │ conditionAtReturn │    │
│  │  ngePass │     │ purchaseDate │★NEW│ │ returnRemarks     │    │
│  │ twoFA*   │     │ depreciat-  │★NEW│ │ notes             │    │
│  └──────────┘     │  ionMethod  │     │ bulkBatchId       │    │
│                    │ usefulLife  │★NEW│ │ agreementId (FK)  │    │
│  ┌──────────┐     │ salvageVal  │★NEW│ │ accountability-   │    │
│  │personnel │     │ supplierId  │★NEW│ │  Status           │    │
│  │──────────│     │ warranty*   │     │  recipientSignedAt│    │
│  │ id (PK)  │     └──────┬───────┘     └────────┬──────────┘    │
│  │ fullName │            │                      │               │
│  │ position │     ┌──────┴───────┐     ┌────────┴──────────┐    │
│  │ project  │     │ maintenance  │     │ agreement_docs    │    │
│  │ department│     │ _logs       │     │───────────────────│    │
│  │ instit-  │     │ _schedules  │     │ id, documentNumber│    │
│  │ utionId  │     └──────────────┘     │ status, title     │    │
│  │ design-  │                          │ resolvedText      │    │
│  │  ationId │     ┌──────────────┐     │ signedPdfPath     │    │
│  └──────────┘     │ audit_logs   │     │ propertyOfficerNm │    │
│                    │──────────────│     │ authorizedRepName │    │
│  ┌──────────┐     │ id, action, │     │ personnelId (FK)  │    │
│  │suppliers │★NEW│ │ entity,     │     └───────────────────┘    │
│  │──────────│     │ entity_id,   │                            │
│  │ id (PK)  │     │ details,    │     ┌──────────────────┐    │
│  │ name     │     │ userId (FK) │     │ agreement_temp-   │    │
│  │ contact  │     └──────────────┘     │ lates + _versions │    │
│  │ email    │                          │ (CRUD templates)  │    │
│  │ phone    │     ┌──────────────┐     └──────────────────┘    │
│  │ address  │     │ lookups      │                            │
│  └──────────┘     │──────────────│     ┌──────────────────┐    │
│                    │ institution │     │ label_templates   │    │
│  ┌──────────┐     │ _lookup     │     │──────────────────│    │
│  │purchase_ │★NEW│ │ project_    │     │ id, name, fields, │    │
│  │ requests │     │  lookup     │     │ bwip-js config    │    │
│  │──────────│     │ designation │     └──────────────────┘    │
│  │ id (PK)  │     │  _lookup    │                            │
│  │ assetId  │     │ lookup_     │     ┌──────────────────┐    │
│  │ request- │     │  values     │     │ guest_tokens     │    │
│  │  edBy   │     └──────────────┘     │──────────────────│    │
│  │ status   │                          │ token, assetId   │    │
│  └──────────┘     ┌──────────────┐     │ expiresAt        │    │
│                    │ notifications│     └──────────────────┘    │
│                    │──────────────│                            │
│                    │ id, type,   │     ┌──────────────────┐    │
│                    │ message,    │     │ backup_logs       │    │
│                    │ userId (FK) │     │──────────────────│    │
│                    └──────────────┘     │ id, filename     │    │
│                                         │ s3Key, size      │    │
│                    ┌──────────────┐     └──────────────────┘    │
│                    │ asset_cond-  │                            │
│                    │  ition_logs  │     ┌──────────────────┐    │
│                    │──────────────│     │ profile_history   │    │
│                    │ id, assetId, │     │──────────────────│    │
│                    │ condition,  │     │ personnelId (FK)  │    │
│                    │ notes, date │     │ field, oldVal,    │    │
│                    └──────────────┘     │ newVal, changedAt│    │
│                                         └──────────────────┘    │
│  ★NEW = Added today (2026-05-22)                               │
│  * = many more fields not shown for brevity                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. API ROUTES — 21 ENDPOINT GROUPS

```
┌──────────────────────────────────────────────────────────────────┐
│                    EXPRESS API ROUTE MAP                          │
│  Base: http://localhost:3001/api/*                               │
│  Auth: Bearer JWT token in Authorization header                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Auth & Guest                                                    │
│  ├── POST   /api/auth/login           → Login (JWT + user)      │
│  ├── POST   /api/auth/verify          → Verify 2FA token        │
│  ├── GET    /api/auth/me              → Current user + perms     │
│  ├── PUT    /api/auth/password        → Change password         │
│  ├── POST   /api/auth/forgot          → Forgot password email   │
│  ├── POST   /api/auth/reset           → Reset password          │
│  └── GET    /api/guest/:token         → Guest asset lookup      │
│                                                                  │
│  Assets  (★ MODIFIED TODAY)                                      │
│  ├── GET    /api/assets               → List + filter + page    │
│  ├── POST   /api/assets               → Create (P2002 catch ★)  │
│  ├── PUT    /api/assets/:id           → Update (image cleanup★) │
│  ├── DELETE /api/assets/:id           → Soft delete             │
│  └── POST   /api/assets/:id/image     → Upload asset image      │
│                                                                  │
│  Issuances                                                        │
│  ├── GET    /api/issuances           → List + batch grouping    │
│  ├── POST   /api/issuances           → Create (single/bulk)     │
│  ├── POST   /api/issuances/:id/return → Return asset            │
│  ├── POST   /api/issuances/:id/transfer → Transfer to new user  │
│  └── POST   /api/issuances/:id/sign   → Digital sign-off        │
│                                                                  │
│  Agreements                                                      │
│  ├── GET    /api/agreements          → List templates          │
│  ├── POST   /api/agreements          → Create template          │
│  ├── GET    /api/agreements/:id      → Get template + versions  │
│  ├── POST   /api/agreements/:id/versions → New version          │
│  ├── POST   /api/agreements/generate/:issuanceId → Generate PDF │
│  └── POST   /api/agreements/upload-signed/:docId → Upload PDF   │
│  └── GET    /api/agreements/verify/:docNumber → Public verify   │
│                                                                  │
│  Suppliers (★ NEW TODAY)                                         │
│  ├── GET    /api/suppliers           → List suppliers            │
│  ├── POST   /api/suppliers           → Create supplier           │
│  ├── PUT    /api/suppliers/:id       → Update supplier           │
│  └── DELETE /api/suppliers/:id       → Delete supplier           │
│                                                                  │
│  AI Suggest (★ MODIFIED TODAY)                                   │
│  └── POST   /api/ai/suggest         → Asset metadata (★expanded)│
│                                                                  │
│  Other Routes                                                     │
│  ├── /api/maintenance     → Maintenance logs + schedules       │
│  ├── /api/audit           → Audit log queries                  │
│  ├── /api/labels          → Label template CRUD + print        │
│  ├── /api/dashboard       → Dashboard stats                     │
│  ├── /api/backups         → Backup management (S3 upload)       │
│  ├── /api/notifications   → User notifications                  │
│  ├── /api/lookups         → Generic lookup CRUD                 │
│  ├── /api/institutions    → Institution lookup CRUD             │
│  ├── /api/projects        → Project lookup CRUD                 │
│  ├── /api/lookup/accountability → Accountability lookup          │
│  ├── /api/users           → User management CRUD               │
│  ├── /api/personnel       → Personnel CRUD                      │
│  ├── /api/reports         → Report generation                   │
│  ├── /api/purchase-requests → Purchase request CRUD             │
│  ├── /api/search          → Global search                       │
│  ├── /api/settings        → System settings                      │
│  └── /api/accountability  → Accountability tracking              │
│                                                                  │
│  Static                                                          │
│  ├── /aio-system/uploads/* → Uploaded files (logos, PDFs)       │
│  └── /aio-system/*         → Production SPA build               │
│                                                                  │
│  Middleware (in order)                                            │
│  ├── helmet()           → Security headers                      │
│  ├── cors()              → Cross-origin                          │
│  ├── morgan()            → HTTP logging                          │
│  ├── express.json(10mb)  → Body parser                           │
│  ├── express.static()    → Uploads + public                      │
│  ├── auth middleware     → JWT verify on /api/* (except guest)   │
│  └── globalErrorHandler → Catch-all error response               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. AUTH & PERMISSION FLOW

```
┌──────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. LOGIN                                                        │
│     Browser ──POST /api/auth/login──► Server                     │
│     { email, password }                                          │
│          │                                                        │
│          ▼                                                        │
│     Server: bcryptjs.compare(password, hash)                     │
│          │                                                        │
│          ├── Success ──► jwt.sign({ userId, role }) ──► { token, user }
│          └── Fail ──► 401 Unauthorized                           │
│                                                                  │
│  2. TOKEN STORAGE                                                │
│     Client: AuthContext.tsx stores token in localStorage          │
│     All subsequent requests: Authorization: Bearer <token>       │
│                                                                  │
│  3. AUTH MIDDLEWARE (server/src/middleware/auth.ts)               │
│     Every /api/* request (except /api/guest):                    │
│     ├── jwt.verify(token, SECRET) → req.user = { userId, role }  │
│     ├── If invalid/expired → 401 Unauthorized                   │
│     └── If valid → next()                                       │
│                                                                  │
│  4. PERMISSION CHECK (server)                                    │
│     hasPermission(requiredPerm):                                 │
│     ├── if (req.user.role === 'ADMIN') → ALLOW (bypass)  ★ KEY  │
│     └── if (requiredPerm in user.permissions[]) → ALLOW         │
│         else → 403 Forbidden                                     │
│                                                                  │
│  5. PERMISSION CHECK (client) ★ FIXED TODAY                      │
│     <PermissionGate permissions={['...']}>                       │
│     ├── if (user.role === 'ADMIN') → SHOW (bypass)     ★ NEW     │
│     ├── Parse user.permissions (array or JSON string)  ★ NEW     │
│     ├── if (all required perms in userPerms[]) → SHOW           │
│     └── else → fallback (null by default)                       │
│                                                                  │
│  6. ALL PERMISSIONS (server/src/middleware/permissions.ts)        │
│     ├── assets:view, assets:create, assets:edit, assets:delete   │
│     ├── issuances:view, issuances:create, issuances:edit,        │
│     │   issuances:return  ← ★ Was missing from ADMIN users DB  │
│     ├── reports:view                                              │
│     ├── labels:view, labels:edit                                 │
│     ├── maintenance:view, maintenance:edit                       │
│     ├── audit:view                                                │
│     ├── users:view, users:manage                                 │
│     └── backups:manage                                           │
│                                                                  │
│  DEFAULT_PERMISSIONS:                                            │
│  ├── ADMIN  → ALL_PERMISSIONS keys (includes issuances:return)    │
│  ├── MANAGER → assets:*, issuances:view/create/edit, reports     │
│  └── VIEWER → assets:view, issuances:view, reports:view          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. ISSUANCE & RETURN FLOW (★ CORE FOCUS TODAY)

```
┌──────────────────────────────────────────────────────────────────┐
│              ISSUANCE → RETURN FULL FLOW                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CREATE ISSUANCE                                                 │
│  ┌─────────┐     ┌──────────────┐     ┌───────────────────┐    │
│  │ New     │────►│ POST /api/   │────►│ assignment created │    │
│  │ Issuance│     │ issuances    │     │ asset.status =     │    │
│  │ Wizard  │     │ (single/bulk)│     │  ASSIGNED          │    │
│  └─────────┘     └──────────────┘     └───────────────────┘    │
│       │                                │                        │
│       │  Single → 1 Assignment row     │  Bulk → N rows with   │
│       │  No bulkBatchId               │  same bulkBatchId      │
│       ▼                                ▼                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              ISSUANCES PAGE TABLE                         │   │
│  │  client/src/pages/IssuancesPage.tsx                       │   │
│  │                                                          │   │
│  │  Row types:                                               │   │
│  │  ├── Single issuance → 1 row, 1 asset                    │   │
│  │  └── Batch issuance  → 1 row (collapse) with expand ►     │   │
│  │                                                          │   │
│  │  Batch Row (collapsed):                                  │   │
│  │  ┌────┬──────────┬────────┬──────┬─────────┬──────────┐ │   │
│  │  │ ▶  │ N Assets │Person  │ Date │ Status  │  Actions  │ │   │
│  │  │    │ • asset1 │        │      │ Active  │ Return All│ │   │
│  │  │    │ • asset2 │        │      │         │ Sign  View│ │   │
│  │  └────┴──────────┴────────┴──────┴─────────┴──────────┘ │   │
│  │                                                          │   │
│  │  Batch Row (expanded) ★ NEW TODAY:                       │   │
│  │  ┌────┬──────────┬────────┬──────┬─────────┬──────────┐ │   │
│  │  │ ▼  │ N Assets │Person  │ Date │ Status  │  Actions  │ │   │
│  │  ├────┼──────────┼────────┼──────┼─────────┼──────────┤ │   │
│  │  │ ↳  │ asset1   │  —     │  —   │ Active  │ 🔄 ↗️ ✏️ │ │   │
│  │  │ ↳  │ asset2   │  —     │  —   │Returned │     (none)│ │   │
│  │  └────┴──────────┴────────┴──────┴─────────┴──────────┘ │   │
│  │    ↳ sub-row buttons 🔄=Return ↗️=Transfer ✏️=Sign     │   │
│  │    (only shown for ACTIVE items, hidden for returned)   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  RETURN PATHS (3 ways to return an asset)                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │  PATH 1: Per-row Return Button (★ NEW today for batches) │   │
│  │  ──────────────────────────────────────────────           │   │
│  │  Single row: amber ↻ Return button                       │   │
│  │  Expanded batch sub-row: amber ↻ Return button  ★ NEW    │   │
│  │  │                                                        │   │
│  │  └──► openReturnModal([singleIssuance])                  │   │
│  │       └──► Select condition → Submit                     │   │
│  │            └──► POST /api/issuances/:id/return            │   │
│  │                 { returnCondition, returnNote }           │   │
│  │                 └──► assignment.returnedAt = now()         │   │
│  │                      asset.status = AVAILABLE             │   │
│  │                                                          │   │
│  │  PATH 2: Batch "Return All" Button                        │   │
│  │  ───────────────────────────────                           │   │
│  │  Collapsed batch row: navy "Return All" button            │   │
│  │  │                                                        │   │
│  │  └──► openReturnModal(batchItems.filter(!returnedAt))     │   │
│  │       └──► Select condition → Submit (sequential POSTs)  │   │
│  │            └──► N × POST /api/issuances/:id/return         │   │
│  │                 └──► Each asset → AVAILABLE                │   │
│  │                                                          │   │
│  │  PATH 3: QR Return Station                                │   │
│  │  ─────────────────────────                                │   │
│  │  "QR Return" button → Scanner modal                       │   │
│  │  │                                                        │   │
│  │  └──► Scan QR / type serial → GET /api/issuances?search   │   │
│  │       └──► Select match → Select condition → Submit       │   │
│  │            └──► POST /api/issuances/:id/return            │   │
│  │                                                          │   │
│  │  ALL 3 PATHS gated by:                                     │   │
│  │  ├── <PermissionGate permissions={['issuances:return']}>  │   │
│  │  │   └── ADMIN bypass ★ FIXED TODAY                       │   │
│  │  └── item.returnedAt === null (only active items)         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  TRANSFER FLOW                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Single/expanded-batch Transfer button (↗️)                │   │
│  │  └──► openTransferModal(issuance)                         │   │
│  │       └──► Select new personnel → Select condition → Sub  │   │
│  │            └──► POST /api/issuances/:id/transfer           │   │
│  │                 └──► Old: returnedAt = now()               │   │
│  │                      New: new Assignment created           │   │
│  │                      asset.status = ASSIGNED (new person)  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  DIGITAL SIGN-OFF                                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Sign button (✏️) on unsigned issuances                     │   │
│  │  └──► openSignModal(issuance)                              │   │
│  │       └──► Enter signer name → POST /api/issuances/:id/sign│  │
│  │            └──► recipientSignedAt = now()                  │   │
│  │                 recipientSignatureName = signer name       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 9. CHANGES MADE TODAY (May 22, 2026)

### A. Return Button Visibility Bug Fix (from docs/RETURN_BUTTON_VISIBILITY_BUG_FIX.md)

**Root Cause:** Backend `hasPermission()` bypasses ADMIN by role, but frontend `PermissionGate` only checked the `permissions` array. ADMIN users in the DB were missing `issuances:return` from their permissions array (added to `ALL_PERMISSIONS` after they were created), so the gate always returned false.

**Changes:**

| # | File | Change |
|---|------|--------|
| 1 | `client/src/components/auth/PermissionGate.tsx` | Added ADMIN role bypass: `if (user.role === 'ADMIN') return <>{children}</>`. Added safe JSON.parse for permissions that might be stored as a string. |
| 2 | `client/src/pages/IssuancesPage.tsx` | Added defensive comment above Return button block documenting the 3 visibility rules. |
| 3 | Database — `users` table | Updated both ADMIN users' `permissions` array to include `issuances:return` (fixing data gap for existing users). |

### B. Expandable Batch Rows with Per-Item Return

**Problem:** Batch rows showed only a static Package icon with tooltip "Bulk batch — select individual assets to return" but it wasn't clickable. No way to return individual assets from a batch — only "Return All" was available.

**Changes:**

| # | File | Change |
|---|------|--------|
| 4 | `client/src/pages/IssuancesPage.tsx` | Replaced static Package icon with clickable ChevronRight/ChevronDown expand/collapse button. |
| 5 | `client/src/pages/IssuancesPage.tsx` | "N Assets" text is now also clickable (same toggle). |
| 6 | `client/src/pages/IssuancesPage.tsx` | Added `expandedBatches` state (Set<string>) to track which batches are expanded. |
| 7 | `client/src/pages/IssuancesPage.tsx` | Added expanded sub-rows: each individual asset in a batch shows on its own row with ↳ prefix, S/N, P/N, status (Active/Returned), and per-item action buttons (Return ↻, Transfer ↗, Sign ✏️). |
| 8 | `client/src/pages/IssuancesPage.tsx` | Returned items in sub-rows show line-through, grey text, green dot; Active items show green pulse dot. |
| 9 | `client/src/pages/IssuancesPage.tsx` | Added `React` import (for React.Fragment with key prop). Removed unused `Package` import. Added `ChevronDown`/`ChevronRight` imports. |
| 10 | `client/src/pages/IssuancesPage.tsx` | Batch parent row uses `<React.Fragment key={...}>` wrapper so sub-rows render as sibling `<tr>` elements (valid table structure). |

### C. Add Asset Improvements (7 Phases — completed earlier today)

| # | File | Change |
|---|------|--------|
| 11 | `client/src/components/assets/AssetFormModal.tsx` | Full rewrite: removed assignedTo from form, added depreciation section (method, usefulLife, salvageValue), supplier dropdown, serialNumberError inline, AI auto-fill with auto-open depreciation. |
| 12 | `client/src/components/assets/AssetDetailModal.tsx` | "Assigned To" → "Assigned To (legacy)" label. |
| 13 | `server/src/routes/asset.routes.ts` | Added P2002 duplicate-field catch → HTTP 409 `{error, details: {field, code: 'DUPLICATE_FIELD'}}`. Added orphaned image cleanup on PUT (fs.unlink old image before saving new). |
| 14 | `server/src/routes/asset.schema.ts` | Made `purchasePrice` and `purchaseDate` required in `createAssetSchema`. Added `depreciationMethod` (enum), `usefulLifeYears` (int, default 5), `salvageValue` (float, default 0), `supplierId` (uuid, optional nullable). |
| 15 | `server/src/routes/supplier.routes.ts` | ★ NEW FILE — Full CRUD for Supplier model (GET list, POST create, PUT update, DELETE). Registered in routes/index.ts. |
| 16 | `server/src/services/ai.service.ts` | Expanded AI suggest: added `USEFUL_LIFE_MAP`, `WARRANTY_YEARS_MAP`, `getAssetMetadata()`. Suggest endpoint now returns `usefulLifeYears`, `warrantyYears`, `confidence`. |
| 17 | `client/src/lib/api.ts` | Added `errorData: any` field to `ApiError` class. Updated `request()` to pass full API error body as `errorData`. Added `warrantyExpiry`, `warrantyNotes`, `depreciationMethod`, `usefulLifeYears`, `salvageValue`, `supplierId` fields to `Asset` interface. |

---

## 10. PERMISSION GATE — BEFORE vs AFTER (TODAY)

```
BEFORE (broken):
┌─────────────────────────────────────────┐
│  PermissionGate                         │
│  ✗ No ADMIN bypass                      │
│  ✗ Permissions stored as string → crash │
│  ✗ ADMIN user lacks issuances:return   │
│                                         │
│  Result: Return buttons HIDDEN for      │
│         ADMIN users despite backend     │
│         allowing the action             │
└─────────────────────────────────────────┘

AFTER (fixed):
┌─────────────────────────────────────────┐
│  PermissionGate                         │
│  ✓ ADMIN role bypass (line 15)          │
│  ✓ Safe JSON.parse for string perms     │
│  ✓ DB updated: ADMIN now has all perms  │
│                                         │
│  Result: Return buttons VISIBLE for      │
│         ADMIN users — backend + client  │
│         permission checks are aligned   │
└─────────────────────────────────────────┘
```

---

## 11. BATCH ROW — BEFORE vs AFTER (TODAY)

```
BEFORE (static, no per-item return):
┌────┬──────────┬────────┬──────┬─────────┬──────────┐
│ 📦 │ N Assets │Person  │ Date │ Status  │  Actions │
│    │ • asset1 │        │      │ Active  │Return All│
│    │ • asset2 │        │      │         │  Sign   │
└────┴──────────┴────────┴──────┴─────────┴──────────┘
  ↑ Static icon, not clickable
  No way to return individual assets

AFTER (expandable, per-item return):
COLLAPSED:
┌────┬──────────┬────────┬──────┬─────────┬──────────┐
│ ▶  │ N Assets │Person  │ Date │ Status  │  Actions │
│    │ • asset1 │        │      │ Active  │Return All│
│    │ • asset2 │        │      │         │  Sign   │
└────┴──────────┴────────┴──────┴─────────┴──────────┘
  ↑ Clickable chevron — expands to show sub-rows

EXPANDED:
┌────┬──────────┬────────┬──────┬─────────┬──────────┐
│ ▼  │ N Assets │Person  │ Date │ Status  │  Actions │
├────┼──────────┼────────┼──────┼─────────┼──────────┤
│ ↳  │ asset1   │  —     │  —   │ Active  │ 🔄 ↗️ ✏️ │
│    │ S/N:xxx  │        │      │         │          │
│    │ P/N:xxx  │        │      │         │          │
│ ↳  │ asset2   │  —     │  —   │Returned │   (none) │
│    │ S/N:yyy  │        │      │ (Good)  │          │
└────┴──────────┴────────┴──────┴─────────┴──────────┘
  ↑ Individual assets with their own Return/Transfer/Sign buttons
  🔄 = Return (amber)  ↗️ = Transfer (blue)  ✏️ = Sign (green)
  Only shown for ACTIVE items — returned items show no action buttons
```

---

## 12. DEV ENVIRONMENT

| Item | Value |
|------|-------|
| Platform | WSL (Windows Subsystem for Linux) |
| Project path | `/home/reggie/.hermes/workspace/aio-system` |
| Client dev server | `localhost:3000` (Vite HMR) |
| Server dev server | `localhost:3001` (ts-node-dev / nodemon) |
| PostgreSQL | `localhost:5432`, DB `aio_system`, user `reggie`, password `admin123` |
| Node.js | v20 |
| Default admin login | `admin@aio-system.local` / `admin123` |
| Production server | `uppivm1@10.170.59.190`, `/var/www/html/aio-system`, PM2, port 3000 |
| Git | Remote configured, push/pull without auth prompts |
| Prisma | Manual SQL + `prisma resolve` for drift — never `prisma migrate reset` |

---

## 13. BRAND & UI CONSTANTS

| Token | Value | Usage |
|-------|-------|-------|
| Navy | `#012061` | Headers, buttons, brand color |
| Orange | `#f8931f` | Accent, hover, warranty expiring alerts |
| Danger Red | `#7B1113` | Expired warranty alerts, destructive actions |
| Dark mode | Supported | TailwindCSS `dark:` prefix |
| Table headers | `bg-[#012061] text-white/70 uppercase tracking-widest text-[10px] font-semibold` |

---

## 14. CRITICAL RULES & CONSTRAINTS

1. **Icon safety**: Before removing ANY lucide import, grep ALL nav arrays (inventory, issuance, system) — a missing icon = blank white page.
2. **Route removal**: 5 steps — delete page → remove Route+import from App.tsx → remove nav+check icon from AppLayout.tsx → remove route file+import+registration from index.ts → search stray refs. Dangling `app.use()` without import = silent 404.
3. **Prisma drift**: Manual SQL + `prisma resolve`, NEVER `prisma migrate reset` on DB.
4. **Production**: Do NOT touch Apache config. PM2 manages the Node.js process.
5. **PermissionGate**: ADMIN role must bypass — backend and frontend must stay aligned.
6. **Action without confirmation**: Never commit, push, deploy, or implement code changes without Houtarou's explicit confirmation.