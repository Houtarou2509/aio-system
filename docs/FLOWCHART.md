# AIO-System — Full System Flowchart & Map

> Auto-generated reference for AI agents and developers.
> Last updated: 2026-04-27

---

## 1. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Runtime** | Node.js | v22+ |
| **Server** | Express.js | 4.x |
| **Database** | PostgreSQL | via Prisma ORM 6.x |
| **Auth** | JWT (jsonwebtoken) + bcryptjs + 2FA (TOTP) | |
| **Frontend** | React 18 + Vite 6 + TypeScript | |
| **UI Components** | Radix UI + custom components (Tailwind CSS) | |
| **Charts** | Chart.js + react-chartjs-2 | |
| **PDF/Labels** | PDFKit + bwip-js (barcodes) | |
| **Image Processing** | Sharp (resize on upload) | |
| **File Upload** | Multer (5MB limit, images only) | |
| **CSV Import** | csv-parse | |
| **Cron** | node-cron (backup 02:00 SGT, notifications 09:00 SGT) | |
| **Backup** | archiver (zip) + AWS S3 (@aws-sdk/client-s3) | |
| **AI** | Google Gemini API (googleapis) — asset suggestion | |
| **Email** | Google APIs (gmail send) | |
| **QR Codes** | html5-qrcode (scanner) + bwip-js (generation) | |
| **Rate Limiting** | express-rate-limit | |
| **Security** | helmet, cors, morgan (logging) | |
| **Process Manager** | PM2 (ecosystem.config.js) | |
| **Testing** | Vitest (unit/integration/security) + Playwright (E2E) | |

---

## 2. Project Structure

