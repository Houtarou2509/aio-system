# AIO-System — Inventory Module Flow

> **Last updated:** 2026-05-22  
> **Context:** DRDF (Demographic Research and Development Foundation, Inc.) — Palma Hall, UP Diliman  
> The AIO-System tracks laptops, printers, and other office devices with property numbers, accountability agreements, and printed letterhead documents.

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 20+ (ts-node-dev for dev) |
| **Language** | TypeScript (strict mode) |
| **Framework** | Express.js |
| **ORM** | Prisma ORM 6.x |
| **Database** | PostgreSQL 16 |
| **Frontend** | React 18 + TypeScript + Vite |
| **Styling** | TailwindCSS 3 + shadcn/ui |
| **PDF Generation** | PDFKit (server-side) |
| **Auth** | JWT (access + refresh tokens), RBAC roles, 2FA |
| **Builds** | Monorepo (server, client, shared workspaces via npm) |
| **Process Manager** | PM2 (production VM) |

---

## 2. Project Structure (File Map)

```
aio-system/
├── server/
│   ├── prisma/
│   │   └── schema.prisma                    # Database schema (462 lines)
│   ├── src/
│   │   ├── index.ts                         # Express app bootstrap, route registration
│   │   ├── lib/
│   │   │   └── prisma.ts                    # Prisma client singleton
│   │   ├── middleware/
│   │   │   ├── auth.ts                      # authenticate, hasPermission, authorize, requireRole
│   │   │   ├── audit.ts                     # Auto-audit middleware for writes
│   │   │   ├── errorHandler.ts              # Global error handler
│   │   │   ├── permissions.ts               # Permission constants
│   │   │   └── validate.ts                  # Zod validation middleware
│   │   ├── routes/
│   │   │   ├── asset.routes.ts              # /api/assets — CRUD, bulk ops, dispose, history
│   │   │   ├── maintenance.routes.ts        # /api/assets/:id/maintenance, /:id/schedules, /calendar
│   │   │   ├── issuance.routes.ts           # /api/issuances — issue, return, sign, lock/release
│   │   │   ├── agreement.routes.ts          # /api/agreements — templates, documents, PDF, verify
│   │   │   ├── accountability.routes.ts      # /api/accountability/report — accountability report
│   │   │   ├── accountabilityLookup.routes.ts # /api/lookup/accountability — personnel lookups
│   │   │   ├── personnel.routes.ts           # /api/personnel — profiles CRUD
│   │   │   ├── lookup.routes.ts             # /api/lookups — inventory lookups (type, category, location, manufacturer)
│   │   │   ├── audit.routes.ts              # /api/audit — enriched audit trail
│   │   │   ├── search.routes.ts             # /api/search — global search
│   │   │   ├── reports.routes.ts            # /api/reports — summary reports
│   │   │   ├── supplier.routes.ts            # /api/suppliers
│   │   │   └── ... (auth, users, dashboard, labels, backups, notifications, AI, etc.)
│   │   ├── services/
│   │   │   ├── asset.service.ts             # Asset CRUD, depreciation, search, batch ops
│   │   │   ├── issuance.service.ts           # Issue, return, sign-off, checkAndCloseAgreementDocument
│   │   │   ├── agreement.service.ts          # Template CRUD, PDF generation, document rendering
│   │   │   ├── agreementDocumentRenderer.service.ts # Agreement variable substitution
│   │   │   ├── accountability.service.ts     # Accountability report queries
│   │   │   ├── personnel.service.ts          # Personnel CRUD, readiness toggle
│   │   │   ├── maintenance.service.ts        # Maintenance logs & schedules
│   │   │   ├── audit.service.ts              # Enriched audit querying, CSV export
│   │   │   ├── auditLog.service.ts           # logAudit() write helper (used everywhere)
│   │   │   ├── search.service.ts             # Global search across all entities
│   │   │   ├── supplier.service.ts            # Supplier CRUD
│   │   │   └── ... (auth, backup, dashboard, depreciation, email, labels, notifications, etc.)
│   │   └── utils/
│   │       ├── response.ts                  # success(), error() response wrappers
│   │       └── auditHelpers.ts              # classifySeverity(), generateSummary()
│   └── uploads/                              # Logo images uploaded by admin
│
├── client/
│   ├── src/
│   │   ├── App.tsx                           # Routes (React Router, basename=/aio-system)
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx             # / — Dashboard overview
│   │   │   ├── AssetsPage.tsx               # /assets — Asset table, detail modal, CRUD
│   │   │   ├── IssuancesPage.tsx             # /issuances — Issue, return, sign-off, batch ops
│   │   │   ├── ProfilesPage.tsx             # /profiles — Personnel profiles
│   │   │   ├── AccountabilityLookupPage.tsx # /accountability-lookup — Designation/Institution/Project
│   │   │   ├── AccountabilityTemplatesPage.tsx # /accountability/templates — Agreement templates
│   │   │   ├── AccountabilityReportPage.tsx  # /accountability/report — Accountability report
│   │   │   ├── InventoryLookupPage.tsx       # /lookup — Inventory lookup values (type, category, etc.)
│   │   │   ├── MaintenanceCalendarPage.tsx   # /maintenance-calendar
│   │   │   ├── ReportsPage.tsx               # /reports
│   │   │   ├── AuditPage.tsx                 # /audit — Enriched audit trail
│   │   │   ├── SuppliersPage.tsx             # /suppliers
│   │   │   ├── PurchaseRequestsPage.tsx      # /purchase-requests
│   │   │   ├── SettingsPage.tsx              # /settings — Admin Hub
│   │   │   └── ... (Login, Users, Backups, Notifications)
│   │   ├── components/
│   │   │   ├── AppLayout.tsx                 # Sidebar navigation, theme toggle
│   │   │   ├── assets/                       # AssetCard, AssetDetailModal, AssetForm
│   │   │   ├── issuances/                    # IssueModal, ReturnModal, BatchIssueModal
│   │   │   ├── audit/                        # AuditTimeline
│   │   │   ├── auth/                         # ProtectedRoute, PermissionGate
│   │   │   ├── search/                       # GlobalSearchModal
│   │   │   └── ui/                           # shadcn/ui: Dialog, Button, Input, etc.
│   │   ├── hooks/
│   │   │   ├── useAssets.ts                  # React Query data hooks for assets
│   │   │   ├── useAgreementPreview.ts        # PDF preview hook
│   │   │   ├── useLookup.ts, useLookupOptions.ts # Lookup value hooks
│   │   │   └── ...
│   │   ├── context/
│   │   │   ├── AuthContext.tsx                # Auth provider, login, logout, refresh
│   │   │   └── ThemeContext.tsx               # Dark/light mode
│   │   └── lib/
│   │       ├── api.ts                        # apiFetch() — auto-refresh, 401 retry
│   │       ├── utils.ts                      # Format helpers
│   │       └── warranty.ts                   # Warranty calculations
│   └── ...
│
└── shared/                                   # (reserved for shared types if needed)
```

