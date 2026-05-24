# AIO-System — Add Asset Flow Improvement Prompts
> Generated: 2026-05-22
> Module: Add Asset (`AssetFormModal` + `POST /api/assets`)
> Format: OpenClaw two-block prompt structure (Global Context + Phase block)

---

## Already Covered by Previous Prompt Sets

The following gaps from this module were already addressed in earlier
improvement prompt batches and do NOT need to be re-prompted:

| Gap | Covered In |
|---|---|
| CSV import validation report | Inventory Improvements — Phase 7-A and 7-B |
| Disposal pre-check guard | Inventory Improvements — Phase 3-A and 3-B |
| Warranty expiry alerts | Inventory Improvements — Phase 6-A and 6-B |

---

## Improvement 1: Remove ASSIGNED_TO from AssetFormModal

> **Note:** Inventory Improvement 8 hid ASSIGNED_TO from InventoryLookupPage
> but did NOT remove the deprecated "Assigned To" dropdown from AssetFormModal.
> This prompt closes that remaining gap.

### Phase 1 — Remove deprecated Assigned To field from asset form

```
=== GLOBAL CONTEXT ===
Project: AIO-System (All-In-One Office Asset Inventory System)
Repo: /home/reggie/.hermes/workspace/aio-system
Stack: Node.js / TypeScript / Express / Prisma ORM / PostgreSQL
Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
Monorepo workspaces: server, client, shared
Full-file output is required. No partial snippets.

=== PHASE 1: Remove ASSIGNED_TO deprecated field from AssetFormModal ===

PROBLEM STATEMENT:
AssetFormModal.tsx has an "Assigned To" dropdown (field #8) that calls
useLookupOptions('assigned-to') which maps to the ASSIGNED_TO lookup
category. This category is deprecated — the system now uses Personnel
profiles and Issuances for assignment tracking. The dropdown still appears
in both the Add Asset and Edit Asset forms, creating confusion for admins
who may try to use it and produce inconsistent data.

A previous prompt (Inventory Improvement 8) hid ASSIGNED_TO from the
InventoryLookupPage and the backend returns 410 for that category.
This prompt removes the field from the form itself.

SOLUTION REQUIREMENTS:
1. In client/src/components/assets/AssetFormModal.tsx:
   - Remove the "Assigned To" Select dropdown (field #8) entirely from
     both the create and edit form layouts.
   - Remove the useLookupOptions('assigned-to') call if it is used
     exclusively for this field. If used elsewhere in the file, keep it.
   - Remove assignedTo from the form state initialization and
     form reset logic.
   - Remove assignedTo from the submit payload construction.
   Full file output required.

2. In client/src/lib/api.ts:
   - Remove assignedTo from the Asset interface if it is present.
   - Remove assignedTo from the assetsApi.create() and assetsApi.update()
     payload types if explicitly typed.
   Full file output required only if Asset interface is changed.

3. DO NOT remove assignedTo from:
   - server/prisma/schema.prisma (field stays for historical data)
   - server/src/routes/asset.schema.ts (optional field, harmless to keep)
   - GET /api/assets response (existing assets may have assignedTo data)
   - AssetDetailModal.tsx read-only view (historical data should still
     be visible if it exists on an asset)

4. In AssetDetailModal.tsx, if assignedTo is displayed:
   - Keep it visible but add a small note next to the label:
     "(legacy)" in muted text, so admins know it is a deprecated field.
   Full file output required only if this component is changed.

VERIFICATION AFTER THIS PHASE:
Open Add Asset modal → confirm no "Assigned To" field appears.
Open Edit Asset modal for a legacy asset that has assignedTo set →
  confirm no "Assigned To" editable field (form cannot overwrite it).
Open Asset Detail modal for a legacy asset with assignedTo set →
  confirm the value is still visible with "(legacy)" label.
Submit new asset creation → confirm payload does not include assignedTo.
npm run build --workspace=client → confirm clean build, no unused import warnings.
```

---

## Improvement 2: Friendly Duplicate Serial Number Error

### Phase 2 — Map duplicate serial error to field-level feedback

