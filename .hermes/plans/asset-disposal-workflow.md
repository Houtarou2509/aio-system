# Asset Disposal / Write-Off Workflow — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace the blunt "delete=retire" with a formal disposal workflow: mark for disposal → admin approval → write-off with reason/date/method.

**Architecture:** Add `DisposalMethod` enum and disposal fields to the Asset model. A new `POST /api/assets/:id/dispose` endpoint handles the write-off. The existing Assets page gets a "Dispose" action in the bulk toolbar and individual row menus. No separate disposal page — it lives inside a modal with reason + method + date fields. The depreciation cron (if present) is checked to ensure disposed assets are skipped.

**Tech Stack:** Prisma migrations, Express routes, React + TailwindCSS + shadcn/ui, Zod validation

---

## Current State

- `AssetStatus` enum: AVAILABLE, ASSIGNED, MAINTENANCE, RETIRED, LOST
- `Asset` model: has `status`, `deletedAt` (soft-delete)
- Delete endpoint sets `status = 'RETIRED'` and `deletedAt = now` — no disposal metadata
- `AssetDetailModal` already has RETIRED status badge styling
- No depreciation cron service found (search returned 0 hits)
- Bulk actions toolbar already exists on AssetsPage with selection checkboxes

## Target State

- `DisposalMethod` enum: DONATED, SOLD, SCRAPPED, RETURNED_TO_VENDOR, OTHER
- Asset gains: `disposalReason` (String?), `disposalDate` (DateTime?), `disposalMethod` (DisposalMethod?)
- New endpoint: `POST /api/assets/:id/dispose` — Admin only, writes disposal fields + sets status=RETIRED
- AssetsPage: "Dispose" button in bulk toolbar, "Dispose" option in individual row action menus
- Modal: disposal reason (textarea), method (select), date (datepicker)
- Audit log on disposal
- Disposed assets are filtered from depreciation (if cron exists later) and marked visually

---

### Task 1: Add DisposalMethod enum + disposal fields to Prisma schema

**Objective:** Extend the data model to support disposal metadata.

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Add DisposalMethod enum**

After `AssetStatus` enum (line 186), add:

```prisma
enum DisposalMethod {
  DONATED
  SOLD
  SCRAPPED
  RETURNED_TO_VENDOR
  OTHER
}
```

**Step 2: Add disposal fields to Asset model**

Inside the `Asset` model (after `deletedAt`, line 51), add:

```prisma
  disposalReason   String?           @db.Text
  disposalDate     DateTime?
  disposalMethod   DisposalMethod?
```

**Step 3: Run migration**

```bash
cd /home/reggie/.hermes/workspace/aio-system/server && npx prisma migrate dev --name add-disposal-fields
```

Expected: migration created, prisma client regenerated.

**Step 4: Verify with prisma studio**

```bash
cd /home/reggie/.hermes/workspace/aio-system/server && timeout 5 npx prisma studio --port 5556 2>&1 || true
```

Expected: schema visible with new DisposalMethod enum and disposal fields on Asset.

**Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add DisposalMethod enum and disposal fields to Asset model"
```

---

### Task 2: Add disposal Zod schema + service + route

**Objective:** Create the server-side disposal logic.

**Files:**
- Create: `server/src/routes/disposal.schema.ts`
- Modify: `server/src/services/asset.service.ts`
- Modify: `server/src/routes/asset.routes.ts`

**Step 1: Create disposal schema**

Create `server/src/routes/disposal.schema.ts`:

```typescript
import { z } from 'zod';