---

## 3. Database Models (Key Entities)

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│     Asset        │────>│   Assignment      │<────│   Personnel        │
│                 │  1:N│                  │ N:1 │                    │
│ - id (UUID)     │     │ - id (UUID)       │     │ - id (UUID)        │
│ - name          │     │ - assetId (FK)    │     │ - fullName         │
│ - type          │     │ - personnelId(FK) │     │ - designationId(FK)│
│ - serialNumber  │     │ - assignedAt      │     │ - projectId (FK)   │
│ - propertyNumber│     │ - returnedAt      │     │ - institutionId(FK)│
│ - status        │     │ - condition       │     │ - email, phone     │
│ - location      │     │ - conditionAtIssue│     │ - isReadyForIssuance│
│ - imageUrl      │     │ - returnCondition │     │ - status           │
│ - supplierId(FK)│     │ - accountabilityStatus   │ - personnelType    │
│ - purchasePrice │     │ - agreementDocumentId(FK) │                    │
│ - purchaseDate  │     │ - bulkBatchId     │     │ Relations:         │
│ - depreciation* │     │ - recipientSignedAt│     │  → Designation     │
│ - disposal*     │     │ - returnRemarks   │     │  → Project         │
│ - deletedAt     │     │                    │     │  → Institution     │
└─────────────────┘     └──────────────────┘     └────────────────────┘
       │ 1:N                                              │
       │                                                  │ N:1
       ├──────────────────┐                    ┌─────────────────────┐
       │                  │                    │  DesignationLookup   │
       ▼                  ▼                    │  ProjectLookup        │
