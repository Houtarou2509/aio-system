import { logAudit } from './auditLog.service';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import path from 'path';
import fs from 'fs';
import { classifySeverity, generateSummary } from '../utils/auditHelpers';


const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export interface AssetFilterInput {
  type?: string;
  status?: string;
  location?: string;
  owner?: string;
  assignedTo?: string;
  manufacturer?: string;
  search?: string;
  purchaseDateFrom?: string;
  purchaseDateTo?: string;
  warrantyExpiryFrom?: string;
  warrantyExpiryTo?: string;
  qrPrintStatus?: 'printed' | 'not_printed';
}

export function buildAssetWhere(query: AssetFilterInput): Prisma.AssetWhereInput {
  const status = query.status;
  const isRetiredView = status === 'RETIRED';

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
  if (status && !isRetiredView) {
    where.status = status as any;
  }
  if (query.location) where.location = { contains: query.location, mode: 'insensitive' };
  if (query.owner) where.owner = { contains: query.owner, mode: 'insensitive' };
  if (query.assignedTo) where.assignedTo = { contains: query.assignedTo };
  if (query.manufacturer) where.manufacturer = { contains: query.manufacturer, mode: 'insensitive' };
  if (query.qrPrintStatus === 'printed') where.qrPrintedAt = { not: null };
  if (query.qrPrintStatus === 'not_printed') where.qrPrintedAt = null;

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
    const isDateSearch = /^\d{4}-\d{2}-\d{2}$/.test(query.search);
    const isYearSearch = /^\d{4}$/.test(query.search);

    const orConditions: Prisma.AssetWhereInput[] = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { propertyNumber: { contains: query.search, mode: 'insensitive' } },
      { assignedTo: { contains: query.search, mode: 'insensitive' } },
      { serialNumber: { contains: query.search, mode: 'insensitive' } },
      { manufacturer: { contains: query.search, mode: 'insensitive' } },
      { location: { contains: query.search, mode: 'insensitive' } },
      { owner: { contains: query.search, mode: 'insensitive' } },
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

  return where;
}