```
aio-system/
├── package.json                    # Monorepo root (workspaces: server, client, shared)
├── ecosystem.config.js             # PM2 config (port 3001 dev / 3000 prod)
├── playwright.config.ts            # E2E test config
│
├── 📁 server/                      # ─── BACKEND ───
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── prisma/
│   │   ├── schema.prisma           # ⭐ Database schema (all models)
│   │   ├── seed.ts                 # DB seed script
│   │   └── seed-lookups.ts         # Lookup value seed
│   ├── uploads/                    # User-uploaded images (served statically)
│   ├── public/                     # Built frontend (Vite output, served in prod)
│   └── src/
│       ├── index.ts                # ⭐ Express app entry — mounts all routes, starts server
│       ├── jobs/
│       │   └── cron.ts             # Scheduled jobs (backup, notifications)
│       ├── middleware/
│       │   ├── auth.ts             # JWT auth + role authorization
│       │   ├── audit.ts            # Auto-audit middleware
│       │   ├── validate.ts         # Zod schema validation
│       │   ├── errorHandler.ts     # Global error handler
│       │   └── index.ts
│       ├── routes/                 # ⭐ All API endpoints
│       │   ├── auth.routes.ts      #    /api/auth
│       │   ├── asset.routes.ts     #    /api/assets
│       │   ├── request.routes.ts   #    /api/assets/request & /requests
│       │   ├── maintenance.routes.ts #  /api/assets/:id/maintenance
│       │   ├── maintenanceSchedules.ts # /api/assets/maintenance-schedules
│       │   ├── maintenanceUpcoming.ts  # /api/maintenance/upcoming
│       │   ├── audit.routes.ts     #    /api/audit
│       │   ├── user.routes.ts      #    /api/users
│       │   ├── dashboard.routes.ts #    /api/dashboard
│       │   ├── label.routes.ts     #    /api/labels
│       │   ├── guest.routes.ts     #    /api/guest
│       │   ├── lookup.routes.ts    #    /api/lookups
│       │   ├── ai.routes.ts        #    /api/ai
│       │   ├── backup.routes.ts    #    /api/backups
│       │   ├── notification.routes.ts # /api/notifications
│       │   └── *.schema.ts         #    Zod validation schemas per route
│       ├── services/               # ⭐ Business logic layer
│       │   ├── auth.service.ts     #    Login, JWT, 2FA, refresh tokens
│       │   ├── asset.service.ts    #    CRUD + history + stats
│       │   ├── audit.service.ts    #    Query, revert, export CSV, cleanup
│       │   ├── maintenance.service.ts
│       │   ├── dashboard.service.ts
│       │   ├── label.service.ts    #    PDF generation, template CRUD
│       │   ├── guest.service.ts    #    Guest tokens + rate limiting
│       │   ├── depreciation.service.ts
│       │   ├── notification.service.ts
│       │   ├── backup.service.ts   #    Zip + S3 upload
│       │   └── ai.service.ts       #    Gemini API asset suggestion
│       └── utils/
│           ├── response.ts         #    success() / error() helpers
│           ├── env.ts              #    ENV validation
│           └── guestFilter.ts      #    Strip sensitive fields for guests
│
├── 📁 client/                      # ─── FRONTEND ───
│   ├── package.json
│   ├── vite.config.ts              # Vite config (base: /aio-system)
│   ├── components.json             # shadcn/ui config
│   └── src/
│       ├── main.tsx                # React entry
│       ├── App.tsx                 # ⭐ Routes (React Router, basename: /aio-system)
│       ├── index.css               # Global styles + Tailwind
│       ├── context/
│       │   └── AuthContext.tsx     # Auth state, login, token refresh
│       ├── pages/                  # ⭐ All page components
│       │   ├── LoginPage.tsx       #    /login
│       │   ├── Setup2FaPage.tsx    #    /setup-2fa
│       │   ├── DashboardPage.tsx   #    / (home)
│       │   ├── AssetsPage.tsx      #    /assets
│       │   ├── AuditPage.tsx       #    /audit
│       │   ├── SettingsPage.tsx    #    /settings
│       │   ├── UserManagementPage.tsx # /users (Admin only)
│       │   ├── InventoryLookupPage.tsx # /lookup (Admin/StaffAdmin)
│       │   └── GuestAssetPage.tsx  #    /guest/:token (public)
│       ├── components/
│       │   ├── AppLayout.tsx       # Sidebar + top nav shell
│       │   ├── assets/             # Asset-related components
│       │   │   ├── AssetDetailModal.tsx    # Full asset detail with tabs
│       │   │   ├── AssetFormModal.tsx      # Create/edit asset form
│       │   │   ├── AssetTable.tsx          # Sortable/filterable table
│       │   │   ├── AssetFilterSidebar.tsx  # Filter panel
│       │   │   ├── ImportAssetsModal.tsx   # CSV import
│       │   │   ├── PendingRequestsModal.tsx # Admin request review
│       │   │   ├── QRScannerModal.tsx      # QR code scanner
│       │   │   └── index.ts
│       │   ├── audit/
│       │   │   ├── AuditTimeline.tsx       # Per-entity audit timeline
│       │   │   └── index.ts
│       │   ├── auth/
│       │   │   ├── ProtectedRoute.tsx      # Route guard
│       │   │   ├── RoleGate.tsx            # Conditional render by role
│       │   │   └── index.ts
│       │   ├── dashboard/
│       │   │   ├── DashboardWidgets.tsx
│       │   │   └── index.ts
│       │   ├── depreciation/
│       │   │   ├── FinancialsTab.tsx       # Depreciation calculator
│       │   │   ├── DepreciationBar.tsx
│       │   │   └── index.ts
│       │   ├── guest/
│       │   │   ├── GuestTokenManager.tsx   # Create/revoke guest tokens
│       │   │   └── index.ts
│       │   ├── labels/
│       │   │   ├── TemplateDesigner.tsx    # Visual label editor
│       │   │   └── index.ts
│       │   ├── lookup/
│       │   │   └── LookupTab.tsx           # Lookup value CRUD
│       │   ├── maintenance/
│       │   │   ├── MaintenanceTab.tsx
│       │   │   ├── ScheduleMaintenanceModal.tsx
│       │   │   └── index.ts
│       │   ├── notifications/
│       │   │   └── NotificationBell.tsx    # Unread notification badge
│       │   ├── users/
│       │   │   ├── AddUserModal.tsx
│       │   │   ├── EditUserModal.tsx
│       │   │   └── index.ts
│       │   └── ui/                 # Reusable UI primitives
│       │       ├── badge.tsx, button.tsx, checkbox.tsx, dialog.tsx,
│       │       │   input.tsx, label.tsx, popover.tsx, scroll-area.tsx,
│       │       │   select.tsx, table.tsx, tabs.tsx
│       │       └── (shadcn/radix-based)
│       ├── hooks/
│       │   ├── useAssets.ts        # Asset data fetching hook
│       │   ├── useLookup.ts        # Lookup data hook
│       │   ├── useLookupOptions.ts # Dropdown options hook
│       │   └── useSavedFilters.ts  # Persisted filter state
│       ├── lib/
│       │   ├── api.ts              # ⭐ Central API client (all endpoints)
│       │   ├── labels-api.ts       # Label-specific API calls
│       │   ├── utils.ts            # cn() helper + misc
│       │   └── warranty.ts         # Warranty status calculator
│       ├── utils/
│       │   ├── csvTemplate.ts      # CSV template generator
│       │   ├── depreciation.ts     # Depreciation math
│       │   └── maintenanceUtils.ts # Maintenance helpers
│       └── types/
│           └── lookup.ts
│
├── 📁 shared/                      # ─── SHARED TYPES ───
│   ├── package.json
│   └── types/
│       └── index.ts                # Shared TypeScript types
│
├── 📁 tests/                       # ─── TEST SUITES ───
│   ├── smoke/                      #    Smoke tests
│   ├── functional/                 #    Functional tests (assets, auth, audit, etc.)
│   ├── integration/                #    Integration tests (DB, AI, cron)
│   ├── security/                   #    Security tests (auth bypass, data exposure, etc.)
│   ├── ui/                         #    Playwright E2E tests
│   ├── helpers/
│   │   └── mocks.ts
│   └── fixtures/
│       └── assets.ts
│
└── 📁 docs/                        # ─── DOCUMENTATION ───
    ├── ASSIGNEDTO_FLOW.md          # assignedTo relationship analysis
    ├── login-redesign-recommendations.md
    ├── security-checklist.md
    └── test-strategy.md
```

