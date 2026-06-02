import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, hasPermission } from '../middleware/auth';
import { success, error } from '../utils/response';

const router = Router();

// All routes require authentication
router.use(authenticate);

// UUID-like regex: matches strings that look like a UUID (e.g. "550e8400-e29b-41d4-a716-446655440000")
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Check if assignedTo is unreadable (null, empty string, or a stale UUID)
function isUnreadableAssignedTo(val: string | null | undefined): boolean {
  if (val === null || val === undefined || val === '') return true;
  return UUID_LIKE.test(val);
}

// GET /api/data-quality — summary of data quality issues
router.get('/', hasPermission('assets:view'), async (_req: Request, res: Response) => {
  try {
    // Only ADMIN and STAFF_ADMIN can access
    const user = (_req as any).user;
    if (!user || !['ADMIN', 'STAFF_ADMIN'].includes(user.role)) {
      return error(res, 'Forbidden', 403);
    }

    // assignedWithoutPersonnel needs post-query filtering (UUID detection)
    // so we fetch all ASSIGNED non-deleted assets and filter in TypeScript.
    const allAssigned = await prisma.asset.findMany({
      where: { deletedAt: null, status: 'ASSIGNED' },
      select: { id: true, name: true, status: true, assignedTo: true },
      orderBy: { name: 'asc' },
    });
    const assignedWithoutPersonnel = allAssigned
      .filter(a => isUnreadableAssignedTo(a.assignedTo))
      .slice(0, 20);
    const countAssignedWithoutPersonnel = allAssigned.filter(a => isUnreadableAssignedTo(a.assignedTo)).length;

    const [
      missingPropertyNumber,
      missingSerialNumber,
      missingOwner,
      missingLocation,
      missingImageUrl,
      missingPurchaseDate,
      missingPurchasePrice,
      retiredNotDeleted,
      totalAssets,
      countMissingPropertyNumber,
      countMissingSerialNumber,
      countMissingOwner,
      countMissingLocation,
      countMissingImageUrl,
      countMissingPurchaseDate,
      countMissingPurchasePrice,
      countRetiredNotDeleted,
    ] = await Promise.all([
      prisma.asset.findMany({
        where: { deletedAt: null, propertyNumber: null },
        select: { id: true, name: true, type: true, status: true, propertyNumber: true },
        orderBy: { name: 'asc' },
        take: 20,
      }),
      prisma.asset.findMany({
        where: { deletedAt: null, serialNumber: null },
        select: { id: true, name: true, type: true, status: true, serialNumber: true },
        orderBy: { name: 'asc' },
        take: 20,
      }),
      prisma.asset.findMany({
        where: { deletedAt: null, owner: null },
        select: { id: true, name: true, type: true, status: true, owner: true },
        orderBy: { name: 'asc' },
        take: 20,
      }),
      prisma.asset.findMany({
        where: { deletedAt: null, location: null },
        select: { id: true, name: true, type: true, status: true, location: true },
        orderBy: { name: 'asc' },
        take: 20,
      }),
      prisma.asset.findMany({
        where: { deletedAt: null, imageUrl: null },
        select: { id: true, name: true, type: true, status: true, imageUrl: true },
        orderBy: { name: 'asc' },
        take: 20,
      }),
      prisma.asset.findMany({
        where: { deletedAt: null, purchaseDate: null },
        select: { id: true, name: true, type: true, status: true, purchaseDate: true },
        orderBy: { name: 'asc' },
        take: 20,
      }),
      prisma.asset.findMany({
        where: { deletedAt: null, purchasePrice: null },
        select: { id: true, name: true, type: true, status: true, purchasePrice: true },
        orderBy: { name: 'asc' },
        take: 20,
      }),
      // Retired assets not soft-deleted, or soft-deleted assets not marked RETIRED
      prisma.asset.findMany({
        where: {
          OR: [
            { status: 'RETIRED', deletedAt: null },
            { deletedAt: { not: null }, status: { not: 'RETIRED' } },
          ],
        },
        select: { id: true, name: true, type: true, status: true, deletedAt: true },
        orderBy: { name: 'asc' },
        take: 20,
      }),
      prisma.asset.count({ where: { deletedAt: null } }),
      prisma.asset.count({ where: { deletedAt: null, propertyNumber: null } }),
      prisma.asset.count({ where: { deletedAt: null, serialNumber: null } }),
      prisma.asset.count({ where: { deletedAt: null, owner: null } }),
      prisma.asset.count({ where: { deletedAt: null, location: null } }),
      prisma.asset.count({ where: { deletedAt: null, imageUrl: null } }),
      prisma.asset.count({ where: { deletedAt: null, purchaseDate: null } }),
      prisma.asset.count({ where: { deletedAt: null, purchasePrice: null } }),
      prisma.asset.count({
        where: {
          OR: [
            { status: 'RETIRED', deletedAt: null },
            { deletedAt: { not: null }, status: { not: 'RETIRED' } },
          ],
        },
      }),
    ]);

    return success(res, {
      totalAssets,
      counts: {
        missingPropertyNumber: countMissingPropertyNumber,
        missingSerialNumber: countMissingSerialNumber,
        missingOwner: countMissingOwner,
        missingLocation: countMissingLocation,
        missingImageUrl: countMissingImageUrl,
        missingPurchaseDate: countMissingPurchaseDate,
        missingPurchasePrice: countMissingPurchasePrice,
        assignedWithoutPersonnel: countAssignedWithoutPersonnel,
        retiredVisibilityIssue: countRetiredNotDeleted,
      },
      examples: {
        missingPropertyNumber,
        missingSerialNumber,
        missingOwner,
        missingLocation,
        missingImageUrl,
        missingPurchaseDate,
        missingPurchasePrice,
        assignedWithoutPersonnel,
        retiredVisibilityIssue: retiredNotDeleted,
      },
    });
  } catch (err: any) {
    return error(res, err.message || 'Failed to fetch data quality', 500);
  }
});

export default router;