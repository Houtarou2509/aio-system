import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const AUDIT_ACTIONS = {
  ISSUANCE_CREATED: 'issuance.created',
  ISSUANCE_BULK_CREATED: 'issuance.bulk_created',
  ISSUANCE_RETURNED: 'issuance.returned',
  ISSUANCE_SIGNED: 'issuance.signed',
  AGREEMENT_PDF_VIEWED: 'agreement.pdf_viewed',
  AGREEMENT_SIGNED_COPY_UPLOADED: 'agreement.signed_copy_uploaded',
  PERSONNEL_CREATED: 'personnel.created',
  PERSONNEL_UPDATED: 'personnel.updated',
  PERSONNEL_DELETED: 'personnel.deleted',
  ASSET_LOCKED: 'asset.locked',
  ASSET_RELEASED: 'asset.released',
  ISSUANCE_TRANSFERRED: 'issuance.transferred',
  ISSUE_REPORT_CREATED: 'issue_report.created',
  ISSUE_REPORT_STATUS_UPDATED: 'issue_report.status_updated',
  ISSUE_REPORT_NOTES_UPDATED: 'issue_report.notes_updated',
} as const;

export async function logAudit(params: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        metadata: params.metadata === null || params.metadata === undefined
          ? Prisma.JsonNull
          : params.metadata as Prisma.InputJsonValue,
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
