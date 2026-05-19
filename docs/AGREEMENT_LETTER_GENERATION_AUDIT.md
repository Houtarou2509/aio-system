# Agreement Letter Generation Audit & Recommendations

Audit timestamp: 2026-05-19 11:53 +08
Scope: AIO System accountability agreement templates, issuance agreement resolution, PDF generation, PDF preview/download/upload, and recipient sign-off flow.

## Executive Summary

The agreement-letter system is functional and has the correct foundation: templates are stored in the database, placeholders are resolved server-side, the issuance wizard supports single and multi-asset agreements, generated PDFs include metadata/sign-off status, and recipient digital sign-off is persisted on assignment records.

However, the current implementation is not yet strong enough for a real accountability-document workflow. The main risks are:

1. The actual generated PDF does not preserve the exact resolved agreement text saved during issuance.
2. The PDF body rendering can silently truncate content when the body exceeds the fixed one-page area.
3. Template preview in the template editor is not using the same parser/data path as final PDF generation.
4. Signatory names entered during issuance are not persisted, so regenerated PDFs can lose the actual signatories used at issuance time.
5. The system mixes three concepts: template content, resolved agreement text, and final PDF rendering. These need a cleaner document lifecycle.
6. The fallback/default behavior can generate poor output when the default template is test/sample content.

Recommendation: before adding more visual polish, stabilize the document lifecycle: resolve once, snapshot the resolved document, persist signatories and document metadata, and generate PDFs from that immutable snapshot instead of reconstructing from current template/personnel/asset state.

## Current System Map

### Data Layer

Relevant Prisma models:

- `AgreementTemplate`
  - `id`
  - `name`
  - `title`
  - `content`
  - `headerLogo`
  - `defaultLogo`
  - `isDefault`
  - `defaultPropertyOfficer`
  - `defaultAuthorizedRep`
  - timestamps

- `Assignment`
  - `agreementText`
  - `agreementId`
  - `bulkBatchId`
  - `recipientSignedAt`
  - `recipientSignatureName`
  - `recipientSignatureMethod`
  - `recipientSignatureIp`

Verified database state:

- Assignment agreement/sign-off columns exist in active DB.
- One template exists.
- One template is marked default.

### Backend Flow

Primary files:

- `server/src/routes/agreement.routes.ts`
- `server/src/services/agreement.service.ts`
- `server/src/utils/templateParser.ts`
- `server/src/routes/issuance.routes.ts`
- `server/src/services/issuance.service.ts`
- `server/src/routes/issuance.schema.ts`

Current backend flow:

1. Templates are managed through `/api/agreements/templates`.
2. Placeholder list is served from `/api/agreements/placeholders`.
3. Issuance preview resolves template text through `/api/issuances/resolve-template` or `/api/issuances/resolve-template/bulk`.
4. Bulk issuance calls `bulkIssueAssets()`, resolves template text, and saves the same `agreementText` to every assignment in the batch.
5. PDF preview/generation calls `/api/agreements/pdf`, which runs `generateAgreementPdf()`.
6. Digital sign-off calls `POST /api/issuances/:id/sign` and updates either one assignment or all unsigned active assignments in the same `bulkBatchId`.

### Frontend Flow

Primary files:

- `client/src/pages/AccountabilityTemplatesPage.tsx`
- `client/src/components/issuances/BulkIssuanceWizard.tsx`
- `client/src/pages/IssuancesPage.tsx`
- `client/src/components/issuances/PDFPreviewModal.tsx`
- `client/src/lib/api.ts`

Current frontend behavior:

1. Template page allows creating/editing templates and inserting variables.
2. Unified issuance wizard supports selecting 1 or many assets.
3. Wizard resolves agreement text server-side and shows it in an editable textarea.
4. Wizard can preview generated PDF before issuing.
5. Issuances page groups bulk batches into one row.
6. Issuances page can preview the agreement PDF and trigger digital sign-off.
7. PDF preview modal supports print, download, and uploading a signed copy to the personnel profile.

## Verification Performed

### Passed

- `cd server && npx prisma validate` passed.
- `npm run build` passed.
- Template parser supports:
  - `{{assetParagraph}}`
  - `{{assetTable}}`
  - `{{assetSection}}`
  - `{{assetCount}}`
  - `{{#ifSingleAsset}}...{{/ifSingleAsset}}`
  - `{{#ifMultipleAssets}}...{{/ifMultipleAssets}}`
- Active DB has the expected assignment columns.
- Active DB has a default template.
- Direct PDF generation produced a PDF buffer successfully.

### Warning From PDF Text Extraction

A sample generated PDF extracted text resembling:

```text
LSAHP TITLE
Issued: May 19, 2026
Recipient: Juan Dela Cruz
Assets: 3
Pending recipient signoff
LSAHP LETTER BODY
...
TEST Officer
Test Representative
```

