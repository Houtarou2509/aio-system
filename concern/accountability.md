# Accountability Context — Profiles, Users, Issuances, Accountability Lookup, and Agreement Templates

## Purpose

This document explains how the AIO-System accountability area works as one connected flow:

1. Users log in and receive roles/permissions.
2. Profiles define the real personnel who can receive assets.
3. Assets are issued to profiles through Issuances.
4. Issuance creates Assignment rows and AgreementDocument snapshots.
5. Agreement Templates provide the reusable letter format.
6. View Agreement / PDF renders the issued document from database truth.
7. Accountability Lookup maintains dropdown/reference data used by profiles.

This is focused on the accountability module, but includes the relevant stack, file map, data models, route map, frontend map, and the problems already encountered in this area.

---

## Stack Used

Frontend:
- React
- TypeScript
- Vite
- React Router
- Tailwind CSS
- lucide-react icons
- API helper: `client/src/lib/api.ts`
- Auth context: `client/src/context/AuthContext.tsx`
- Permission/role UI guards: `ProtectedRoute`, `PermissionGate`, `RoleGate`

Backend:
- Node.js
- TypeScript
- Express
- Prisma ORM
- PostgreSQL
- Zod for request validation
- PDFKit for agreement PDF generation
- Multer for file uploads such as logos and signed agreements
- JWT/auth middleware with role and permission checks

Database:
- PostgreSQL through Prisma Client
- Prisma schema file: `server/prisma/schema.prisma`

Main branded UI conventions:
- Navy: `#012061`
- Orange accent: `#f8931f`
- Red/error: `#7B1113`
- Table headers should use solid navy `bg-[#012061]` with uppercase small text styling.

---

## High-Level Mental Model

User account = someone who can log in to AIO-System.

Profile / Personnel = real person who can receive assets and sign accountability documents.

Asset = physical item such as laptop, printer, webcam, etc.

Issuance / Assignment = record that an asset was issued to a profile/personnel.

Agreement Template = reusable agreement-letter format with placeholders.

AgreementDocument = frozen issued agreement snapshot with document number, resolved text, linked assignments/assets, signatories, and signature state.

Accountability Lookup = controlled dropdown/reference values for profiles, such as designations, institutions, and projects.

The correct flow is:

User account performs action -> selects profile/personnel -> selects assets -> creates issuance/assignments -> agreement template resolves -> AgreementDocument snapshot is stored -> View Agreement fetches document by `agreementDocumentId` -> PDF renders DB-sourced assets and signatures.

---

## Main Frontend File Map

### Routing and Layout

`client/src/App.tsx`
- Registers all app routes under `BrowserRouter basename="/aio-system"`.
- Accountability routes:
  - `/profiles` -> `ProfilesPage`
  - `/issuances` -> `IssuancesPage`
  - `/accountability-lookup` -> `AccountabilityLookupPage`
  - `/accountability/templates` -> `AccountabilityTemplatesPage`
- Old template paths redirect to `/accountability/templates`:
  - `/templates`
  - `/settings/templates`

`client/src/components/AppLayout.tsx`
- Defines sidebar navigation groups.
- Accountability nav currently includes:
  - Profiles
  - Issuances
  - Accountability Lookup
  - Agreement Templates
- Important pitfall: do not remove lucide icons without checking all nav arrays. Missing icon import can cause a blank white React page.

### Accountability Pages

`client/src/pages/ProfilesPage.tsx`
- UI for personnel/profile records.
- Profiles are the recipients of assets.
- Uses profile fields such as full name, designation, project, institution, contract/hired dates, readiness, and status.
- Related backend: `personnel.routes.ts`, `personnel.service.ts`, `personnel.schema.ts`.

`client/src/pages/IssuancesPage.tsx`
- Main operational page for issuing and returning assets.
- Supports single and batch/multi-asset issuances.
- Shows active/returned assignments.
- Groups rows by bulk batch where applicable.
- Handles View Agreement / PDF request payload.
- Handles return actions.
- Handles signed-copy / sign-off UI paths.
- Critical: batch View Agreement must include `agreementDocumentId`; frontend `assets` array is only fallback.

`client/src/pages/AccountabilityLookupPage.tsx`
- Admin/reference page for accountability dropdown values.
- Manages designations, institutions, and projects.
- Related backend: `accountabilityLookup.routes.ts`.