┌─────────────────┐ ┌──────────────────┐     │  InstitutionLookup    │
│ MaintenanceLog  │ │MaintenanceSchedule│     └─────────────────────┘
│ - technician    │ │ - title           │
│ - description   │ │ - scheduledDate   │
│ - cost          │ │ - frequency       │
│ - date          │ │ - status          │
└─────────────────┘ └──────────────────┘

┌─────────────────────────┐     ┌────────────────────────┐
│  AgreementTemplate       │     │  AgreementDocument      │
│ - name                   │     │ - documentNumber (unique)│
│ - title                  │     │ - templateId (FK)       │
│ - content (HTML)         │     │ - templateVersionId     │
│ - headerLogo             │     │ - resolvedText (HTML)   │
│ - defaultPropertyOfficer │     │ - personnelId (FK)      │
│ - defaultAuthorizedRep   │     │ - assetSnapshot (JSON)  │
│ - currentVersion         │     │ - status (issued/returned│
│                          │     │   /pending_signature)   │
│                          │     │ - signatureHash (SHA-256)│
│                          │     │ - signedPdfPath         │
└─────────────────────────┘     └────────────────────────┘

┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ LookupValue │  │   Supplier   │  │ PurchaseReq  │  │   AuditLog   │
│ (Inventory) │  │ - name       │  │ - assetName  │  │ - action     │
│ ASSET_TYPE  │  │ - contact    │  │ - type       │  │ - entityType │
│ MANUFACTURER│  │ - email/phone│  │ - status     │  │ - entityId   │
│ LOCATION    │  │ - website     │  │ - reason     │  │ - metadata   │
│ ASSIGNED_TO │  │              │  │              │  │ - severity   │
└─────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

---

## 4. Asset Lifecycle Flow

### 4.1 Creation & Registration

```
Admin creates asset
        │
        ▼
  POST /api/assets
  ┌─────────────────────────────────────────┐
  │ Fields: name, type, serialNumber,       │
  │   propertyNumber, manufacturer, location,│
  │   purchasePrice, purchaseDate,           │
  │   warrantyExpiry, supplierId, imageUrl   │
  │ Status: AVAILABLE (default)              │
  └─────────────────────────────────────────┘
        │
        ▼
  Asset appears in /assets table
  Type/Manufacturer/Location come from LookupValue (ASSET_TYPE, MANUFACTURER, LOCATION)
```

**Files involved:**
- `server/src/routes/asset.routes.ts` → `POST /`
- `server/src/services/asset.service.ts` → `createAsset()`
- `client/src/pages/AssetsPage.tsx` → Add Asset modal
- `client/src/components/assets/AssetForm.tsx` → Form with lookup dropdowns
- `client/src/hooks/useLookup.ts` → Fetches dropdown options

### 4.2 Assignment (Issuance)

```
Admin selects personnel + assets
        │
        ▼
  POST /api/issuances (single asset)
  POST /api/issuances/bulk (batch: 1 Personnel → N Assets)
  ┌─────────────────────────────────────────┐
  │ Input: personnelId, assetIds[],          │
  │   agreementId (template), condition     │
  │                                         │
  │ Creates:                                │
  │  - Assignment rows (1 per asset)        │
  │  - AgreementDocument (1 per batch)       │
  │  - bulkBatchId groups the assignments   │
  │                                         │
  │ Asset status → ASSIGNED                │
  │ Assignment.accountabilityStatus:        │
  │   PENDING_SIGNATURE                    │
  └─────────────────────────────────────────┘
        │
        ▼
  Asset shows issued status in table
  AgreementDocument available for PDF preview
```

**Files involved:**
- `server/src/routes/issuance.routes.ts` → `POST /`, `POST /bulk`
- `server/src/services/issuance.service.ts` → `createIssuance()`, `bulkIssuance()`
- `client/src/pages/IssuancesPage.tsx` → Issue modal, batch UI
- `client/src/components/issuances/` → BatchIssueModal

### 4.3 Agreement Document & Signing