export const disposeAssetSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500),
  method: z.enum(['DONATED', 'SOLD', 'SCRAPPED', 'RETURNED_TO_VENDOR', 'OTHER']),
  date: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
});
```

**Step 2: Add disposeAsset service function**

At the end of `server/src/services/asset.service.ts` (before the export for history), add:

```typescript
// --- DISPOSE ---
export async function disposeAsset(
  id: string,
  data: { reason: string; method: string; date: string },
  performedById: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const existing = await prisma.asset.findUnique({ where: { id, deletedAt: null } });
  if (!existing) throw new Error('Asset not found');
  if (existing.status === 'RETIRED') throw new Error('Asset is already retired');

  const disposalDate = new Date(data.date);

  const asset = await prisma.asset.update({
    where: { id },
    data: {
      status: 'RETIRED',
      deletedAt: new Date(),
      disposalReason: data.reason,
      disposalDate,
      disposalMethod: data.method as any,
    },
  });

  // Generate a readable summary
  const methodLabel = data.method.replace(/_/g, ' ').toLowerCase();
  const summary = `Disposed "${existing.name}" — ${methodLabel} on ${disposalDate.toLocaleDateString('en-PH')}: ${data.reason}`;

  await prisma.auditLog.create({
    data: {
      entityType: 'Asset',
      entityId: id,
      action: 'DISPOSE',
      performedById,
      ipAddress,
      userAgent,
      field: '*',
      oldValue: null,
      newValue: JSON.stringify(data),
      severity: 'HIGH',
      summary,
    },
  });

  return asset;
}
```

**Step 3: Add route**

In `server/src/routes/asset.routes.ts`, after the import block (around line 27), add:

```typescript
import { disposeAssetSchema } from './disposal.schema';
```

Before the `export default router` at the end, add:

```typescript
// POST /api/assets/:id/dispose — formal disposal with reason/method/date (Admin only)
router.post('/:id/dispose', authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const parsed = disposeAssetSchema.safeParse(req.body);
    if (!parsed.success) return error(res, parsed.error.message, 400);

    const asset = await assetService.disposeAsset(
      String(req.params.id),
      parsed.data,
      req.user!.id,
      getClientIp(req),
      String(req.headers['user-agent'] || ''),
    );

    return success(res, asset, 200);
  } catch (err: any) {
    const status = err.message === 'Asset not found' ? 404
      : err.message === 'Asset is already retired' ? 409
      : 400;
    return error(res, err.message, status);
  }
});
```

**Step 4: Verify**

```bash
cd /home/reggie/.hermes/workspace/aio-system/server && npx tsc --noEmit --pretty 2>&1 | head -10
```

Expected: no errors.

**Step 5: Test via curl**

```bash
# Get auth token
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@aio-system.local","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

# Dispose an asset (replace ASSET_ID with an actual asset ID)
curl -s -X POST http://localhost:3001/api/assets/ASSET_ID/dispose \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Broken beyond repair","method":"SCRAPPED","date":"2026-05-06"}' | python3 -m json.tool
```

Expected: asset returned with `status: "RETIRED"`, `disposalReason`, `disposalDate`, `disposalMethod` filled.

**Step 6: Commit**

```bash
git add server/src/routes/disposal.schema.ts server/src/services/asset.service.ts server/src/routes/asset.routes.ts
git commit -m "feat: add disposeAsset endpoint with reason, method, and date"
```

---

### Task 3: Build the DisposeAssetModal component

**Objective:** Create a modal for the disposal form.

**Files:**
- Create: `client/src/components/assets/DisposeAssetModal.tsx`

**Step 1: Write the component**

```tsx
import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Asset } from '../../lib/api';

const DISPOSAL_METHODS = [
  { value: 'DONATED', label: 'Donated' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'SCRAPPED', label: 'Scrapped' },
  { value: 'RETURNED_TO_VENDOR', label: 'Returned to Vendor' },
  { value: 'OTHER', label: 'Other' },
];

interface Props {
  asset: Asset;
  onClose: () => void;
  onDisposed: () => void;
}