`client/src/pages/AccountabilityTemplatesPage.tsx`
- Admin page for agreement templates.
- Lists, creates, edits, deletes templates.
- Uploads optional header logo.
- Marks one template as default.
- Sets default signatories.
- Shows placeholder reference.
- Shows preview in single and multi-asset modes.
- Shows version history.

### Shared Frontend Support Files

`client/src/lib/api.ts`
- Shared API wrapper.
- `apiFetch` for JSON endpoints.
- `apiFetchBlob` for blob/PDF endpoints.
- Handles auth/session behavior.

`client/src/context/AuthContext.tsx`
- Stores logged-in user.
- Must include `permissions: string[]` in the user object so permission-based UI works.

`client/src/components/auth/ProtectedRoute.tsx`
- Protects routes by authentication and optional role requirements.
- Shows branded access denied page for unauthorized route access.

`client/src/components/auth/PermissionGate.tsx`
- Shows/hides UI by granular permission keys.
- Preferred for action buttons.

`client/src/components/auth/RoleGate.tsx`
- Shows/hides UI by role only.
- Less flexible than PermissionGate.

---

## Main Backend File Map

### Server Entry and Shared Infrastructure

`server/src/index.ts`
- Express server setup.
- Registers API route prefixes.
- Serves built frontend under `/aio-system` in production.

`server/src/lib/prisma.ts`
- Prisma Client instance.

`server/src/middleware/auth.ts`
- Authentication middleware.
- Role and permission guards.
- Important functions:
  - `authenticate`
  - `authorize`
  - `requireRole`
  - `hasPermission`

`server/src/middleware/validate.ts`
- Zod request validation middleware.

`server/src/utils/response.ts`
- Standard API response helpers:
  - `success(res, data, statusCode?, meta?)`
  - `error(res, message, statusCode?)`

### Users / Auth

`server/src/routes/auth.routes.ts`
`server/src/routes/auth.schema.ts`
`server/src/services/auth.service.ts`
- Login, current user, tokens, auth data.
- User object must return role and permissions for frontend gates.

`server/src/routes/user.routes.ts`
`server/src/routes/user.schema.ts`
- Admin user management.
- Controls app login accounts, roles, and permissions.

### Profiles / Personnel

`server/src/routes/personnel.routes.ts`
`server/src/routes/personnel.schema.ts`
`server/src/services/personnel.service.ts`
- CRUD for personnel profiles.
- Readiness toggling for issuance.
- Signed agreement upload tied to a personnel profile.
- Creates profile history rows where applicable.

### Issuances / Assignments

`server/src/routes/issuance.routes.ts`
`server/src/routes/issuance.schema.ts`
`server/src/services/issuance.service.ts`
- Lists issuances.
- Creates single issuance.
- Creates bulk/multi-asset issuance.
- Returns issuance.
- Digitally signs issuance.
- Locks selected assets during wizard flow.
- Releases locked assets if wizard is cancelled.
- Resolves templates for preview.
- Creates AgreementDocument snapshots during issuance.

### Agreement Templates and Documents

`server/src/routes/agreement.routes.ts`
`server/src/routes/agreement.schema.ts`
`server/src/services/agreement.service.ts`
`server/src/services/agreementDocumentRenderer.service.ts`
`server/src/utils/templateParser.ts`
- Template CRUD.
- Template version history.
- Placeholder reference.
- Template preview/validation.
- Agreement document list/backfill/sanitization.
- Signed document copy upload.
- PDF generation.

### Accountability Lookup

`server/src/routes/accountabilityLookup.routes.ts`
- Lookup CRUD for:
  - designations
  - institutions
  - projects
- Used by Profiles page and profile forms.

There are also route files named:
- `server/src/routes/project.routes.ts`
- `server/src/routes/institution.routes.ts`

But the accountability lookup page is centered around `accountabilityLookup.routes.ts` for designation/institution/project reference values.

---

## Main Prisma Models and How They Connect

### User

Represents a login account.

Important fields:
- `id`
- `username`
- `email`
- `passwordHash`
- `role`
- `permissions`
- `fullName`
- `twoFactorEnabled`

Used for:
- Logging in.
- Performing issuance actions.
- Audit logs.
- Upload ownership.
- Role/permission-based access.