---

## 3. Database Schema (Prisma)

```
┌─────────────────────────────────────────────────────────────────┐
│                         PostgreSQL                               │
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │    User       │     │    Asset      │     │  Assignment  │   │
│  ├──────────────┤     ├──────────────┤     ├──────────────┤   │
│  │ id*          │◄──┐ │ id*          │──┐  │ id*          │   │
│  │ username     │   │ │ name         │  │  │ assetId ─────┼──►│
│  │ email        │   │ │ type         │  │  │ userId ─────┼──►│
│  │ passwordHash │   │ │ manufacturer │  │  │ assignedTo   │   │
│  │ role         │   │ │ serialNumber │  │  │ assignedAt   │   │
│  │ fullName      │   │ │ purchasePrice│  │  │ returnedAt   │   │
│  │ status       │   │ │ purchaseDate │  │  │ condition    │   │
│  │ twoFactorSec │   │ │ status       │  │  │ notes        │   │
│  │ twoFactorEn  │   │ │ location     │  │  │ requestStatus│   │
│  │ backupCodes  │   │ │ imageUrl     │  │  │ requestNote  │   │
│  │ lastLogin    │   │ │ assignedTo   │  │  └──────────────┘   │
│  │ createdAt     │   │ │ propertyNumber│ │                      │
│  │ updatedAt     │   │ │ warrantyExpir│ │                      │
│  └──────┬───────┘   │ │ warrantyNotes│ │                      │
│         │           │ │ deletedAt    │ │                      │
│         │           │ └──────┬───────┘ │                      │
│         │           │        │         │                      │
│         ▼           │        ▼         │                      │
│  ┌──────────────┐   │  ┌──────────────┐│                      │
│  │  AuditLog    │   │  │MaintenanceLog││                      │
│  ├──────────────┤   │  ├──────────────┤│                      │
│  │ id*          │   │  │ id*          ││                      │
│  │ entityType   │   │  │ assetId ─────┼┤                      │
│  │ entityId     │   │  │ technician   ││                      │
│  │ action       │   │  │ description  ││                      │
│  │ field        │   │  │ cost         ││                      │
│  │ oldValue     │   │  │ date         ││                      │
│  │ newValue     │   │  └──────────────┘│                      │
│  │ performedById┼───┘                  │                      │
│  │ performedAt  │      ┌──────────────┐│                      │
│  │ ipAddress    │      │MaintenanceSch││                      │
│  └──────────────┘      ├──────────────┤│                      │
│                        │ id*          ││                      │
│  ┌──────────────┐      │ assetId ─────┼┤                      │
│  │  GuestToken  │      │ scheduleDate ││                      │
│  ├──────────────┤      │ description  ││                      │
│  │ id*          │      │ nextDueDate  ││                      │
│  │ assetId ─────┼──►   │ frequency    ││                      │
│  │ token (uniq) │      └──────────────┘│                      │
│  │ expiresAt    │                     │                      │
│  │ maxAccess    │      ┌──────────────┐│                      │
│  │ accessCount  │      │  Notification││                      │
│  │ isActive     │      ├──────────────┤│                      │
│  └──────────────┘      │ id*          ││                      │
│                        │ assetId ─────┼┤                      │
│  ┌──────────────┐      │ type         ││                      │
│  │ LookupValue  │      │ message      ││                      │
│  ├──────────────┤      │ isRead       ││                      │
│  │ id*          │      └──────────────┘│                      │
│  │ category     │                     │                      │
│  │ value        │      ┌──────────────┐│                      │
│  │ isActive     │      │LabelTemplate│ │                      │
│  └──────────────┘      ├──────────────┤│                      │
│                        │ id*          ││                      │
│  Enum: Role            │ name         ││                      │
│  ├ ADMIN               │ layout       ││                      │
│  ├ STAFF_ADMIN         │ fields       ││                      │
│  ├ STAFF               │ createdById ─┼┤                      │
│  └ GUEST               └──────────────┘│                      │
│                                     │                      │
│  Enum: AssetStatus                  │                      │
│  ├ AVAILABLE                         │                      │
│  ├ ASSIGNED                          │                      │
│  ├ MAINTENANCE                       │                      │
│  ├ RETIRED                           │                      │
│  └ LOST                              │                      │
│                                                                 │
│  Enum: RequestStatus                                            │
│  ├ PENDING                                                      │
│  ├ APPROVED                                                     │
│  └ DENIED                                                       │
│                                                                 │
│  Enum: LookupCategory                                           │
│  ├ ASSET_TYPE                                                   │
│  ├ MANUFACTURER                                                 │
│  ├ LOCATION                                                     │
│  └ ASSIGNED_TO                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. API Routes Map

### Authentication (`/api/auth`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/login` | Public | Login (rate limited: 5/15min) |
| POST | `/refresh` | Public | Refresh JWT token |
| POST | `/logout` | Authenticated | Invalidate refresh token |
| POST | `/2fa/setup` | Authenticated | Generate TOTP secret + QR |
| POST | `/2fa/verify` | Authenticated | Verify & enable 2FA |
| POST | `/2fa/validate` | Public | Validate 2FA during login |
| GET | `/me` | Authenticated | Get current user info |

