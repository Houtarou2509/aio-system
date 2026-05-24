# Agreement View/PDF Multi-Asset Rendering Problem

Date documented: May 21, 2026
Project: AIO System / Asset accountability system
Area: Issuances -> View Agreement -> generated agreement PDF/preview

---

## 1. Problem summary

When viewing an agreement letter for a batch/multi-asset issuance, the rendered agreement content is still wrong.

Observed user-facing output included:

```text
LSAHP TITLE
Issued: May 20, 2026 Doc:
AGR-20260520-31LN79
Recipient: Angelo DeLos Santos Assets: 3 Pending sign-off
LSAHP LETTER BODY
May 20, 2026 Angelo DeLos Santos , Field Interviewer of DRDF Inc., (LSAHP 2026) CAN-IR-C3530 Good Angelo DeLos Santos Field
Interviewer DRDF Inc., LSAHP 2026 Canon imageRUNNER C3530 PN-2023-001 No. Asset Name Serial Number Property
Number Condition
%%% %%%%%%%%%%%%%%%%%%%%%%%%% %%%%%%%%%%%%%%%%%%%%% %%%%%%%%%%%%%%%%%%%%% %%%%%%%%%
1 Canon imageRUNNER C3530 CAN-I90q LEN-M90Q-001 PN-2025-004 Good
3 Logitech Brio 4K Webcam LOG-BRIO-001 PN-2025-010 Good
```

Main symptoms:

1. Placeholder/table divider artifacts like `%%%` / `%%%%%%%` still appear.
2. The View Agreement/PDF output may show stale text from the saved agreement body.
3. Multi-asset rows are incomplete or inconsistent.
4. The database can contain multiple assets, but the rendered PDF may still show only one asset.
5. Previous fixes cleaned some text but did not fully fix the actual rendered View/PDF path.

Root concern:

The agreement renderer is mixing two different things:

- Old saved letter body text, which can contain broken legacy table output.
- Current structured agreement assets from `AgreementDocument`, assignments, and `assetSnapshot`.

The renderer must not trust the stale body text for the asset list. It should rebuild the asset section from source-of-truth asset data.

---

## 2. Stack used by the project

Repository path:

```text
/home/reggie/.hermes/workspace/aio-system
```

Monorepo/workspaces:

```text
root package: aio-system
workspaces:
- server
- client
- shared
```

Root scripts:

```text
npm run dev                # concurrently starts server and client
npm run dev:server         # server only
npm run dev:client         # client only
npm run build              # client build then server build
npm run test               # server tests
npm run test:smoke
npm run test:functional
npm run test:integration
npm run test:ui
npm run test:security
npm run db:migrate
npm run db:seed
```

Backend stack:

```text
Node.js / TypeScript
Express
Prisma ORM
PostgreSQL
PDFKit for PDF generation
Zod for request validation
Vitest / Supertest for tests
```

Important backend dependencies:

```text
express
@prisma/client
prisma
pdfkit
zod
jsonwebtoken
multer
helmet
cors
morgan
vitest
supertest
typescript
ts-node-dev
```

Frontend stack:

```text
React 18
TypeScript
Vite
Tailwind CSS
React Router
Radix UI components
lucide-react icons
Zod
Vitest
Playwright for UI tests
```

Important frontend dependencies:

```text
react
react-dom
vite
react-router-dom
react-hook-form
zod
lucide-react
@radix-ui/*
tailwindcss
@playwright/test
```

---

## 3. Environment used

Development host:

```text
WSL - Windows Subsystem for Linux
Linux home: /home/reggie
Project path: /home/reggie/.hermes/workspace/aio-system
```

```

---

## 4. Exact user path affected

UI path:

```text
AIO System -> Issuances -> View Agreement button
```

Frontend function path:

```text
client/src/pages/IssuancesPage.tsx
openAgreementPreview(params)
```

Network/API path:

```text
POST /api/agreements/pdf
```

Backend route path:

```text
server/src/routes/agreement.routes.ts
router.post('/pdf', ...)
```

Backend generation path:

```text
server/src/services/agreement.service.ts
generateAgreementPdf(input)
```

PDF renderer utilities involved:

```text
server/src/services/agreement.service.ts
- sanitizeAgreementText()
- stripLegacyAssetTableLines()
- formatAssetTableForPdf()
- composePdfBodyText()
- parseBodySegments()
- generateAgreementPdf()