Important distinction:
- A User is not necessarily the asset recipient.
- A Personnel/Profile is the asset recipient.

### Personnel / Profile

Represents the person who receives assets.

Important fields include:
- `id`
- `fullName`
- `designation`
- `project`
- `projectYear`
- `email`
- `phone`
- `hiredDate`
- `institution`
- readiness/status-related fields
- lookup links for designation/project/institution where available

Used for:
- Selecting recipient in Issuance flow.
- Agreement recipient snapshot.
- Profile history.
- Accountability tracking.

### Asset

Represents physical inventory.

Important fields include:
- `id`
- `name`
- `type`
- `manufacturer`
- `serialNumber`
- `propertyNumber`
- `status`
- condition/location/purchase fields

Used for:
- Asset issuance.
- Assignment relation.
- Agreement asset rows.
- Asset lock/release during issuance wizard.

### Assignment

Represents issued asset accountability.

Important fields include:
- `id`
- `assetId`
- `personnelId`
- `assignedTo`
- `assignedAt`
- `returnedAt`
- `condition`
- agreement/template fields
- `bulkBatchId`
- agreement document relation
- recipient sign-off metadata

Used for:
- Active/returned issuance list.
- Return workflow.
- Digital sign-off.
- Bulk grouping.
- Linking assets to AgreementDocument.

### AgreementTemplate

Reusable agreement letter template.

Important fields:
- `id`
- `name`
- `title`
- `content`
- `headerLogo`
- `isDefault`
- `defaultPropertyOfficer`
- `defaultAuthorizedRep`
- `currentVersion`

Used for:
- New issuance agreement text.
- Preview in template editor.
- Default fallback if no template selected.

### AgreementTemplateVersion

Immutable version row for template history.

Important fields:
- `templateId`
- `versionNumber`
- `name`
- `title`
- `content`
- `headerLogo`
- `defaultPropertyOfficer`
- `defaultAuthorizedRep`
- `changeSummary`

Used for:
- Auditability of template changes.
- Linking old documents to the template version used at issuance time.

### AgreementDocument

Frozen issued agreement snapshot.

Important fields:
- `documentNumber`
- `templateId`
- `templateVersionId`
- `templateVersion`
- `title`
- `resolvedText`
- `headerLogo`
- `bulkBatchId`
- `personnelId`
- `personnelNameSnapshot`
- `designationSnapshot`
- `projectSnapshot`
- `institutionSnapshot`
- `assetSnapshot`
- `propertyOfficerName`
- `authorizedRepName`
- `status`
- `issuedAt`
- `recipientSignedAt`
- `recipientSignatureName`
- `signedPdfPath`

Used for:
- View Agreement.
- PDF rendering.
- Historical accountability proof.
- Document-level signed copy.
- Multi-asset source of truth.

Critical rule:
- For an existing agreement, View/PDF should use `agreementDocumentId` to fetch AgreementDocument from the DB.
- Do not trust stale frontend payloads for assets if the document exists.

### Lookup Models

Used by Accountability Lookup:
- `DesignationLookup`
- `InstitutionLookup`
- `ProjectLookup`
- `ProfileHistory`

Purpose:
- Keep profile dropdown values controlled and reusable.
- Avoid free-text inconsistencies.
- Track profile changes/history.

---

## Route Map for Accountability Area

### Profiles / Personnel

Base route likely mounted as:
- `/api/personnel`

Important endpoints:
- `GET /api/personnel`
  - list profiles with pagination/search/status/project filters
- `GET /api/personnel/:id`
  - get one profile
- `POST /api/personnel`
  - create profile
- `PATCH /api/personnel/:id`
  - update profile
- `DELETE /api/personnel/:id`
  - soft-delete profile
- `PATCH /api/personnel/:id/readiness`
  - toggle readiness for issuance
- `POST /api/personnel/:id/signed-agreement`
  - upload signed agreement PDF tied to profile

### Issuances

Base route likely mounted as:
- `/api/issuances`

Important endpoints:
- `GET /api/issuances`
  - list assignments/issuances
- `POST /api/issuances`
  - create single issuance
- `POST /api/issuances/bulk`
  - create multi-asset/batch issuance
- `POST /api/issuances/:id/return`
  - return asset
- `POST /api/issuances/:id/sign`
  - recipient digital sign-off
- `POST /api/issuances/assets/lock`
  - lock selected assets during wizard