This suggests the current default template in the local DB may be test/sample content, not a production-ready DRDF accountability letter. Even if the engine works, the active default template content itself needs review.

## Major Findings & Recommendations

## 1. Critical: PDF generation does not use saved `agreementText`

### Current State

During issuance, the system resolves template content and stores it as `assignment.agreementText`.

But later, when viewing a PDF from the issuances table, the frontend reconstructs PDF params from current assignment/personnel/asset fields and calls `/api/agreements/pdf`. The PDF service then fetches the template again and parses the current template content.

### Risk

The PDF viewed later may not match the agreement text that was shown or accepted during issuance.

Examples:

- Admin edits the template after an asset was issued.
- Personnel designation/project/institution changes after issuance.
- Asset name/property number changes after issuance.
- Signatory defaults change after issuance.
- The agreement textarea was edited manually in the wizard, but that edited text is not used for PDF preview/regeneration.

This is a serious document-integrity issue because an accountability agreement should be a historical record, not a live rendering of current data.

### Recommendation

Make `agreementText` the source of truth after issuance.

Add one of these patterns:

Option A — quick stabilization:
- Add `agreementText` to the list issuance API response.
- When viewing an existing issuance, pass `agreementText` to the PDF endpoint.
- Update `generateAgreementPdf()` to prefer `p.agreementText` if supplied.

Option B — better document architecture:
- Create an `AgreementDocument` table:
  - `id`
  - `assignmentId` or `bulkBatchId`
  - `templateId`
  - `templateVersionSnapshot`
  - `resolvedText`
  - `title`
  - `headerLogo`
  - `propertyOfficerName`
  - `authorizedRepName`
  - `documentNumber`
  - `pdfPath` or generated-on-demand hash
  - `createdAt`
  - `createdById`
  - sign-off fields/status
- Assignments reference the generated document.

Priority: P0

## 2. Critical: PDF body can silently truncate

### Current State

`generateAgreementPdf()` renders within a fixed body area and stops rendering when content exceeds `MAX_BODY_Y`:

```ts
if (y + lh > MAX_BODY_Y) break;
```

### Risk

Long agreements or many-asset tables can be silently cut off. There is no page 2, no warning, no returned error, and no visual alert in the UI.

For accountability documents, silent truncation is dangerous. Terms or asset rows can disappear.

### Recommendation

Implement multi-page PDF rendering.

Minimum acceptable fix:
- If content does not fit, call `doc.addPage()` and continue rendering.
- Repeat header or compact metadata on continuation pages.
- Keep signature block on the final page only.
- Add page numbers.

Better fix:
- Split PDF renderer into sections:
  - header
  - metadata strip
  - body paragraphs
  - asset table
  - terms
  - signatories
- Use a reusable `ensureSpace(height)` helper.
- Render multi-asset tables as actual PDF table rows instead of monospaced text.

Priority: P0

## 3. High: Template editor preview does not use server parser

### Current State

`AccountabilityTemplatesPage.tsx` has local sample replacement logic:

- It strips single-asset conditional blocks.
- It always keeps multiple-asset conditional blocks.
- It manually replaces sample values from `SAMPLE_DATA`.

### Risk

Preview can drift from final PDF behavior.

Specific issues:

- Template preview always behaves like a multi-asset preview.
- It does not call the backend parser.
- It does not test the single-asset branch.
- It can hide parser bugs until issuance/PDF generation.

### Recommendation

Add backend preview endpoint or reusable client parser parity.

Recommended endpoint:

`POST /api/agreements/preview`

Body:

```json
{
  "content": "template text",
  "mode": "single" | "multiple",
  "sampleData": optional
}
```

Return:

```json
{
  "resolvedText": "...",
  "warnings": ["Unknown placeholder {{x}}"]
}
```

Frontend template page should provide:

- Single-asset preview tab
- Multi-asset preview tab
- Unknown placeholder warnings
- Conditional block validation

Priority: P1

## 4. High: Signatory names entered during issuance are not persisted

### Current State

The bulk wizard captures:

- `propertyOfficerName`
- `authorizedRepName`

These are sent to `bulkIssueAssets()`, but the service does not save them to assignments or a document record. They are only useful for immediate PDF preview if passed directly.

When viewing the agreement later, the PDF uses current template defaults instead.

### Risk

The generated agreement can later show different signatories from the actual issuance.

### Recommendation

Persist signatory snapshots at issuance time.

Minimum:
- Add to `assignments`:
  - `propertyOfficerNameSnapshot`
  - `authorizedRepNameSnapshot`

Better:
- Store these in a separate `AgreementDocument` table.

Priority: P1

## 5. High: Edited agreement textarea may not affect issued PDF

### Current State

The wizard shows an editable agreement textarea. However:

- `handleIssue()` sends template ID and signatory fields.
- It does not send the edited `agreement` text.
- Backend resolves template again during `bulkIssueAssets()`.

### Risk

User edits shown agreement text, assumes it will be used, but final saved agreement may ignore those edits.

### Recommendation

Decide UX intent:

Option A — agreement body is editable:
- Send `agreementText: agreement` to backend on issue.
- Save that exact text.
- Generate final PDF from that exact text.

Option B — agreement body is preview-only:
- Make textarea read-only.
- Provide clear “Edit template” action instead.

For accountability documents, I recommend Option A only if edits are audited and versioned; otherwise Option B is safer.

Priority: P1

## 6. High: PDF endpoint accepts loosely validated body

### Current State

`POST /api/agreements/pdf` passes `req.body` directly to `generateAgreementPdf()` without Zod validation.

### Risk

Invalid/missing values can produce bad documents instead of clear validation errors. It is also inconsistent with the rest of the backend route style.

### Recommendation

Add `generateAgreementPdfSchema` in `agreement.schema.ts`.

Validate:

- `personnelName` required
- `assetName` required unless `assets` exists
- `assets` array shape
- optional sign-off fields
- optional signatory names
- optional `agreementText`
- optional `templateId`

Priority: P1

## 7. Medium: Default template content needs production control

### Current State

The local default template appears to contain test/sample labels such as `LSAHP TITLE`, `LSAHP LETTER BODY`, `TEST Officer`, and `Test Representative`.

### Risk

A user can generate a valid PDF with invalid official wording/header/signatories.

### Recommendation

Add template governance:

- Seed a production DRDF default template.
- Add “Draft / Active / Archived” status to templates.
- Only active templates can be used for issuance.
- Require explicit confirmation before making a template default.
- Show “last updated by / updated at”.
- Consider admin-only template editing using a more precise permission than `settings:view`.

Priority: P1

## 8. Medium: Template versioning is missing

### Current State

Templates are mutable in place.

### Risk

Historical issuances cannot prove which template wording was active at issuance time.

### Recommendation

Implement versioning:

- `AgreementTemplateVersion`
  - `id`
  - `templateId`
  - `versionNumber`
  - `title`
  - `content`
  - `headerLogo`
  - signatory defaults
  - `createdAt`
  - `createdById`
- Each agreement document stores the version used.

Priority: P2

## 9. Medium: Digital sign-off is internal/admin-driven, not recipient-driven

### Current State

The sign-off button is available to users with `issuances:edit`. The signer name is typed into a modal.

### Risk

This is more of an admin-recorded acknowledgement than an actual recipient sign-off. It may be acceptable operationally, but the document label “Digitally signed” can imply stronger assurance than the system provides.

### Recommendation

Clarify sign-off model.

If admin-recorded:
- Label as “Acknowledgement recorded by [admin]”.
- Store `performedById`, IP, user agent, timestamp.

If recipient-driven:
- Generate a secure sign-off link/QR token.
- Recipient signs by opening the link.
- Capture recipient IP/user-agent/timestamp.
- Optional typed-name attestation checkbox.

Priority: P2

## 10. Medium: Batch sign-off audit log only records one assignment ID

### Current State

Batch sign-off updates all unsigned assignments in the batch, but creates one audit log using the clicked assignment ID.

### Risk

Other assignment rows in the batch may not show direct audit history for their sign-off.

### Recommendation

For batch sign-off:

- Create an audit log for each assignment updated, or
- Create a batch-level document audit log if an `AgreementDocument` entity is added.

Priority: P2

## 11. Medium: PDF rendering uses monospaced text table instead of structured table

### Current State

`{{assetTable}}` produces fixed-width text using padding and slicing.

### Risk

Long names, serials, or property numbers are truncated. Extracted text can look messy. Alignment depends on font and PDF text extraction behavior.

### Recommendation

Move multi-asset table rendering out of raw template text and into the PDF renderer.

Approach:

- Template uses `{{assetTable}}` as semantic marker.
- Parser returns segments/blocks, not only a flat string.
- PDF renderer detects table block and renders real columns with wrapping.

Priority: P2

## 12. Medium: Template placeholder validation is missing

### Current State

Unknown placeholders remain in the output as `{{unknownKey}}`.

### Risk

Final PDFs can contain unresolved placeholders.

### Recommendation

Add validation before saving and before issuance:

- Detect unknown placeholders.
- Detect unclosed conditional blocks.
- Warn about deprecated aliases.
- Block issuing if unresolved placeholders remain unless admin explicitly overrides.

Priority: P2

## 13. Low: Upload signed copy is linked to personnel, not agreement/assignment

### Current State

The PDF preview modal uploads signed PDFs to:

`POST /api/personnel/:personnelId/signed-agreement`

### Risk

A personnel profile can have a signed agreement, but the uploaded file may not be linked to the specific assignment/batch agreement it belongs to.