### Assets (`/api/assets`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Authenticated | List assets (filter, sort, paginate) |
| GET | `/stats` | Authenticated | Asset statistics (by status, type, location) |
| POST | `/` | Admin/StaffAdmin | Create asset (JSON or multipart with image) |
| POST | `/import` | Admin/StaffAdmin | Bulk CSV import |
| GET | `/bulk-status` | — | — |
| PATCH | `/bulk-status` | Admin/StaffAdmin | Change status for multiple assets |
| DELETE | `/bulk-delete` | Admin | Soft-delete (retire) multiple assets |
| GET | `/:id` | Authenticated | Get single asset (guest-filtered if GUEST role) |
| PUT | `/:id` | Admin/StaffAdmin/Staff | Update asset (JSON or multipart) |
| DELETE | `/:id` | Admin | Soft-delete single asset |
| POST | `/:id/image` | Admin/StaffAdmin/Staff | Upload/resize image (Sharp, 800px max) |
| GET | `/:id/history` | Authenticated | Assignment history for asset |

### Request/Approval (`/api/assets`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/request` | Staff/StaffAdmin/Admin | Staff requests an asset → creates Assignment + AuditLog |
| GET | `/requests` | Admin/StaffAdmin | List requests (filter by status) |
| PATCH | `/request/:id/approve` | Admin/StaffAdmin | Approve → Assignment.status=APPROVED, Asset.status=ASSIGNED |
| PATCH | `/request/:id/deny` | Admin/StaffAdmin | Deny → Assignment.status=DENIED |

