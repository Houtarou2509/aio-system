import { PrismaClient, Prisma } from '@prisma/client';
import { classifySeverity, generateSummary } from '../utils/auditHelpers';

export { classifySeverity, generateSummary };

const prisma = new PrismaClient();

/* ─── Module mapping: entity types → logical module ─── */
const ENTITY_MODULE_MAP: Record<string, 'INVENTORY' | 'ACCOUNTABILITY' | 'SYSTEM'> = {
  Asset: 'INVENTORY',
  MaintenanceLog: 'INVENTORY',
  MaintenanceSchedule: 'INVENTORY',
  Assignment: 'ACCOUNTABILITY',
  Personnel: 'ACCOUNTABILITY',
  User: 'SYSTEM',
};

const MODULE_ENTITY_TYPES: Record<string, string[]> = {
  INVENTORY: ['Asset', 'MaintenanceLog', 'MaintenanceSchedule'],
  ACCOUNTABILITY: ['Assignment', 'Personnel'],
  SYSTEM: ['User'],
};

export async function queryAuditLogs(filters: {
  page: number; limit: number;
  entityType?: string; entityId?: string; action?: string; severity?: string; performedBy?: string;
  dateFrom?: string; dateTo?: string; module?: string;
}) {
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.action) where.action = filters.action;
  if (filters.severity) where.severity = filters.severity as any;
  if (filters.performedBy) where.performedById = filters.performedBy;
  if (filters.module && MODULE_ENTITY_TYPES[filters.module]) {
    where.entityType = { in: MODULE_ENTITY_TYPES[filters.module] };
  }
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

  // Collect entity IDs
  const directAssetIds = new Set<string>();
  const indirectIds = new Set<string>();
  const userIds = new Set<string>();

  for (const log of logs) {
    if (log.entityType === 'Asset') {
      directAssetIds.add(log.entityId);
    } else if (log.entityType === 'Assignment' || log.entityType === 'MaintenanceLog') {
      indirectIds.add(log.entityId);
    } else if (log.entityType === 'User' || log.entityType === 'Personnel') {
      userIds.add(log.entityId);
    }
  }

  const assetMap = new Map<string, { name: string; serialNumber: string | null }>();
  const userMap = new Map<string, string>();

  // Fetch assets directly
  if (directAssetIds.size > 0) {
    const assets = await prisma.asset.findMany({
      where: { id: { in: [...directAssetIds] } },
      select: { id: true, name: true, serialNumber: true },
    });
    for (const a of assets) assetMap.set(a.id, { name: a.name, serialNumber: a.serialNumber });
  }

  // Fetch users + personnel
  if (userIds.size > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, username: true },
    });
    for (const u of users) userMap.set(u.id, u.username);

    const personnel = await prisma.personnel.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, fullName: true },
    });
    for (const p of personnel) userMap.set(p.id, p.fullName);
  }

  // Resolve Assignment/MaintenanceLog → assetId
  if (indirectIds.size > 0) {
    const ids = [...indirectIds];
    const assignments = await prisma.assignment.findMany({
      where: { id: { in: ids } },
      select: { id: true, assetId: true },
    });
    const maintLogs = await prisma.maintenanceLog.findMany({
      where: { id: { in: ids } },
      select: { id: true, assetId: true },
    });
    const allAssetIds = [...new Set([...assignments.map(a => a.assetId), ...maintLogs.map(m => m.assetId)])];
    if (allAssetIds.length > 0) {
      const assets = await prisma.asset.findMany({
        where: { id: { in: allAssetIds } },
        select: { id: true, name: true, serialNumber: true },
      });
      for (const a of assets) assetMap.set(a.id, { name: a.name, serialNumber: a.serialNumber });
    }

    const indirectMap = new Map<string, string>();
    for (const a of assignments) indirectMap.set(a.id, a.assetId);
    for (const m of maintLogs) indirectMap.set(m.id, m.assetId);

    for (const log of logs) {
      if ((log.entityType === 'Assignment' || log.entityType === 'MaintenanceLog') && indirectMap.has(log.entityId)) {
        const assetId = indirectMap.get(log.entityId)!;
        const info = assetMap.get(assetId);
        if (info) {
          (log as any).assetName = info.name;
          (log as any).serialNumber = info.serialNumber;
        }
      }
    }
  }

  // Attach info for direct Asset entries + regenerate null summaries
  for (const log of logs) {
    if (log.entityType === 'Asset') {
      const info = assetMap.get(log.entityId);
      if (info) {
        (log as any).assetName = info.name;
        (log as any).serialNumber = info.serialNumber;
      }
    }

    // Resolve name for User/Personnel entity type
    if ((log.entityType === 'User' || log.entityType === 'Personnel') && userMap.has(log.entityId)) {
      (log as any).assetName = userMap.get(log.entityId);
    }

    // Backfill summary if null (legacy logs)
    if (!(log as any).summary) {
      (log as any).summary = generateSummary({
        action: log.action,
        entityType: log.entityType,
        field: log.field,
        oldValue: log.oldValue,
        newValue: log.newValue,
        assetName: (log as any).assetName || undefined,
      });
    }

    // Backfill severity if null (legacy logs)
    if (!(log as any).severity) {
      (log as any).severity = classifySeverity(log.action, log.field);
    }

    // Attach module label
    (log as any).module = ENTITY_MODULE_MAP[log.entityType] || 'SYSTEM';
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
      severity: 'MEDIUM',
      summary: generateSummary({ action: 'REVERT', entityType: log.entityType, field: log.field || undefined, oldValue: log.newValue, newValue: log.oldValue }),
    },
  });

  return { reverted: true, field: log.field, revertedTo: log.oldValue };
}

export async function exportAuditLogsCsv(filters: {
  entityType?: string; entityId?: string; action?: string; severity?: string; performedBy?: string;
  dateFrom?: string; dateTo?: string; module?: string;
}): Promise<string> {
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.action) where.action = filters.action;
  if (filters.severity) where.severity = filters.severity as any;
  if (filters.performedBy) where.performedById = filters.performedBy;
  if (filters.module && MODULE_ENTITY_TYPES[filters.module]) {
    where.entityType = { in: MODULE_ENTITY_TYPES[filters.module] };
  }
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

  const header = 'id,action,module,assetName,serialNumber,entityType,entityId,field,oldValue,newValue,performedBy,performedAt,ipAddress';
  const rows = enriched.map(l =>
    [
      l.id,
      l.action,
      (l as any).module || 'SYSTEM',
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