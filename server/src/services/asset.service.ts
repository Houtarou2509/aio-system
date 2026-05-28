import { logAudit } from './auditLog.service';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import path from 'path';
import fs from 'fs';
import { classifySeverity, generateSummary } from '../utils/auditHelpers';


const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- LIST ---
export async function listAssets(query: {
  page: number; limit: number;
  type?: string; status?: string; location?: string; assignedTo?: string; search?: string;
  sortBy: string; sortOrder: string;
  purchaseDateFrom?: string; purchaseDateTo?: string;
  warrantyExpiryFrom?: string; warrantyExpiryTo?: string;
}) {
  const isRetiredView = query.status === 'RETIRED';

  // When viewing disposed/retired assets, include soft-deleted records.
  // For all other views, exclude soft-deleted (deletedAt !== null) records.
  const where: Prisma.AssetWhereInput = isRetiredView
    ? {
        OR: [
          { status: 'RETIRED' as any },
          { deletedAt: { not: null } },
        ],
      }
    : { deletedAt: null };

  if (query.type) {
    where.type = { contains: query.type, mode: 'insensitive' } as any;
  }
  // status filter already handled above for RETIRED; for other statuses,
  // apply normally on top of the non-deleted base filter
  if (query.status && !isRetiredView) {
    where.status = query.status as any;
  }
  if (query.location) where.location = { contains: query.location, mode: 'insensitive' };
  if (query.assignedTo) where.assignedTo = { contains: query.assignedTo };

  // Date filters
  if (query.purchaseDateFrom || query.purchaseDateTo) {
    where.purchaseDate = {
      ...(query.purchaseDateFrom ? { gte: new Date(query.purchaseDateFrom) } : {}),
      ...(query.purchaseDateTo ? { lte: new Date(query.purchaseDateTo) } : {}),
    };
  }
  if (query.warrantyExpiryFrom || query.warrantyExpiryTo) {
    where.warrantyExpiry = {
      ...(query.warrantyExpiryFrom ? { gte: new Date(query.warrantyExpiryFrom) } : {}),
      ...(query.warrantyExpiryTo ? { lte: new Date(query.warrantyExpiryTo) } : {}),
    };
  }

  if (query.search) {
    // Check if search looks like a date (YYYY-MM-DD or YYYY)
    const isDateSearch = /^\d{4}-\d{2}-\d{2}$/.test(query.search);
    const isYearSearch = /^\d{4}$/.test(query.search);

    const orConditions: Prisma.AssetWhereInput[] = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { propertyNumber: { contains: query.search, mode: 'insensitive' } },
      { assignedTo: { contains: query.search, mode: 'insensitive' } },
      { serialNumber: { contains: query.search, mode: 'insensitive' } },
      { manufacturer: { contains: query.search, mode: 'insensitive' } },
      { location: { contains: query.search, mode: 'insensitive' } },
    ];

    if (isDateSearch) {
      orConditions.push({ purchaseDate: { equals: new Date(query.search) } });
    } else if (isYearSearch) {
      const year = parseInt(query.search);
      const start = new Date(year, 0, 1);
      const end = new Date(year + 1, 0, 1);
      orConditions.push({ purchaseDate: { gte: start, lt: end } });
    }

    where.OR = orConditions;
  }

  const [items, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { [query.sortBy]: query.sortOrder },
      include: {
        maintenanceSchedules: {
          where: { status: { in: ['pending', 'overdue'] } },
          select: { id: true, title: true, scheduledDate: true, status: true },
          orderBy: { scheduledDate: 'asc' },
        },
        assignments: {
          where: { returnedAt: null },
          select: { id: true, assignedTo: true, personnel: { select: { id: true, fullName: true } } },
          orderBy: { assignedAt: 'desc' },
          take: 1,
        },
      },
    }),
    prisma.asset.count({ where }),
  ]);

  // Backfill/override assignedTo from active assignment personnel data.
  // This handles:
  // 1. Records with status ASSIGNED but blank assignedTo
  // 2. Old records where assignedTo is a userId (UUID) instead of a name
  // Always prefer the personnel fullName from the active assignment.
  const enriched = items.map((a: any) => {
    const activeAssignment = a.assignments?.[0];
    if (activeAssignment) {
      const personnelName = activeAssignment.personnel?.fullName;
      if (personnelName) {
        // Override with the authoritative personnel name
        a.assignedTo = personnelName;
      } else if (!a.assignedTo) {
        // No personnel, no existing value — try assignment.assignedTo
        a.assignedTo = activeAssignment.assignedTo || null;
      }
      // If assignedTo is a UUID-like value (legacy userId), also try assignment.assignedTo
      if (a.assignedTo && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(a.assignedTo)) {
        a.assignedTo = activeAssignment.assignedTo || null;
      }
    }
    // Remove assignments from response (internal enrichment only)
    const { assignments, ...rest } = a;
    return rest;
  });

  return { items: enriched, total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) };
}

