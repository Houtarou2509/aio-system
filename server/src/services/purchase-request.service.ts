import { prisma } from '../lib/prisma';
import { classifySeverity, generateSummary } from '../utils/auditHelpers';

// ── LIST ──
export async function listRequests(userId: string, role: string) {
  const where: any = {};
  if (role !== 'ADMIN') {
    where.requestedById = userId;
  }

  const items = await prisma.purchaseRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      requestedBy: { select: { id: true, username: true, email: true } },
      approvedBy: { select: { id: true, username: true, email: true } },
    },
  });

  return { items, total: items.length };
}

// ── CREATE ──
export async function createRequest(
  data: { assetName: string; type: string; reason: string; notes?: string },
  userId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const request = await prisma.purchaseRequest.create({
    data: {
      assetName: data.assetName,
      type: data.type,
      reason: data.reason,
      notes: data.notes ?? null,
      requestedById: userId,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      entityType: 'PurchaseRequest',
      entityId: request.id,
      action: 'REQUEST',
      performedById: userId,
      ipAddress,
      userAgent,
      field: '*',
      oldValue: null,
      newValue: JSON.stringify(data),
      severity: 'MEDIUM',
      summary: generateSummary({
        action: 'REQUEST',
        entityType: 'PurchaseRequest',
        assetName: data.assetName,
      }),
    },
  });

  return request;
}

// ── APPROVE ──
export async function approveRequest(
  id: string,
  adminId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const existing = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!existing) throw new Error('Purchase request not found');
  if (existing.status !== 'PENDING') throw new Error('Request is not in PENDING status');

  const result = await prisma.$transaction(async (tx) => {
    // Update request
    const request = await tx.purchaseRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: adminId,
        approvedAt: new Date(),
      },
    });

    // Auto-create asset
    await tx.asset.create({
      data: {
        name: existing.assetName,
        type: existing.type,
        status: 'AVAILABLE',
        remarks: `Created from approved purchase request. Reason: ${existing.reason}`,
      },
    });

    return request;
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      entityType: 'PurchaseRequest',
      entityId: id,
      action: 'APPROVE',
      performedById: adminId,
      ipAddress,
      userAgent,
      field: 'status',
      oldValue: 'PENDING',
      newValue: 'APPROVED',
      severity: 'MEDIUM',
      summary: generateSummary({
        action: 'APPROVE',
        entityType: 'PurchaseRequest',
        assetName: existing.assetName,
      }),
    },
  });

  return result;
}

// ── REJECT ──
export async function rejectRequest(
  id: string,
  adminId: string,
  reason: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const existing = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!existing) throw new Error('Purchase request not found');
  if (existing.status !== 'PENDING') throw new Error('Request is not in PENDING status');

  const request = await prisma.purchaseRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      approvedById: adminId,
      approvedAt: new Date(),
      notes: reason,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      entityType: 'PurchaseRequest',
      entityId: id,
      action: 'DENY',
      performedById: adminId,
      ipAddress,
      userAgent,
      field: 'status',
      oldValue: 'PENDING',
      newValue: 'REJECTED',
      severity: 'MEDIUM',
      summary: generateSummary({
        action: 'DENY',
        entityType: 'PurchaseRequest',
        assetName: existing.assetName,
      }),
    },
  });

  return request;
}
