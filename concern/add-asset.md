# Add Asset — Full Stack Context Document

> How the "Add Asset" flow works end-to-end, from button click to database row and back.

---

## 1. User Flow Summary

1. User clicks **"Add Asset"** button on `AssetsPage` (header, orange button with `Plus` icon).
2. `AssetFormModal` opens in creation mode (`isEdit = false`).
3. User fills in fields (Name required, Type required, Price required, Purchase Date required for new).
4. Optional: User clicks **Sparkles** AI-suggest button next to Name to auto-fill Type & Manufacturer.
5. Optional: User uploads an image (triggers multipart/form-data submission).
6. On submit:
   - **No image** → `assetsApi.create(data)` → `POST /api/assets` with JSON body.
   - **With image** → `assetsApi.createWithImage(formData)` → `POST /api/assets` with `multipart/form-data` (field `image` + field `data` as JSON string).
7. Backend validates via Zod schema (`createAssetSchema`), calls `assetService.createAsset()`.
8. If image attached, multer processes it → saved to `server/uploads/<uuid>.<ext>` → `imageUrl` updated on asset.
9. Audit log entry created (`action: CREATE`).
10. Frontend calls `refetch()` → `useAssets` hook re-fetches the paginated list → new asset appears in the table.

---

## 2. Frontend — File Map

### 2.1 Page Component

| File | Purpose |
|------|---------|
| `client/src/pages/AssetsPage.tsx` | Main assets list page. Manages state for modals, KPI tiles, filters, selection, bulk actions. Contains `handleCreate()` which calls `assetsApi.create()` or `assetsApi.createWithImage()`. |

### 2.2 Form Modal

| File | Purpose |
|------|---------|
| `client/src/components/assets/AssetFormModal.tsx` | The add/edit asset form. Handles form state, image upload preview, AI suggest, validation, submission. Dual-mode: create vs edit. |
| `client/src/components/assets/index.ts` | Barrel export for all asset components. |

### 2.3 Data Hook & API Layer

| File | Purpose |
|------|---------|
| `client/src/hooks/useAssets.ts` | React hook wrapping `assetsApi.list()`. Manages `assets`, `loading`, `error`, `meta` (pagination), `filters`, `setFilters`, `refetch`. Uses `useDebounce` for search. |
| `client/src/hooks/useDebounce.ts` | Generic debounce hook (300ms default). Used by `useAssets` for search input. |
| `client/src/hooks/useLookupOptions.ts` | Fetches dropdown options from `GET /api/lookups/:category`. Used for Type, Manufacturer, Location, Assigned To selects. |
| `client/src/lib/api.ts` (lines 187–286) | `Asset` interface, `AssetFilters` interface, `assetsApi` object with `create()`, `createWithImage()`, `list()`, `update()`, `updateWithImage()`, `delete()`, `bulkStatus()`, `bulkDelete()`, etc. |

### 2.4 Supporting Components (not directly in add flow, but on same page)

| File | Purpose |
|------|---------|
| `client/src/components/assets/AssetTable.tsx` | Renders the asset data table. |
| `client/src/components/assets/AssetDetailModal.tsx` | Read-only detail view for a single asset. |
| `client/src/components/assets/AssetFilterSidebar.tsx` | (Legacy filter sidebar — currently filters are inline in header). |
| `client/src/components/assets/ImportAssetsModal.tsx` | CSV bulk import modal. |
| `client/src/components/assets/DisposeAssetModal.tsx` | Asset disposal modal. |

---

## 3. Frontend — AssetFormModal Detailed

### 3.1 Form Fields

| # | Field | Type | Required | Source |
|---|-------|------|----------|--------|
| 1 | **Image** | File upload (`accept="image/*"`) | No | Local state `imageFile` → sent as multipart |
| 2 | **Name** | Text input | **Yes** | `form.name` |
| 3 | **Type** | Select dropdown | **Yes** | `useLookupOptions('asset-types')` |
| 4 | **Manufacturer** | Select dropdown | No | `useLookupOptions('manufacturers')` |
| 5 | **Serial Number** | Text input | No | `form.serialNumber` |
| 6 | **Price** | Number input (₱ prefix) | **Yes** | `form.purchasePrice` |
| 7 | **Purchase Date** | Date input | **Yes (create only)** | `form.purchaseDate` |
| 8 | **Assigned To** | Select dropdown | No | `useLookupOptions('assigned-to')` — *deprecated category, kept for legacy data* |
| 9 | **Property #** | Text input | No | `form.propertyNumber` |
| 10 | **Location** | Select dropdown | No | `useLookupOptions('locations')` |
| 11 | **Status** | Select (AVAILABLE, ASSIGNED, MAINTENANCE, RETIRED, LOST) | **Yes** | `form.status`, default `AVAILABLE` |
| 12 | **Remarks** | Textarea | No | `form.remarks` |
| 13 | **Warranty Expiry** | Date input | No | `form.warrantyExpiry` |
| 14 | **Warranty Notes** | Text input | No | `form.warrantyNotes` |