```
=== GLOBAL CONTEXT ===
Project: AIO-System (All-In-One Office Asset Inventory System)
Repo: /home/reggie/.hermes/workspace/aio-system
Stack: Node.js / TypeScript / Express / Prisma ORM / PostgreSQL
Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
Monorepo workspaces: server, client, shared
Full-file output is required. No partial snippets.

=== PHASE 2: Return friendly error for duplicate serialNumber on asset create/update ===

PROBLEM STATEMENT:
The Asset model has serialNumber as @unique. When a duplicate serial
number is submitted via POST /api/assets or PUT /api/assets/:id, the
backend returns a raw Prisma error (P2002 unique constraint violation)
which the frontend receives as a generic 400/500 error and shows as a
plain error toast. The admin has no indication of which field caused
the error or what to fix.

SOLUTION REQUIREMENTS:
1. In server/src/routes/asset.routes.ts:
   - In the POST / (create) and PUT /:id (update) handlers, wrap the
     service call in a try/catch that intercepts Prisma P2002 errors:

     import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

     catch (error) {
       if (error instanceof PrismaClientKnownRequestError
           && error.code === 'P2002') {
         const field = (error.meta?.target as string[])?.includes('serialNumber')
           ? 'serialNumber'
           : 'unknown'
         return res.status(409).json({
           success: false,
           error: {
             message: 'A unique field value already exists.',
             field,
             code: 'DUPLICATE_FIELD'
           }
         })
       }
       throw error  // re-throw unknown errors to global handler
     }

   - Apply the same catch pattern to both create and update handlers.
   Full file output required.

2. In server/src/services/asset.service.ts:
   - If createAsset() or updateAsset() also contain try/catch blocks
     that swallow Prisma errors, ensure P2002 errors are NOT caught
     there — let them propagate to the route handler where they are
     handled uniformly.
   Full file output required only if the service swallows these errors.

3. In client/src/components/assets/AssetFormModal.tsx:
   - After submitting, check the error response for:
     { success: false, error: { code: 'DUPLICATE_FIELD', field: 'serialNumber' } }
   - If matched, set a field-level error on the Serial Number input:
       serialNumberError: 'This serial number already exists in the system.'
   - Display the error message below the Serial Number input field
     in red (#7B1113), matching the style of other field errors in the form.
   - Do not show a generic toast for this specific error — the
     inline field error is sufficient.
   Full file output required.

VERIFICATION AFTER THIS PHASE:
Create an asset with serialNumber: "SN-DUPE-001".
Attempt to create a second asset with the same serial number.
Confirm response is HTTP 409 with code: DUPLICATE_FIELD.
Confirm AssetFormModal shows "This serial number already exists in the system."
  below the Serial Number field in red.
Confirm no generic error toast appears.
Edit an existing asset and change its serial number to match another asset.
Confirm same inline error appears in edit mode.
```

---

## Improvement 3: Align purchasePrice Required Between UI and Schema

### Phase 3 — Enforce purchasePrice as required in backend schema

