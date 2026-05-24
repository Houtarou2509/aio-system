# Agreement Template Context — AIO-System

## Purpose

This document explains how the Agreement Template feature works in AIO-System, with focus on the accountability/agreement-letter flow that produces the View Agreement / PDF output in Issuances.

The most important rule is this:

Agreement templates are only the starting text pattern. Once an issuance is created, the system should rely on the AgreementDocument snapshot and its linked assignments/assets for View Agreement and PDF rendering, not on stale frontend payloads or old inline text tables.

---

## Stack Used

Frontend:
- React
- TypeScript
- Vite
- Tailwind CSS
- lucide-react icons
- API helper: `client/src/lib/api.ts`

Backend:
- Node.js
- TypeScript
- Express
- Prisma ORM
- PostgreSQL
- PDFKit for PDF generation
- Zod for request validation
- Multer for logo/signed-PDF uploads

Main database models:
- `AgreementTemplate`
- `AgreementTemplateVersion`
- `AgreementDocument`
- `Assignment`
- `Asset`
- `Personnel`
- `User`

---

## Main Files Involved

Frontend template admin page:
- `client/src/pages/AccountabilityTemplatesPage.tsx`

Issuance/View Agreement page:
- `client/src/pages/IssuancesPage.tsx`

Backend routes:
- `server/src/routes/agreement.routes.ts`
- `server/src/routes/agreement.schema.ts`

Backend services:
- `server/src/services/agreement.service.ts`
- `server/src/services/agreementDocumentRenderer.service.ts`

Template parser:
- `server/src/utils/templateParser.ts`

Prisma schema:
- `server/prisma/schema.prisma`

---

## What an Agreement Template Is

An agreement template is a reusable text body used when issuing assets to personnel.

In Prisma, the core template model is:

```prisma
model AgreementTemplate {
  id                     String   @id @default(uuid())
  name                   String   @default("Default")
  title                  String   @default("ISSUANCE & ACCOUNTABILITY AGREEMENT")
  content                String   @default("")
  headerLogo             String?
  defaultLogo            String?
  isDefault              Boolean  @default(false)
  defaultPropertyOfficer String?
  defaultAuthorizedRep   String?
  currentVersion         Int      @default(1)
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
  assignments            Assignment[] @relation("AssignmentAgreement")
  documents              AgreementDocument[] @relation("AgreementDocumentTemplate")
  versions               AgreementTemplateVersion[]

  @@map("agreement_templates")
}
```

Important fields:
- `name` — user-facing template name.
- `title` — PDF/agreement title.
- `content` — template body with placeholders like `{{personnelName}}`.
- `headerLogo` — optional logo path uploaded for this template.
- `isDefault` — marks the default template used when issuance does not choose a specific template.
- `defaultPropertyOfficer` — default signatory name.
- `defaultAuthorizedRep` — default signatory name.
- `currentVersion` — current template revision number.

---

## Template Versions

Template versions are stored separately in `AgreementTemplateVersion`.

```prisma
model AgreementTemplateVersion {
  id                     String   @id @default(uuid())
  templateId             String
  versionNumber          Int
  name                   String
  title                  String
  content                String   @db.Text
  headerLogo             String?
  defaultPropertyOfficer String?
  defaultAuthorizedRep   String?
  changeSummary          String?
  createdAt              DateTime @default(now())

  template               AgreementTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  documents              AgreementDocument[] @relation("AgreementDocumentTemplateVersion")

  @@unique([templateId, versionNumber])
  @@index([templateId])
  @@map("agreement_template_versions")
}
```

Purpose:
- Keep historical template revisions.
- Allow documents to remember which template version was used.
- Prevent future template edits from changing old issued documents.

Important concept:
- Template edits should not rewrite historical agreement documents.
- Once issued, an AgreementDocument is the immutable document snapshot.

---

## AgreementDocument Is the Source of Truth After Issuance

When an agreement is generated during issuance, the system creates or uses an `AgreementDocument` snapshot.