### Maintenance (`/api/assets` + `/api/maintenance`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/:id/maintenance` | Authenticated | List maintenance logs |
| POST | `/:id/maintenance` | Admin/StaffAdmin | Create maintenance log |
| PUT | `/:id/maintenance/:logId` | Admin/StaffAdmin | Update maintenance log |
| DELETE | `/:id/maintenance/:logId` | Admin/StaffAdmin | Delete maintenance log |
| GET | `/maintenance-schedules` | Authenticated | List all schedules |
| POST | `/maintenance-schedules` | Admin/StaffAdmin | Create schedule |
| PUT | `/maintenance-schedules/:id` | Admin/StaffAdmin | Update schedule |
| DELETE | `/maintenance-schedules/:id` | Admin | Delete schedule |
| GET | `/maintenance/upcoming` | Authenticated | Upcoming maintenance (next N days) |

### Audit Trail (`/api/audit`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Authenticated | List audit logs (filter, paginate) |
| GET | `/export` | Admin/StaffAdmin | Export filtered logs as CSV |
| DELETE | `/cleanup` | Admin | Delete logs older than N days |
| GET | `/:entityId` | Authenticated | Timeline for specific entity |
| POST | `/:id/revert` | Admin | Revert a specific field change |

### Users (`/api/users`) — Admin only
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Admin | List all users |
| POST | `/` | Admin | Create user |
| PUT | `/:id` | Admin | Update user |
| PATCH | `/:id/status` | Admin | Activate/deactivate user |

### Lookups (`/api/lookups`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/:category` | Authenticated | Active values for category (asset-types, manufacturers, locations, assigned-to) |
| GET | `/:category/all` | Admin/StaffAdmin | All values including inactive |
| POST | `/:category` | Admin/StaffAdmin | Add lookup value |
| PATCH | `/:id` | Admin/StaffAdmin | Edit/toggle lookup value |
| POST | `/migrate` | Admin | Seed lookups from existing asset data |

### Dashboard (`/api/dashboard`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/stats` | Authenticated | KPI stats |
| GET | `/warranties-expiring` | Authenticated | Warranties expiring soon |
| GET | `/location-stats` | Authenticated | Assets by location |
| GET | `/age-stats` | Authenticated | Asset age distribution |

### Labels (`/api/labels`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/generate-pdf` | Authenticated | Generate barcode/PDF labels for assets |
| GET | `/templates` | Admin/StaffAdmin | List label templates |
| POST | `/templates` | Admin/StaffAdmin | Create template |
| PUT | `/templates/:id` | Admin/StaffAdmin | Update template |
| DELETE | `/templates/:id` | Admin | Delete template |

### Guest Access (`/api/guest`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/a/:token` | **Public** | View asset via guest token (rate limited) |
| POST | `/tokens` | Admin/StaffAdmin | Create guest token |
| GET | `/tokens` | Admin/StaffAdmin | List tokens |
| DELETE | `/tokens/:id` | Admin | Revoke guest token |

### AI (`/api/ai`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/suggest` | Authenticated | AI-suggest asset details via Gemini |

### Backups (`/api/backups`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/now` | Admin | Manual backup trigger |
| GET | `/` | Admin | List backup history |

### Notifications (`/api/notifications`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Authenticated | Get unread notifications |
| PATCH | `/:id/read` | Authenticated | Mark as read |

### Health
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | Public | Health check |

---

## 5. Frontend Routes Map

| Path | Component | Access | Description |
|------|-----------|--------|-------------|
| `/login` | LoginPage | Public | Login form |
| `/setup-2fa` | Setup2FaPage | Authenticated | 2FA setup wizard |
| `/guest/:token` | GuestAssetPage | Public | Guest asset view |
| `/` | DashboardPage | Authenticated | KPI dashboard with charts |
| `/assets` | AssetsPage | Authenticated | Asset table, CRUD, requests |
| `/users` | UserManagementPage | Admin only | User CRUD |
| `/audit` | AuditPage | Authenticated | Full audit trail with filters |
| `/lookup` | InventoryLookupPage | Admin/StaffAdmin | Lookup value management |
| `/settings` | SettingsPage | Authenticated | App settings |

All authenticated routes share `AppLayout` (sidebar + topbar).

---

## 6. Feature Implementation Status

### ✅ Fully Implemented

