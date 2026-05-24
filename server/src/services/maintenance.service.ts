import { logAudit } from './auditLog.service';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { classifySeverity, generateSummary } from '../utils/auditHelpers';



export async function listMaintenanceLogs(assetId: string, page: number, limit: number) {
  const [items, total] = await Promise.all([
    prisma.maintenanceLog.findMany({
      where: { assetId },
      orderBy: { date: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.maintenanceLog.count({ where: { assetId } }),
  ]);

  // Check frequent repair flag: >3 events in 12 months
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const recentCount = await prisma.maintenanceLog.count({
    where: { assetId, date: { gte: twelveMonthsAgo } },
  });

  return { items, total, page, limit, totalPages: Math.ceil(total / limit), frequentRepair: recentCount > 3 };
}

export async function createMaintenanceLog(assetId: string, data: Prisma.MaintenanceLogCreateInput, performedById: string, ipAddress?: string, userAgent?: string) {
  const log = await prisma.maintenanceLog.create({ data: { ...data, asset: { connect: { id: assetId } } } });
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { name: true } });

  await logAudit({
  userId: performedById ?? null,
  action: 'CREATE',
  entityType: 'MaintenanceLog',
  entityId: log.id ?? null,
  ipAddress: ipAddress ?? null,
  metadata: {
    "userAgent": userAgent,
    "field": '*',
    "newValue": JSON.stringify(data),
    "severity": classifySeverity('CREATE'),
    "summary": generateSummary({ action: 'CREATE', entityType: 'MaintenanceLog', assetName: asset?.name }),
  },
});

  return log;
}

export async function updateMaintenanceLog(logId: string, data: Prisma.MaintenanceLogUpdateInput, performedById: string, ipAddress?: string, userAgent?: string) {
  const existing = await prisma.maintenanceLog.findUnique({ where: { id: logId }, include: { asset: { select: { name: true } } } });
  if (!existing) throw new Error('Maintenance log not found');

  const log = await prisma.maintenanceLog.update({ where: { id: logId }, data });

  for (const [key, newVal] of Object.entries(data)) {
    const oldVal = (existing as any)[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      await logAudit({
  userId: performedById ?? null,
  action: 'UPDATE',
  entityType: 'MaintenanceLog',
  entityId: logId ?? null,
  ipAddress: ipAddress ?? null,
  metadata: {
    "userAgent": userAgent,
    "field": key,
    "oldValue": String(oldVal ?? ''),
    "newValue": String(newVal ?? ''),
    "severity": classifySeverity('UPDATE', key),
    "summary": generateSummary({ action: 'UPDATE', entityType: 'MaintenanceLog', field: key, oldValue: String(oldVal ?? ''), newValue: String(newVal ?? ''), assetName: existing.asset?.name }),
  },
});
    }
  }

  return log;
}

export async function deleteMaintenanceLog(logId: string, performedById: string, ipAddress?: string, userAgent?: string) {
  const existing = await prisma.maintenanceLog.findUnique({ where: { id: logId }, include: { asset: { select: { name: true } } } });
  if (!existing) throw new Error('Maintenance log not found');

  await prisma.maintenanceLog.delete({ where: { id: logId } });

  await logAudit({
  userId: performedById ?? null,
  action: 'DELETE',
  entityType: 'MaintenanceLog',
  entityId: logId ?? null,
  ipAddress: ipAddress ?? null,
  metadata: {
    "userAgent": userAgent,
    "severity": 'HIGH',
    "summary": generateSummary({ action: 'DELETE', entityType: 'MaintenanceLog', assetName: existing.asset?.name }),
  },
});

  return { deleted: true };
}

// ── Per-asset maintenance cost summary ────────────────────

export async function getAssetMaintenanceSummary(assetId: string) {
  const logs = await prisma.maintenanceLog.findMany({
    where: { assetId },
    orderBy: { date: 'asc' },
  });

  if (logs.length === 0) {
    return {
      assetId,
      totalCost: 0,
      logCount: 0,
      avgCostPerLog: 0,
      maxCost: 0,
      minCost: 0,
      lastMaintenanceDate: null,
      firstMaintenanceDate: null,
      costByYear: [],
    };
  }

  const costs = logs.map(l => Number(l.cost));
  const totalCost = costs.reduce((sum, c) => sum + c, 0);

  // Group by year
  const yearMap = new Map<number, { total: number; count: number }>();
  for (const log of logs) {
    const year = new Date(log.date).getFullYear();
    const entry = yearMap.get(year) || { total: 0, count: 0 };
    entry.total += Number(log.cost);
    entry.count += 1;
    yearMap.set(year, entry);
  }

  const costByYear = Array.from(yearMap.entries())
    .map(([year, data]) => ({ year, total: data.total, count: data.count }))
    .sort((a, b) => a.year - b.year);

  return {
    assetId,
    totalCost: Math.round(totalCost * 100) / 100,
    logCount: logs.length,
    avgCostPerLog: Math.round((totalCost / logs.length) * 100) / 100,
    maxCost: Math.round(Math.max(...costs) * 100) / 100,
    minCost: Math.round(Math.min(...costs) * 100) / 100,
    lastMaintenanceDate: logs[logs.length - 1].date,
    firstMaintenanceDate: logs[0].date,
    costByYear,
  };
}

// ── System-wide maintenance cost summary ──────────────────

export async function getMaintenanceCostSummary(filters: { from?: string; to?: string; assetType?: string; location?: string }) {
  // Build where clause for logs based on date filters
  const logWhere: any = {};
  if (filters.from || filters.to) {
    logWhere.date = {};
    if (filters.from) logWhere.date.gte = new Date(filters.from);
    if (filters.to) logWhere.date.lte = new Date(filters.to);
  }

  // Build asset filters
  const assetWhere: any = { deletedAt: null };
  if (filters.assetType) assetWhere.type = filters.assetType;
  if (filters.location) assetWhere.location = filters.location;

  // If asset filters are applied, scope logs to matching assets
  if (filters.assetType || filters.location) {
    logWhere.asset = { ...assetWhere };
  }

  // Fetch all matching logs with asset info
  const logs = await prisma.maintenanceLog.findMany({
    where: logWhere,
    include: {
      asset: {
        select: { id: true, name: true, serialNumber: true, type: true },
      },
    },
    orderBy: { date: 'desc' },
  });

  const totalCost = logs.reduce((sum, l) => sum + Number(l.cost), 0);
  const assetCostMap = new Map<string, { assetId: string; assetName: string; serialNumber: string | null; totalCost: number }>();

  for (const log of logs) {
    const entry = assetCostMap.get(log.assetId) || {
      assetId: log.assetId,
      assetName: log.asset.name,
      serialNumber: log.asset.serialNumber,
      totalCost: 0,
    };
    entry.totalCost += Number(log.cost);
    assetCostMap.set(log.assetId, entry);
  }

  // Top 10 cost assets
  const topCostAssets = Array.from(assetCostMap.values())
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 10)
    .map(e => ({ ...e, totalCost: Math.round(e.totalCost * 100) / 100 }));

  // Group by asset type
  const typeCostMap = new Map<string, { totalCost: number; logCount: number }>();
  for (const log of logs) {
    const type = log.asset.type || 'Unknown';
    const entry = typeCostMap.get(type) || { totalCost: 0, logCount: 0 };
    entry.totalCost += Number(log.cost);
    entry.logCount += 1;
    typeCostMap.set(type, entry);
  }

  const costByAssetType = Array.from(typeCostMap.entries())
    .map(([type, data]) => ({ type, totalCost: Math.round(data.totalCost * 100) / 100, logCount: data.logCount }))
    .sort((a, b) => b.totalCost - a.totalCost);

  // Count distinct assets with logs
  const distinctAssetCount = assetCostMap.size;
  const avgCostPerAsset = distinctAssetCount > 0
    ? Math.round((totalCost / distinctAssetCount) * 100) / 100
    : 0;

  return {
    totalCost: Math.round(totalCost * 100) / 100,
    totalLogs: logs.length,
    avgCostPerAsset,
    topCostAssets,
    costByAssetType,
  };
}