// --- LIST ---
export async function listAssets(query: {
  page: number; limit: number;
  type?: string; status?: string; location?: string; owner?: string; assignedTo?: string; manufacturer?: string; search?: string;
  sortBy: string; sortOrder: string;
  purchaseDateFrom?: string; purchaseDateTo?: string;
  warrantyExpiryFrom?: string; warrantyExpiryTo?: string;
  qrPrintStatus?: 'printed' | 'not_printed';
}) {
  const where = buildAssetWhere(query);

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

// --- CSV EXPORT ---
export async function exportAssetsCsv(assets: any[]): Promise<{ csv: string; recordCount: number }>;
export async function exportAssetsCsv(query: AssetFilterInput): Promise<{ csv: string; recordCount: number }>;
export async function exportAssetsCsv(arg: any[] | AssetFilterInput): Promise<{ csv: string; recordCount: number }> {
  let assets: any[];
  if (Array.isArray(arg)) {
    assets = arg;
  } else {
    const where = buildAssetWhere(arg);
    assets = await prisma.asset.findMany({
      where,
      include: {
        assignments: {
          where: { returnedAt: null },
          select: { id: true, assignedTo: true, personnel: { select: { id: true, fullName: true } } },
          orderBy: { assignedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    assets = assets.map((a: any) => {
      const activeAssignment = a.assignments?.[0];
      if (activeAssignment) {
        const personnelName = activeAssignment.personnel?.fullName;
        if (personnelName) a.assignedTo = personnelName;
        else if (!a.assignedTo) a.assignedTo = activeAssignment.assignedTo || null;
        if (a.assignedTo && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(a.assignedTo)) {
          a.assignedTo = activeAssignment.assignedTo || null;
        }
      }
      const { assignments, ...rest } = a;
      return rest;
    });
  }
  const headers = ['Name', 'Type', 'Status', 'Location', 'Owner', 'Assigned To', 'Property #', 'Price', 'Purchase Date', 'Serial Number', 'Manufacturer', 'Remarks', 'Added Date'];
  const esc = (val: string | number | null | undefined) => {
    if (val == null) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const rows = assets.map(a => [
    esc(a.name), esc(a.type), esc(a.status), esc(a.location), esc(a.owner),
    esc(a.assignedTo), esc(a.propertyNumber), esc(a.purchasePrice != null ? Number(a.purchasePrice) : ''),
    esc(a.purchaseDate ? new Date(a.purchaseDate).toISOString().split('T')[0] : ''),
    esc(a.serialNumber), esc(a.manufacturer), esc(a.remarks),
    esc(new Date(a.createdAt).toISOString().split('T')[0]),
  ].join(','));
  return { csv: [headers.join(','), ...rows].join('\n'), recordCount: assets.length };
}

export async function markAssetsQrPrinted(input: {
  assetIds?: string[];
  filters?: AssetFilterInput;
  printedById: string;
}): Promise<{ updated: number; printedAt: Date }> {
  const printedAt = new Date();
  const data = { qrPrintedAt: printedAt, qrPrintedById: input.printedById };

  if (input.assetIds?.length) {
    const result = await prisma.asset.updateMany({
      where: { id: { in: input.assetIds }, deletedAt: null },
      data,
    });
    return { updated: result.count, printedAt };
  }

  if (input.filters) {
    const result = await prisma.asset.updateMany({
      where: buildAssetWhere(input.filters),
      data,
    });
    return { updated: result.count, printedAt };
  }

  return { updated: 0, printedAt };
}

// Helper to clean warranty and blank-string fields for DB
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
  // propertyNumber: empty string → null (blank means "no property number")
  if ('propertyNumber' in result) {
    if (result.propertyNumber === '' || result.propertyNumber === undefined) {
      result.propertyNumber = null;
    }
  }
  // serialNumber: empty string → null (blank means "no serial number")
  if ('serialNumber' in result) {
    if (result.serialNumber === '') {
      result.serialNumber = null;
    }
  }
  // assignedTo: empty string → null (blank means "no assignee")
  if ('assignedTo' in result) {
    if (result.assignedTo === '' || result.assignedTo === undefined) {
      result.assignedTo = null;
    }
  }
  return result;
}

// Normalize values for audit comparison — eliminates false change detection
// caused by type mismatches (Date object vs ISO string) and format differences.
const DATE_FIELDS = new Set([
  'purchaseDate', 'warrantyExpiry',
  'disposalDate', ' createdAt', 'updatedAt',
]);

function normalizeAuditValue(value: unknown, field?: string): string {
  if (value === null || value === undefined || value === '') return '';
  // Date objects and date-like strings → YYYY-MM-DD for comparison
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return '';
    // ISO datetime strings (e.g. "2026-01-15T00:00:00.000Z")
    if (/^\d{4}-\d{2}-\d{2}(T|\s)/.test(trimmed)) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
      }
    }
    // Locale date strings (e.g. "01/15/2026" or "2026/01/15")
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
      }
    }
    // Numeric strings that could be Decimal fields — compare as numbers
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return String(parseFloat(trimmed));
    }
    return trimmed;
  }
  if (typeof value === 'number') return String(value);
  // Decimal/PrismaDecimal objects
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    const s = String(value);
    if (/^-?\d+(\.\d+)?$/.test(s)) return String(parseFloat(s));
    return s;
  }
  return String(value);
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

  // ── Guard: unique propertyNumber if provided ──
  if (cleaned.propertyNumber && cleaned.propertyNumber.trim() !== '') {
    const existing = await prisma.asset.findFirst({
      where: {
        propertyNumber: { equals: cleaned.propertyNumber.trim(), mode: 'insensitive' },
      },
    });
    if (existing) {
      const err: any = new Error('Property number already exists.');
      err.code = 'DUPLICATE_PROPERTY_NUMBER';
      err.statusCode = 409;
      throw err;
    }
  }

  try {
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
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[]) || [];
      if (target.some(t => t.toLowerCase().includes('propertynumber'))) {
        const dupErr: any = new Error('Property number already exists.');
        dupErr.code = 'DUPLICATE_PROPERTY_NUMBER';
        dupErr.statusCode = 409;
        throw dupErr;
      }
    }
    throw err;
  }
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

  // ── Guard: unique propertyNumber if changed ──
  const newPropNum = (data as any).propertyNumber;
  if (newPropNum !== undefined && newPropNum !== null && String(newPropNum).trim() !== '') {
    const trimmed = String(newPropNum).trim();
    if (trimmed.toLowerCase() !== (existing.propertyNumber || '').toLowerCase()) {
      const conflict = await prisma.asset.findFirst({
        where: {
          propertyNumber: { equals: trimmed, mode: 'insensitive' },
        },
      });
      if (conflict) {
        const err: any = new Error('Property number already exists.');
        err.code = 'DUPLICATE_PROPERTY_NUMBER';
        err.statusCode = 409;
        throw err;
      }
    }
  }

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

  try {
    const asset = await prisma.asset.update({ where: { id }, data: cleaned });

    // Audit log each changed field (using normalized comparison to avoid false positives)
    for (const [key, newVal] of Object.entries(data)) {
      if (key === 'updatedAt') continue;
      const oldVal = (existing as any)[key];
      // Normalize both values to eliminate type/format mismatches
      // (e.g. Date object vs ISO string, Decimal vs string)
      const oldNorm = normalizeAuditValue(oldVal, key);
      const newNorm = normalizeAuditValue(newVal, key);
      if (oldNorm === newNorm) continue;
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
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[]) || [];
      if (target.some(t => t.toLowerCase().includes('propertynumber'))) {
        const dupErr: any = new Error('Property number already exists.');
        dupErr.code = 'DUPLICATE_PROPERTY_NUMBER';
        dupErr.statusCode = 409;
        throw dupErr;
      }
    }
    throw err;
  }
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

  // Archive disposal document metadata
  try {
    const { makeDocumentNumber } = await import('../services/agreement.service');
    const { recordDisposalDocumentArchive } = await import('../services/document-archive.service');
    await recordDisposalDocumentArchive(asset.id, performedById, {
      title: `Disposal Record — ${existing.name}`,
      documentNumber: makeDocumentNumber('DSP'),
      reason: data.reason,
      method: data.method,
    });
  } catch (archiveErr) {
    console.error('[disposeAsset] archive creation failed:', archiveErr);
  }

  return asset;
}

