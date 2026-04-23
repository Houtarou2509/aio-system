import { PrismaClient, Prisma } from '@prisma/client';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- LIST ---
export async function listAssets(query: {
  page: number; limit: number;
  type?: string; status?: string; location?: string; assignedTo?: string; search?: string;
  sortBy: string; sortOrder: string;
}) {
  const where: Prisma.AssetWhereInput = { deletedAt: null };
  if (query.type) {
    where.type = { contains: query.type, mode: 'insensitive' } as any;
  }
  if (query.status) where.status = query.status as any;
  if (query.location) where.location = { contains: query.location, mode: 'insensitive' };
  if (query.assignedTo) where.assignedTo = { contains: query.assignedTo };
  if (query.search) {
    where.OR = [
      { name: { contains: query.search } },
      { manufacturer: { contains: query.search } },
      { serialNumber: { contains: query.search } },
      { location: { contains: query.search } },
    ];
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
      },
    }),
    prisma.asset.count({ where }),
  ]);

  return { items, total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) };
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
export async function createAsset(data: Prisma.AssetCreateInput, performedById: string, ipAddress?: string) {
  const cleaned = cleanWarrantyFields(data);
  const asset = await prisma.asset.create({ data: cleaned });

  await prisma.auditLog.create({
    data: { entityType: 'Asset', entityId: asset.id, action: 'CREATE', performedById, ipAddress, field: '*', oldValue: null, newValue: JSON.stringify(data) },
  });

  return asset;
}

// --- GET SINGLE ---
export async function getAsset(id: string) {
  const asset = await prisma.asset.findUnique({
    where: { id, deletedAt: null },
    include: {
      assignments: { include: { user: { select: { id: true, username: true, email: true } } }, orderBy: { assignedAt: 'desc' } },
      maintenanceLogs: { orderBy: { date: 'desc' } },
    },
  });
  if (!asset) throw new Error('Asset not found');
  return asset;
}

// --- UPDATE ---
export async function updateAsset(id: string, data: Prisma.AssetUpdateInput, performedById: string, ipAddress?: string) {
  const existing = await prisma.asset.findUnique({ where: { id, deletedAt: null } });
  if (!existing) throw new Error('Asset not found');

  const cleaned = cleanWarrantyFields(data);
  const asset = await prisma.asset.update({ where: { id }, data: cleaned });

  // Audit log each changed field
  for (const [key, newVal] of Object.entries(data)) {
    if (key === 'updatedAt') continue;
    const oldVal = (existing as any)[key];
    const oldStr = oldVal == null ? '' : String(oldVal);
    const newStr = newVal == null ? '' : String(newVal);
    if (oldStr === newStr) continue;
    await prisma.auditLog.create({
      data: {
        entityType: 'Asset', entityId: id, action: 'UPDATE', performedById, ipAddress,
        field: key, oldValue: oldVal == null ? null : formatAuditValue(oldVal), newValue: newVal == null ? null : formatAuditValue(newVal),
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
export async function deleteAsset(id: string, performedById: string, ipAddress?: string) {
  const existing = await prisma.asset.findUnique({ where: { id, deletedAt: null } });
  if (!existing) throw new Error('Asset not found');

  const now = new Date();
  const asset = await prisma.asset.update({
    where: { id },
    data: { deletedAt: now, status: 'RETIRED' },
  });

  await prisma.auditLog.create({
    data: { entityType: 'Asset', entityId: id, action: 'SOFT_DELETE', performedById, ipAddress, field: 'deletedAt', newValue: now.toISOString() },
  });

  return asset;
}

// --- CHECKOUT ---
export async function checkoutAsset(assetId: string, userId: string, notes: string | undefined, performedById: string, ipAddress?: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId, deletedAt: null } });
  if (!asset) throw new Error('Asset not found');
  if (asset.status !== 'AVAILABLE') throw new Error('Asset is not available for checkout');

  const [assignment] = await Promise.all([
    prisma.assignment.create({ data: { assetId, userId, notes, condition: 'Good' } }),
    prisma.asset.update({ where: { id: assetId }, data: { status: 'ASSIGNED', assignedTo: userId } }),
  ]);

  await prisma.auditLog.create({
    data: { entityType: 'Asset', entityId: assetId, action: 'CHECKOUT', performedById, ipAddress, field: 'assignedTo', newValue: userId },
  });

  return assignment;
}

// --- RETURN ---
export async function returnAsset(assetId: string, condition: string, notes: string | undefined, performedById: string, ipAddress?: string) {
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

  await prisma.auditLog.create({
    data: { entityType: 'Asset', entityId: assetId, action: 'RETURN', performedById, ipAddress, field: 'status', newValue: 'AVAILABLE' },
  });

  return { returned: true };
}

// --- IMAGE UPLOAD ---
export async function uploadAssetImage(assetId: string, filename: string, performedById: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId, deletedAt: null } });
  if (!asset) throw new Error('Asset not found');

  const imageUrl = `/uploads/${filename}`;
  await prisma.asset.update({ where: { id: assetId }, data: { imageUrl } });

  await prisma.auditLog.create({
    data: { entityType: 'Asset', entityId: assetId, action: 'UPDATE', performedById, field: 'imageUrl', newValue: imageUrl },
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
  const [byStatus, byType, byLocation, total] = await Promise.all([
    prisma.asset.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { status: true } }),
    prisma.asset.groupBy({ by: ['type'], where: { deletedAt: null }, _count: { type: true } }),
    prisma.asset.groupBy({ by: ['location'], where: { deletedAt: null }, _count: { location: true } }),
    prisma.asset.count({ where: { deletedAt: null } }),
  ]);

  return {
    total,
    byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count.status])),
    byType: Object.fromEntries(byType.map(t => [t.type, t._count.type])),
    byLocation: Object.fromEntries(byLocation.filter(l => l.location).map(l => [l.location, l._count.location])),
  };
}