```
=== GLOBAL CONTEXT ===
Project: AIO-System (All-In-One Office Asset Inventory System)
Repo: /home/reggie/.hermes/workspace/aio-system
Stack: Node.js / TypeScript / Express / Prisma ORM / PostgreSQL
Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
Monorepo workspaces: server, client, shared
Full-file output is required. No partial snippets.

=== PHASE 3: Align purchasePrice required constraint between frontend and backend ===

PROBLEM STATEMENT:
AssetFormModal marks purchasePrice (Price) as a required field for new
asset creation. However, createAssetSchema in asset.schema.ts has:
  purchasePrice: z.coerce.number().nonnegative().optional()
This means the backend silently accepts asset creation with no purchase
price when called directly via API, bypassing the frontend enforcement.
An asset without purchasePrice breaks depreciation calculations which
depend on this value (depreciationMethod uses purchasePrice, usefulLifeYears,
salvageValue). The schema must match what the form enforces.

SOLUTION REQUIREMENTS:
1. In server/src/routes/asset.schema.ts:
   - Update createAssetSchema:
     purchasePrice: z.coerce.number({
       required_error: 'Purchase price is required.',
       invalid_type_error: 'Purchase price must be a number.'
     }).nonnegative('Purchase price cannot be negative.')
     // Remove .optional()

   - purchaseDate should also be required for creation. Update:
     purchaseDate: z.string({
       required_error: 'Purchase date is required.'
     }).min(1, 'Purchase date is required.')
     .transform(v => new Date(v).toISOString())
     // Remove .optional()

   - updateAssetSchema: keep purchasePrice and purchaseDate as optional
     (partial updates should not require re-sending these fields).

   Full file output required.

2. In server/src/services/asset.service.ts:
   - Confirm createAsset() does not have a fallback that silently
     substitutes a default price (e.g. 0) when purchasePrice is missing.
     If it does, remove the fallback — the schema validation will
     catch missing prices before the service is called.
   Full file output required only if a fallback exists.

3. In client/src/components/assets/AssetFormModal.tsx:
   - Confirm the client-side validation for purchasePrice and purchaseDate
     shows clear required errors:
       "Purchase price is required."
       "Purchase date is required."
     before the form is submitted.
   - These validations likely already exist since the fields are marked
     required in the form. Verify and align the error messages with
     the backend schema messages.
   Full file output required only if error messages need updating.

VERIFICATION AFTER THIS PHASE:
POST /api/assets with no purchasePrice field → confirm 400 with
  "Purchase price is required."
POST /api/assets with purchasePrice: -100 → confirm 400 with
  "Purchase price cannot be negative."
POST /api/assets with no purchaseDate → confirm 400 with
  "Purchase date is required."
POST /api/assets with all required fields → confirm 201 success.
PUT /api/assets/:id with no purchasePrice → confirm update succeeds
  (update schema still optional).
```

---

## Improvement 4: Add Depreciation Fields to Add Asset Form

### Phase 4 — Add usefulLifeYears and salvageValue to AssetFormModal

```
=== GLOBAL CONTEXT ===
Project: AIO-System (All-In-One Office Asset Inventory System)
Repo: /home/reggie/.hermes/workspace/aio-system
Stack: Node.js / TypeScript / Express / Prisma ORM / PostgreSQL
Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
Monorepo workspaces: server, client, shared
Full-file output is required. No partial snippets.

=== PHASE 4: Add depreciation fields to AssetFormModal ===

PROBLEM STATEMENT:
The Asset model has depreciationMethod (default: straight_line),
usefulLifeYears (default: 5), and salvageValue (default: 0). None of
these fields appear in AssetFormModal. An admin registering a high-value
asset (e.g. a ₱150,000 server or camera) must accept the defaults and
then edit the asset afterward to correct them — if they even know to do
it. Depreciation calculations are wrong until corrected, which means
the dashboard and Reports page show incorrect asset values from day one.

SOLUTION REQUIREMENTS:
1. In client/src/components/assets/AssetFormModal.tsx:
   - Add a collapsible "Depreciation Settings" section at the bottom
     of the form, below Warranty fields and above the submit button.
   - Collapsed by default (toggle with a ChevronDown/ChevronUp icon).
   - Label: "Depreciation Settings" with a small info note:
     "These values are used to calculate the asset's book value over time."
   - Fields inside the section:
     A. Depreciation Method — Select dropdown:
          Options: Straight Line (value: straight_line)
          Default: straight_line
          (Only one method is implemented — show one option for now,
          leave room for future methods)
     B. Useful Life (Years) — Number input:
          Min: 1, Max: 50, default: 5
          Label: "Useful Life (Years)"
          Helper text: "How many years is this asset expected to last?"
     C. Salvage Value (₱) — Number input with ₱ prefix:
          Min: 0, default: 0
          Label: "Salvage Value (₱)"
          Helper text: "Estimated resale/scrap value at end of useful life."
   - Include these fields in the form state initialization with defaults:
       depreciationMethod: 'straight_line'
       usefulLifeYears: 5
       salvageValue: 0
   - Include in the submit payload for both create and update.
   Full file output required.

2. In server/src/routes/asset.schema.ts:
   - Add to createAssetSchema and updateAssetSchema:
     depreciationMethod: z.string().optional().default('straight_line'),
     usefulLifeYears: z.coerce.number().int().min(1).max(50).optional().default(5),
     salvageValue: z.coerce.number().nonnegative().optional().default(0),
   Full file output required.

3. Confirm server/src/services/asset.service.ts createAsset() passes
   these fields through to prisma.asset.create(). They are already on
   the schema model so no migration is needed.
   Full file output required only if the service strips these fields.

LAYOUT ASCII:
┌─────────────────────────────────────────────────────────┐
│ [Warranty Expiry]          [Warranty Notes]             │
├─────────────────────────────────────────────────────────┤
│ ▼ Depreciation Settings                         [ChevronDown] │
│   Depreciation Method: [Straight Line ▾]                │
│   Useful Life (Years): [5          ]                    │
│   Salvage Value (₱):   [0          ]                    │
│   "These values calculate the asset's book value."      │
├─────────────────────────────────────────────────────────┤
│                             [Cancel]  [Save Asset]      │
└─────────────────────────────────────────────────────────┘

BRAND/STYLE:
- Navy: #012061, Orange: #f8931f.
- Section header uses a thin navy left border accent.
- Helper text in muted gray text-sm.
- Collapsible toggle uses ChevronDown/ChevronUp from lucide-react.
- Confirm icon imports are present.

VERIFICATION AFTER THIS PHASE:
Open Add Asset modal → confirm "Depreciation Settings" section is collapsed.
Click to expand → confirm Depreciation Method, Useful Life, Salvage Value appear.
Change Useful Life to 3 and Salvage Value to 5000.
Submit → confirm asset is created with usefulLifeYears: 3, salvageValue: 5000.
Open the asset in detail view → confirm values are shown.
Edit the asset → confirm depreciation fields are pre-filled with saved values.
```

