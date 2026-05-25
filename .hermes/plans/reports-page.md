# Reports Page — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** A dedicated Reports page with 5 report panels: Inventory Valuation, Asset Utilization, Maintenance Cost Analysis, Warranty Calendar, and Asset Timeline.

**Architecture:** New `reports` service + route with 3 new endpoints (valuation, utilization, maintenance-costs). The Reports page reuses existing brand patterns — navy header, bento grid layout, BentoCard primitives. The warranty and age reports reuse existing dashboard endpoints.

**Tech Stack:** Prisma queries, Express routes, React + TailwindCSS + shadcn/ui, Chart.js (Doughnut/Bar), Lucide icons

---

## Data Available

- Asset: name, type, purchasePrice, purchaseDate, status, location, warrantyExpiry, assignedTo
- Assignment: assetId, assignedAt, returnedAt
- MaintenanceLog: assetId, cost, date, technicianName, description
- AuditLog: full history of all actions

## Reports to Build

| # | Report | Source | Visual |
|---|--------|--------|--------|
| 1 | Inventory Valuation | NEW endpoint: sum of purchasePrice, avg by type, count by status | Bar chart + summary cards |
| 2 | Asset Utilization | NEW endpoint: most checked-out assets, avg assignment duration | Bar chart (top 10) |
| 3 | Maintenance Cost Analysis | NEW endpoint: total spend, cost per asset | Bar chart + summary |
| 4 | Warranty Calendar | Reuse GET /api/dashboard/warranties-expiring | Sortable list with days-remaining badges |
| 5 | Asset Timeline | Reuse GET /api/audit (action filter) | Timeline feed of recent changes |

---

### Task 1: Create reports service (3 new endpoints)

**Objective:** Server-side data aggregation for inventory valuation, asset utilization, and maintenance costs.

**Files:**
- Create: `server/src/services/reports.service.ts`

```typescript
import { prisma } from '../lib/prisma';

const notDeleted = { deletedAt: null };

// Report 1: Inventory Valuation
export async function getInventoryValuation() {
  const [allAssets, byType, byStatus] = await Promise.all([
    prisma.asset.findMany({
      where: notDeleted,
      select: { id: true, name: true, type: true, status: true, purchasePrice: true, location: true },
    }),
    prisma.asset.groupBy({ by: ['type'], where: notDeleted, _count: { type: true }, _sum: { purchasePrice: true } }),
    prisma.asset.groupBy({ by: ['status'], where: notDeleted, _count: { status: true } }),
  ]);

  const totalPurchasePrice = allAssets.reduce((sum, a) => sum + Number(a.purchasePrice || 0), 0);
  const totalAssets = allAssets.length;
  const assetsWithPrice = allAssets.filter(a => a.purchasePrice != null).length;

  return {
    totalAssets,
    totalPurchasePrice,
    averagePrice: assetsWithPrice > 0 ? totalPurchasePrice / assetsWithPrice : 0,
    assetsWithPrice,
    byType: byType.map(t => ({
      type: t.type,
      count: t._count.type,
      totalPrice: Number(t._sum.purchasePrice || 0),
    })),
    byStatus: byStatus.map(s => ({
      status: s.status,
      count: s._count.status,
    })),
  };
}

// Report 2: Asset Utilization
export async function getAssetUtilization() {
  const assignments = await prisma.assignment.findMany({
    where: { returnedAt: { not: null } },
    select: { assetId: true, assignedAt: true, returnedAt: true, assignedTo: true },
    orderBy: { assignedAt: 'desc' },
  });

  // Group by assetId
  const assetMap = new Map<string, { count: number; totalDays: number; names: Set<string> }>();
  for (const a of assignments) {
    const entry = assetMap.get(a.assetId) || { count: 0, totalDays: 0, names: new Set() };
    entry.count++;
    if (a.assignedTo) entry.names.add(a.assignedTo);
    const days = (new Date(a.returnedAt!).getTime() - new Date(a.assignedAt).getTime()) / (1000 * 60 * 60 * 24);
    entry.totalDays += days;
    assetMap.set(a.assetId, entry);
  }

  // Get asset names
  const assetIds = Array.from(assetMap.keys());
  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds } },
    select: { id: true, name: true, type: true },
  });
  const nameMap = new Map(assets.map(a => [a.id, { name: a.name, type: a.type }]));

  const results = Array.from(assetMap.entries())
    .map(([id, data]) => ({
      assetId: id,
      name: nameMap.get(id)?.name || 'Unknown',
      type: nameMap.get(id)?.type || 'Unknown',
      checkoutCount: data.count,
      avgDurationDays: Math.round(data.totalDays / data.count),
      uniqueAssignees: data.names.size,
    }))
    .sort((a, b) => b.checkoutCount - a.checkoutCount)
    .slice(0, 10);

  return { topUtilized: results };
}

// Report 3: Maintenance Cost Analysis
export async function getMaintenanceCosts() {
  const [logs, totalCount] = await Promise.all([
    prisma.maintenanceLog.findMany({
      include: { asset: { select: { id: true, name: true, purchasePrice: true } } },
      orderBy: { date: 'desc' },
    }),
    prisma.maintenanceLog.count(),
  ]);

  const totalCost = logs.reduce((sum, l) => sum + Number(l.cost), 0);
  const assetCostMap = new Map<string, { name: string; totalCost: number; count: number; purchasePrice: number }>();
  
  for (const log of logs) {
    const entry = assetCostMap.get(log.assetId) || { 
      name: log.asset.name, 
      totalCost: 0, 
      count: 0, 
      purchasePrice: Number(log.asset.purchasePrice || 0) 
    };
    entry.totalCost += Number(log.cost);
    entry.count++;
    assetCostMap.set(log.assetId, entry);
  }

  const byAsset = Array.from(assetCostMap.entries())
    .map(([id, data]) => ({
      assetId: id,
      name: data.name,
      totalCost: data.totalCost,
      maintenanceCount: data.count,
      purchasePrice: data.purchasePrice,
      costRatio: data.purchasePrice > 0 ? (data.totalCost / data.purchasePrice) * 100 : 0,
    }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 10);

  return {
    totalMaintenanceCount: totalCount,
    totalCost,
    averageCost: totalCount > 0 ? totalCost / totalCount : 0,
    byAsset,
  };
}
```

