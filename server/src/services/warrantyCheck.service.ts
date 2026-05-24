import { prisma } from '../lib/prisma';
import { logAudit } from './auditLog.service';

/**
 * Scans assets with warranties expiring within 30 days (not retired, not deleted).
 * For each asset found, checks if a warranty.expiry_notified audit log entry
 * was already created in the last 7 days for that asset. If not, creates one
 * and triggers email notification to admin users.
 *
 * This function is safe to call repeatedly — it deduplicates via AuditLog.
 * Wrapped in try/catch and never throws.
 */
export async function checkAndNotifyWarrantyExpiry(): Promise<void> {
  try {
    const now = new Date();
    const thirtyDays = new Date();
    thirtyDays.setDate(now.getDate() + 30);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    // Find assets with warranties expiring within 30 days, not retired, not deleted
    const expiringAssets = await prisma.asset.findMany({
      where: {
        warrantyExpiry: {
          not: null,
          gte: now,
          lte: thirtyDays,
        },
        status: { not: 'RETIRED' },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        warrantyExpiry: true,
        status: true,
        assignedTo: true,
      },
    });

    // Also find assets where warranty has already expired but still active
    const expiredAssets = await prisma.asset.findMany({
      where: {
        warrantyExpiry: {
          not: null,
          lt: now,
        },
        status: { in: ['AVAILABLE', 'ASSIGNED', 'PENDING_ASSIGNMENT', 'MAINTENANCE'] },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        warrantyExpiry: true,
        status: true,
        assignedTo: true,
      },
    });

    const allAssets = [...expiringAssets, ...expiredAssets];
    let notified = 0;

    for (const asset of allAssets) {
      try {
        // Check if we already notified about this asset in the last 7 days
        const recentNotification = await prisma.auditLog.findFirst({
          where: {
            action: 'warranty.expiry_notified',
            entityType: 'Asset',
            entityId: asset.id,
            createdAt: { gte: sevenDaysAgo },
          },
        });

        if (recentNotification) {
          // Already notified within the last 7 days — skip
          continue;
        }

        const daysRemaining = Math.ceil(
          (asset.warrantyExpiry!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        const isExpired = daysRemaining <= 0;

        // Log audit entry
        await logAudit({
          userId: null,
          action: 'warranty.expiry_notified',
          entityType: 'Asset',
          entityId: asset.id,
          metadata: {
            warrantyExpiry: asset.warrantyExpiry!.toISOString(),
            daysRemaining,
            isExpired,
            assetName: asset.name,
            assetStatus: asset.status,
            assignedTo: asset.assignedTo || null,
          },
        });

        notified++;
      } catch (innerErr) {
        console.error(`[WarrantyCheck] Failed to process asset ${asset.id}:`, innerErr);
      }
    }

    console.log(`[WarrantyCheck] Processed ${allAssets.length} assets, notified ${notified}`);
  } catch (err) {
    console.error('[WarrantyCheck] Error in checkAndNotifyWarrantyExpiry:', err);
  }
}