- `POST /api/issuances/assets/release`
  - release locked assets if wizard is cancelled
- `GET /api/issuances/assets/available`
  - list assets available for issuance
- `GET /api/issuances/personnel/active`
  - list active personnel for issuance wizard
- `POST /api/issuances/resolve-template`
  - resolve agreement preview for one/many assets
- `POST /api/issuances/resolve-template/bulk`
  - bulk template preview helper
- `POST /api/issuances/agreement`
  - older agreement text generation path

### Agreement Templates / Documents

Base route in frontend calls is:
- `/api/agreements`

Important endpoints:
- `GET /api/agreements/templates`
- `GET /api/agreements/templates/:id`
- `GET /api/agreements/templates/:id/versions`
- `POST /api/agreements/templates`
- `PATCH /api/agreements/templates/:id`
- `DELETE /api/agreements/templates/:id`
- `POST /api/agreements/upload-logo`
- `GET /api/agreements/placeholders`
- `POST /api/agreements/templates/preview`
- `POST /api/agreements/templates/validate`
- `GET /api/agreements/documents`
- `POST /api/agreements/documents/backfill`
- `POST /api/agreements/documents/sanitize-text`
- `POST /api/agreements/documents/:id/signed-copy`
- `POST /api/agreements/pdf`

### Accountability Lookup

Base route likely mounted as:
- `/api/accountability-lookup`

Sub-routes:
- `/designations`
- `/institutions`
- `/projects`

Each supports:
- `GET /`
- `GET /active`
- `POST /`
- `PATCH /:id`

---

## Frontend Navigation Map

In `client/src/components/AppLayout.tsx`, accountability section is:

- Profiles
  - path: `/profiles`
  - icon: `Users`
  - roles: ADMIN, STAFF_ADMIN

- Issuances
  - path: `/issuances`
  - icon: `FileSignature`
  - roles: ADMIN, STAFF_ADMIN

- Accountability Lookup
  - path: `/accountability-lookup`
  - icon: `Database`
  - roles: ADMIN, STAFF_ADMIN

- Agreement Templates
  - path: `/accountability/templates`
  - icon: `FileText`
  - role: ADMIN

Mobile bottom nav includes Issuances but does not expose every accountability route.

---

## How Profiles, Users, Issuances, Lookup, and Templates Work Together

### 1. User logs in

The logged-in `User` supplies:
- role
- permissions
- user id for audit/createdBy/issuedBy fields

The user performs the action but is not necessarily the asset recipient.

Example:
- Admin user logs in.
- Admin creates an issuance for Angelo DeLos Santos.
- Admin's user id becomes `issuedById`.
- Angelo's Personnel id becomes `personnelId`.

### 2. Profiles define recipients

Profiles/Personnel records are the people who can receive assets.

A profile carries:
- name
- designation
- institution
- project
- email/phone
- readiness/status

This data is copied into agreement document snapshots so later profile edits do not rewrite historical issued documents.

### 3. Accountability Lookup feeds profile forms

Lookup values provide controlled dropdowns:
- designations
- institutions
- projects

The Profile page uses these values to keep names consistent.

When a lookup value is deactivated, old profile records may keep snapshot/free-text names but lose or ignore the active lookup link.

### 4. Issuance selects profile and assets

Issuance flow selects:
- one profile/personnel
- one or more assets
- condition
- agreement template/default template
- signatories if needed

During the wizard, selected assets may be temporarily locked as `PENDING_ASSIGNMENT` to avoid two users issuing the same asset.

On successful issuance:
- Assignment rows are created.
- Asset statuses become assigned.
- AgreementDocument snapshot is created.
- Each assignment in a bulk batch should point to the same AgreementDocument.

### 5. Agreement Template resolves into text

The selected/default template has placeholders such as:
- `{{personnelName}}`
- `{{designation}}`
- `{{institutionText}}`
- `{{projectText}}`
- `{{assetName}}`
- `{{serialNumber}}`
- `{{propertyNumber}}`
- `{{condition}}`
- `{{assetSection}}`
- `{{assetTable}}`
- `{{assetCount}}`

The backend parser fills these with profile and asset data.

### 6. AgreementDocument stores immutable document snapshot

After template resolution, AgreementDocument stores:
- document number
- title
- resolved body text
- personnel snapshot
- asset snapshot
- template id/version
- signatories
- signature state
- linked assignments