**Verification:**

```bash
cd /home/reggie/.hermes/workspace/aio-system/server && npx tsc --noEmit --pretty 2>&1 | head -10
```

**Commit:**

```bash
git add server/src/services/reports.service.ts
git commit -m "feat: add reports service with valuation, utilization, and maintenance endpoints"
```

---

### Task 2: Create reports route (3 new endpoints)

**Objective:** Wire the service functions as REST endpoints.

**Files:**
- Create: `server/src/routes/reports.routes.ts`
- Modify: `server/src/index.ts` (register route)

**Step 1: Create route file**

```typescript
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { success, error } from '../utils/response';
import * as reportsService from '../services/reports.service';

const router = Router();
router.use(authenticate);

// GET /api/reports/inventory-valuation
router.get('/inventory-valuation', async (_req: Request, res: Response) => {
  try {
    const data = await reportsService.getInventoryValuation();
    return success(res, data, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// GET /api/reports/asset-utilization
router.get('/asset-utilization', async (_req: Request, res: Response) => {
  try {
    const data = await reportsService.getAssetUtilization();
    return success(res, data, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// GET /api/reports/maintenance-costs
router.get('/maintenance-costs', async (_req: Request, res: Response) => {
  try {
    const data = await reportsService.getMaintenanceCosts();
    return success(res, data, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

export default router;
```

**Step 2: Register in server index.ts**

Find the line where other routes are registered (e.g., `app.use('/api/assets', assetRoutes)`). Add:

```typescript
import reportsRoutes from './routes/reports.routes';
// ... among other route registrations ...
app.use('/api/reports', reportsRoutes);
```

**Step 3: Verify**

```bash
curl -s http://localhost:3001/api/reports/inventory-valuation -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20
```

**Commit:**

```bash
git add server/src/routes/reports.routes.ts server/src/index.ts
git commit -m "feat: add reports route with valuation, utilization, and maintenance-cost endpoints"
```

---

### Task 3: Build the Reports page