```
AgreementDocument created at issuance
        │
        ├─► GET /api/agreements/:id/preview  → PDF preview
        │   (server generates PDF via agreement.service.ts)
        │
        ├─► POST /api/issuances/:id/sign     → Recipient sign-off
        │   Input: { recipientSignatureName }
        │   Sets: recipientSignedAt, signatureMethod: "typed"
        │   Computes: signatureHash = SHA256(documentNumber|name|timestamp)
        │
        ├─► POST /api/agreements/:id/upload-signed  → Upload scanned PDF
        │   Sets: signedPdfPath, signedUploadedAt
        │
        └─► GET /api/agreements/verify/:documentNumber → Public verification
            Checks signatureHash integrity
```

**Files involved:**
- `server/src/routes/agreement.routes.ts` → Preview, verify, template CRUD
- `server/src/routes/issuance.routes.ts` → Sign-off endpoint
- `server/src/services/agreement.service.ts` → `generateAgreementPdf()`, template rendering
- `server/src/services/agreementDocumentRenderer.service.ts` → Variable substitution
- `client/src/pages/IssuancesPage.tsx` → VerifiedBadge, DocStatusBadge

### 4.4 Return

```
Admin returns asset(s) from personnel
        │
        ├─► Single return:
        │   POST /api/issuances/:id/return
        │   Input: { returnCondition, returnRemarks }
        │   Sets: returnedAt, returnCondition, conditionAtReturn
        │   Assignment.accountabilityStatus → RETURNED
        │   Asset.status → AVAILABLE
        │   Calls: checkAndCloseAgreementDocument()
        │
        └─► Bulk return:
            POST /api/issuances/bulk-return
            Input: { assignmentIds[], returnCondition, returnRemarks }
            Loops through each assignment
            Calls: checkAndCloseAgreementDocument()
```

**checkAndCloseAgreementDocument(agreementDocumentId):**
- Fetches all Assignments linked to that AgreementDocument
- If ALL assignments have `returnedAt` set → `AgreementDocument.status = 'returned'`
- If any still active → no change (stays `issued`)

**Files involved:**
- `server/src/routes/issuance.routes.ts` → `POST /:id/return`, `POST /bulk-return`
- `server/src/services/issuance.service.ts` → `returnIssuance()`, `bulkReturn()`, `checkAndCloseAgreementDocument()`

### 4.5 Disposal / Retirement

```
Admin disposes asset
        │
        ▼
  POST /api/assets/:id/dispose
  ┌─────────────────────────────────────────┐
  │ Input: { method: DONATED|SOLD|SCRAPPED│  │
  │          RETURNED_TO_VENDOR|OTHER,        │
  │          reason, disposalDate }            │
  │ Asset.status → RETIRED                    │
  │ Asset.disposalMethod, disposalReason,     │
  │   disposalDate set                         │
  └─────────────────────────────────────────┘
```

**Files involved:**
- `server/src/routes/asset.routes.ts` → `POST /:id/dispose`
- `server/src/services/asset.service.ts` → `disposeAsset()`

---

## 5. Lookup System (Inventory + Accountability)

The system has **two separate lookup systems**:

### 5.1 Inventory Lookups (`LookupValue` model)

Used for asset dropdown fields — stored in a single table with a `category` enum.

| Category | Used In | Example Values |
|---|---|---|
| `ASSET_TYPE` | Asset.type | Laptop, Printer, Monitor |
| `MANUFACTURER` | Asset.manufacturer | Dell, HP, Lenovo |
| `LOCATION` | Asset.location | Room 201, Server Room |
| `ASSIGNED_TO` | Asset.assignedTo | (legacy, now uses Personnel) |

**API:** `GET/POST/PATCH/DELETE /api/lookups/:category`  
**UI:** `/lookup` — InventoryLookupPage  
**Files:**
- `server/src/routes/lookup.routes.ts`
- `client/src/pages/InventoryLookupPage.tsx`

### 5.2 Accountability Lookups (Separate models)

Used for Personnel profile fields — each has its own table.

| Model | Personnel Field | Statuses |
|---|---|---|
| `DesignationLookup` | `personnel.designationId` | active, inactive |
| `InstitutionLookup` | `personnel.institutionId` | active, inactive |
| `ProjectLookup` | `personnel.projectId` | active, inactive, completed, archived |

