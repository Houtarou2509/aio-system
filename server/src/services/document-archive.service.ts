import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logAudit, AUDIT_ACTIONS } from './auditLog.service';

export const DOCUMENT_ARCHIVE_TYPES = [
  'ACCOUNTABILITY_FORM',
  'SIGNED_AGREEMENT',
  'RETURN_FORM',
  'PURCHASE_DOCUMENT',
  'DISPOSAL_DOCUMENT',
] as const;

export type DocumentArchiveType = typeof DOCUMENT_ARCHIVE_TYPES[number];

export interface ListDocumentsFilters {
  search?: string;
  documentType?: DocumentArchiveType;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  assetId?: string;
  personnelId?: string;
  purchaseRequestId?: string;
  assignmentId?: string;
  page?: number;
  limit?: number;
}

function buildWhere(filters: ListDocumentsFilters): Prisma.DocumentArchiveItemWhereInput {
  const where: Prisma.DocumentArchiveItemWhereInput = {};

  if (filters.documentType) {
    where.documentType = filters.documentType;
  }
  if (filters.status) {
    where.status = filters.status as any;
  }
  if (filters.assetId) {
    where.assetId = filters.assetId;
  }
  if (filters.personnelId) {
    where.personnelId = filters.personnelId;
  }
  if (filters.purchaseRequestId) {
    where.purchaseRequestId = filters.purchaseRequestId;
  }
  if (filters.assignmentId) {
    where.assignmentId = filters.assignmentId;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const d = new Date(filters.dateTo);
      if (!isNaN(d.getTime())) {
        const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
        where.createdAt.lte = endOfDay;
      }
    }
  }

  if (filters.search) {
    const q = filters.search;
    where.OR = [
      { documentNumber: { contains: q, mode: 'insensitive' } },
      { title: { contains: q, mode: 'insensitive' } },
      { sourceEntityType: { contains: q, mode: 'insensitive' } },
      { asset: { name: { contains: q, mode: 'insensitive' } } },
      { asset: { serialNumber: { contains: q, mode: 'insensitive' } } },
      { asset: { propertyNumber: { contains: q, mode: 'insensitive' } } },
      { personnel: { fullName: { contains: q, mode: 'insensitive' } } },
      { personnel: { email: { contains: q, mode: 'insensitive' } } },
      { purchaseRequest: { assetName: { contains: q, mode: 'insensitive' } } },
    ];
  }

  return where;
}

export async function listDocuments(filters: ListDocumentsFilters = {}) {
  const { page = 1, limit = 20 } = filters;
  const where = buildWhere(filters);

  const [items, total] = await Promise.all([
    prisma.documentArchiveItem.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true } },
        personnel: { select: { id: true, fullName: true, designation: true } },
        purchaseRequest: { select: { id: true, assetName: true, status: true } },
        assignment: { select: { id: true, assignedTo: true, assetId: true } },
        uploadedBy: { select: { id: true, username: true, fullName: true } },
      },
    }),
    prisma.documentArchiveItem.count({ where }),
  ]);

  return {
    data: items,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getDocumentById(id: string) {
  return prisma.documentArchiveItem.findUnique({
    where: { id },
    include: {
      asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true } },
      personnel: { select: { id: true, fullName: true, designation: true } },
      purchaseRequest: { select: { id: true, assetName: true, status: true } },
      assignment: { select: { id: true, assignedTo: true, assetId: true } },
      uploadedBy: { select: { id: true, username: true, fullName: true } },
    },
  });
}

const SERVER_ROOT = path.resolve(__dirname, '../../');
const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

export function resolveDocumentPath(filePath?: string | null): string | null {
  if (!filePath) return null;
  // Strip a leading slash and any leading parent-dir traversal; reject absolute or traversal paths
  const normalized = filePath.replace(/^\/+/, '').replace(/\\/g, '/');
  if (/^(\.\.|\.\/|\.\\|\.\.\/|\.\.\\)/.test(normalized)) return null;
  if (normalized.includes('../') || normalized.includes('..\\')) return null;

  const absolutePath = path.resolve(SERVER_ROOT, normalized);
  // Ensure resolved path is inside the uploads directory tree
  const relativeToUploads = path.relative(UPLOADS_ROOT, absolutePath);
  if (relativeToUploads.startsWith('..') || path.isAbsolute(relativeToUploads)) return null;

  return absolutePath;
}