### Recommendation

Attach signed copy to the agreement document or batch:

- `AgreementDocument.signedPdfPath`
- `AgreementDocument.signedUploadedAt`
- `AgreementDocument.signedUploadedById`

Keep a personnel-level latest/summary view, but store the source of truth at document level.

Priority: P2

## 14. Low: Permission names should be more granular

### Current State

Template modification uses `settings:view`.

### Risk

A user allowed to view settings may be able to create/edit/delete official agreement templates.

### Recommendation

Add granular permissions:

- `agreements:view`
- `agreements:create`
- `agreements:edit`
- `agreements:delete`
- `agreements:sign`

Or map to existing `issuances:create/edit` where appropriate.

Priority: P3

## Recommended Implementation Plan

## Phase A — Document Integrity Stabilization

Goal: make existing issued documents reproducible.

1. Add `agreementText` to list issuance responses.
2. Update PDF generation schema to accept `agreementText`.
3. Update `generateAgreementPdf()` to use supplied `agreementText` as source of truth before parsing template content.
4. Decide whether wizard agreement textarea is editable or preview-only.
5. If editable, send edited agreement text to backend during issuance.
6. Persist signatory snapshots.
7. Add tests proving that template edits after issuance do not alter an existing agreement PDF.

Priority: do this first.

## Phase B — Multi-page PDF Reliability

Goal: no silent truncation.

1. Add `ensureSpace()` helper.
2. Add continuation page support.
3. Move signature block to final page.
4. Add page number/footer.
5. Add regression test with 30+ assets.
6. Add test for long terms body.

Priority: second.

## Phase C — Template Preview & Validation

Goal: template admins can trust preview.

1. Add backend preview endpoint using `parseTemplate()`.
2. Add single/multiple preview tabs.
3. Add placeholder validation endpoint/function.
4. Show warnings in template editor.
5. Block unresolved placeholders in active/default templates.

Priority: third.

## Phase D — AgreementDocument Model

Goal: mature document lifecycle.

1. Add `AgreementDocument` model.
2. Store immutable snapshot per single issuance or batch.
3. Link assignments to document ID.
4. Move signed upload to document record.
5. Add document status:
   - draft
   - issued
   - signed
   - superseded
   - voided
6. Add downloadable document history.

Priority: fourth.

## Suggested Data Model Improvement

Recommended new model:

```prisma
model AgreementDocument {
  id                         String   @id @default(uuid())
  documentNumber             String   @unique
  templateId                 String?
  templateVersion            Int?
  title                      String
  resolvedText               String
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
  createdAt                  DateTime @default(now())
  updatedAt                  DateTime @updatedAt
}
```

Assignments can either reference `agreementDocumentId`, or single/batch lookups can be done through `bulkBatchId`.

## Suggested PDF Renderer Improvement

Split `agreement.service.ts` into smaller modules:

- `agreement-template.service.ts`
- `agreement-document.service.ts`
- `agreement-pdf.service.ts`
- `agreement-template-parser.ts`
- `agreement-validation.ts`

Recommended renderer flow:

1. Build normalized document object.
2. Validate all required fields.
3. Render header.
4. Render metadata strip.
5. Render body blocks.
6. Render asset table block with structured columns.
7. Render terms.
8. Add new page as needed.
9. Render signatories on final page.
10. Add page numbers/document number.

## Priority Table

| Priority | Recommendation | Why |
|---|---|---|
| P0 | Generate existing PDFs from saved `agreementText` / immutable snapshot | Prevents historical document drift |
| P0 | Add multi-page PDF rendering | Prevents silent truncation |
| P1 | Persist signatory snapshots | Prevents regenerated PDFs showing wrong signatories |
| P1 | Fix edited agreement textarea behavior | Prevents user-visible text differing from saved/final text |
| P1 | Add Zod validation for PDF endpoint | Prevents malformed PDFs and bad inputs |
| P1 | Replace template editor preview with server parser preview | Prevents preview/final drift |
| P1 | Replace local default/test template with production DRDF template | Prevents invalid official output |
| P2 | Add template versioning | Auditability and legal/document traceability |
| P2 | Add document-level signed-copy storage | Correct ownership of uploaded signed PDFs |
| P2 | Improve batch sign-off audit logs | Better per-assignment traceability |
| P2 | Render real PDF tables | Better multi-asset readability |
| P3 | Add granular agreement permissions | Better admin control |

## Final Recommendation

The system is ready as a prototype/operational MVP, but not yet robust enough as the permanent official agreement-letter engine.

The most important change is conceptual: stop treating agreement PDFs as live renders of current database/template state. Treat each agreement as an immutable issued document with a snapshot of wording, personnel, assets, signatories, and sign-off state.

Once that is done, visual polish and template UX improvements will be much safer because the underlying recordkeeping will be stable.