server/src/services/agreementDocumentRenderer.service.ts
- buildAgreementDocumentView()
- stripSignatureAndLegacyTable()
- buildAssets()
```

---

## 5. Data model involved

Main Prisma model:

```text
server/prisma/schema.prisma
model AgreementDocument
```

Relevant fields:

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
}
```

Important meaning:

- `AgreementDocument.resolvedText` is the saved text body. This can contain stale/broken legacy table content.
- `AgreementDocument.assetSnapshot` stores asset data captured at issuance time.
- `AgreementDocument.assignments` links the document to assignment rows.
- Each assignment links to the current `Asset` record.

Correct source-of-truth order should be:

1. AgreementDocument assignments + linked assets, if present.
2. AgreementDocument `assetSnapshot`, as fallback.
3. Frontend payload `assets`, as final fallback.
4. Single `assetName` fields only for old/single-asset compatibility.

---

## 6. File map

### Backend route and schema

```text
server/src/routes/agreement.routes.ts
```

Relevant route:

```ts
router.post(
  '/pdf',
  authenticate,
  hasPermission('issuances:view'),
  validate(agreementPdfSchema),
  async (req, res) => {
    const pdfBuffer = await agreementService.generateAgreementPdf(req.body);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="...pdf"`);
    res.send(pdfBuffer);
  }
);
```

```text
server/src/routes/agreement.schema.ts
```

Relevant schema:

```ts
const pdfAssetSchema = z.object({
  name: z.string().min(1).max(500),
  serialNumber: z.string().max(200).optional().nullable(),
  propertyNumber: z.string().max(200).optional().nullable(),
  condition: z.string().max(100).optional().nullable(),
});