| # | Feature | Frontend | Backend | Notes |
|---|---------|----------|---------|-------|
| 1 | **Authentication** | LoginPage, AuthContext | auth.routes + auth.service | JWT + refresh tokens |
| 2 | **2FA (TOTP)** | Setup2FaPage | auth.routes | Google Authenticator compatible |
| 3 | **Asset CRUD** | AssetFormModal, AssetTable | asset.routes + asset.service | Create, read, update, soft-delete |
| 4 | **Image Upload** | AssetFormModal | asset.routes | Multer + Sharp resize (800px) |
| 5 | **CSV Import** | ImportAssetsModal | asset.routes | csv-parse, validation, bulk insert |
| 6 | **Bulk Operations** | AssetTable | asset.routes | Bulk status change, bulk delete |
| 7 | **Asset Filtering & Sorting** | AssetFilterSidebar, AssetTable | asset.routes | Type, status, location, search |
| 8 | **Request/Approval Flow** | AssetDetailModal, PendingRequestsModal | request.routes | Staff request → Admin approve/deny |
| 9 | **Assignment Tracking** | AssetDetailModal (History tab) | asset.routes (history) | Per-asset assignment history |
| 10 | **Audit Trail** | AuditPage, AuditTimeline | audit.routes + audit.service | Full CRUD logging, revert, CSV export |
| 11 | **Audit Revert** | AuditPage | audit.service | Field-level revert with safety checks |
| 12 | **Maintenance Logs** | MaintenanceTab | maintenance.routes | CRUD for maintenance records |
| 13 | **Maintenance Schedules** | ScheduleMaintenanceModal | maintenanceSchedules.ts | Recurring schedule creation |
| 14 | **Upcoming Maintenance** | — | maintenanceUpcoming.ts | Next N days view |
| 15 | **Depreciation** | FinancialsTab, DepreciationBar | depreciation.service | Straight-line calculator |
| 16 | **Dashboard** | DashboardPage, DashboardWidgets | dashboard.routes | Stats, charts, warranty alerts |
| 17 | **Label Generation** | TemplateDesigner | label.routes + label.service | PDFKit + bwip-js barcodes |
| 18 | **Label Templates** | TemplateDesigner | label.routes | CRUD for label layouts |
| 19 | **Guest Access** | GuestAssetPage, GuestTokenManager | guest.routes | Time-limited, rate-limited public links |
| 20 | **Inventory Lookups** | InventoryLookupPage, LookupTab | lookup.routes | Dropdown value management (4 categories) |
| 21 | **Lookup Migration** | — | lookup.routes | Seed lookups from existing asset data |
| 22 | **User Management** | UserManagementPage, AddUserModal, EditUserModal | user.routes | CRUD, activate/deactivate |
| 23 | **Notifications** | NotificationBell | notification.routes | Unread badge, warranty/maintenance alerts |
| 24 | **AI Asset Suggestion** | AssetFormModal | ai.routes + ai.service | Gemini API auto-fill |
| 25 | **Database Backup** | SettingsPage (trigger) | backup.routes + backup.service | Zip + S3 upload |
| 26 | **Cron Jobs** | — | cron.ts | Daily backup (02:00 SGT), notifications (09:00 SGT) |
| 27 | **QR Scanner** | QRScannerModal | — | html5-qrcode camera scanner |
| 28 | **Rate Limiting** | — | auth.routes | 5 login attempts / 15 min per IP |
| 29 | **Guest Data Filtering** | — | guestFilter.ts | Strip sensitive fields for GUEST role |
| 30 | **Warranty Tracking** | AssetDetailModal (Overview) | — | Expiry status badges |
| 31 | **PWA Support** | manifest.json | — | vite-plugin-pwa |
| 32 | **Role-Based Access** | RoleGate, ProtectedRoute | auth middleware | ADMIN, STAFF_ADMIN, STAFF, GUEST |

### ⚠️ Partially Implemented / Known Issues