// Helper to clean warranty fields for DB
function cleanWarrantyFields(data: any) {
  const result: any = { ...data };
  // warrantyExpiry: empty string → null, valid date string → Date
  if ('warrantyExpiry' in result) {
    if (result.warrantyExpiry === '' || result.warrantyExpiry === null || result.warrantyExpiry === undefined) {
      result.warrantyExpiry = null;
    } else {
      result.warrantyExpiry = new Date(result.warrantyExpiry);
    }
  }
  // warrantyNotes: empty string → null
  if ('warrantyNotes' in result) {
    if (result.warrantyNotes === '' || result.warrantyNotes === null) {
      result.warrantyNotes = null;
    }
  }
  return result;
}

// Format audit values — dates get readable format instead of raw Date.toString() or ISO
function formatAuditValue(value: any): string {
  if (value === null || value === undefined) return 'empty';
  if (value === '') return 'empty';
  if (value instanceof Date) {
    return value.toLocaleDateString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  if (typeof value === 'string' && !isNaN(Date.parse(value)) && value.includes('T')) {
    return new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  return String(value);
}

// --- CREATE ---
export async function createAsset(data: Prisma.AssetCreateInput, performedById: string, ipAddress?: string, userAgent?: string) {
  const cleaned = cleanWarrantyFields(data);
  const asset = await prisma.asset.create({ data: cleaned });

  await logAudit({
  userId: performedById ?? null,
  action: 'CREATE',
  entityType: 'Asset',
  entityId: asset.id ?? null,
  ipAddress: ipAddress ?? null,
  metadata: {
    "userAgent": userAgent,
    "field": '*',
    "oldValue": null,
    "newValue": JSON.stringify(data),
    "severity": 'LOW',
    "summary": generateSummary({ action: 'CREATE', entityType: 'Asset', assetName: (data as any).name }),
  },
});

  return asset;
}

// --- GET SINGLE ---
export async function getAsset(id: string) {
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      assignments: { include: { user: { select: { id: true, username: true, email: true } }, personnel: { select: { id: true, fullName: true } } }, orderBy: { assignedAt: 'desc' } },
      maintenanceLogs: { orderBy: { date: 'desc' } },
    },
  });
  if (!asset) throw new Error('Asset not found');

  // Backfill/override assignedTo from active assignment personnel data
  // Handles: blank assignedTo, and legacy UUID values from old userId assignments
  if (asset.assignments?.length) {
    const activeAssignment = asset.assignments.find((a: any) => !a.returnedAt);
    if (activeAssignment) {
      const personnelName = activeAssignment.personnel?.fullName;
      if (personnelName) {
        asset.assignedTo = personnelName;
      } else if (!asset.assignedTo) {
        asset.assignedTo = activeAssignment.assignedTo || null;
      }
      // If assignedTo looks like a UUID (legacy userId), clear it or replace
      if (asset.assignedTo && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(asset.assignedTo)) {
        asset.assignedTo = activeAssignment.assignedTo || null;
      }
    }
  }

  return asset;
}