This is the record View Agreement should use.

### 7. View Agreement/PDF renders from the document

When user clicks View Agreement:
- frontend sends PDF request to `/api/agreements/pdf`
- payload must include `agreementDocumentId` when available
- backend fetches AgreementDocument and linked assignments/assets
- backend builds structured document view
- PDFKit renders the final letter and structured asset table

---

## Agreement Template Placeholder Logic

File:
- `server/src/utils/templateParser.ts`

Important functions:
- `assetRows(data)`
- `buildAssetParagraph(data)`
- `buildAssetTable(data)`
- `computeDerived(data)`
- `applyConditionals(template, data)`
- `parseTemplate(template, data)`
- `validateTemplateContent(template)`
- `getPlaceholderReference()`

Smart placeholders:
- `{{assetParagraph}}` -> one asset block
- `{{assetTable}}` -> multi-asset text table
- `{{assetSection}}` -> paragraph for one asset, table for many

Conditional blocks:

```text
{{#ifSingleAsset}}
Only shown for one asset.
{{/ifSingleAsset}}

{{#ifMultipleAssets}}
Only shown for more than one asset.
{{/ifMultipleAssets}}
```

Important PDF rule:
- Template preview may show a plain-text asset table.
- Final PDF should render assets from structured DB data using PDFKit, not trust inline text table rows.

---

## Agreement PDF Rendering Logic

Primary file:
- `server/src/services/agreement.service.ts`

Support renderer:
- `server/src/services/agreementDocumentRenderer.service.ts`

Key functions/concepts:
- `resolveAgreementPdfParams(input)`
- `buildAgreementDocumentView(input)`
- `renderAssetTableToPdf(doc, assets, x, startY, contentWidth)`
- `sanitizeAgreementText()`
- `stripLegacyAssetTableLines()`

Correct asset priority when `agreementDocumentId` exists:

1. `document.assignments` linked live assets
2. `document.assetSnapshot`
3. `p.assets` from frontend payload
4. legacy `p.assetName`

Why:
- A batch frontend row can be stale or incomplete.
- A paginated/filtered frontend list may not include all assets in a batch.
- Existing/stale records may contain only first-asset text.
- DB-linked assignments and document snapshots are the source of truth.

---

## Current Known Agreement PDF Problem and Fix Direction

Problem encountered:
- View Agreement showed artifacts such as:
  - `%%%`
  - `%%%%%%%%%%%%%%%%%%%%%`
  - inline legacy table header
  - missing multi-asset rows
- Example symptom:
  - Angelo agreement had 3 assets but View/PDF showed stale or partial rows.

Root causes identified:
1. Old `AgreementDocument.resolvedText` and `Assignment.agreementText` could already contain dirty percent/table artifacts.
2. Frontend batch View Agreement did not always send `agreementDocumentId`.
3. Backend could fall back to incomplete frontend `assets` array.
4. Fresh generated asset table was previously appended into body text and then stripped by legacy-table sanitizer.

Fix direction implemented in current uncommitted work:
1. Batch View Agreement sends `agreementDocumentId`.
2. Backend resolves the document from DB.
3. Assets come from DB assignments first, then assetSnapshot, then frontend fallback.
4. Body text sanitization applies only to raw/stored body text.
5. Asset rows render directly through PDFKit.
6. Temporary test script was removed after verification.

Important rule now:
- Do not pipe generated asset rows through `sanitizeAgreementText()`.
- Sanitizer is for dirty saved text only.

---

## Common Problems We Faced in This Accountability Area

### Problem 1: Frontend batch row not sending agreementDocumentId

Symptom:
- Single row View Agreement worked better than batch row View Agreement.
- Batch row relied on frontend assets array.
- Existing/stale records could show one asset only.

Fix:
- Batch row must find `batchAgreementDocument` from batch items.
- Payload must include `agreementDocumentId`.
- Keep frontend assets only as fallback.

### Problem 2: Backend trusting frontend assets too early

Symptom:
- DB had all linked assets, but PDF used partial frontend data.

Fix:
- `resolveAgreementPdfParams()` must enforce asset priority:
  1. linked assignments
  2. assetSnapshot
  3. frontend assets
  4. legacy assetName

### Problem 3: Legacy `%` divider artifacts stored in DB