**API:** `GET/POST/PATCH /api/lookup/accountability/designations|institutions|projects`  
**UI:** `/accountability-lookup` — AccountabilityLookupPage  
**Files:**
- `server/src/routes/accountabilityLookup.routes.ts`
- `client/src/pages/AccountabilityLookupPage.tsx`

**Deactivation guard (Phase 8-A):** When deactivating a lookup value that has active Personnel references, the API returns `409 { error: { details: { code: 'LOOKUP_IN_USE', affectedCount: N } } }`. The UI shows a confirmation dialog. Force-deactivate with `forceDeactivate: true` creates an audit log entry.

---

## 6. Maintenance Flow

```
┌──────────────────────────────────────────────┐
│  Maintenance Logs (ad-hoc, completed work)    │
│  ─────────────────────────────────────────    │
│  GET  /api/assets/:assetId/maintenance        │
│  POST /api/assets/:assetId/maintenance        │
│  PUT  /api/assets/:assetId/maintenance/:logId │
│  DEL  /api/assets/:assetId/maintenance/:logId │
│                                               │
│  Fields: technicianName, description,          │
│          cost, date                            │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  Maintenance Schedules (planned, recurring)   │
│  ─────────────────────────────────────────    │
│  GET    /api/assets/:id/schedules               │
│  POST   /api/assets/:id/schedules               │
│  PATCH  /api/assets/:id/schedules/:id/done      │
│  DEL    /api/assets/:id/schedules/:id            │
│                                               │
│  Fields: title, scheduledDate, frequency,     │
│          status (pending/completed), notes     │
│                                               │
│  GET /api/maintenance/upcoming                  │
│  GET /api/maintenance/calendar                  │
└──────────────────────────────────────────────┘
```

**UI:** `/maintenance-calendar` — MaintenanceCalendarPage (calendar view)  
**Files:**
- `server/src/routes/maintenance.routes.ts`
- `server/src/services/maintenance.service.ts`
- `client/src/pages/MaintenanceCalendarPage.tsx`

---

## 7. Accountability Agreement Document Lifecycle

```
AgreementTemplate (admin-defined)
    │
    │  POST /api/agreements (create/update template)
    │  POST /api/agreements/:id/versions (versioned content)
    │
    ▼
At issuance time:
    │
    │  POST /api/issuances/resolve-template
    │  (substitutes variables: {{recipientName}}, {{assetList}}, etc.)
    │
    ▼
AgreementDocument (immutable snapshot)
    │
    │  status: "issued" ──────────────────────┐
    │         (all assets still out)           │
    │                                         │
    │  Recipient sign-off:                    │
    │  POST /api/issuances/:id/sign           │
    │  status → "pending_signature"           │
    │  OR status stays "issued" if not signed │
    │                                         │
    │  When ALL assignments returned:          │
    │  checkAndCloseAgreementDocument()       │
    │  status → "returned"                   │
    │                                         │
    ▼                                         │
PDF Generation:                                │
    │  GET /api/agreements/:id/preview        │
    │  GET /api/agreements/:id/download        │
    │  - Renders resolved HTML → PDF via      │
    │    PDFKit with letterhead, signature    │
    │    block, verification URL footnote     │
    │                                         │
Verification:                                  │
    │  GET /api/agreements/verify/:docNumber │
    │  - Checks signatureHash integrity       │
    │─────────────────────────────────────────┘
```

**Files:**
- `server/src/services/agreement.service.ts` → `generateAgreementPdf()`
- `server/src/services/agreementDocumentRenderer.service.ts` → Variable substitution
- `server/src/routes/agreement.routes.ts` → Templates, preview, download, verify
- `client/src/pages/IssuancesPage.tsx` → DocStatusBadge, VerifiedBadge

---

## 8. Audit Trail

Every write operation is logged via `logAudit()` from `server/src/services/auditLog.service.ts`.

```
AuditLog record:
  - id, userId, action, entityType, entityId, metadata (JSON), ipAddress, createdAt

Audit enrichment (read side):
  - audit.service.ts enriches raw logs with:
    • assetName, serialNumber (resolved via FK)
    • summary (auto-generated from action + field changes)
    • severity (LOW, MEDIUM, HIGH — auto-classified)
    • module (INVENTORY, ACCOUNTABILITY, SYSTEM)
    • performedBy (user relation)

API: GET /api/audit (filterable, paginated, CSV export)
UI: /audit — AuditPage (rich timeline with filters, severity badges, module grouping)
```