export async function createArchiveItem(data: {
  documentType: DocumentArchiveType;
  title: string;
  documentNumber: string;
  filePath?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  assetId?: string | null;
  personnelId?: string | null;
  purchaseRequestId?: string | null;
  assignmentId?: string | null;
  status?: string;
  uploadedById?: string | null;
}) {
  return prisma.documentArchiveItem.create({
    data: {
      documentType: data.documentType,
      title: data.title,
      documentNumber: data.documentNumber,
      filePath: data.filePath ?? null,
      sourceEntityType: data.sourceEntityType ?? null,
      sourceEntityId: data.sourceEntityId ?? null,
      assetId: data.assetId ?? null,
      personnelId: data.personnelId ?? null,
      purchaseRequestId: data.purchaseRequestId ?? null,
      assignmentId: data.assignmentId ?? null,
      status: (data.status as any) ?? 'ACTIVE',
      uploadedById: data.uploadedById ?? null,
    },
    include: {
      asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true } },
      personnel: { select: { id: true, fullName: true } },
      purchaseRequest: { select: { id: true, assetName: true } },
      assignment: { select: { id: true, assignedTo: true } },
    },
  });
}

export async function upsertArchiveItemBySource(
  sourceEntityType: string,
  sourceEntityId: string,
  documentType: DocumentArchiveType,
  data: {
    title: string;
    documentNumber: string;
    filePath?: string | null;
    assetId?: string | null;
    personnelId?: string | null;
    purchaseRequestId?: string | null;
    assignmentId?: string | null;
    uploadedById?: string | null;
  },
) {
  const existing = await prisma.documentArchiveItem.findFirst({
    where: { sourceEntityType, sourceEntityId, documentType, status: 'ACTIVE' },
  });

  if (existing) {
    await prisma.documentArchiveItem.update({
      where: { id: existing.id },
      data: { status: 'SUPERSEDED' },
    });
  }

  return createArchiveItem({
    ...data,
    documentType,
    sourceEntityType,
    sourceEntityId,
  });
}

export async function recordSignedAgreementArchive(
  agreementDocumentId: string,
  signedPdfPath: string,
  uploadedById: string,
  metadata: {
    title: string;
    documentNumber: string;
    personnelId?: string | null;
    assignmentId?: string | null;
    assetId?: string | null;
  },
) {
  const item = await upsertArchiveItemBySource(
    'AgreementDocument',
    agreementDocumentId,
    'SIGNED_AGREEMENT',
    {
      title: metadata.title,
      documentNumber: metadata.documentNumber,
      filePath: signedPdfPath,
      assetId: metadata.assetId ?? null,
      personnelId: metadata.personnelId ?? null,
      assignmentId: metadata.assignmentId ?? null,
      uploadedById,
    },
  );

  await logAudit({
    userId: uploadedById ?? null,
    action: AUDIT_ACTIONS.DOCUMENT_ARCHIVED,
    entityType: 'DocumentArchiveItem',
    entityId: item.id,
    ipAddress: null,
    metadata: {
      documentType: 'SIGNED_AGREEMENT',
      sourceEntityType: 'AgreementDocument',
      sourceEntityId: agreementDocumentId,
      documentNumber: metadata.documentNumber,
    },
  }).catch(() => {});

  return item;
}