Symptom:
- New code looked clean, but old View Agreement still showed `%` rows.

Cause:
- Artifacts were already stored in immutable `AgreementDocument.resolvedText` or `Assignment.agreementText`.

Fix:
- Sanitize stored/resolved text on read/render.
- Provide dry-run-first stored-text sanitizer route.
- For production/live data, sanitize existing rows after deploy.

### Problem 4: Inline legacy table header embedded mid-body

Symptom:
- `%` was gone but body still showed:
  - `No. Asset Name Serial Number Property Number Condition`
  - stale rows

Cause:
- Header was embedded in the same line as normal body text, not always line-start.

Fix:
- Strip legacy table from body text while preserving text before the header.
- Render structured assets separately.

### Problem 5: Generated table got stripped by sanitizer

Symptom:
- Resolver had all assets, but PDF output still omitted rows.

Cause:
- New generated plain-text table used same header as legacy dirty table.
- Sanitizer treated it as old table and removed it.

Fix:
- Do not append new asset table to body text.
- Render asset rows directly using PDFKit.

### Problem 6: Wrong document used for verification

Symptom:
- Verifying a 2-asset local document when the reported issue was a 3-asset Angelo document.

Fix:
- Always verify exact document number/id from the user's report.
- For Angelo issue, the correct document was `AGR-20260520-31LN79`.

### Problem 7: Build artifacts accidentally changed during client build

Symptom:
- `npm run build --workspace=client` changed `server/public` files.

Fix:
- Revert generated public artifacts unless deployment/static build update is intended.
- Do not commit unrelated build output in a source-fix phase.

### Problem 8: Role gates vs permission gates

Symptom:
- Users with granular permissions could still be blocked if route uses role-only middleware.

Fix:
- Prefer `hasPermission()` in backend resource routes.
- Prefer `PermissionGate` in frontend action buttons.
- Use role gates only when role restriction is truly intended.

### Problem 9: Zod optional fields rejecting null

Symptom:
- Frontend sends `null`, backend schema uses `.optional()`, request fails validation.

Fix:
- For fields that frontend may send as `null`, use `.optional().nullable()`.

### Problem 10: Icon import crash causing blank page

Symptom:
- White page after changing sidebar/nav icons.

Cause:
- lucide icon removed from import but still used in another nav array.

Fix:
- Before removing any icon from `AppLayout.tsx`, grep all nav arrays:
  - inventoryNav
  - issuanceNav
  - systemNav
  - mobile bottom nav

---

## Profiles Page Context

Page:
- `client/src/pages/ProfilesPage.tsx`

Backend:
- `server/src/routes/personnel.routes.ts`
- `server/src/routes/personnel.schema.ts`
- `server/src/services/personnel.service.ts`

Purpose:
- Manage personnel profiles who can receive issued assets.

Important behavior:
- Create/update/delete personnel records.
- Search/filter/paginate profiles.
- Track profile readiness for issuance.
- Upload signed agreement documents at profile level in older/parallel flow.
- Maintain history when profile metadata changes.

Profile data feeds agreements:
- full name -> recipient name
- designation -> recipient designation
- project -> project text
- institution -> institution text
- email/phone -> contact metadata

Historical requirement:
- AgreementDocument snapshots should preserve values at time of issuance, even if profile later changes.

---

## Users Context

Pages/backend:
- `client/src/pages/UserManagementPage.tsx`
- `server/src/routes/user.routes.ts`
- `server/src/routes/user.schema.ts`
- `server/src/services/auth.service.ts`
- `client/src/context/AuthContext.tsx`

Purpose:
- Manage who can log in and what they can do.

Key distinction:
- User account performs the issuance action.
- Personnel/Profile receives the asset.

User data affects accountability by:
- `issuedById` on AgreementDocument.
- audit logs.
- route access.
- button visibility.

Important frontend rule:
- `AuthContext` User interface must include `permissions: string[]`.
- If permissions are missing, `PermissionGate` can silently hide expected UI.

---

## Issuances Page Context

Page:
- `client/src/pages/IssuancesPage.tsx`

Backend:
- `server/src/routes/issuance.routes.ts`
- `server/src/routes/issuance.schema.ts`
- `server/src/services/issuance.service.ts`

Purpose:
- Issue assets to personnel.
- Return assets.
- View accountability agreements.
- Handle digital sign-off and signed PDF copies.