```prisma
model AgreementDocument {
  id                         String   @id @default(uuid())
  documentNumber             String   @unique
  templateId                 String?
  templateVersionId          String?
  templateVersion            Int?
  title                      String
  resolvedText               String   @db.Text
  headerLogo                 String?
  bulkBatchId                String?
  personnelId                String?
  personnelNameSnapshot      String
  designationSnapshot        String?
  projectSnapshot            String?
  institutionSnapshot        String?
  assetSnapshot              Json
  propertyOfficerName        String?
  authorizedRepName          String?
  status                     String   @default("issued")
  issuedAt                   DateTime @default(now())
  issuedById                 String
  recipientSignedAt          DateTime?
  recipientSignatureName     String?
  recipientSignatureMethod   String?
  recipientSignatureIp       String?
  signedPdfPath              String?
  signedUploadedAt           DateTime?
  signedUploadedById         String?
  createdAt                  DateTime @default(now())
  updatedAt                  DateTime @updatedAt

  template                   AgreementTemplate? @relation("AgreementDocumentTemplate", fields: [templateId], references: [id], onDelete: SetNull)
  templateVersionRecord      AgreementTemplateVersion? @relation("AgreementDocumentTemplateVersion", fields: [templateVersionId], references: [id], onDelete: SetNull)
  personnel                  Personnel? @relation("AgreementDocumentPersonnel", fields: [personnelId], references: [id], onDelete: SetNull)
  issuedBy                   User @relation("AgreementDocumentIssuedBy", fields: [issuedById], references: [id])
  signedUploadedBy           User? @relation("AgreementDocumentSignedUploadedBy", fields: [signedUploadedById], references: [id], onDelete: SetNull)
  assignments                Assignment[]

  @@index([bulkBatchId])
  @@index([personnelId])
  @@index([templateVersionId])
  @@index([issuedAt])
  @@map("agreement_documents")
}
```

Important fields:
- `documentNumber` — final document number, e.g. `AGR-20260520-31LN79`.
- `resolvedText` — saved resolved body text from the template at issuance time.
- `assetSnapshot` — JSON fallback copy of assets at issuance time.
- `assignments` — live linked assignment rows; this is preferred when resolving assets for View/PDF.
- `personnelNameSnapshot`, `designationSnapshot`, `projectSnapshot`, `institutionSnapshot` — recipient snapshot values.
- `propertyOfficerName`, `authorizedRepName` — signatory names.
- `recipientSignedAt`, `recipientSignatureName` — digital sign-off metadata.
- `signedPdfPath` — uploaded signed agreement copy.

Critical rule:
- For View Agreement and PDF generation, use `agreementDocumentId` to fetch the document from the database.
- Do not trust the frontend's batch asset array as authoritative because it may be filtered, paginated, stale, or incomplete.

---

## Template Placeholders

Placeholders are parsed by:

- `server/src/utils/templateParser.ts`

The parser replaces `{{placeholder}}` tokens using actual issuance data.

Supported common placeholders:

Document/personnel:
- `{{date}}`
- `{{fullName}}`
- `{{personnelName}}`
- `{{designation}}`
- `{{position}}`
- `{{designationComma}}`
- `{{positionComma}}`
- `{{institution}}`
- `{{institutionText}}`
- `{{project}}`
- `{{projectText}}`

Single/first asset:
- `{{assetName}}`
- `{{serialNumber}}`
- `{{propertyNumber}}`
- `{{condition}}`

Multi-asset/smart placeholders:
- `{{assetCount}}`
- `{{assetParagraph}}`
- `{{assetTable}}`
- `{{assetSection}}`
- `{{assetList}}`

Conditional blocks:

```text
{{#ifSingleAsset}}
This text appears only when one asset is issued.
{{/ifSingleAsset}}

{{#ifMultipleAssets}}
This text appears only when multiple assets are issued.
{{/ifMultipleAssets}}
```

Important behavior:
- `{{assetParagraph}}` is intended for one asset.
- `{{assetTable}}` is intended for multiple assets.
- `{{assetSection}}` automatically chooses paragraph for one asset or table for multiple assets.

---

## Template Parser Flow

File:
- `server/src/utils/templateParser.ts`

Key functions:
- `assetRows(data)`
- `buildAssetParagraph(data)`
- `buildAssetTable(data)`
- `computeDerived(data)`
- `applyConditionals(template, data)`
- `parseTemplate(template, data)`
- `validateTemplateContent(template)`
- `getPlaceholderReference()`

Flow:

1. Receive raw template content.
2. Build asset rows from `data.assets` or fallback single asset fields.
3. Compute derived values such as:
   - `assetCount`
   - `assetParagraph`
   - `assetTable`
   - `assetSection`
   - `designationComma`
   - `projectText`
4. Apply conditional blocks:
   - remove single-only blocks if multiple assets exist.
   - remove multiple-only blocks if only one asset exists.
5. Replace `{{key}}` tokens with resolved strings.
6. Unknown placeholders remain as `{{unknownKey}}` and validation can warn about them.

Important warning:
- The parser may still produce a plain-text asset table for preview/template text.
- The final PDF should not rely on that plain-text asset table for asset rendering.
- The final PDF now renders structured asset rows directly using PDFKit.

