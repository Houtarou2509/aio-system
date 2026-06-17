import { logAudit } from './auditLog.service';
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
  await logAudit({
  userId: userId ?? null,
  action: 'REQUEST',
  entityType: 'PurchaseRequest',
  entityId: request.id ?? null,
  ipAddress: ipAddress ?? null,
  metadata: {
    "userAgent": userAgent,
    "field": '*',
    "oldValue": null,
    "newValue": JSON.stringify(data),
    "severity": 'MEDIUM',
    "summary": generateSummary({
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

    // Auto-create asset and link it
    const asset = await tx.asset.create({
      data: {
        name: existing.assetName,
        type: existing.type,
        status: 'AVAILABLE',
        remarks: `Created from approved purchase request. Reason: ${existing.reason}`,
      },
    });

    // Link purchase request to the created asset
    await tx.purchaseRequest.update({
      where: { id },
      data: {
        convertedToAssetId: asset.id,
        convertedAt: new Date(),
      },
    });

    return request;
  });

  // Audit log
  await logAudit({
  userId: adminId ?? null,
  action: 'APPROVE',
  entityType: 'PurchaseRequest',
  entityId: id ?? null,
  ipAddress: ipAddress ?? null,
  metadata: {
    "userAgent": userAgent,
    "field": 'status',
    "oldValue": 'PENDING',
    "newValue": 'APPROVED',
    "severity": 'MEDIUM',
    "summary": generateSummary({
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
  await logAudit({
  userId: adminId ?? null,
  action: 'DENY',
  entityType: 'PurchaseRequest',
  entityId: id ?? null,
  ipAddress: ipAddress ?? null,
  metadata: {
    "userAgent": userAgent,
    "field": 'status',
    "oldValue": 'PENDING',
    "newValue": 'REJECTED',
    "severity": 'MEDIUM',
    "summary": generateSummary({
        action: 'DENY',
        entityType: 'PurchaseRequest',
        assetName: existing.assetName,
      }),
  },
});

  return request;
}

// ── CONVERT TO ASSET ──
export async function convertToAsset(
  id: string,
  userId: string,
  overrides: {
    propertyNumber?: string;
    serialNumber?: string;
    location?: string;
    supplierId?: string;
    purchaseDate?: string;
    purchasePrice?: number;
    warrantyExpiry?: string;
    warrantyNotes?: string;
  } = {},
  ipAddress?: string,
  userAgent?: string,
) {
  const existing = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!existing) {
    const err: any = new Error('Purchase request not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (existing.status !== 'APPROVED') {
    const err: any = new Error('Only approved purchase requests can be converted.');
    err.code = 'NOT_APPROVED';
    throw err;
  }
  if (existing.convertedToAssetId) {
    const err: any = new Error('This purchase request has already been converted to an asset.');
    err.code = 'ALREADY_CONVERTED';
    err.assetId = existing.convertedToAssetId;
    throw err;
  }

  // Build asset data from purchase request + overrides
  const assetData: any = {
    name: existing.assetName,
    type: existing.type,
    status: 'AVAILABLE',
    remarks: `Created from purchase request. Reason: ${existing.reason}`,
  };
  if (overrides.propertyNumber) assetData.propertyNumber = overrides.propertyNumber;
  if (overrides.serialNumber) assetData.serialNumber = overrides.serialNumber;
  if (overrides.location) assetData.location = overrides.location;
  if (overrides.supplierId) assetData.supplierId = overrides.supplierId;
  if (overrides.purchaseDate) assetData.purchaseDate = new Date(overrides.purchaseDate);
  if (overrides.purchasePrice !== undefined) assetData.purchasePrice = overrides.purchasePrice;
  if (overrides.warrantyExpiry) assetData.warrantyExpiry = new Date(overrides.warrantyExpiry);
  if (overrides.warrantyNotes) assetData.warrantyNotes = overrides.warrantyNotes;

  const result = await prisma.$transaction(async (tx) => {
    const asset = await tx.asset.create({ data: assetData });

    await tx.purchaseRequest.update({
      where: { id },
      data: {
        convertedToAssetId: asset.id,
        convertedAt: new Date(),
        status: 'fulfilled',
      },
    });

    return { asset, purchaseRequest: await tx.purchaseRequest.findUnique({ where: { id } }) };
  });

  // Audit log
  await logAudit({
    userId: userId ?? null,
    action: 'purchase_request.converted',
    entityType: 'PurchaseRequest',
    entityId: id ?? null,
    ipAddress: ipAddress ?? null,
    metadata: {
      'userAgent': userAgent,
      'field': '*',
      'newValue': JSON.stringify({ assetId: result.asset.id, assetName: result.asset.name }),
      'severity': 'MEDIUM',
      'summary': generateSummary({
        action: 'CONVERT',
        entityType: 'PurchaseRequest',
        assetName: existing.assetName,
      }),
    },
  });

  // Archive purchase document metadata
  try {
    const { makeDocumentNumber } = await import('../services/agreement.service');
    const { recordPurchaseDocumentArchive } = await import('../services/document-archive.service');
    await recordPurchaseDocumentArchive(id, userId, {
      title: `Purchase Record — ${existing.assetName}`,
      documentNumber: makeDocumentNumber('PUR'),
      assetId: result.asset.id,
    });
  } catch (archiveErr) {
    console.error('[convertToAsset] archive creation failed:', archiveErr);
  }

  return result;
}