// --- UPDATE ---
export async function updateAsset(id: string, data: Prisma.AssetUpdateInput, performedById: string, ipAddress?: string, userAgent?: string) {
  const existing = await prisma.asset.findUnique({ where: { id, deletedAt: null } });
  if (!existing) throw new Error('Asset not found');

  // ── Guard: block manual status change away from ASSIGNED when active issuance exists ──
  const newStatusRaw = (data as any).status;
  if (newStatusRaw && existing.status === 'ASSIGNED' && newStatusRaw !== 'ASSIGNED') {
    const activeIssuance = await prisma.assignment.findFirst({
      where: { assetId: id, returnedAt: null },
    });
    if (activeIssuance) {
      const err: any = new Error('Asset has an active issuance. Use the Issuances return flow before changing this status.');
      err.code = 'ACTIVE_ISSUANCE_EXISTS';
      err.statusCode = 409;
      throw err;
    }
  }

  const cleaned = cleanWarrantyFields(data);
  const asset = await prisma.asset.update({ where: { id }, data: cleaned });

  // Audit log each changed field
  for (const [key, newVal] of Object.entries(data)) {
    if (key === 'updatedAt') continue;
    const oldVal = (existing as any)[key];
    const oldStr = oldVal == null ? '' : String(oldVal);
    const newStr = newVal == null ? '' : String(newVal);
    if (oldStr === newStr) continue;
    await logAudit({
  userId: performedById ?? null,
  action: 'UPDATE',
  entityType: 'Asset',
  entityId: id ?? null,
  ipAddress: ipAddress ?? null,
  metadata: {
    "userAgent": userAgent,
    "field": key,
    "oldValue": oldVal == null ? null : formatAuditValue(oldVal),
    "newValue": newVal == null ? null : formatAuditValue(newVal),
    "severity": classifySeverity('UPDATE', key),
    "summary": generateSummary({ action: 'UPDATE', entityType: 'Asset', field: key, oldValue: oldVal == null ? null : formatAuditValue(oldVal), newValue: newVal == null ? null : formatAuditValue(newVal), assetName: existing.name }),
  },
});
  }

  // Auto-track assignment history when assignedTo changes
  const oldAssignedTo = (existing as any).assignedTo as string | null;
  const newAssignedToRaw = (data as any).assignedTo;

  // Resolve the actual new value (handle Prisma input forms)
  let newAssignedTo: string | null;
  if (newAssignedToRaw === undefined) {
    // assignedTo wasn't changed
    newAssignedTo = oldAssignedTo;
  } else if (newAssignedToRaw === null || newAssignedToRaw === '') {
    newAssignedTo = null;
  } else if (typeof newAssignedToRaw === 'string') {
    newAssignedTo = newAssignedToRaw;
  } else {
    newAssignedTo = oldAssignedTo; // Prisma nested form, skip
  }

  const oldNorm = oldAssignedTo || null;
  const newNorm = newAssignedTo || null;

  if (oldNorm !== newNorm) {
    // Close any active assignment
    const activeAssignment = await prisma.assignment.findFirst({
      where: { assetId: id, returnedAt: null },
      orderBy: { assignedAt: 'desc' },
    });
    if (activeAssignment) {
      await prisma.assignment.update({
        where: { id: activeAssignment.id },
        data: { returnedAt: new Date() },
      });
    }

    // Create new assignment if assigning to someone
    if (newNorm) {
      await prisma.assignment.create({
        data: {
          assetId: id,
          assignedTo: newNorm,
          assignedAt: new Date(),
        },
      });
    }
  }

  return asset;
}

// --- SOFT DELETE ---
export async function deleteAsset(id: string, performedById: string, ipAddress?: string, userAgent?: string) {
  const existing = await prisma.asset.findUnique({ where: { id, deletedAt: null } });
  if (!existing) throw new Error('Asset not found');

  const now = new Date();
  const asset = await prisma.asset.update({
    where: { id },
    data: { deletedAt: now, status: 'RETIRED' },
  });

  await logAudit({
  userId: performedById ?? null,
  action: 'SOFT_DELETE',
  entityType: 'Asset',
  entityId: id ?? null,
  ipAddress: ipAddress ?? null,
  metadata: {
    "userAgent": userAgent,
    "field": 'deletedAt',
    "newValue": now.toISOString(),
    "severity": 'HIGH',
    "summary": generateSummary({ action: 'DELETE', entityType: 'Asset', assetName: existing?.name }),
  },
});

  return asset;
}

