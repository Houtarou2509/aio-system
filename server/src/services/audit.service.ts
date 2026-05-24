import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { classifySeverity, generateSummary } from '../utils/auditHelpers';
import { logAudit } from './auditLog.service';

export { classifySeverity, generateSummary };

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

type AuditFilters = {
  page?: number;
  limit?: number;
  entityType?: string;
  entityId?: string;
  action?: string;
  severity?: string;
  performedBy?: string;
  dateFrom?: string;
  dateTo?: string;
  module?: string;
};

function buildAuditWhere(filters: AuditFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.action) where.action = filters.action;
  if (filters.performedBy) where.userId = filters.performedBy;
  if (filters.module && MODULE_ENTITY_TYPES[filters.module]) {
    where.entityType = { in: MODULE_ENTITY_TYPES[filters.module] };
  }
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) (where.createdAt as any).gte = new Date(filters.dateFrom);
    if (filters.dateTo) (where.createdAt as any).lte = new Date(filters.dateTo);
  }
  if (filters.severity) {
    where.metadata = {
      path: ['severity'],
      equals: filters.severity,
    } as any;
  }

  return where;
}

function getMetadataValue(log: { metadata: Prisma.JsonValue | null }, key: string): string {
  if (!log.metadata || typeof log.metadata !== 'object' || Array.isArray(log.metadata)) return '';
  const value = (log.metadata as Record<string, unknown>)[key];
  if (value === null || value === undefined) return '';
  return String(value);
}

function getAuditSummary(log: any): string {
  const summary = getMetadataValue(log, 'summary');
  if (summary) return summary;

  return generateSummary({
    action: log.action,
    entityType: log.entityType,
    field: getMetadataValue(log, 'field') || undefined,
    oldValue: getMetadataValue(log, 'oldValue') || undefined,
    newValue: getMetadataValue(log, 'newValue') || undefined,
    assetName: log.assetName || undefined,
  });
}

export async function queryAuditLogs(filters: AuditFilters) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const where = buildAuditWhere(filters);

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, username: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const enriched = await enrichWithAssetInfo(items);

  return { items: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
}

const notDeleted = { deletedAt: null };

/**
 * Enrich audit log items with assetName and serialNumber.
 * - Asset entityId → direct lookup
 * - Assignment/MaintenanceLog entityId → resolve via assetId FK
 */
async function enrichWithAssetInfo(logs: any[]): Promise<any[]> {
  if (logs.length === 0) return logs;

  const directAssetIds = new Set<string>();
  const indirectIds = new Set<string>();
  const userIds = new Set<string>();

  for (const log of logs) {
    if (!log.entityId) continue;
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

  if (directAssetIds.size > 0) {
    const assets = await prisma.asset.findMany({
      where: { id: { in: [...directAssetIds] }, ...notDeleted },
      select: { id: true, name: true, serialNumber: true },
    });
    for (const a of assets) assetMap.set(a.id, { name: a.name, serialNumber: a.serialNumber });
  }

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
        where: { id: { in: allAssetIds }, ...notDeleted },
        select: { id: true, name: true, serialNumber: true },
      });
      for (const a of assets) assetMap.set(a.id, { name: a.name, serialNumber: a.serialNumber });
    }

    const indirectMap = new Map<string, string>();
    for (const a of assignments) indirectMap.set(a.id, a.assetId);
    for (const m of maintLogs) indirectMap.set(m.id, m.assetId);

    for (const log of logs) {
      if ((log.entityType === 'Assignment' || log.entityType === 'MaintenanceLog') && log.entityId && indirectMap.has(log.entityId)) {
        const assetId = indirectMap.get(log.entityId)!;
        const info = assetMap.get(assetId);
        if (info) {
          log.assetName = info.name;
          log.serialNumber = info.serialNumber;
        }
      }
    }
  }

  for (const log of logs) {
    if (log.entityType === 'Asset' && log.entityId) {
      const info = assetMap.get(log.entityId);
      if (info) {
        log.assetName = info.name;
        log.serialNumber = info.serialNumber;
      }
    }

    if ((log.entityType === 'User' || log.entityType === 'Personnel') && log.entityId && userMap.has(log.entityId)) {
      log.assetName = userMap.get(log.entityId);
    }

    log.summary = getAuditSummary(log);
    log.severity = getMetadataValue(log, 'severity') || classifySeverity(log.action, getMetadataValue(log, 'field') || undefined);
    log.field = getMetadataValue(log, 'field');
    log.oldValue = getMetadataValue(log, 'oldValue');
    log.newValue = getMetadataValue(log, 'newValue');
    log.performedBy = log.user;
    log.performedAt = log.createdAt;
    log.module = ENTITY_MODULE_MAP[log.entityType] || 'SYSTEM';
  }

  return logs;
}

export async function getEntityAuditTimeline(entityId: string) {
  const logs = await prisma.auditLog.findMany({
    where: { entityId },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, username: true } } },
  });

  return enrichWithAssetInfo(logs);
}

export async function revertAuditEntry(auditLogId: string) {
  const log = await prisma.auditLog.findUnique({ where: { id: auditLogId } });
  if (!log) throw new Error('Audit log not found');

  throw new Error('Audit entry revert is not supported by the Phase 2-A audit log schema. Audit metadata is stored for traceability only.');
}

export async function exportAuditLogsCsv(filters: AuditFilters): Promise<{ csv: string; recordCount: number }> {
  const where = buildAuditWhere(filters);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
      include: { user: { select: { username: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const enriched = await enrichWithAssetInfo(logs);

  const header = 'id,action,module,assetName,serialNumber,entityType,entityId,field,oldValue,newValue,performedBy,performedAt,ipAddress';
  const rows = enriched.map(l =>
    [
      l.id,
      l.action,
      l.module || 'SYSTEM',
      `"${(l.assetName || 'N/A (Deleted)').replace(/"/g, '""')}"`,
      `"${(l.serialNumber || '').replace(/"/g, '""')}"`,
      l.entityType,
      l.entityId || '',
      l.field || '',
      `"${(l.oldValue || '').replace(/"/g, '""')}"`,
      `"${(l.newValue || '').replace(/"/g, '""')}"`,
      l.user?.username || '',
      l.createdAt.toISOString(),
      l.ipAddress || '',
    ].join(',')
  );

  return { csv: [header, ...rows].join('\n'), recordCount: total };
}

export async function cleanupAuditLogs(olderThanDays: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const result = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  await logAudit({
    userId: null,
    action: 'audit.cleanup',
    entityType: 'AuditLog',
    entityId: null,
    metadata: { deleted: result.count, olderThanDays },
    ipAddress: null,
  });

  return { deleted: result.count };
}