---

## Improvement 5: Add Supplier Dropdown to Add Asset Form

### Phase 5 — Add supplierId field to AssetFormModal

```
=== GLOBAL CONTEXT ===
Project: AIO-System (All-In-One Office Asset Inventory System)
Repo: /home/reggie/.hermes/workspace/aio-system
Stack: Node.js / TypeScript / Express / Prisma ORM / PostgreSQL
Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
Monorepo workspaces: server, client, shared
Full-file output is required. No partial snippets.

=== PHASE 5: Add Supplier field to AssetFormModal ===

PROBLEM STATEMENT:
The Asset model has a supplierId (FK to Supplier) but AssetFormModal
has no Supplier field. An admin registering a newly purchased asset from
a specific vendor must: create the asset → then go to Edit to link the
supplier. This two-step process is unnecessary friction and means assets
are created without supplier data, which matters for warranty claims and
reordering. The supplier link should be available at creation time.

SOLUTION REQUIREMENTS:
1. In client/src/components/assets/AssetFormModal.tsx:
   - Add a "Supplier" Select dropdown in the form, placed between
     Purchase Date and Property Number fields.
   - Label: "Supplier" (optional field).
   - Fetches supplier list from GET /api/suppliers on modal open.
     Response shape: { success: true, data: [{ id, name }] }
   - Dropdown options: one option per supplier showing supplier.name.
     Include a blank/none option: "— None —" (value: empty string / null).
   - Add supplierId to form state, default: null.
   - Include supplierId in the submit payload (null if not selected).
   - In edit mode, pre-fill supplierId from existing asset.supplierId.
   Full file output required.

2. The supplier fetch should:
   - Be called once when the modal opens (useEffect on isOpen).
   - Use the existing apiFetch() or assetsApi pattern — do NOT use a
     new axios instance or separate fetch pattern.
   - Store in local state: suppliers: Supplier[], suppliersLoading: boolean.
   - Show a loading placeholder in the dropdown while fetching.
   - If the fetch fails, show the dropdown as empty with a note:
     "Could not load suppliers." — do not block form submission.

3. In server/src/routes/asset.schema.ts:
   - Add to createAssetSchema and updateAssetSchema:
     supplierId: z.string().uuid().optional().nullable()
   Full file output required.

4. Confirm server/src/services/asset.service.ts createAsset() and
   updateAsset() pass supplierId through to Prisma. It is already on
   the Asset model so no migration is needed.
   Full file output required only if the service strips this field.

5. In AssetDetailModal.tsx:
   - If supplier is already joined and shown in the detail view, no
     change needed. If supplierId is shown as a raw UUID, join the
     supplier name instead:
     Include supplier: { select: { name: true } } in the Prisma query
     that fetches the asset for the detail view.
   Full file output required only if detail view is changed.

VERIFICATION AFTER THIS PHASE:
Open Add Asset modal → confirm Supplier dropdown appears between
Purchase Date and Property Number.
Confirm dropdown is populated with suppliers from GET /api/suppliers.
Select a supplier and submit → confirm asset.supplierId is set in DB.
Open the asset in Detail modal → confirm supplier name is shown.
Edit the asset → confirm supplier dropdown is pre-filled.
Submit with no supplier selected → confirm supplierId is null (not an error).
```