---

## Frontend Template Management Flow

Page:
- `client/src/pages/AccountabilityTemplatesPage.tsx`

Main responsibilities:
- List agreement templates.
- Select/edit a template.
- Create new templates.
- Upload optional header logo.
- Mark a template as default.
- Set default signatories.
- Preview template output in single or multiple asset mode.
- Show placeholder reference.
- Show template version history.

Important API calls used by the page:
- `GET /api/agreements/templates`
- `GET /api/agreements/templates/:id`
- `GET /api/agreements/templates/:id/versions`
- `POST /api/agreements/templates`
- `PATCH /api/agreements/templates/:id`
- `DELETE /api/agreements/templates/:id`
- `GET /api/agreements/placeholders`
- `POST /api/agreements/templates/preview`
- `POST /api/agreements/templates/validate`

Template create/update uses multipart form data because the template may include a logo file:
- `name`
- `title`
- `content`
- `isDefault`
- `defaultPropertyOfficer`
- `defaultAuthorizedRep`
- `headerLogo` file, optional

---

## Backend Template Routes

File:
- `server/src/routes/agreement.routes.ts`

Template CRUD:
- `GET /api/agreements/templates`
- `GET /api/agreements/templates/:id`
- `GET /api/agreements/templates/:id/versions`
- `POST /api/agreements/templates`
- `PATCH /api/agreements/templates/:id`
- `DELETE /api/agreements/templates/:id`

Placeholder/preview/validation:
- `GET /api/agreements/placeholders`
- `POST /api/agreements/templates/preview`
- `POST /api/agreements/templates/validate`

Document history and maintenance:
- `GET /api/agreements/documents`
- `POST /api/agreements/documents/backfill`
- `POST /api/agreements/documents/sanitize-text`
- `POST /api/agreements/documents/:id/signed-copy`

PDF generation:
- `POST /api/agreements/pdf`

Permission pattern:
- Viewing templates/documents generally uses `issuances:view`.
- Editing templates/settings generally uses `settings:view` in the current route file.
- Backfill/sanitize/signed-copy operations use `issuances:edit`.

---

## Backend Template Service Flow

File:
- `server/src/services/agreement.service.ts`

Main template functions:
- `listTemplates()`
- `getTemplate(id)`
- `listTemplateVersions(templateId)`
- `createTemplate(data, logoPath?)`
- `updateTemplate(id, data, logoPath?)`
- `deleteTemplate(id)`
- `previewTemplate(content, mode)`
- `validateTemplateContent(content)`

Important behavior:

1. Only one default template is allowed.
   - When a template is marked as default, other templates are unset.

2. Creating a template also creates version 1.
   - Stored in `AgreementTemplateVersion`.

3. Updating a template can increment/create a new version.
   - Keeps history for auditability.

4. Preview mode uses sample data.
   - Single mode uses one sample asset.
   - Multiple mode uses three sample assets.

5. Preview output is sanitized.
   - This helps prevent old percent-divider artifacts from showing in preview.

---

## Issuance-to-Agreement Flow

High-level flow:

1. User selects personnel and one or more assets in the Issuance flow.
2. User selects or relies on the default agreement template.
3. Backend resolves the template using personnel/project/asset data.
4. Backend creates assignment rows.
5. Backend creates or links an `AgreementDocument` snapshot.
6. For batch/multiple assets, all assignment rows should point to the same agreement document.
7. Issuances page uses the document to View Agreement / preview PDF.

Critical concept:
- Single issuance and batch issuance must converge into the same document-based View Agreement path.
- The agreement document should carry the real document number, resolved body, assets, signatories, and signature metadata.

---

## View Agreement / PDF Generation Flow

Route:
- `POST /api/agreements/pdf`

Service:
- `generateAgreementPdf(input)` in `server/src/services/agreement.service.ts`

Important helper:
- `resolveAgreementPdfParams(input)`

Current expected flow:

1. Frontend sends a PDF request.
2. Request should include `agreementDocumentId` whenever the agreement already exists.
3. Backend calls `resolveAgreementPdfParams(input)`.
4. If `agreementDocumentId` is present, backend fetches `AgreementDocument` from DB.
5. Backend resolves recipient/document/signature fields from the DB document.
6. Backend resolves assets using the priority order below.
7. Backend builds a structured `AgreementDocumentView`.
8. Backend sanitizes only raw/stored body text.
9. Backend renders the body text.
10. Backend renders asset table directly through PDFKit.
11. Backend renders terms/signatures/footer.
12. Backend returns the PDF buffer.

---

## Asset Resolution Priority for View/PDF

