import { prisma } from '../lib/prisma';
import { classifySeverity, generateSummary } from '../utils/auditHelpers';

// --- LIST ---
export async function listSuppliers() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { assets: true } },
    },
  });
  return suppliers;
}

// --- GET SINGLE ---
export async function getSupplier(id: string) {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      _count: { select: { assets: true } },
    },
  });
  if (!supplier) throw new Error('Supplier not found');
  return supplier;
}

// --- CREATE ---
export async function createSupplier(
  data: {
    name: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    website?: string;
    notes?: string;
  },
  performedById: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const supplier = await prisma.supplier.create({ data });

  await prisma.auditLog.create({
    data: {
      entityType: 'Supplier',
      entityId: supplier.id,
      action: 'CREATE',
      performedById,
      ipAddress,
      userAgent,
      field: '*',
      oldValue: null,
      newValue: JSON.stringify(data),
      severity: 'LOW',
      summary: generateSummary({ action: 'CREATE', entityType: 'Supplier', assetName: supplier.name }),
    },
  });

  return supplier;
}

// --- UPDATE ---
export async function updateSupplier(
  id: string,
  data: {
    name?: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    website?: string;
    notes?: string;
  },
  performedById: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) throw new Error('Supplier not found');

  const supplier = await prisma.supplier.update({ where: { id }, data });

  // Audit log each changed field
  for (const [key, newVal] of Object.entries(data)) {
    if (key === 'updatedAt') continue;
    const oldVal = (existing as any)[key];
    const oldStr = oldVal == null ? '' : String(oldVal);
    const newStr = newVal == null ? '' : String(newVal);
    if (oldStr === newStr) continue;
    await prisma.auditLog.create({
      data: {
        entityType: 'Supplier',
        entityId: id,
        action: 'UPDATE',
        performedById,
        ipAddress,
        userAgent,
        field: key,
        oldValue: oldVal == null ? null : String(oldVal),
        newValue: newVal == null ? null : String(newVal),
        severity: classifySeverity('UPDATE', key),
        summary: generateSummary({
          action: 'UPDATE',
          entityType: 'Supplier',
          field: key,
          oldValue: oldVal == null ? null : String(oldVal),
          newValue: newVal == null ? null : String(newVal),
          assetName: existing.name,
        }),
      },
    });
  }

  return supplier;
}

// --- DELETE ---
export async function deleteSupplier(
  id: string,
  performedById: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) throw new Error('Supplier not found');

  // Check if any assets reference this supplier
  const assetCount = await prisma.asset.count({ where: { supplierId: id } });
  if (assetCount > 0) {
    throw new Error(`Cannot delete supplier that has ${assetCount} asset(s) linked to it. Reassign or remove those assets first.`);
  }

  const supplier = await prisma.supplier.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      entityType: 'Supplier',
      entityId: id,
      action: 'DELETE',
      performedById,
      ipAddress,
      userAgent,
      field: '*',
      oldValue: existing.name,
      newValue: null,
      severity: 'HIGH',
      summary: generateSummary({ action: 'DELETE', entityType: 'Supplier', assetName: existing.name }),
    },
  });

  return supplier;
}
