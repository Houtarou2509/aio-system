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

  return { items, total, page: filters.page, limit: filters.limit, totalPages: Math.ceil(total / filters.limit) };
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

  const header = 'id,entityType,entityId,action,field,oldValue,newValue,performedBy,performedAt,ipAddress';
  const rows = logs.map(l =>
    [
      l.id,
      l.entityType,
      l.entityId,
      l.action,
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