**Objective:** A full Reports page with 5 panels in a bento grid. Brand-consistent with the rest of the app.

**Files:**
- Create: `client/src/pages/ReportsPage.tsx`

The page structure follows the proven pattern: sticky navy header, content area with bento grid. Each panel is a BentoCard.

Layout:
- Row 1: Inventory Valuation (col-span-1, summary cards + doughnut) | Asset Utilization (col-span-1, bar chart of top 10) | Maintenance Costs (col-span-1, summary + top list)
- Row 2: Warranty Calendar (col-span-2, full table list) | Asset Timeline (col-span-1, scrollable feed)

Reuses `BentoCard` and `BentoCardTitle` from DashboardPage — extract them to a shared component if time permits, otherwise inline the same primitives.

Key implementation details:
- Fetches 3 new endpoints + warranty-expiring + audit data
- Inventory Valuation: shows "Total Assets", "Total Value", "Average Price" as summary stats, doughnut of status distribution, bar of value by type
- Asset Utilization: horizontal bar of top 10 most-checked-out assets with count labels
- Maintenance Costs: shows "Total Spend", "Avg Cost", vertical bar of top 10 expensive assets with costRatio warning when >50%
- Warranty Calendar: same data as dashboard widget but full-width sortable list with days-left badges and red glow for expired
- Asset Timeline: last 20 audit entries in a vertical timeline with action badges

**Commit:**

```bash
git add client/src/pages/ReportsPage.tsx
git commit -m "feat: add Reports page with 5 data panels"
```

---

### Task 4: Wire Reports into sidebar + router

**Objective:** Add "Reports" nav link and route registration.

**Files:**
- Modify: `client/src/components/AppLayout.tsx` (add nav item)
- Modify: `client/src/App.tsx` (add route)

**Step 1: Add to AppLayout nav**

In `inventoryNav` array, add after Assets:

```typescript
{ to: '/reports', label: 'Reports', IconComponent: BarChart3 },
```

Add `BarChart3` to the lucide-react imports.

**Step 2: Add route in App.tsx**

After the other page imports, add:

```typescript
import ReportsPage from './pages/ReportsPage';
```

In the routes section, after the Assets route:

```tsx
<Route path="reports" element={<ReportsPage />} />
```

**Step 3: Verify TypeScript**

```bash
cd client && npx tsc --noEmit --pretty
```

**Commit:**

```bash
git add client/src/components/AppLayout.tsx client/src/App.tsx
git commit -m "feat: wire Reports page into sidebar nav and router"
```

---

### Task 5: End-to-end verification

**Objective:** Verify all endpoints return data, page renders correctly in browser.

**Step 1: Test all 3 new endpoints**

```bash
# Inventory Valuation
curl -s http://localhost:3001/api/reports/inventory-valuation -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Assets: {d[\"data\"][\"totalAssets\"]}, Total Value: ₱{d[\"data\"][\"totalPurchasePrice\"]:,.0f}')"

# Asset Utilization
curl -s http://localhost:3001/api/reports/asset-utilization -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d['data']['topUtilized']; [print(f'{i[\"name\"]}: {i[\"checkoutCount\"]}x') for i in items[:3]]"

# Maintenance Costs
curl -s http://localhost:3001/api/reports/maintenance-costs -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Total spend: ₱{d[\"data\"][\"totalCost\"]:,.0f}, Avg: ₱{d[\"data\"][\"averageCost\"]:,.0f}')"
```

**Step 2: Navigate to Reports page in browser**

Open `http://localhost:3000/aio-system/reports` — verify:
- [ ] Navy "Reports" header with icon + title
- [ ] Inventory Valuation panel: total assets, total value, status doughnut
- [ ] Asset Utilization panel: top 10 bar chart
- [ ] Maintenance Cost Analysis: total spend, top assets list with cost ratio warnings
- [ ] Warranty Calendar: full list with days-left badges, red glow for expired
- [ ] Asset Timeline: scrollable vertical timeline with action badges
- [ ] Dark mode compatible
- [ ] Mobile responsive (stacks to 1-col)
- [ ] "Reports" nav link in sidebar is active when on Reports page

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete Reports page with end-to-end verification"
```