### 3.2 AI Suggest (Sparkles button)

- Calls `POST /api/ai/suggest` with `{ assetName: form.name }`.
- On success, auto-fills `type` and `manufacturer` from `data.suggestions[0]`.
- Button disabled when name is empty or request is in flight.

### 3.3 Image Upload Logic

1. `imageFile` state holds the `File` object.
2. `imagePreview` shows a preview via `URL.createObjectURL()`.
3. On submit:
   - If `imageFile` is set → build `FormData` with `image` (file) + `data` (JSON string of form fields).
   - If no image → send plain JSON to `assetsApi.create(data)`.

### 3.4 Lookup Dropdowns (useLookupOptions)

Each dropdown (Type, Manufacturer, Location, Assigned To) uses:
```
GET /api/lookups/{category}
```
Where category maps:
- `asset-types` → `ASSET_TYPE`
- `manufacturers` → `MANUFACTURER`
- `locations` → `LOCATION`
- `assigned-to` → `ASSIGNED_TO` (deprecated)

Returns: `{ success: true, data: LookupValue[] }` where each item has `{ id, value, isActive }`.

The `mergeWithFallback()` helper ensures that if a saved value is from an inactive lookup, it still appears in the dropdown with an "(inactive)" label.

---

## 4. Backend — File Map

### 4.1 Route Handler

| File | Purpose |
|------|---------|
| `server/src/routes/asset.routes.ts` | Express router mounted at `/api/assets`. Contains all asset endpoints including POST `/` (create). |

**Create endpoint** (lines 85–111):
```typescript
router.post('/', hasPermission('assets:create'), upload.single('image'), async (req, res) => {
  // If multipart: parse req.body.data as JSON
  // Validate with createAssetSchema
  // Call assetService.createAsset()
  // If image: rename file, update imageUrl on asset
  // Return 201 with asset
});
```

### 4.2 Validation Schema

| File | Purpose |
|------|---------|
| `server/src/routes/asset.schema.ts` | Zod schemas for request validation. |

**createAssetSchema**:
```typescript
{
  name: z.string().min(1),           // Required
  type: z.string().min(1),           // Required
  manufacturer: z.string().optional(),
  serialNumber: z.string().optional(),
  purchasePrice: z.coerce.number().nonnegative().optional(),
  purchaseDate: z.string().optional().transform(v => v ? new Date(v).toISOString() : undefined),
  status: z.enum([...]).default('AVAILABLE'),
  location: z.string().optional(),
  assignedTo: z.string().optional(),
  propertyNumber: z.string().optional(),
  remarks: z.string().optional(),
  warrantyExpiry: z.string().optional().nullable(),
  warrantyNotes: z.string().max(500).optional().nullable(),
}
```

### 4.3 Service Layer

| File | Purpose |
|------|---------|
| `server/src/services/asset.service.ts` | Business logic for CRUD, search, pagination, disposal, stats. |

**`createAsset(data, performedById, ipAddress, userAgent)`** (lines 122–143):
1. Calls `cleanWarrantyFields()` — converts empty warranty strings to `null`, parses dates.
2. `prisma.asset.create({ data: cleaned })`.
3. Audit log: `action: CREATE`, `severity: LOW`, full data logged.

### 4.4 Database Model

| File | Purpose |
|------|---------|
| `server/prisma/schema.prisma` | Prisma schema defining the `Asset` model. |