---

## 9. Roles & Permissions

| Role | Access |
|---|---|
| `ADMIN` | Full system access, user management, force-deactivate lookups, delete assets |
| `STAFF_ADMIN` | Manage assets, issuances, personnel, lookups, maintenance |
| `STAFF` | View assets, issuances, maintenance logs (limited writes) |
| `GUEST` | Read-only via guest token links |

**Permission system:** `hasPermission('assets:create')`, `authorize(['ADMIN', 'STAFF_ADMIN'])`, `requireRole(['ADMIN'])`  
**Defined in:** `server/src/middleware/permissions.ts`, `client/src/components/auth/PermissionGate.tsx`

---

## 10. API Route Map (Inventory-Related)

| Method | Endpoint | Description |
|---|---|---|
| **Assets** | | |
| GET | `/api/assets` | List assets (paginated, filterable, soft-delete aware) |
| GET | `/api/assets/stats` | Dashboard summary stats |
| POST | `/api/assets` | Create asset (with optional image upload) |
| POST | `/api/assets/import` | Bulk CSV import |
| PATCH | `/api/assets/bulk-status` | Change status for multiple assets |
| DELETE | `/api/assets/bulk-delete` | Soft-delete multiple assets |
| POST | `/api/assets/bulk-assign` | Assign multiple assets |
| POST | `/api/assets/bulk-return` | Return multiple assets |
| POST | `/api/assets/bulk-update` | Update fields for multiple assets |
| GET | `/api/assets/:id` | Get single asset |
| PUT | `/api/assets/:id` | Update asset |
| DELETE | `/api/assets/:id` | Soft-delete asset |
| POST | `/api/assets/:id/image` | Upload asset image |
| POST | `/api/assets/:id/dispose` | Dispose/retire asset |
| GET | `/api/assets/:id/history` | Audit timeline for asset |
| **Issuances** | | |
| GET | `/api/issuances` | List issuances |
| GET | `/api/issuances/active/asset/:assetId` | Active issuance for an asset |
| POST | `/api/issuances` | Single issuance |
| POST | `/api/issuances/bulk` | Batch issuance (1 person → N assets) |
| POST | `/api/issuances/:id/return` | Single return |
| POST | `/api/issuances/bulk-return` | Bulk return |
| POST | `/api/issuances/:id/sign` | Recipient sign-off |
| POST | `/api/issuances/assets/lock` | Lock assets for pending issuance |
| POST | `/api/issuances/assets/release` | Release locked assets |
| GET | `/api/issuances/assets/available` | Available assets for issuance |
| GET | `/api/issuances/personnel/active` | Active personnel for dropdown |
| POST | `/api/issuances/agreement` | Create agreement document |
| POST | `/api/issuances/resolve-template` | Resolve template for preview |
| **Agreements** | | |
| GET | `/api/agreements` | List templates |
| POST | `/api/agreements` | Create template |
| GET | `/api/agreements/:id` | Get template |
| PATCH | `/api/agreements/:id` | Update template |
| DELETE | `/api/agreements/:id` | Delete template |
| POST | `/api/agreements/:id/versions` | Create version |
| GET | `/api/agreements/:id/versions` | List versions |
| GET | `/api/agreements/documents/:id/preview` | Preview document PDF |
| GET | `/api/agreements/documents/:id/download` | Download document PDF |
| POST | `/api/agreements/documents/:id/upload-signed` | Upload signed PDF |
| POST | `/api/agreements/:id/send-sign-request` | Send sign request email |
| GET | `/api/agreements/verify/:documentNumber` | Public verification endpoint |
| **Personnel** | | |
| GET | `/api/personnel` | List personnel (paginated, filterable) |
| POST | `/api/personnel` | Create personnel (ADMIN only) |
| PATCH | `/api/personnel/:id` | Update personnel (ADMIN only) |
| DELETE | `/api/personnel/:id` | Delete personnel (ADMIN only) |
| PATCH | `/api/personnel/:id/readiness` | Toggle isReadyForIssuance |
| GET | `/api/personnel/:id/accountability` | Accountability summary |
| **Lookups** | | |
| GET | `/api/lookups/:category` | List inventory lookup values |
| POST | `/api/lookups/:category` | Add value |
| PATCH | `/api/lookups/:category/:id` | Update value |
| GET | `/api/lookup/accountability/designations` | List designations |
| PATCH | `/api/lookup/accountability/designations/:id` | Update (with force-deactivate guard) |
| *(same for /institutions and /projects)* | | |
| **Maintenance** | | |
| GET | `/api/assets/:assetId/maintenance` | List maintenance logs |
| POST | `/api/assets/:assetId/maintenance` | Create log |
| PUT | `/api/assets/:assetId/maintenance/:logId` | Update log |
| DELETE | `/api/assets/:assetId/maintenance/:logId` | Delete log |
| GET | `/api/assets/:id/schedules` | List schedules |
| POST | `/api/assets/:id/schedules` | Create schedule |
| PATCH | `/api/assets/:id/schedules/:scheduleId/done` | Mark complete |
| DELETE | `/api/assets/:id/schedules/:scheduleId` | Delete schedule |
| GET | `/api/maintenance/upcoming` | Upcoming schedules |
| GET | `/api/maintenance/calendar` | Calendar data |
| **Accountability Report** | | |
| GET | `/api/accountability/report` | Report (JSON, CSV) |
| **Audit** | | |
| GET | `/api/audit` | Enriched audit trail |
| GET | `/api/audit/export` | CSV export |
| GET | `/api/audit/:entityId` | Entity timeline |

