import { PrismaClient, Prisma } from '@prisma/client';
import { classifySeverity, generateSummary } from '../utils/auditHelpers';

const prisma = new PrismaClient();

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

  await prisma.auditLog.create({
    data: { entityType: 'MaintenanceLog', entityId: log.id, action: 'CREATE', performedById, ipAddress, userAgent, field: '*', newValue: JSON.stringify(data), severity: classifySeverity('CREATE'), summary: generateSummary({ action: 'CREATE', entityType: 'MaintenanceLog', assetName: asset?.name }) },
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
      await prisma.auditLog.create({
        data: { entityType: 'MaintenanceLog', entityId: logId, action: 'UPDATE', performedById, ipAddress, userAgent, field: key, oldValue: String(oldVal ?? ''), newValue: String(newVal ?? ''), severity: classifySeverity('UPDATE', key), summary: generateSummary({ action: 'UPDATE', entityType: 'MaintenanceLog', field: key, oldValue: String(oldVal ?? ''), newValue: String(newVal ?? ''), assetName: existing.asset?.name }) },
      });
    }
  }

  return log;
}

export async function deleteMaintenanceLog(logId: string, performedById: string, ipAddress?: string, userAgent?: string) {
  const existing = await prisma.maintenanceLog.findUnique({ where: { id: logId }, include: { asset: { select: { name: true } } } });
  if (!existing) throw new Error('Maintenance log not found');

  await prisma.maintenanceLog.delete({ where: { id: logId } });

  await prisma.auditLog.create({
    data: { entityType: 'MaintenanceLog', entityId: logId, action: 'DELETE', performedById, ipAddress, userAgent, severity: 'HIGH', summary: generateSummary({ action: 'DELETE', entityType: 'MaintenanceLog', assetName: existing.asset?.name }) },
  });

  return { deleted: true };
}