| # | Issue | Details |
|---|-------|---------|
| 1 | **`assignedTo` is a free-text string** | Not a FK to User table. Lookup "assigned-to" has no sync with User table. See `docs/ASSIGNEDTO_FLOW.md` |
| 2 | **Audit REQUEST logs lack descriptive message** | Fixed today (2026-04-27): now includes `oldValue: null` for REQUEST entries. Still no human-readable "who requested what" in log fields |
| 3 | **AssetDetailModal Request button was sync** | Fixed today: now async with "Pending Approval" state + console.log |
| 4 | **AuditPage missing REQUEST/APPROVE/DENY actions** | Fixed today: added to config, filters, PENDING highlighting, Quick Approve |
| 5 | **No audit for direct assignedTo changes** | AssetFormModal lets admins set assignedTo directly — no Assignment record created |
| 6 | **Lookup "assigned-to" not synced with Users** | Manually maintained dropdown; migration only seeds from existing asset data |

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
     │ Store tokens in localStorage             │ Verify JWT on every request
     ▼                                          ▼
┌──────────┐     Authorization: Bearer <JWT>   ┌──────────┐
│ AuthContext│───────────────────────────────►│  middleware│
│          │                                  │  auth.ts   │
│ • Auto-refresh before expiry               └──────────┘
│ • Redirect to /login on 401                     │
│ • RoleGate / ProtectedRoute                      ▼
                                              req.user = {id, role, username}
```

### Asset Request Flow (Staff → Admin)
```
Staff                            Admin                            Database
  │                                │                                │
  │ 1. Click "Request"             │                                │
  │──► POST /api/assets/request ───┤                                │
  │    {assetId, requestNote}      │                                │
  │                                │──► Check: asset AVAILABLE?    │
  │                                │──► Check: no pending already? │
  │                                │──► Create Assignment           │
  │                                │     (PENDING, userId,          │
  │                                │      assignedTo=username)      │
  │                                │──► Create AuditLog              │
  │                                │     (action: REQUEST)          │
  │◄── 201 {assignment} ──────────┤                                │
  │                                │                                │
  │ Button → "Pending Approval"    │                                │
  │                                │                                │
  │                         2. Admin opens PendingRequestsModal    │
  │                                │──► GET /api/assets/requests    │
  │                                │     ?status=PENDING            │
  │                                │◄── [{assignment, asset, user}] │
  │                                │                                │
  │                         3a. Approve                           │
  │                                │──► PATCH /request/:id/approve │
  │                                │──► Transaction:                │
  │                                │     Assignment → APPROVED      │
  │                                │     Asset → ASSIGNED           │
  │                                │     Asset.assignedTo = username│
  │                                │──► AuditLog (APPROVE)          │
  │                                │                                │
  │                         3b. Deny                              │
  │                                │──► PATCH /request/:id/deny     │
  │                                │──► Assignment → DENIED         │
  │                                │──► AuditLog (DENY)            │
  │                                │                                │
  │                         4. Quick Approve (AuditPage)          │
  │                                │──► PATCH /request/:id/approve │
  │                                │    (same endpoint, triggered   │
  │                                │     from audit trail table)    │
```

### Audit Trail Flow
```
Any Action                              Database
  │                                        │
  ├── Asset CREATE/UPDATE/DELETE ──────────►│ AuditLog { entityType: 'Asset', ... }
  ├── Assignment REQUEST/APPROVE/DENY ────►│ AuditLog { entityType: 'Assignment', ... }
  ├── Maintenance CREATE/UPDATE ───────────►│ AuditLog { entityType: 'MaintenanceLog', ... }
  ├── Bulk IMPORT/STATUS_CHANGE ───────────►│ AuditLog { entityId: 'bulk', ... }
  ├── Lookup MIGRATE ──────────────────────►│ AuditLog { entityId: 'lookup-migration', ... }
  ├── Backup TRIGGER ──────────────────────►│ AuditLog { action: 'BACKUP', ... }
  │                                        │
  │   Admin views:                          │
  ├── GET /api/audit (filter + paginate) ──►│
  ├── GET /api/audit/export (CSV) ────────►│
  ├── POST /api/audit/:id/revert ─────────►│ (field-level undo)
  └── DELETE /api/audit/cleanup ───────────►│ (purge old logs)
```

### Lookup → Asset Dropdown Flow
```
┌────────────────┐    GET /api/lookups/:category    ┌────────────┐
│ AssetFormModal │─────────────────────────────────►│ LookupValue │
│                │◄─────────────────────────────────│  table      │
│                │    [{value, isActive}]            │             │
│                │                                   │  Categories:│
│                │   Dropdowns populated:            │  • asset-types│
│                │   • Type        → ASSET_TYPE      │  • manufacturers│
│                │   • Manufacturer → MANUFACTURER   │  • locations│
│                │   • Location    → LOCATION         │  • assigned-to│
│                │   • Assigned To → ASSIGNED_TO     │             │
└────────────────┘                                   └────────────┘
        │
        │ POST/PUT /api/assets
        ▼