export async function recordAccountabilityFormArchive(
  agreementDocumentId: string,
  performedById: string,
  metadata: {
    title: string;
    documentNumber: string;
    personnelId?: string | null;
    assignmentId?: string | null;
    assetId?: string | null;
  },
) {
  const item = await upsertArchiveItemBySource(
    'AgreementDocument',
    agreementDocumentId,
    'ACCOUNTABILITY_FORM',
    {
      title: metadata.title,
      documentNumber: metadata.documentNumber,
      assetId: metadata.assetId ?? null,
      personnelId: metadata.personnelId ?? null,
      assignmentId: metadata.assignmentId ?? null,
      uploadedById: performedById,
    },
  );

  await logAudit({
    userId: performedById ?? null,
    action: AUDIT_ACTIONS.DOCUMENT_ARCHIVED,
    entityType: 'DocumentArchiveItem',
    entityId: item.id,
    ipAddress: null,
    metadata: {
      documentType: 'ACCOUNTABILITY_FORM',
      sourceEntityType: 'AgreementDocument',
      sourceEntityId: agreementDocumentId,
      documentNumber: metadata.documentNumber,
    },
  }).catch(() => {});

  return item;
}

export async function recordReturnFormArchive(
  assignmentId: string,
  performedById: string,
  metadata: {
    title: string;
    documentNumber: string;
    assetId: string;
    personnelId?: string | null;
  },
) {
  const item = await upsertArchiveItemBySource(
    'Assignment',
    assignmentId,
    'RETURN_FORM',
    {
      title: metadata.title,
      documentNumber: metadata.documentNumber,
      assetId: metadata.assetId,
      personnelId: metadata.personnelId ?? null,
      assignmentId,
      uploadedById: performedById,
    },
  );

  await logAudit({
    userId: performedById ?? null,
    action: AUDIT_ACTIONS.DOCUMENT_ARCHIVED,
    entityType: 'DocumentArchiveItem',
    entityId: item.id,
    ipAddress: null,
    metadata: {
      documentType: 'RETURN_FORM',
      sourceEntityType: 'Assignment',
      sourceEntityId: assignmentId,
      documentNumber: metadata.documentNumber,
    },
  }).catch(() => {});

  return item;
}

export async function recordPurchaseDocumentArchive(
  purchaseRequestId: string,
  performedById: string,
  metadata: {
    title: string;
    documentNumber: string;
    assetId?: string | null;
  },
) {
  const item = await upsertArchiveItemBySource(
    'PurchaseRequest',
    purchaseRequestId,
    'PURCHASE_DOCUMENT',
    {
      title: metadata.title,
      documentNumber: metadata.documentNumber,
      purchaseRequestId,
      assetId: metadata.assetId ?? null,
      uploadedById: performedById,
    },
  );

  await logAudit({
    userId: performedById ?? null,
    action: AUDIT_ACTIONS.DOCUMENT_ARCHIVED,
    entityType: 'DocumentArchiveItem',
    entityId: item.id,
    ipAddress: null,
    metadata: {
      documentType: 'PURCHASE_DOCUMENT',
      sourceEntityType: 'PurchaseRequest',
      sourceEntityId: purchaseRequestId,
      documentNumber: metadata.documentNumber,
    },
  }).catch(() => {});

  return item;
}

export async function recordDisposalDocumentArchive(
  assetId: string,
  performedById: string,
  metadata: {
    title: string;
    documentNumber: string;
    reason?: string | null;
    method?: string | null;
  },
) {
  const item = await upsertArchiveItemBySource(
    'Asset',
    assetId,
    'DISPOSAL_DOCUMENT',
    {
      title: metadata.title,
      documentNumber: metadata.documentNumber,
      assetId,
      uploadedById: performedById,
    },
  );

  await logAudit({
    userId: performedById ?? null,
    action: AUDIT_ACTIONS.DOCUMENT_ARCHIVED,
    entityType: 'DocumentArchiveItem',
    entityId: item.id,
    ipAddress: null,
    metadata: {
      documentType: 'DISPOSAL_DOCUMENT',
      sourceEntityType: 'Asset',
      sourceEntityId: assetId,
      documentNumber: metadata.documentNumber,
      reason: metadata.reason ?? null,
      method: metadata.method ?? null,
    },
  }).catch(() => {});

  return item;
}

export async function logDocumentView(documentId: string, userId: string, ipAddress?: string) {
  await logAudit({
    userId,
    action: AUDIT_ACTIONS.DOCUMENT_VIEWED,
    entityType: 'DocumentArchiveItem',
    entityId: documentId,
    ipAddress: ipAddress ?? null,
  }).catch(() => {});
}
