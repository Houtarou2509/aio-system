import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export async function queryAuditLogs(filters: {
  page: number; limit: number;
  entityType?: string; entityId?: string; action?: string; performedBy?: string;
  dateFrom?: string; dateTo?: string;
}) {
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.action) where.action = filters.action;
  if (filters.performedBy) where.performedById = filters.performedBy;
  if (filters.dateFrom || filters.dateTo) {
    where.performedAt = {};
    if (filters.dateFrom) (where.performedAt as any).gte = new Date(filters.dateFrom);
    if (filters.dateTo) (where.performedAt as any).lte = new Date(filters.dateTo);
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
      orderBy: { performedAt: 'desc' },
      include: { performedBy: { select: { id: true, username: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  // Enrich logs with asset name and serial number
  const enriched = await enrichWithAssetInfo(items);

  return { items: enriched, total, page: filters.page, limit: filters.limit, totalPages: Math.ceil(total / filters.limit) };
}

const notDeleted = { deletedAt: null };

/**
 * Enrich audit log items with assetName and serialNumber.
 * - Asset entityId → direct lookup
 * - Assignment/MaintenanceLog entityId → resolve via assetId FK
 */
async function enrichWithAssetInfo(logs: any[]): Promise<any[]> {
  if (logs.length === 0) return logs;

  // Collect entity IDs that need asset lookup
  const directAssetIds = new Set<string>();   // entityType === 'Asset'
  const indirectIds = new Set<string>();       // Assignment or MaintenanceLog

  for (const log of logs) {
    if (log.entityType === 'Asset') {
      directAssetIds.add(log.entityId);
    } else if (log.entityType === 'Assignment' || log.entityType === 'MaintenanceLog') {
      indirectIds.add(log.entityId);
    }
  }

  // Fetch assets directly
  const assetMap = new Map<string, { name: string; serialNumber: string | null }>();
  if (directAssetIds.size > 0) {
    const assets = await prisma.asset.findMany({
      where: { id: { in: [...directAssetIds] } },
      select: { id: true, name: true, serialNumber: true },
    });
    for (const a of assets) assetMap.set(a.id, { name: a.name, serialNumber: a.serialNumber });
  }

  // Resolve Assignment → assetId
  if (indirectIds.size > 0) {
    const ids = [...indirectIds];
    // Assignments
    const assignments = await prisma.assignment.findMany({
      where: { id: { in: ids } },
      select: { id: true, assetId: true },
    });
    const assignmentAssetIds = assignments.map(a => a.assetId);
    // MaintenanceLogs
    const maintLogs = await prisma.maintenanceLog.findMany({
      where: { id: { in: ids } },
      select: { id: true, assetId: true },
    });
    const maintAssetIds = maintLogs.map(m => m.assetId);

    const allAssetIds = [...new Set([...assignmentAssetIds, ...maintAssetIds])];
    if (allAssetIds.length > 0) {
      const assets = await prisma.asset.findMany({
        where: { id: { in: allAssetIds } },
        select: { id: true, name: true, serialNumber: true },
      });
      for (const a of assets) assetMap.set(a.id, { name: a.name, serialNumber: a.serialNumber });
    }

    // Map indirect entityId → asset info via assignment/maintenance FK
    const indirectMap = new Map<string, string>();
    for (const a of assignments) indirectMap.set(a.id, a.assetId);
    for (const m of maintLogs) indirectMap.set(m.id, m.assetId);

    for (const log of logs) {
      if (log.entityType === 'Assignment' || log.entityType === 'MaintenanceLog') {
        const assetId = indirectMap.get(log.entityId);
        if (assetId) {
          const info = assetMap.get(assetId);
          if (info) {
            (log as any).assetName = info.name;
            (log as any).serialNumber = info.serialNumber;
          }
        }
      }
    }
  }

  // Attach info for direct Asset entries
  for (const log of logs) {
    if (log.entityType === 'Asset') {
      const info = assetMap.get(log.entityId);
      if (info) {
        (log as any).assetName = info.name;
        (log as any).serialNumber = info.serialNumber;
      }
    }
  }

  return logs;
}

export async function getEntityAuditTimeline(entityId: string) {
  const logs = await prisma.auditLog.findMany({
    where: { entityId },
    orderBy: { performedAt: 'desc' },
    include: { performedBy: { select: { id: true, username: true } } },
  });
  // Filter out no-op UPDATE entries where oldValue === newValue
  return logs.filter(l => {
    if (l.action !== 'UPDATE' || !l.field || l.field === '*') return true;
    const oldStr = l.oldValue == null ? '' : String(l.oldValue);
    const newStr = l.newValue == null ? '' : String(l.newValue);
    return oldStr !== newStr;
  });
}

export async function revertAuditEntry(auditLogId: string) {
  const log = await prisma.auditLog.findUnique({ where: { id: auditLogId } });
  if (!log) throw new Error('Audit log not found');
  if (!log.field || log.field === '*') throw new Error('Cannot revert this audit entry (no specific field)');
  if (!log.oldValue && log.oldValue !== '') throw new Error('No old value to revert to');
  if (String(log.oldValue) === String(log.newValue)) throw new Error('Cannot revert a no-op change (oldValue === newValue)');

  // Determine which model to update
  const modelMap: Record<string, string> = {
    Asset: 'asset',
    MaintenanceLog: 'maintenanceLog',
    User: 'user',
  };

  const modelName = modelMap[log.entityType];
  if (!modelName) throw new Error(`Cannot revert changes to entity type: ${log.entityType}`);

  // Revert the field
  const updateData: any = { [log.field]: log.oldValue };
  await (prisma as any)[modelName].update({
    where: { id: log.entityId },
    data: updateData,
  });

  // Log the revert itself
  await prisma.auditLog.create({
    data: {
      entityType: log.entityType,
      entityId: log.entityId,
      action: 'REVERT',
      field: log.field,
      oldValue: log.newValue,
      newValue: log.oldValue,
      performedById: log.performedById,
    },
  });

  return { reverted: true, field: log.field, revertedTo: log.oldValue };
}

export async function exportAuditLogsCsv(filters: {
  entityType?: string; entityId?: string; action?: string; performedBy?: string;
  dateFrom?: string; dateTo?: string;
}): Promise<string> {
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.action) where.action = filters.action;
  if (filters.performedBy) where.performedById = filters.performedBy;
  if (filters.dateFrom || filters.dateTo) {
    where.performedAt = {};
    if (filters.dateFrom) (where.performedAt as any).gte = new Date(filters.dateFrom);
    if (filters.dateTo) (where.performedAt as any).lte = new Date(filters.dateTo);
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { performedAt: 'desc' },
    take: 10000,
    include: { performedBy: { select: { username: true } } },
  });

  const enriched = await enrichWithAssetInfo(logs);

  const header = 'id,action,assetName,serialNumber,entityType,entityId,field,oldValue,newValue,performedBy,performedAt,ipAddress';
  const rows = enriched.map(l =>
    [
      l.id,
      l.action,
      `"${((l as any).assetName || 'N/A (Deleted)').replace(/"/g, '""')}"`,
      `"${((l as any).serialNumber || '').replace(/"/g, '""')}"`,
      l.entityType,
      l.entityId,
      l.field || '',
      `"${(l.oldValue || '').replace(/"/g, '""')}"`,
      `"${(l.newValue || '').replace(/"/g, '""')}"`,
      (l.performedBy as any)?.username || '',
      l.performedAt.toISOString(),
      l.ipAddress || '',
    ].join(',')
  );

  return [header, ...rows].join('\n');
}

export async function cleanupAuditLogs(olderThanDays: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const result = await prisma.auditLog.deleteMany({
    where: { performedAt: { lt: cutoff } },
  });

  return { deleted: result.count };
}