// --- CHECKOUT ---
export async function checkoutAsset(assetId: string, userId: string, notes: string | undefined, performedById: string, ipAddress?: string, userAgent?: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId, deletedAt: null } });
  if (!asset) throw new Error('Asset not found');
  if (asset.status !== 'AVAILABLE') throw new Error('Asset is not available for checkout');

  const [assignment] = await Promise.all([
    prisma.assignment.create({ data: { assetId, userId, notes, condition: 'Good' } }),
    prisma.asset.update({ where: { id: assetId }, data: { status: 'ASSIGNED', assignedTo: userId } }),
  ]);

  await logAudit({
  userId: performedById ?? null,
  action: 'CHECKOUT',
  entityType: 'Asset',
  entityId: assetId ?? null,
  ipAddress: ipAddress ?? null,
  metadata: {
    "userAgent": userAgent,
    "field": 'assignedTo',
    "newValue": userId,
    "severity": 'HIGH',
    "summary": generateSummary({ action: 'CHECKOUT', entityType: 'Asset', assetName: asset?.name }),
  },
});

  return assignment;
}

// --- RETURN ---
export async function returnAsset(assetId: string, condition: string, notes: string | undefined, performedById: string, ipAddress?: string, userAgent?: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId, deletedAt: null } });
  if (!asset) throw new Error('Asset not found');
  if (asset.status !== 'ASSIGNED') throw new Error('Asset is not currently assigned');

  const activeAssignment = await prisma.assignment.findFirst({
    where: { assetId, returnedAt: null },
    orderBy: { assignedAt: 'desc' },
  });
  if (!activeAssignment) throw new Error('No active assignment found');

  await Promise.all([
    prisma.assignment.update({ where: { id: activeAssignment.id }, data: { returnedAt: new Date(), condition, notes } }),
    prisma.asset.update({ where: { id: assetId }, data: { status: 'AVAILABLE', assignedTo: null } }),
  ]);

  await logAudit({
  userId: performedById ?? null,
  action: 'RETURN',
  entityType: 'Asset',
  entityId: assetId ?? null,
  ipAddress: ipAddress ?? null,
  metadata: {
    "userAgent": userAgent,
    "field": 'status',
    "newValue": 'AVAILABLE',
    "severity": 'MEDIUM',
    "summary": generateSummary({ action: 'RETURN', entityType: 'Asset', assetName: asset?.name }),
  },
});

  return { returned: true };
}

// --- IMAGE UPLOAD ---
export async function uploadAssetImage(assetId: string, filename: string, performedById: string, userAgent?: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId, deletedAt: null } });
  if (!asset) throw new Error('Asset not found');

  const imageUrl = `/uploads/${filename}`;
  await prisma.asset.update({ where: { id: assetId }, data: { imageUrl } });

  await logAudit({
  userId: performedById ?? null,
  action: 'UPDATE',
  entityType: 'Asset',
  entityId: assetId ?? null,
  ipAddress: null,
  metadata: {
    "userAgent": userAgent,
    "field": 'imageUrl',
    "newValue": imageUrl,
    "severity": 'MEDIUM',
    "summary": generateSummary({ action: 'UPDATE', entityType: 'Asset', field: 'imageUrl', assetName: asset?.name }),
    "oldImageUrl": (asset as any)?.imageUrl || null,
  },
});

  return { imageUrl };
}

