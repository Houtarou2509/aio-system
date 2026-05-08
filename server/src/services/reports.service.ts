import { prisma } from '../lib/prisma';

const notDeleted = { deletedAt: null };

// ── Report 1: Inventory Valuation ──────────────────────────

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

// ── Report 2: Asset Utilization ────────────────────────────

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

// ── Report 3: Maintenance Cost Analysis ───────────────────

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
      purchasePrice: Number(log.asset.purchasePrice || 0),
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