---

## Improvement 6: Clean Up Orphaned Image Files on Replace

### Phase 6 — Delete old image file when asset image is replaced

```
=== GLOBAL CONTEXT ===
Project: AIO-System (All-In-One Office Asset Inventory System)
Repo: /home/reggie/.hermes/workspace/aio-system
Stack: Node.js / TypeScript / Express / Prisma ORM / PostgreSQL
Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
Monorepo workspaces: server, client, shared
Full-file output is required. No partial snippets.

=== PHASE 6: Delete old image file from disk when asset image is replaced ===

PROBLEM STATEMENT:
When an admin edits an asset and uploads a new image, the backend:
1. Saves the new file to server/uploads/<asset.id>.<ext>
2. Updates imageUrl on the Asset record.
The old file (if it had a different extension, e.g. .jpg replaced by .png)
is never deleted. Over time, orphaned image files accumulate on disk.
For the same extension, the file is overwritten — but mixed-extension
replacements leave orphan files permanently.

SOLUTION REQUIREMENTS:
1. In server/src/routes/asset.routes.ts, in the PUT /:id handler
   (update with image), before saving the new image file:
   a. Fetch the existing asset to get its current imageUrl.
   b. If imageUrl is set, extract the filename from the URL path.
   c. Build the full path: path.join(__dirname, '../../uploads', filename)
   d. Check if the file exists using fs.existsSync().
   e. If it exists AND the new filename is different from the old filename:
      fs.unlinkSync(oldFilePath) — delete the old file.
      Wrap in try/catch: log error to console on failure, do not throw.
   f. Then proceed to save the new image as normal.

2. Also apply the same cleanup in the POST /:id/image handler
   (dedicated image upload endpoint) if one exists.

3. Import 'path' and 'fs' from Node.js built-ins at the top of the file.
   These are already available — no new packages needed.

4. Full file output required for server/src/routes/asset.routes.ts.

IMPORTANT CONSTRAINTS:
- Never delete a file if its path is outside server/uploads/ (path
  traversal guard):
  if (!resolvedPath.startsWith(uploadsDir)) return  // skip deletion
- Never delete a file during asset soft-delete (RETIRED) — the image
  may still be needed for audit/history viewing.
- Never delete a file if the new upload fails — only delete after the
  new file is confirmed written to disk.

VERIFICATION AFTER THIS PHASE:
Upload a .jpg image for an asset. Confirm file exists in server/uploads/.
Edit the asset and upload a .png image.
Confirm new .png file exists in server/uploads/.
Confirm old .jpg file NO LONGER exists in server/uploads/.
Edit the asset and upload another .png (same extension).
Confirm only one .png exists (overwritten, not duplicated).
Attempt to upload an image for a new asset (no previous image).
Confirm no errors (no old file to delete, handled gracefully).
```

---

## Improvement 7: Expand AI Suggest to Include More Fields

### Phase 7 — Add depreciation and warranty hints to AI suggest response