// --- HISTORY ---
export async function getAssetHistory(assetId: string, page: number, limit: number) {
  const [items, total] = await Promise.all([
    prisma.assignment.findMany({
      where: { assetId },
      include: { user: { select: { id: true, username: true, email: true } } },
      orderBy: { assignedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.assignment.count({ where: { assetId } }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// --- STATS ---
export async function getAssetStats() {
  const now = new Date();
  const thirtyDays = new Date();
  thirtyDays.setDate(now.getDate() + 30);

  const [byStatus, byType, byLocation, total, warrantiesExpiringSoon, warrantiesExpired, warrantiesExpiringSoonList] = await Promise.all([
    prisma.asset.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { status: true } }),
    prisma.asset.groupBy({ by: ['type'], where: { deletedAt: null }, _count: { type: true } }),
    prisma.asset.groupBy({ by: ['location'], where: { deletedAt: null }, _count: { location: true } }),
    prisma.asset.count({ where: { deletedAt: null } }),
    // Warranties expiring within 30 days (not yet expired)
    prisma.asset.count({
      where: {
        warrantyExpiry: { not: null, gte: now, lte: thirtyDays },
        status: { not: 'RETIRED' },
        deletedAt: null,
      },
    }),
    // Warranties already expired (still active/assigned)
    prisma.asset.count({
      where: {
        warrantyExpiry: { not: null, lt: now },
        status: { in: ['AVAILABLE', 'ASSIGNED', 'PENDING_ASSIGNMENT', 'MAINTENANCE'] },
        deletedAt: null,
      },
    }),
    // List of assets expiring soon (max 10 for dashboard widget)
    prisma.asset.findMany({
      where: {
        warrantyExpiry: { not: null, gte: now, lte: thirtyDays },
        status: { not: 'RETIRED' },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        serialNumber: true,
        propertyNumber: true,
        warrantyExpiry: true,
        status: true,
        assignedTo: true,
      },
      orderBy: { warrantyExpiry: 'asc' },
      take: 10,
    }),
  ]);

  return {
    total,
    byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count.status])),
    byType: Object.fromEntries(byType.map(t => [t.type, t._count.type])),
    byLocation: Object.fromEntries(byLocation.filter(l => l.location).map(l => [l.location, l._count.location])),
    warrantiesExpiringSoon,
    warrantiesExpired,
    warrantiesExpiringSoonList: warrantiesExpiringSoonList.map(a => ({
      ...a,
      warrantyExpiry: a.warrantyExpiry!.toISOString(),
    })),
  };
}

// --- DISPOSE ---
export async function disposeAsset(
  id: string,
  data: { reason: string; method: string; date: string; forceDispose?: boolean },
  performedById: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const existing = await prisma.asset.findUnique({ where: { id, deletedAt: null } });
  if (!existing) throw new Error('Asset not found');
  if (existing.status === 'RETIRED') throw new Error('Asset is already retired');

  // ── Pre-disposal validation ──

  // a. Active assignment check — hard block
  const activeAssignment = await prisma.assignment.findFirst({
    where: { assetId: id, returnedAt: null },
  });
  if (activeAssignment) {
    const err: any = new Error('Asset is currently assigned. Return it before disposing.');
    err.code = 'ASSET_STILL_ASSIGNED';
    err.assignedTo = activeAssignment.personnelId;
    err.statusCode = 409;
    throw err;
  }

  // b. Open agreement document check — hard block
  const openDoc = await prisma.agreementDocument.findFirst({
    where: { assignments: { some: { assetId: id } }, status: 'issued' },
  });
  if (openDoc) {
    const err: any = new Error('Asset has an open agreement document. Close it before disposing.');
    err.code = 'OPEN_AGREEMENT_EXISTS';
    err.documentNumber = openDoc.documentNumber;
    err.statusCode = 409;
    throw err;
  }

  // c. Pending maintenance schedule check — soft block (forceable)
  const pendingSchedules = await prisma.maintenanceSchedule.findMany({
    where: { assetId: id, status: 'pending' },
  });
  if (pendingSchedules.length > 0 && !data.forceDispose) {
    const err: any = new Error('Asset has pending maintenance schedules.');
    err.code = 'PENDING_MAINTENANCE';
    err.scheduleCount = pendingSchedules.length;
    err.canForce = true;
    err.statusCode = 409;
    throw err;
  }

  const disposalDate = new Date(data.date);

  // If forceDispose, cancel pending maintenance schedules
  if (data.forceDispose && pendingSchedules.length > 0) {
    await prisma.maintenanceSchedule.updateMany({
      where: { assetId: id, status: 'pending' },
      data: { status: 'cancelled' },
    });
  }

  const asset = await prisma.asset.update({
    where: { id },
    data: {
      status: 'RETIRED',
      deletedAt: new Date(),
      disposalReason: data.reason,
      disposalDate,
      disposalMethod: data.method as any,
    },
  });

  const methodLabel = data.method.replace(/_/g, ' ').toLowerCase();
  const summary = `Disposed "${existing.name}" — ${methodLabel} on ${disposalDate.toLocaleDateString('en-PH')}: ${data.reason}`;

  await logAudit({
  userId: performedById ?? null,
  action: 'DISPOSE',
  entityType: 'Asset',
  entityId: id ?? null,
  ipAddress: ipAddress ?? null,
  metadata: {
    "userAgent": userAgent,
    "field": '*',
    "oldValue": null,
    "newValue": JSON.stringify(data),
    "severity": 'HIGH',
    "summary": summary,
  },
});

  return asset;
}