export const agreementPdfSchema = z.object({
  personnelName: z.string().min(1).max(500),
  designation: z.string().max(500).optional().nullable(),
  position: z.string().max(500).optional().nullable(),
  project: z.string().max(500).optional().nullable(),
  institution: z.string().max(500).optional().nullable(),
  assetName: z.string().min(1).max(500),
  serialNumber: z.string().max(200).optional().nullable(),
  propertyNumber: z.string().max(200).optional().nullable(),
  condition: z.string().max(100).optional().nullable(),
  templateId: z.string().uuid().optional().nullable(),
  agreementText: z.string().max(100000).optional().nullable(),
  title: z.string().max(500).optional().nullable(),
  propertyOfficerName: z.string().max(200).optional().nullable(),
  authorizedRepName: z.string().max(200).optional().nullable(),
  assets: z.array(pdfAssetSchema).max(100).optional(),
  recipientSignedAt: z.union([z.string(), z.date()]).optional().nullable(),
  recipientSignatureName: z.string().max(200).optional().nullable(),
  documentNumber: z.string().max(100).optional().nullable(),
  agreementDocumentId: z.string().uuid().optional().nullable(),
});
```

### Backend PDF generator

```text
server/src/services/agreement.service.ts
```

Important functions:

```text
sanitizeAgreementText()
stripLegacyAssetTableLines()
formatAssetTableForPdf()
composePdfBodyText()
parseBodySegments()
resolveAgreementPdfParams()
generateAgreementPdf()
```

### Backend document view builder

```text
server/src/services/agreementDocumentRenderer.service.ts
```

Important functions:

```text
sanitizeAgreementText()
stripSignatureAndLegacyTable()
buildAssets()
buildSignatures()
buildAgreementDocumentView()
```

### Frontend issuance page

```text
client/src/pages/IssuancesPage.tsx
```

Important areas:

```text
openAgreementPreview(params)
Single-row View Agreement button
Batch-row View Agreement button
PDFPreviewModal usage
```

Relevant frontend flow:

```ts
const openAgreementPreview = useCallback(async (params) => {
  const res = await fetch('/api/agreements/pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/pdf',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  setPdfPreview({ blobUrl: url, loading: false, filename: ... });
}, []);
```

Batch-row payload includes:

```ts
assets: batchItems.map(bi => ({
  name: bi.asset?.name || '—',
  serialNumber: bi.asset?.serialNumber || undefined,
  propertyNumber: bi.asset?.propertyNumber || undefined,
  condition: bi.condition || first.condition || undefined,
}))
```

Single-row payload includes `agreementDocumentId` but not an `assets` array.

### PDF preview modal

```text
client/src/components/issuances/PDFPreviewModal.tsx
```

Responsibilities:

- Displays generated PDF blob in iframe.
- Allows print/download.
- Handles signed PDF copy upload.
- Uses `agreementDocumentId` for document-level signed-copy upload.

---

## 7. What was already attempted

### Attempt 1: Remove percent divider artifacts

Implemented/attempted in backend sanitizers:

```text
server/src/services/agreement.service.ts
sanitizeAgreementText()

server/src/services/agreementDocumentRenderer.service.ts
sanitizeAgreementText()
```

Goal:

- Remove lines made mostly of `%`, `_`, dashes, or other divider characters.
- Remove inline percent divider runs.

Example logic:

```ts
const percentCount = (trimmed.match(/%/g) || []).length;

if (
  (percentCount >= 5 && /^[%\s\-–—_]+$/.test(trimmed)) ||
  /^[\s\-–—_─━═=]{5,}$/.test(trimmed)
) {
  return '';
}

return line.replace(/[ \t]*%[%\s\-–—_]{4,}%[%\s\-–—_]*/g, ' ');
```

Result:

- Helps remove divider artifacts in some text paths.
- Not sufficient because View/PDF rendering can still use stale/broken saved `resolvedText` and legacy table content.

### Attempt 2: Strip legacy asset table from saved body text

Implemented/attempted:

```text
server/src/services/agreement.service.ts
stripLegacyAssetTableLines()

server/src/services/agreementDocumentRenderer.service.ts
stripSignatureAndLegacyTable()
```

Goal:

- Detect old table header:

```text
No. Asset Name Serial Number Property Number Condition
```

- Remove that header and old rows from body text.

Result:

- Partially helps remove stale table text.
- Risk: the same stripping logic can accidentally strip the new clean asset table if the new table is inserted as plain text and then sanitized again.

### Attempt 3: Add PDF payload fields for document-level source of truth

Changed/attempted:

```text
server/src/routes/agreement.schema.ts
```

Added:

```text
assets[].condition
agreementDocumentId
```

Goal:

- Allow frontend to send the agreement document ID.
- Allow backend to resolve real document assets instead of trusting frontend asset text.

Result:

- Good direction.
- Not enough by itself because the final PDF body composition still loses the asset table.

### Attempt 4: Backend resolver for AgreementDocument data

Changed/attempted:

```text
server/src/services/agreement.service.ts
resolveAgreementPdfParams()
```

Current resolver behavior:

```ts
if (!p.agreementDocumentId) return p;

const document = await prisma.agreementDocument.findUnique({
  where: { id: p.agreementDocumentId },
  include: {
    assignments: {
      orderBy: { assignedAt: 'asc' },
      include: {
        asset: { select: { name: true, serialNumber: true, propertyNumber: true } },
      },
    },
    personnel: { ... },
  },
});

const assignmentAssets = document.assignments.map((assignment) => ({
  name: assignment.asset?.name || '—',
  serialNumber: assignment.asset?.serialNumber || null,
  propertyNumber: assignment.asset?.propertyNumber || null,
  condition: assignment.conditionAtIssue || assignment.condition || p.condition || 'Good',
}));

const snapshotAssets = assetSnapshotArray(document.assetSnapshot);
const documentAssets = assignmentAssets.length ? assignmentAssets : snapshotAssets;
```

Goal:

- If `agreementDocumentId` is sent, backend fetches the real document.
- Backend uses document assignments/assets or asset snapshot.
- Backend overrides frontend partial/stale fields.

Result:

- This proved useful and should stay.
- But rendered PDF still did not show all assets, meaning the remaining bug is after data resolution.

### Attempt 5: Frontend batch payload includes per-asset condition

Changed/attempted:

```text
client/src/pages/IssuancesPage.tsx
```

Batch View Agreement payload now includes:

```ts
assets: batchItems.map(bi => ({
  name: bi.asset?.name || '—',
  serialNumber: bi.asset?.serialNumber || undefined,
  propertyNumber: bi.asset?.propertyNumber || undefined,
  condition: bi.condition || first.condition || undefined,
}))
```

Goal:

- Multi-asset preview has per-asset condition.

Result:

- Useful fallback.
- Still not enough because document-level rendering should not rely only on frontend payload.

---

## 8. Verification already performed

A local test script was used:

```text
server/tmp-generate-angelo-pdf.ts
```

Command used:

```bash
npx ts-node --transpile-only tmp-generate-angelo-pdf.ts 4ce7ce6b-ec8b-453a-8015-cf89f7879c88 && pdftotext /tmp/angelo-test.pdf - | sed -n '1,120p'
```

Output observed:

```text
LSAHP TITLE
LSAHP LETTER BODY
May 21, 2026 Angelo DeLos Santos , Field Interviewer of DRDF Inc., (LSAHP 2026) CAN-IR-C3530 Good Angelo DeLos Santos Field
Interviewer DRDF Inc., LSAHP 2026 Canon imageRUNNER C3530 PN-2023-001

Angelo DeLos Santos

TEST Officer

Test Representative

Recipient

Property Officer

Authorized Representative

Page 1 of 1

AGR-20260521-FRW0MQ
```

Meaning:

- The generated PDF did not include the expected full multi-asset list.
- The output still rendered only the old body text/first asset.
- This proves the bug is not only database storage. It is in the View/PDF rendering/composition path.

Also verified:

```bash
npm run build --workspace=server
```

Result:

```text
PASSED
```

Important: build passing does not mean the user-facing rendered PDF is correct.

---

## 9. Current likely root cause

Current problematic flow in `server/src/services/agreement.service.ts`:

```ts
const cleanBody = composePdfBodyText(documentView)
  .replace(/\r\n?/g, '\n')
  .split('\n')
  .map(line => line.trim())
  .join('\n');

const normalizedBody = normalizePercentDividers(cleanBody)
  .replace(/\n{3,}/g, '\n\n');

const segments = parseBodySegments(normalizedBody);
```

Important functions:

```ts
function composePdfBodyText(view: AgreementDocumentView): string {
  const assetTable = formatAssetTableForPdf(view);
  if (!assetTable) return view.bodyText;

  const lines = view.bodyText.split('\n');
  const termsIndex = lines.findIndex((line) => line.trim().startsWith('Terms and Conditions:'));
  if (termsIndex === -1) {
    return sanitizeAgreementText([view.bodyText, assetTable].filter(Boolean).join('\n\n'));
  }

  return sanitizeAgreementText([
    ...lines.slice(0, termsIndex),
    '',
    assetTable,
    '',
    ...lines.slice(termsIndex),
  ].join('\n'));
}
```

Potential bug:

1. `composePdfBodyText()` creates a clean asset table as plain text:

```text
No. Asset Name Serial Number Property Number Condition
1 Canon imageRUNNER C3530 ...
2 ...
3 ...
```

2. It then passes that joined text through `sanitizeAgreementText()`.
3. `sanitizeAgreementText()` calls `stripLegacyAssetTableLines()`.
4. `stripLegacyAssetTableLines()` removes any table that starts with:

```text
No. Asset Name Serial Number Property Number Condition
```

5. Therefore, the code may create the new correct asset table and then remove it again as if it were a legacy dirty table.

That explains why the resolved assets can exist but the PDF text still lacks the full table.

---

## 10. Current git working tree status at time of documentation

Current modified files:

```text
M client/src/pages/IssuancesPage.tsx
M server/src/routes/agreement.schema.ts
M server/src/services/agreement.service.ts
```

Deleted/untracked files also present under `concern/` and a temp script:

```text
D concern/agreement-juan-dela-cruz.pdf:Zone.Identifier
D concern/img20260508_17310015.pdf
?? concern/accountability-flow.png
?? concern/accountability-flow.svg
?? concern/agreement-angelo-delos-santos (1).pdf
?? concern/agreement-angelo-delos-santos (1).pdf:Zone.Identifier
?? concern/render-accountability-flow.js
?? server/tmp-generate-angelo-pdf.ts
```

Diff stat at time of documentation:

```text
client/src/pages/IssuancesPage.tsx                 |   1 +
server/src/routes/agreement.schema.ts              |   2 +
server/src/services/agreement.service.ts           |  86 +++++++++++++++++++--
5 files changed, 84 insertions(+), 5 deletions(-)
```

No commit/push/deploy was done for this incomplete fix.

---

## 11. Correct solution direction

Do not keep inserting the new asset table as plain text and then sending it through the same legacy-table sanitizer.

The safer fix:

### Step 1: Treat body text and asset table separately

- Sanitize body text only.
- Strip old legacy asset table only from saved `resolvedText` / body text.
- Build `documentView.assets` from source-of-truth data.
- Render assets as structured PDF rows directly, not as a string that goes through `sanitizeAgreementText()`.

### Step 2: Change PDF generation layout

Instead of:

```ts
const cleanBody = composePdfBodyText(documentView);
const normalizedBody = normalizePercentDividers(cleanBody);
const segments = parseBodySegments(normalizedBody);
```

Use a flow closer to:

```text
1. build documentView
2. parse/render clean body paragraphs only
3. render structured asset table from documentView.assets
4. render remaining terms/body text if needed
5. render signature block
```

Or minimally:

```text
1. sanitize/strip legacy table from body first
2. insert a marker for asset table that sanitizer will not remove
3. parse segments
4. when marker is reached, render documentView.assets directly
```

### Step 3: Add a dedicated renderer for asset rows

Recommended new function in `server/src/services/agreement.service.ts`:

```ts
function renderAssetTable(doc, assets, x, y, width): number {
  // Draw header row
  // Draw each asset row with columns:
  // No., Asset Name, Serial Number, Property Number, Condition
  // Handle wrapping/continuation pages
  // Return updated y position
}
```

The asset renderer must use `documentView.assets`, not `documentView.bodyText`.

### Step 4: Never run the generated structured asset rows through legacy sanitizer

Important rule:

```text
Dirty saved body text -> sanitizer allowed
New structured asset table -> sanitizer forbidden
```

### Step 5: Verification must be PDF text extraction, not just DB check

Required verification command pattern:

```bash
npx ts-node --transpile-only tmp-generate-angelo-pdf.ts <agreementDocumentId>
pdftotext /tmp/angelo-test.pdf - | sed -n '1,160p'
```

Expected proof:

- No `%%%`
- No `%%%%%%%`
- No broken placeholder divider line
- All expected assets appear by name
- All expected property numbers appear
- Document number appears
- Signatures still appear
- No accidental blank pages

---

## 12. Acceptance criteria

A fix should not be considered done until all items below are true.

For the exact Angelo/multi-asset agreement:

1. View Agreement opens successfully from the Issuances page.
2. The generated PDF/preview has no percent divider artifacts.
3. The generated PDF/preview shows every asset in the agreement, not only the first one.
4. Asset rows come from `AgreementDocument.assignments` or `AgreementDocument.assetSnapshot`, not stale body text.
5. The output is verified by extracting text from the actual generated PDF.
6. The PDF still contains:
   - title
   - body letter text
   - document number
   - recipient information
   - asset list
   - signature area
   - footer/page number
7. Existing/stale records are handled, not only newly created agreements.

---

## 13. Important warning for the next developer/agent

Do not say this is fixed after only checking:

```text
- database rows
- TypeScript build
- frontend payload
- sanitizer unit behavior
```

Those checks are not enough.

The only reliable proof is:

```text
Generate the actual PDF from the same View Agreement code path and inspect/extract the rendered output.
```

This issue persisted because earlier fixes were judged too early. The final fix must be verified against the actual rendered agreement letter.

---

## 14. Recommended immediate next implementation

The next implementation should modify:

```text
server/src/services/agreement.service.ts
```

Specifically:

1. Stop using `composePdfBodyText()` to inject the asset table as plain text.
2. Keep `stripLegacyAssetTableLines()` only for cleaning old `resolvedText`.
3. Render `documentView.assets` directly inside the PDFKit drawing loop.
4. Add page-break handling for asset table rows.
5. Re-run PDF extraction for Angelo document.
6. Only after local verification, apply the same fix to production and verify the production View Agreement.

---

## 15. Human note

This problem is frustrating because the UI can look like it is fixed in one layer while another layer still renders stale content. The correct mental model is:

```text
Agreement body text is not the source of truth for assets.
AgreementDocument + assignments/assetSnapshot are the source of truth for assets.
The PDF renderer must enforce that source of truth every time View Agreement is opened.
```