Important behaviors:
- Single issuance and batch issuance should share the same conceptual flow.
- Batch rows group multiple Assignment rows with same `bulkBatchId` and/or AgreementDocument.
- A row labeled `1 Assets` can still be rendered through batch-row UI depending on grouping.
- Return button must exist for both single rows and batch rows.

View Agreement requirement:
- The request should include `agreementDocumentId`.
- `assets` in request is fallback only.
- Backend DB document resolution is authoritative.

---

## Accountability Lookup Context

Page:
- `client/src/pages/AccountabilityLookupPage.tsx`

Backend:
- `server/src/routes/accountabilityLookup.routes.ts`

Purpose:
- Maintain reusable lookup values for profile metadata.

Lookup categories:
- Designations
- Institutions
- Projects

Why it matters:
- Agreement letters need consistent recipient details.
- Profiles should not use inconsistent free-text values when lookup control is available.
- Deactivating lookup values must not destroy historical profile/agreement meaning.

Important behavior:
- Lookups can be active/inactive.
- Projects can also be completed/archived.
- Deactivation checks references and may return warnings.

---

## Agreement Templates Context

Page:
- `client/src/pages/AccountabilityTemplatesPage.tsx`

Backend:
- `server/src/routes/agreement.routes.ts`
- `server/src/routes/agreement.schema.ts`
- `server/src/services/agreement.service.ts`
- `server/src/utils/templateParser.ts`

Purpose:
- Admin defines the reusable text used for accountability agreements.

Template fields:
- name
- title
- content/body
- header logo
- default flag
- default property officer
- default authorized representative

Template editor supports:
- Create
- Edit
- Delete
- Set default
- Upload logo
- Preview single-asset output
- Preview multi-asset output
- Show placeholder reference
- Show version history

Important rule:
- Templates affect future issuances.
- Old issued AgreementDocument snapshots should not change just because template content changed later.

---

## AgreementDocument and View/PDF Context

AgreementDocument is the durable accountability proof.

When created correctly, it stores:
- document number
- resolved body text
- personnel snapshot
- asset snapshot
- linked assignments
- template/version references
- signatory names
- signature state
- signed-copy path

View/PDF path must do this:

1. Accept request from Issuances page.
2. Prefer `agreementDocumentId`.
3. Fetch AgreementDocument from DB.
4. Fetch linked assignments/assets.
5. Use assetSnapshot if assignment links are missing.
6. Use frontend assets only as final fallback.
7. Clean dirty body text only.
8. Render asset rows directly through PDFKit.
9. Render signatures.
10. Verify exact document output.

---

## Source-of-Truth Rules

For Users:
- `users` table is source of truth for login identity, role, and permissions.

For Profiles:
- `personnel` table is source of truth for current profile data.
- AgreementDocument snapshot is source of truth for historical recipient data.

For Assets:
- `assets` table is source of truth for current asset identity/status.
- AgreementDocument `assetSnapshot` is fallback/historical capture.

For Issuances:
- `assignments` table is source of truth for active/returned accountability state.

For Agreement Templates:
- `agreement_templates` is source of truth for current reusable templates.
- `agreement_template_versions` is source of truth for immutable revisions.

For Issued Agreements:
- `agreement_documents` is source of truth for View/PDF output.
- linked assignments are preferred source of actual asset rows.

---

## Verification Checklist for Accountability Changes

When changing this area, verify end-to-end, not just one file.

Profiles:
- Create/update profile.
- Confirm lookup values render correctly.
- Confirm active personnel appears in issuance wizard.

Users/permissions:
- Confirm logged-in user response includes permissions.
- Confirm buttons are hidden/shown correctly.
- Confirm backend still enforces permission.

Issuances:
- Single issuance creates assignment and updates asset status.
- Batch issuance creates all assignment rows.
- Assets lock during wizard and release on cancel.
- Return works for single and batch rows.
- Active/returned filters work.

Agreement templates:
- Template preview works for single mode.
- Template preview works for multiple mode.
- Placeholder warnings work.
- Default template behavior is deterministic.
- Version history updates correctly.

Agreement View/PDF:
- Open exact View Agreement path in UI.
- Confirm title present.
- Confirm body present.
- Confirm document number present.
- Confirm recipient name present.
- Confirm all expected assets present.
- Confirm all property numbers present.
- Confirm signature block present.
- Confirm no `%` / `%%%%%` artifacts.
- Confirm no old inline legacy table inside body.
- Confirm no accidental blank pages.