---

## 11. UI Navigation Map

```
Sidebar:
  │
  ├── INVENTORY
  │   ├── Dashboard (/)
  │   ├── Assets (/assets)
  │   ├── Maintenance (/maintenance-calendar)
  │   ├── Reports (/reports)
  │   └── Inventory Lookup (/lookup) [ADMIN, STAFF_ADMIN]
  │
  ├── ACCOUNTABILITY
  │   ├── Profiles (/profiles) [ADMIN, STAFF_ADMIN]
  │   ├── Issuances (/issuances) [ADMIN, STAFF_ADMIN]
  │   ├── Accountability Lookup (/accountability-lookup) [ADMIN, STAFF_ADMIN]
  │   ├── Agreement Templates (/accountability/templates) [ADMIN]
  │   └── Accountability Report (/accountability/report) [ADMIN]
  │
  └── SYSTEM
      └── Admin Hub (/settings)
          ├── User Management
          ├── Audit Trail (/audit)
          ├── Backups
          └── System Settings
```

---

## 12. Key Business Rules

1. **Soft delete only** — Assets are never hard-deleted. `deletedAt` timestamp marks removal; all queries filter `deletedAt: null`.

2. **AgreementDocument immutability** — When an agreement document is created, its `resolvedText` is a frozen snapshot. Template changes don't retroactively affect issued documents.

3. **AgreementDocument auto-close** — When all Assignments linked to an AgreementDocument have `returnedAt` set, the document status automatically becomes `'returned'` via `checkAndCloseAgreementDocument()`.

4. **Signature integrity** — Each sign-off computes `signatureHash = SHA256(documentNumber|recipientSignatureName|signedAt)`. The `/verify/:documentNumber` public endpoint checks this hash against stored data.

5. **Lookup deactivation guard** — Deactivating a DesignationLookup, InstitutionLookup, or ProjectLookup that has active Personnel references returns HTTP 409. The client shows a confirmation dialog. Force-deactivate with audit log.

6. **Bulk operations** — Assets support bulk status change, bulk delete, bulk assign, bulk return, and bulk update via dedicated endpoints.

7. **Property number uniqueness** — Each asset carries a `propertyNumber` string, typically assigned by the property clerk, used for physical tracking and agreement documents.

8. **Depreciation** — Assets support `straight_line` depreciation with `purchasePrice`, `usefulLifeYears`, and `salvageValue`. Computed on the frontend via `client/src/lib/warranty.ts` and `client/src/components/depreciation/`.

9. **PDF generation** — Agreement PDFs are generated server-side using PDFKit with DRDF letterhead, signature blocks, and a verification URL footnote (`APP_BASE_URL/api/agreements/verify/<documentNumber>`).