┌────────────────┐
│  Asset table    │  ← assignedTo stored as plain string
│  (assignedTo)   │  ← NOT a FK to User or LookupValue
└────────────────┘
```

### Backup Flow
```
┌──────────────┐  Manual  ┌──────────┐  zip + upload  ┌──────────┐
│ Admin clicks │────────►│ backup.  │───────────────►│ AWS S3   │
│ "Backup Now" │         │ service  │                │ bucket   │
└──────────────┘         └──────────┘                └──────────┘
                              │
                              ├── pg_dump → .sql
                              ├── Archive uploads/ → .zip
                              ├── Combined → single .zip
                              ├── Upload to S3
                              └── Create AuditLog entry
                              
                         Cron (02:00 SGT daily)
                              │
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
                                   ├── Create Notification records
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

## 8. Security Stack

| Layer | Implementation |
|-------|---------------|
| **Auth** | JWT (access + refresh), bcrypt password hashing |
| **2FA** | TOTP (Google Authenticator compatible), backup codes |
| **Rate Limiting** | express-rate-limit on login (5/15min), guest access |
| **Headers** | helmet (CSP, HSTS, etc.) |
| **CORS** | Configured with credentials |
| **Input Validation** | Zod schemas on all routes |
| **File Upload** | Multer with type/size limits, Sharp processing |
| **Soft Delete** | Assets use `deletedAt` (recoverable) |
| **Role Gates** | Frontend: RoleGate, ProtectedRoute. Backend: authorize() middleware |
| **Guest Filtering** | guestFilter.ts strips sensitive fields |
| **Audit Logging** | Every CUD operation logged with user, IP, old/new values |

---

## 9. Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3001 dev, 3000 prod) | No |
| `NODE_ENV` | development / production | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | Access token signing key | Yes |
| `REFRESH_TOKEN_SECRET` | Refresh token signing key | Yes |
| `AWS_ACCESS_KEY_ID` | S3 backup upload | For backups |
| `AWS_SECRET_ACCESS_KEY` | S3 backup upload | For backups |
| `AWS_S3_BUCKET` | S3 bucket name | For backups |
| `AWS_REGION` | S3 region | For backups |
| `GEMINI_API_KEY` | Google Gemini AI | For AI suggest |
| `GMAIL_CLIENT_ID` | Email notifications | For email |
| `GMAIL_CLIENT_SECRET` | Email notifications | For email |

---

## 10. Key File Quick Reference

| Want to... | Go to |
|------------|-------|
| Change database schema | `server/prisma/schema.prisma` |
| Add a new API endpoint | `server/src/routes/*.routes.ts` + `server/src/services/*.service.ts` |
| Add validation to a route | `server/src/routes/*.schema.ts` |
| Change frontend routing | `client/src/App.tsx` |
| Change auth behavior | `client/src/context/AuthContext.tsx` + `server/src/middleware/auth.ts` |
| Modify asset form | `client/src/components/assets/AssetFormModal.tsx` |
| Modify asset detail view | `client/src/components/assets/AssetDetailModal.tsx` |
| Change request/approval UI | `client/src/components/assets/PendingRequestsModal.tsx` |
| Change audit trail UI | `client/src/pages/AuditPage.tsx` |
| Add a new frontend page | `client/src/pages/*.tsx` + add route in `App.tsx` |
| Change lookup dropdowns | `server/src/routes/lookup.routes.ts` + `client/src/hooks/useLookup.ts` |
| Change dashboard widgets | `client/src/components/dashboard/DashboardWidgets.tsx` |
| Modify label PDF output | `server/src/services/label.service.ts` |
| Change backup logic | `server/src/services/backup.service.ts` |
| Modify cron schedules | `server/src/jobs/cron.ts` |
| Change PM2 config | `ecosystem.config.js` |
| Change Vite build config | `client/vite.config.ts` |
| Add shared types | `shared/types/index.ts` |
| Central API client | `client/src/lib/api.ts` |