```
=== GLOBAL CONTEXT ===
Project: AIO-System (All-In-One Office Asset Inventory System)
Repo: /home/reggie/.hermes/workspace/aio-system
Stack: Node.js / TypeScript / Express / Prisma ORM / PostgreSQL
Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
Monorepo workspaces: server, client, shared
Full-file output is required. No partial snippets.

=== PHASE 7: Expand AI suggest to include usefulLifeYears and warrantyYears hints ===

PROBLEM STATEMENT:
POST /api/ai/suggest currently auto-fills only type and manufacturer
from the asset name. Given the asset name, an AI can also reasonably
estimate:
  - usefulLifeYears (e.g. a laptop: 3-5 years, a printer: 5-7 years)
  - warrantyYears (e.g. typical vendor warranty for that device class)
Since the AI endpoint already exists and Improvement 4 added
usefulLifeYears and salvageValue to the form, expanding the AI suggest
response to include these hints is low effort with useful value for admins
entering depreciation settings.

SOLUTION REQUIREMENTS:
1. In server/src/services/ai.service.ts (or ai.routes.ts — wherever
   the AI suggest prompt is built):
   - Update the prompt sent to the AI model to also request:
     usefulLifeYears: estimated useful life in years as an integer
     warrantyYears: typical vendor warranty period in years as an integer
     confidence: 'high' | 'medium' | 'low' — how confident the suggestion is

   - Updated prompt structure (adjust to match the existing prompt format):
     "Given the asset name '{assetName}', suggest the following as JSON:
      {
        type: string (asset category e.g. Laptop, Printer, Monitor),
        manufacturer: string (brand name if identifiable, else null),
        usefulLifeYears: number (typical useful life in years, integer),
        warrantyYears: number (typical vendor warranty in years, integer),
        confidence: 'high' | 'medium' | 'low'
      }
      Return only valid JSON. No explanation."

   - Parse the response and include the new fields in the API response.
   Full file output required.

2. In client/src/components/assets/AssetFormModal.tsx:
   - When AI suggest returns, auto-fill the existing fields (type, manufacturer)
     as before, PLUS:
     - If usefulLifeYears is returned and the Depreciation Settings section
       exists (from Improvement 4): auto-fill usefulLifeYears.
     - If warrantyYears is returned and warrantyExpiry is currently empty:
       compute a suggested warrantyExpiry = purchaseDate + warrantyYears years
       (only if purchaseDate is also set). Set the warrantyExpiry field.
   - Show a small note next to auto-filled depreciation/warranty fields:
     "AI suggested" in muted orange (#f8931f) text-xs, so the admin
     knows the value was auto-filled and should verify it.
   - If confidence is 'low', show the note as:
     "AI suggested (low confidence — please verify)"
   Full file output required.

3. The AI suggest feature must remain gracefully degradable:
   - If the AI returns only type and manufacturer (old shape), the
     form must still work — do not break on missing new fields.
   - Wrap new field auto-fill in: if (suggestion.usefulLifeYears) { ... }

VERIFICATION AFTER THIS PHASE:
Open Add Asset modal. Type "Canon imageRUNNER C3530" in the Name field.
Click the Sparkles AI suggest button.
Confirm type and manufacturer are auto-filled as before.
Confirm usefulLifeYears is auto-filled in the Depreciation Settings section.
Confirm warrantyExpiry is auto-filled if purchaseDate is set.
Confirm "AI suggested" label appears next to auto-filled fields.
Type "unknown device xyz" in the Name field and click suggest.
Confirm form does not crash if AI returns low confidence or null fields.
```

---

## Recommended Run Order

```
Phase 1  → Remove ASSIGNED_TO from AssetFormModal     [run first — closes gap from Improvement 8]
Phase 2  → Friendly duplicate serial error             [quick backend + frontend fix]
Phase 3  → Align purchasePrice required in schema      [critical data integrity fix]
Phase 4  → Add depreciation fields to form             [depends on schema being stable]
Phase 5  → Add Supplier dropdown to form               [independent, run anytime]
Phase 6  → Clean up orphaned image files               [backend only, run anytime]
Phase 7  → Expand AI suggest                           [run last — depends on Phase 4]
```

> **Dependency note:** Phase 7 should run after Phase 4 because the AI
> suggest expansion auto-fills usefulLifeYears which only exists in the
> form after Phase 4 adds it. Running Phase 7 before Phase 4 means the
> auto-fill logic has no target field to populate.