export interface AssetLifecycleEvent {
  id: string;
  type: 'created' | 'edited' | 'issued' | 'returned' | 'repaired' | 'transferred' | 'disposed' | 'audited';
  occurredAt: string;
  title: string;
  description: string;
  actorName?: string | null;
  source: 'asset' | 'assignment' | 'maintenance' | 'condition' | 'audit';
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  metadata?: Record<string, unknown>;
}

export async function getAssetLifecycle(assetId: string): Promise<AssetLifecycleEvent[]> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: {
      assignments: {
        include: {
          user: { select: { id: true, fullName: true, username: true } },
          personnel: { select: { id: true, fullName: true } },
          returnedBy: { select: { fullName: true, username: true } },
        },
        orderBy: { assignedAt: 'asc' },
      },
      maintenanceLogs: { orderBy: { date: 'asc' } },
      conditionLogs: {
        include: { recordedBy: { select: { fullName: true, username: true } } },
        orderBy: { recordedAt: 'asc' },
      },
    },
  });
  if (!asset) throw new Error('Asset not found');

  const events: AssetLifecycleEvent[] = [];

  // Created
  events.push({
    id: `created-${asset.id}`,
    type: 'created',
    occurredAt: asset.createdAt.toISOString(),
    title: 'Asset created',
    description: `${asset.name} (${asset.type}) was added to the system.`,
    actorName: null,
    source: 'asset',
    severity: 'LOW',
  });

  // Assignments → issued/returned/transferred
  for (const a of asset.assignments) {
    const actorName = a.personnel?.fullName || a.assignedTo || a.user?.fullName || a.user?.username || null;
    const transferConditionLog = asset.conditionLogs.find(c => c.assignmentId === a.id && c.event === 'transferred');
    const issueConditionLog = asset.conditionLogs.find(c => c.assignmentId === a.id && c.event === 'issued');
    const returnConditionLog = asset.conditionLogs.find(c => c.assignmentId === a.id && c.event === 'returned');

    // Transfer event: a new assignment linked to a 'transferred' condition log
    if (transferConditionLog) {
      events.push({
        id: a.id,
        type: 'transferred',
        occurredAt: a.assignedAt.toISOString(),
        title: `Transferred to ${actorName || 'unknown'}`,
        description: transferConditionLog.note
          ? `Condition: ${transferConditionLog.condition} — ${transferConditionLog.note}`
          : `Condition: ${transferConditionLog.condition}`,
        actorName,
        source: 'assignment',
        severity: 'HIGH',
        metadata: {
          assignmentId: a.id,
          condition: transferConditionLog.condition,
          personnelId: a.personnelId,
          userId: a.userId,
          transferNote: transferConditionLog.note,
        },
      });
      continue;
    }

    events.push({
      id: a.id,
      type: a.personnelId ? 'issued' : 'transferred',
      occurredAt: a.assignedAt.toISOString(),
      title: a.personnelId ? `Issued to ${actorName || 'unknown'}` : 'Assigned',
      description: issueConditionLog
        ? `Condition at issue: ${issueConditionLog.condition}${issueConditionLog.note ? ` — ${issueConditionLog.note}` : ''}`
        : `Asset was ${a.personnelId ? 'issued' : 'assigned'}${a.notes ? `: ${a.notes}` : '.'}`,
      actorName,
      source: 'assignment',
      severity: 'HIGH',
      metadata: {
        assignmentId: a.id,
        condition: issueConditionLog?.condition || a.condition,
        personnelId: a.personnelId,
        userId: a.userId,
        notes: a.notes,
      },
    });

    if (a.returnedAt) {
      // Skip return side of a transfer — it's represented by the transfer event of the follow-on assignment
      if (a.accountabilityStatus === 'TRANSFERRED') continue;
      events.push({
        id: `${a.id}-return`,
        type: 'returned',
        occurredAt: a.returnedAt.toISOString(),
        title: 'Returned',
        description: returnConditionLog
          ? `Condition on return: ${returnConditionLog.condition}${returnConditionLog.note ? ` — ${returnConditionLog.note}` : ''}`
          : a.returnNote || 'Asset was returned.',
        actorName: a.returnedBy?.fullName || a.returnedBy?.username || null,
        source: 'assignment',
        severity: 'MEDIUM',
        metadata: {
          assignmentId: a.id,
          condition: returnConditionLog?.condition || a.returnCondition || a.condition,
          returnNote: a.returnNote,
          returnRemarks: a.returnRemarks,
        },
      });
    }
  }

  // Maintenance → repaired
  for (const m of asset.maintenanceLogs) {
    events.push({
      id: m.id,
      type: 'repaired',
      occurredAt: m.date.toISOString(),
      title: 'Repaired / serviced',
      description: m.description,
      actorName: m.technicianName || null,
      source: 'maintenance',
      severity: 'MEDIUM',
      metadata: {
        cost: m.cost != null ? Number(m.cost) : null,
        technicianName: m.technicianName,
      },
    });
  }

  // AssetConditionLog standalone events not already covered by assignment events
  for (const c of asset.conditionLogs) {
    if (c.assignmentId) continue; // skip enriched assignment events
    events.push({
      id: c.id,
      type: (c.event === 'transferred' ? 'transferred' : c.event === 'issued' ? 'issued' : c.event === 'returned' ? 'returned' : 'audited') as AssetLifecycleEvent['type'],
      occurredAt: c.recordedAt.toISOString(),
      title: `${c.event.charAt(0).toUpperCase() + c.event.slice(1)} recorded`,
      description: `Condition: ${c.condition}${c.note ? ` — ${c.note}` : ''}`,
      actorName: c.recordedBy?.fullName || c.recordedBy?.username || null,
      source: 'condition',
      severity: 'LOW',
      metadata: { condition: c.condition, note: c.note, event: c.event },
    });
  }

  // Disposal
  if (asset.disposalDate || asset.status === 'RETIRED' || asset.deletedAt) {
    const occurredAt = asset.disposalDate?.toISOString()
      || asset.deletedAt?.toISOString()
      || asset.updatedAt.toISOString();
    const methodLabel = asset.disposalMethod ? asset.disposalMethod.replace(/_/g, ' ').toLowerCase() : null;
    events.push({
      id: `disposed-${asset.id}`,
      type: 'disposed',
      occurredAt,
      title: 'Asset disposed',
      description: methodLabel
        ? `${asset.name} was disposed via ${methodLabel}.${asset.disposalReason ? ` Reason: ${asset.disposalReason}` : ''}`
        : asset.disposalReason || 'Asset was disposed.',
      actorName: null,
      source: 'asset',
      severity: 'HIGH',
      metadata: {
        disposalReason: asset.disposalReason,
        disposalMethod: asset.disposalMethod,
        disposalDate: asset.disposalDate?.toISOString() || null,
      },
    });
  }

  // Audit logs
  const auditLogs = await prisma.auditLog.findMany({
    where: { entityType: 'Asset', entityId: assetId },
    include: { user: { select: { fullName: true, username: true } } },
    orderBy: { createdAt: 'asc' },
  });

  for (const log of auditLogs) {
    const meta = log.metadata as Record<string, unknown> | null;
    if (log.action === 'CREATE') continue;
    if (log.action === 'CHECKOUT' || log.action === 'ISSUANCE_CREATED' || log.action === 'ISSUANCE_BULK_CREATED') continue;
    if (log.action === 'RETURN' || log.action === 'ISSUANCE_RETURNED') continue;
    if (log.action === 'TRANSFER' || log.action === 'ISSUANCE_TRANSFERRED') continue;
    if (log.action === 'DISPOSE' || (log.action === 'SOFT_DELETE' && asset.status === 'RETIRED')) continue;

    const type: AssetLifecycleEvent['type'] =
      log.action === 'UPDATE' ? 'edited' :
      log.action === 'BULK_IMPORT' ? 'created' :
      'audited';

    const rawTitle = log.action === 'UPDATE' ? `Edited: ${meta?.field || 'fields'}`
      : log.action === 'BULK_IMPORT' ? 'Bulk imported'
      : log.action.replace(/_/g, ' ').toLowerCase();
    const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);

    events.push({
      id: `audit-${log.id}`,
      type,
      occurredAt: log.createdAt.toISOString(),
      title,
      description: meta?.summary ? String(meta.summary) : `${log.action} on ${log.entityType}`,
      actorName: log.user?.fullName || log.user?.username || null,
      source: 'audit',
      severity: (meta?.severity as 'LOW' | 'MEDIUM' | 'HIGH' | undefined) || 'LOW',
      metadata: meta || undefined,
    });
  }

  events.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  return events;
}