**Asset model fields** (relevant to creation):
```prisma
model Asset {
  id               String        @id @default(uuid())
  name             String                              // Required
  type             String        @default("Other")     // Required, defaults to "Other"
  manufacturer     String?                             // Optional
  serialNumber     String?       @unique               // Optional, must be unique if set
  purchasePrice    Decimal?                            // Optional, stored as Decimal
  purchaseDate     DateTime?                           // Optional
  depreciationMethod String?      @default("straight_line")
  usefulLifeYears   Int?         @default(5)
  salvageValue      Decimal?     @default(0)
  status           AssetStatus   @default(AVAILABLE)
  location         String?                             // Optional
  imageUrl         String?                             // Set after image upload
  propertyNumber   String?                             // Optional
  remarks          String?                             // Optional
  assignedTo       String?                             // Optional
  warrantyExpiry   DateTime?                           // Optional
  warrantyNotes    String?                             // Optional
  deletedAt        DateTime?                           // Soft delete timestamp
  disposalReason   String?       @db.Text              // Disposal
  disposalDate     DateTime?                           // Disposal
  disposalMethod   DisposalMethod?                     // Disposal
  supplierId       String?                             // Supplier relation
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
  // ... relations
  @@map("assets")
}

enum AssetStatus {
  AVAILABLE
  PENDING_ASSIGNMENT
  ASSIGNED
  MAINTENANCE
  RETIRED
  LOST
}
```

### 4.5 Middleware

| Middleware | Purpose |
|-----------|---------|
| `authenticate` (from `server/src/middleware/auth.ts`) | JWT Bearer token validation, sets `req.user`. |
| `hasPermission('assets:create')` (from `server/src/middleware/permissions.ts`) | Checks `req.user.permissions` includes `'assets:create'`. ADMIN gets all permissions; others must have explicit perm. |
| `upload.single('image')` (multer) | Processes multipart file uploads. Saves to `server/uploads/`, max 5MB, images only. |

### 4.6 Audit Logging

| File | Purpose |
|------|---------|
| `server/src/services/auditLog.service.ts` | `logAudit()` writes to `AuditLog` table via Prisma. |

Called with:
```typescript
{
  userId: performedById,
  action: 'CREATE',
  entityType: 'Asset',
  entityId: asset.id,
  ipAddress,
  metadata: {
    userAgent,
    field: '*',
    oldValue: null,
    newValue: JSON.stringify(data),
    severity: 'LOW',
    summary: generateSummary({ action: 'CREATE', entityType: 'Asset', assetName }),
  }
}
```

---

## 5. Lookup Values System

The Type, Manufacturer, and Location dropdowns in AssetFormModal are populated from the `LookupValue` table via:

| Endpoint | Maps to |
|----------|---------|
| `GET /api/lookups/asset-types` | `LookupCategory.ASSET_TYPE` |
| `GET /api/lookups/manufacturers` | `LookupCategory.MANUFACTURER` |
| `GET /api/lookups/locations` | `LookupCategory.LOCATION` |

| File | Purpose |
|------|---------|
| `server/src/routes/lookup.routes.ts` | CRUD for lookup values. Returns only `isActive: true` items by default. |

---

## 6. CSV Import (Bulk Add)

An alternative path for adding assets:

| File | Purpose |
|------|---------|
| `client/src/components/assets/ImportAssetsModal.tsx` | CSV upload modal. User uploads a `.csv` file. |
| `POST /api/assets/import` | Parses CSV, validates each row, creates assets in batch. Returns `{ imported, skipped, warnings, results }`. |

CSV columns expected: `name`, `serialNumber`, `propertyNumber` (required), `type`, `manufacturer`, `status`, `price`, `purchaseDate`, `assignedTo`, `location`, `remarks`, `warrantyExpiry`, `warrantyNotes`.

---

## 7. Request/Response Flow

### 7.1 Create Without Image

```
POST /api/assets
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "name": "Dell Latitude 5540",
  "type": "Laptop",
  "manufacturer": "Dell",
  "purchasePrice": 45000,
  "purchaseDate": "2025-01-15T00:00:00.000Z",
  "status": "AVAILABLE",
  "serialNumber": "SN-12345",
  "propertyNumber": "PROP-00123",
  "location": "2F Palma Hall",
  "warrantyExpiry": "2028-01-15T00:00:00.000Z",
  "warrantyNotes": "3-year on-site"
}
```

Response (201):
```json
{
  "success": true,
  "data": { "id": "...", "name": "Dell Latitude 5540", ... },
  "error": null,
  "meta": null
}
```

### 7.2 Create With Image