This is the most important part for fixing stale/missing multi-asset agreement views.

When `agreementDocumentId` exists, the backend must resolve assets in this order:

1. `document.assignments` linked live assets
   - Best source when assignment rows are correctly linked.
   - Should include all assets in the batch.

2. `document.assetSnapshot`
   - Captured at issuance time.
   - Used if live assignment links are missing or incomplete.

3. `p.assets` from frontend payload
   - Final fallback only.
   - May be incomplete because the frontend row may only contain visible/current batch rows.

4. Single legacy `p.assetName` field
   - Last resort for older/single-asset paths.

Why this matters:
- The batch View Agreement button may have a frontend assets array that is incomplete or stale.
- Existing historical records may have saved dirty text or only the first asset in the frontend payload.
- The database document and assignments are the source of truth.

Correct behavior:
- Frontend should send `agreementDocumentId`.
- Backend should fetch the document and all linked assets.
- PDF should show all assets even if frontend sends only one asset as fallback.

---

## Document View Renderer

File:
- `server/src/services/agreementDocumentRenderer.service.ts`

Main function:
- `buildAgreementDocumentView(input)`

Purpose:
- Convert raw agreement fields into a structured view object.
- Separate title, recipient, clean body text, asset rows, and signatures.
- Strip old signature/table artifacts from body text.

Output shape:

```ts
interface AgreementDocumentView {
  title: string;
  documentNumber: string | null;
  recipient: {
    name: string;
    designation: string | null;
    institution: string | null;
    project: string | null;
  };
  bodyText: string;
  bodyParagraphs: string[];
  assets: AgreementDocumentViewAsset[];
  signatures: AgreementDocumentViewSignature[];
}
```

Key rule:
- `bodyText` is for letter paragraphs only.
- `assets` is a separate structured array.
- Signatures are separate structured blocks.

Do not merge asset rows back into `bodyText` for final PDF rendering.

---

## PDFKit Asset Table Rendering

File:
- `server/src/services/agreement.service.ts`

Function:
- `renderAssetTableToPdf(doc, assets, x, startY, contentWidth)`

Purpose:
- Draw asset rows as a real PDF table.
- Avoid plain-text alignment problems.
- Avoid legacy sanitizer accidentally stripping freshly generated rows.

Important comment now present above the function:

```ts
// Asset table is rendered directly via PDFKit. Do NOT pipe assets through sanitizeAgreementText().
```

Why this rule exists:
- Old saved body text may contain dirty inline legacy tables like:

```text
No. Asset Name Serial Number Property Number Condition
%%% %%%%%%%%%%%%%%%%%%%%%%%%% %%%%%%%%%%%%%%%%%%%%% %%%%%%%%%%%%%%%%%%%%% %%%%%%%%%
1 Canon imageRUNNER C3530 ...
```

- Sanitizers such as `stripLegacyAssetTableLines()` are designed to remove those old embedded tables.
- If a new clean generated asset table is appended to body text and then sanitized, the sanitizer may remove the new table too.
- Therefore final PDF asset rows must bypass body sanitization and be rendered directly from `documentView.assets`.

---

## Sanitization Rules

Relevant functions:
- `sanitizeAgreementText()`
- `stripLegacyAssetTableLines()`
- renderer cleanup functions in `agreementDocumentRenderer.service.ts`

Purpose:
- Remove old percent divider artifacts.
- Remove old flattened legacy table text embedded in saved snapshots.
- Remove duplicated signature blocks from old body text.

Correct scope:
- Apply sanitization to raw/saved template output and stored body text.
- Apply sanitization to `AgreementDocument.resolvedText` before treating it as body text.
- Apply sanitization to old `Assignment.agreementText` during cleanup/backfill.

Incorrect scope:
- Do not apply body sanitization to generated structured asset rows.
- Do not append a generated table to body text and then run `sanitizeAgreementText()`.

---

## Frontend View Agreement Behavior

File:
- `client/src/pages/IssuancesPage.tsx`

Important rule:
- For existing agreement documents, the frontend should include `agreementDocumentId` in the PDF request.

Single row behavior:
- Uses that row's `agreementDocumentId` / `agreementDocument`.

Batch row behavior:
- Must find the agreement document from the batch items.
- Must send `agreementDocumentId` from that document.
- May still send `assets` array, but only as fallback.

Why:
- A batch row can contain multiple assets under one agreement document.
- The currently visible frontend row data can be stale or partial.
- The backend must fetch the full linked set from DB.

Expected request shape includes:

```ts
{
  agreementDocumentId,
  title,
  documentNumber,
  personnelName,
  designation,
  project,
  institution,
  agreementText,
  assets,
  propertyOfficerName,
  authorizedRepName,
  recipientSignedAt,
  recipientSignatureName
}
```

---

## Known Failure Mode: Stale Multi-Asset Batch View

Symptom:
- View Agreement shows only one asset even though the batch has three.
- PDF output contains stale inline text or old table fragments.
- Output may show `%` divider rows or flattened legacy headers.

Example bad output:

```text
No. Asset Name Serial Number Property Number Condition
%%% %%%%%%%%%%%%%%%%%%%%%%%%% %%%%%%%%%%%%%%%%%%%%% %%%%%%%%%%%%%%%%%%%%% %%%%%%%%%
1 Canon imageRUNNER C3530 ...
3 Logitech Brio 4K Webcam ...
```

Root causes:
1. Frontend batch path sends only a fallback assets array without `agreementDocumentId`.
2. Backend trusts frontend `assets` instead of fetching document assignments.
3. Old `resolvedText` already contains embedded legacy asset table rows.
4. Generated asset table is passed through body sanitizer and gets stripped.

Correct fix:
1. Frontend sends `agreementDocumentId` for batch View Agreement.
2. Backend resolves `AgreementDocument` by ID.
3. Backend uses DB-linked assignments first, then asset snapshot, then frontend fallback.
4. Backend sanitizes only raw/stored body text.
5. Backend renders structured asset rows directly with PDFKit.

---

## Correct End-to-End Agreement Template Lifecycle

1. Admin creates/updates template in Accountability Templates page.
2. Backend stores template in `agreement_templates`.
3. Backend stores version in `agreement_template_versions`.
4. Issuance flow selects template/default template.
5. Backend parses template with actual personnel and asset data.
6. Backend stores an `AgreementDocument` snapshot.
7. Assignments link to the document.
8. View Agreement sends `agreementDocumentId`.
9. Backend fetches document and linked assignments/assets.
10. Backend builds structured document view.
11. PDFKit renders title, body, structured asset table, and signatures.
12. User views/downloads PDF.
13. Signed PDF can be uploaded against the document.

---

## What Not To Do

Do not:
- Treat the frontend `assets` array as authoritative for existing documents.
- Use only the first item in a batch to generate a multi-asset agreement.
- Render final PDF assets only as plain text inside `resolvedText`.
- Run generated asset rows through `sanitizeAgreementText()`.
- Remove `agreementDocumentId` from View Agreement payloads.
- Assume a template edit should alter old agreement documents.
- Fix only newly generated text while ignoring existing/stale `AgreementDocument.resolvedText`.
- Claim the fix works without testing the exact reported document number.

---

## Verification Checklist

For agreement template / View Agreement changes, verify this exact path:

1. Open AIO System UI.
2. Go to Issuances.
3. Open View Agreement for the specific record/batch.
4. Confirm the preview/PDF shows:
   - title
   - document number
   - recipient name
   - body letter text
   - all expected assets
   - all property numbers
   - condition values
   - signature block
   - no `%` / `%%%%%` artifacts
   - no old inline legacy asset table
   - no blank extra pages

CLI verification for PDF text:

```bash
pdftotext /tmp/angelo-test.pdf - | sed -n '1,160p'
pdfinfo /tmp/angelo-test.pdf | awk '/^Pages:/ {print $2}'
```

If using a temporary generator script, remove it after verification.

Server build:

```bash
npm run build --workspace=server
```

Optional client build:

```bash
npm run build --workspace=client
```

If client build changes `server/public` artifacts during local verification, do not accidentally commit unrelated build output unless deployment/static artifact update is intended.

---

## Example: Good Multi-Asset Output Expectations

For Angelo DeLos Santos document `AGR-20260520-31LN79`, expected asset rows are:

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

Expected document metadata:
- Document number: `AGR-20260520-31LN79`
- Recipient: `Angelo DeLos Santos`
- Signatures:
  - Recipient
  - Property Officer
  - Authorized Representative

Expected artifact status:
- No `%` divider rows.
- No `%%%%%` lines.
- No flattened inline legacy table inside the body.
- Structured PDF table header is allowed and expected.

---

## Short Mental Model

Template = reusable letter pattern.

Template parser = replaces placeholders.

AgreementDocument = frozen issued document snapshot.

Assignments/assets = authoritative source for actual issued assets.

Document renderer = separates body, assets, and signatures.

PDFKit renderer = draws the final document and structured asset table.

Sanitizer = cleans dirty saved text only, never generated asset rows.

Frontend View Agreement = should pass `agreementDocumentId` so backend can fetch the truth from DB.