Builds:

```bash
npm run build --workspace=server
```

Optional frontend build:

```bash
npm run build --workspace=client
```

Prisma validation for schema changes:

```bash
cd server && npx prisma validate
```

---

## Debugging Strategy for Accountability Bugs

### If View Agreement is wrong

Do not start with PDF layout.

Check in this order:
1. Does frontend send `agreementDocumentId`?
2. Does AgreementDocument exist?
3. Does document have linked assignments?
4. Does `assetSnapshot` contain all expected assets?
5. Does frontend payload contain only one/stale asset?
6. Does `resolvedText` already contain legacy artifacts?
7. Is sanitizer applied only to raw text?
8. Is PDFKit rendering structured `documentView.assets`?
9. Does extracted PDF text match expected exact document number?

### If profile values are wrong in agreement

Check:
1. Current Personnel record.
2. AgreementDocument snapshot fields.
3. Template placeholders used.
4. Whether old document uses old snapshot values by design.

### If issuance wizard cannot select assets

Check:
1. Asset status.
2. Pending assignment locks.
3. Active assignments.
4. Available assets endpoint.
5. Whether cancelled wizard released locks.

### If action button is missing

Check:
1. User role.
2. User permissions in AuthContext.
3. PermissionGate/RoleGate wrapper.
4. Backend middleware.
5. Whether row is single or batch UI.

### If blank white page appears

Check:
1. Browser console.
2. Missing lucide icon import.
3. AppLayout nav arrays.
4. PWA cache/service worker.
5. Vite static asset path.

---

## Practical End-to-End Flow Example

Example: Angelo DeLos Santos receives 3 assets.

1. Admin logs in.
2. Angelo exists as Personnel profile.
3. Angelo profile has designation/project/institution.
4. Admin opens Issuances.
5. Admin selects Angelo.
6. Admin selects 3 assets.
7. System locks assets during wizard.
8. Admin confirms issuance.
9. Backend creates 3 Assignment rows.
10. Backend creates one AgreementDocument for the batch.
11. All 3 assignments link to that document.
12. AgreementDocument receives document number like `AGR-20260520-31LN79`.
13. Issuances page shows batch row.
14. View Agreement sends `agreementDocumentId`.
15. Backend fetches AgreementDocument and linked assignments.
16. PDF renders all 3 assets.
17. Recipient/signatories appear.
18. No legacy `%` artifacts appear.

Expected asset rows for the known Angelo verification case:

1. Canon imageRUNNER C3530
   - Serial: CAN-IR-C3530
   - Property Number: PN-2023-001
   - Condition: Good

2. Lenovo ThinkCentre M90q
   - Serial: LEN-M90Q-001
   - Property Number: PN-2025-004
   - Condition: Good

3. Logitech Brio 4K Webcam
   - Serial: LOG-BRIO-001
   - Property Number: PN-2025-010
   - Condition: Good

Expected document:
- `AGR-20260520-31LN79`

---

## Current Working-Tree Context Related to This Area

Known currently modified source files from the recent agreement/View PDF work:
- `server/src/services/agreement.service.ts`
- `server/src/routes/agreement.schema.ts`
- `client/src/pages/IssuancesPage.tsx`

Context docs in `concern/`:
- `concern/agreement template.md`
- `concern/AGREEMENT_VIEW_PDF_MULTI_ASSET_PROBLEM.md`
- this file: `concern/accountability.md`

Important:
- Do not commit unrelated concern PDFs/images/generated artifacts unless the user explicitly wants them committed.
- Do not commit generated `server/public` frontend build artifacts unless the task is deployment/static build update.
- Ask before commit/push.

---

## Short Summary

Profiles define who receives assets.

Users define who can operate the system.

Accountability Lookup defines clean dropdown/reference values for profiles.

Issuances create Assignment records that bind assets to profiles.

Agreement Templates define reusable legal/accountability letter text.

AgreementDocument freezes the actual issued document.

View Agreement/PDF must render from AgreementDocument and linked assignments, not stale frontend rows.

The biggest recurring problem was treating old text/frontend payloads as truth. The correct source of truth is the DB document and its linked assignments/assets.