```
POST /api/assets
Authorization: Bearer <JWT>
Content-Type: multipart/form-data

Fields:
  image: <file binary>
  data: '{"name":"Dell Latitude 5540","type":"Laptop",...}'
```

The backend:
1. Multer stores the file to `server/uploads/<random-name>`.
2. `assetService.createAsset()` creates the asset (without imageUrl).
3. Post-create: renames file to `<asset.id>.<ext>`, updates `imageUrl` to `/uploads/<asset.id>.<ext>`.

---

## 8. Error Handling

| Scenario | HTTP Code | Response |
|----------|-----------|----------|
| Missing required field (name, type) | 400 | `{ success: false, error: { message: "..." } }` |
| Duplicate serialNumber | 400 | Zod/prisma error |
| Unauthorized (no token) | 401 | Auth middleware |
| Forbidden (no `assets:create` perm) | 403 | Permission middleware |
| File too large (>5MB) | 400 | Multer limit |
| Non-image file | 400 | Multer fileFilter |

---

## 9. Key Technical Details

- **Image URL handling**: Dev mode uses Vite proxy (`/uploads → localhost:3001`). Production uses `/aio-system/uploads/` prefix. The `getImageUrl()` helper in AssetFormModal handles this.
- **Warranty fields**: Empty strings are converted to `null` by `cleanWarrantyFields()` in the service layer. Dates are parsed from ISO strings.
- **Audit severity**: CREATE actions log as `LOW`, UPDATE and DELETE log as `MEDIUM`/`HIGH` depending on the field changed.
- **Soft delete**: Assets are never hard-deleted. `DELETE /api/assets/:id` sets `deletedAt` and `status = RETIRED`. All queries filter by `deletedAt: null`.
- **Guest filtering**: `GET /api/assets` applies `filterAssetsForGuest()` when `req.user.role === 'GUEST'` to strip sensitive fields.

---

## 10. Complete File Map

```
aio-system/
├── client/src/
│   ├── pages/
│   │   └── AssetsPage.tsx                 # Main page: KPI, filters, table, modals
│   ├── components/assets/
│   │   ├── index.ts                       # Barrel exports
│   │   ├── AssetFormModal.tsx             # Add/Edit form modal (390 lines)
│   │   ├── AssetTable.tsx                 # Data table component
│   │   ├── AssetDetailModal.tsx           # Read-only detail view
│   │   ├── AssetFilterSidebar.tsx         # (Legacy) filter sidebar
│   │   ├── ImportAssetsModal.tsx          # CSV import modal
│   │   ├── DisposeAssetModal.tsx          # Disposal modal
│   │   ├── BulkActionModal.tsx             # Bulk status/assign/delete modal
│   │   └── FilterPresetManager.tsx         # Filter preset save/load
│   ├── hooks/
│   │   ├── useAssets.ts                   # Data hook: fetch, filter, paginate
│   │   ├── useDebounce.ts                 # Generic debounce (300ms)
│   │   └── useLookupOptions.ts            # Fetch dropdown options from /api/lookups
│   ├── lib/
│   │   └── api.ts                         # API client: Asset interface, assetsApi object
│   └── components/auth/
│       └── PermissionGate.tsx             # Hides "Add Asset" button if no assets:create perm
│
├── server/src/
│   ├── routes/
│   │   ├── asset.routes.ts                # POST /api/assets (create + image upload)
│   │   ├── asset.schema.ts                # Zod: createAssetSchema, updateAssetSchema, etc.
│   │   ├── lookup.routes.ts               # GET /api/lookups/:category
│   │   └── ai.routes.ts                   # POST /api/ai/suggest (AI auto-fill)
│   ├── services/
│   │   ├── asset.service.ts               # createAsset(), listAssets(), etc.
│   │   ├── auditLog.service.ts            # logAudit() helper
│   │   └── ai.service.ts                  # AI suggest backend
│   ├── middleware/
│   │   ├── auth.ts                         # authenticate, authorize, hasPermission
│   │   └── permissions.ts                  # PERMISSION_KEYS, DEFAULT_PERMISSIONS
│   └── lib/
│       └── prisma.ts                       # Prisma client singleton
│
├── server/prisma/
│   └── schema.prisma                       # Asset model, AssetStatus enum, LookupValue
│
└── server/uploads/                         # Image storage directory
```