export function DisposeAssetModal({ asset, onClose, onDisposed }: Props) {
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('SCRAPPED');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!reason.trim()) { setError('Reason is required'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/assets/${asset.id}/dispose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason.trim(), method, date }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to dispose asset');
      onDisposed();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden animate-in zoom-in-95">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-[#012061]">
            <div className="flex items-center gap-2.5">
              <Trash2 className="h-4 w-4 text-[#f8931f]" />
              <h2 className="text-sm font-bold text-white tracking-tight">Dispose Asset</h2>
            </div>
            <button onClick={onClose} className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            {/* Asset info */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7B1113]/10">
                <Trash2 className="h-4 w-4 text-[#7B1113]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#012061] dark:text-slate-100 truncate">{asset.name}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">{asset.propertyNumber || asset.id.slice(0, 8)}</p>
              </div>
            </div>

            {/* Method */}
            <div>
              <label className="block text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1.5">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors"
              >
                {DISPOSAL_METHODS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors"
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1.5">Reason</label>
              <textarea
                value={reason}
                onChange={(e) => { setReason(e.target.value); setError(null); }}
                rows={3}
                placeholder="e.g. Equipment broken beyond repair, no longer needed..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors resize-none"
                maxLength={500}
              />
              <p className="text-[10px] text-slate-400 mt-1 text-right">{reason.length}/500</p>
            </div>

            {/* Error */}
            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-[11px] font-medium text-red-600 dark:text-red-300">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white hover:opacity-90 transition-all duration-200 active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: '#7B1113' }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {submitting ? 'Disposing…' : 'Confirm Disposal'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
```

**Step 2: Verify**

```bash
cd /home/reggie/.hermes/workspace/aio-system/client && npx tsc --noEmit --pretty 2>&1 | head -10
```

Expected: no errors.

**Step 3: Commit**

```bash
git add client/src/components/assets/DisposeAssetModal.tsx
git commit -m "feat: add DisposeAssetModal form component"
```

---

### Task 4: Wire Dispose into AssetsPage

**Objective:** Add "Dispose" to individual row actions and bulk selection toolbar. Hook up the modal and refresh logic.

**Files:**
- Modify: `client/src/pages/AssetsPage.tsx`

**Step 1: Add import at top**

```typescript
import { DisposeAssetModal } from '../components/assets/DisposeAssetModal';
```

**Step 2: Add state in the AssetsPage component body**

Next to other state like `showBulkModal` / `showCreateModal`:

```typescript
const [disposeTarget, setDisposeTarget] = useState<Asset | null>(null);
```

**Step 3: Add "Dispose" to bulk toolbar**

In the bulk actions toolbar (the div that shows when `selectedIds.size > 0`), next to the existing buttons (Bulk Status Change, Bulk Delete, etc.), add:

```tsx
<button
  onClick={() => {
    const first = assets.find(a => selectedIds.has(a.id));
    if (first) setDisposeTarget(first);
  }}
  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-1.5 text-[11px] font-semibold text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
>
  <Trash2 className="h-3.5 w-3.5" />
  Dispose Selected
</button>
```

Also add `Trash2` to the lucide-react import at the top of the file.

**Step 4: Add "Dispose" to individual asset action menus**

In the table row actions column, add a dispose button for non-RETIRED assets:

```tsx
{asset.status !== 'RETIRED' && (
  <button
    onClick={() => setDisposeTarget(asset)}
    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-slate-400 hover:text-[#7B1113] transition-colors"
    title="Dispose"
  >
    <Trash2 className="w-3.5 h-3.5" />
  </button>
)}
```

**Step 5: Add modal render at bottom of return (before closing outermost `</div>`)**

```tsx
{disposeTarget && (
  <DisposeAssetModal
    asset={disposeTarget}
    onClose={() => setDisposeTarget(null)}
    onDisposed={() => {
      setDisposeTarget(null);
      setSelectedIds(new Set());
      loadAssets();
      showToast('Asset disposed successfully');
    }}
  />
)}
```

**Step 6: Verify TypeScript**

```bash
cd /home/reggie/.hermes/workspace/aio-system/client && npx tsc --noEmit --pretty 2>&1 | head -15
```

Expected: no errors.

**Step 7: Commit**

```bash
git add client/src/pages/AssetsPage.tsx
git commit -m "feat: wire Dispose button into AssetsPage toolbar and row actions"
```

---

### Task 5: Verify end-to-end + edge cases

**Objective:** Manual smoke test in the browser, plus handle edge cases.

**Files:** None (verification only)

**Step 1: Navigate to Assets, select an asset, dispose it**

Open `http://localhost:3000/aio-system/assets`

Test flow:
1. Click the "Dispose Selected" in bulk toolbar (with 1+ selected)
2. Fill in reason, select method, set date → Confirm Disposal
3. Verify: asset disappears from main list (status becomes RETIRED + deletedAt set)
4. Verify: toast "Asset disposed successfully" appears
5. Verify: check `GET /api/audit` shows a DISPOSE log entry

**Step 2: Test double-dispose protection**

```bash
# Same asset, second dispose attempt
curl -s -X POST http://localhost:3001/api/assets/<SAME_ID>/dispose \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"test","method":"SCRAPPED","date":"2026-05-06"}'
```

Expected: 409 "Asset is already retired"

**Step 3: Verify disposal metadata**

```bash
curl -s http://localhost:3001/api/assets/<ID> -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; a=json.load(sys.stdin)['data']; print(a['disposalMethod'], a['disposalReason'], a['disposalDate'])"
```

Expected: SCRAPPED, the reason you entered, the date you picked.

**Step 4: Verify audit trail**

```bash
curl -s "http://localhost:3001/api/audit?action=DISPOSE" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; logs=json.load(sys.stdin)['data']; [print(l['summary']) for l in logs]"
```

Expected: disposal summary with asset name and method.

**Step 5: Commit final state if any fixes were made**

```bash
git add -A
git commit -m "feat: complete disposal workflow with edge case handling"
```

---

## Verification Checklist

- [ ] `DisposalMethod` enum exists in PostgreSQL (via migration)
- [ ] Asset has `disposalReason`, `disposalDate`, `disposalMethod` fields
- [ ] `POST /api/assets/:id/dispose` sets status=RETIRED + all disposal fields
- [ ] Double-dispose returns 409
- [ ] Disposal generates HIGH-severity audit log with human-readable summary
- [ ] DisposeAssetModal renders with: asset name/property #, method dropdown, date picker, reason textarea
- [ ] Reason field shows character count (0/500)
- [ ] Confirm button is brand-red (#7B1113), disabled during submission
- [ ] "Dispose Selected" appears in bulk toolbar when assets are selected
- [ ] "Dispose" trash icon appears in individual row actions for non-RETIRED assets
- [ ] Disposing an asset refreshes the list and clears selection
- [ ] Toast shows "Asset disposed successfully"
- [ ] RETIRED assets don't show dispose button
- [ ] All TypeScript compiles clean (client + server)
