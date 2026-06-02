import { NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Scan assets and maintenance schedules, generating in-app notifications
 * for warranties expiring/expired and maintenance overdue/due-soon.
 * Deduplicates by (assetId + type) — skips if one already exists.
 * In-app only — no email sending.
 */
export async function checkAndGenerateNotifications(): Promise<number> {
  let created = 0;

  const now = new Date();
  const thirtyDays = new Date();
  thirtyDays.setDate(now.getDate() + 30);

  // ── Warranty expiring within 30 days ──
  const expiringWarranties = await prisma.asset.findMany({
    where: {
      warrantyExpiry: {
        not: null,
        gte: now,
        lte: thirtyDays,
      },
      deletedAt: null,
    },
    select: { id: true, name: true, warrantyExpiry: true },
  });

  for (const asset of expiringWarranties) {
    const daysLeft = Math.ceil(
      (asset.warrantyExpiry!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    const message = `Warranty for "${asset.name}" expires in ${daysLeft} day(s).`;

    const existing = await prisma.notification.findFirst({
      where: { assetId: asset.id, type: NotificationType.WARRANTY_EXPIRING },
    });

    if (!existing) {
      await prisma.notification.create({
        data: {
          type: NotificationType.WARRANTY_EXPIRING,
          message,
          assetId: asset.id,
        },
      });
      created++;
    }
  }

  // ── Maintenance overdue (scheduled date passed, not completed) ──
  const overdueSchedules = await prisma.maintenanceSchedule.findMany({
    where: {
      scheduledDate: { lt: now },
      status: { not: 'completed' },
      completedAt: null,
    },
    include: { asset: { select: { id: true, name: true } } },
  });

  for (const schedule of overdueSchedules) {
    const daysOverdue = Math.ceil(
      (now.getTime() - schedule.scheduledDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const message = `Maintenance for "${schedule.asset.name}" is ${daysOverdue} day(s) overdue (scheduled: ${schedule.scheduledDate.toISOString().slice(0, 10)}).`;

    const existing = await prisma.notification.findFirst({
      where: { assetId: schedule.assetId, type: NotificationType.MAINTENANCE_OVERDUE },
    });

    if (!existing) {
      await prisma.notification.create({
        data: {
          type: NotificationType.MAINTENANCE_OVERDUE,
          message,
          assetId: schedule.assetId,
        },
      });
      created++;
    }
  }

  // ── Warranty already expired ──
  const expiredWarranties = await prisma.asset.findMany({
    where: {
      warrantyExpiry: {
        not: null,
        lt: now,
      },
      deletedAt: null,
    },
    select: { id: true, name: true, warrantyExpiry: true },
  });

  for (const asset of expiredWarranties) {
    const expiryDate = asset.warrantyExpiry!;
    const message = `Warranty expired on ${asset.name} (expired ${expiryDate.toISOString().split('T')[0]})`;

    const existing = await prisma.notification.findFirst({
      where: { assetId: asset.id, type: NotificationType.WARRANTY_EXPIRED },
    });

    if (!existing) {
      await prisma.notification.create({
        data: {
          type: NotificationType.WARRANTY_EXPIRED,
          message,
          assetId: asset.id,
        },
      });
      created++;
    }
  }

  // ── Maintenance due soon (within 7 days) ──
  const sevenDays = new Date();
  sevenDays.setDate(now.getDate() + 7);

  const dueSoonSchedules = await prisma.maintenanceSchedule.findMany({
    where: {
      scheduledDate: {
        gte: now,
        lte: sevenDays,
      },
      status: { not: 'completed' },
      completedAt: null,
    },
    include: { asset: { select: { id: true, name: true } } },
  });

  for (const schedule of dueSoonSchedules) {
    const message = `Maintenance due soon for ${schedule.asset.name} (scheduled ${schedule.scheduledDate.toISOString().split('T')[0]})`;

    const existing = await prisma.notification.findFirst({
      where: { assetId: schedule.assetId, type: NotificationType.MAINTENANCE_DUE_SOON },
    });

    if (!existing) {
      await prisma.notification.create({
        data: {
          type: NotificationType.MAINTENANCE_DUE_SOON,
          message,
          assetId: schedule.assetId,
        },
      });
      created++;
    }
  }

  return created;
}