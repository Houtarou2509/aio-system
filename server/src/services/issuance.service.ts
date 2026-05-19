import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import * as crypto from 'crypto';
import { classifySeverity, generateSummary } from '../utils/auditHelpers';
import { parseTemplate } from '../utils/templateParser';
import { makeDocumentNumber } from './agreement.service';



/* ─── Get active issuance for asset (QR return) ─── */
export async function getActiveIssuanceForAsset(assetId: string) {
  return prisma.assignment.findFirst({
    where: { assetId, returnedAt: null },
    orderBy: { assignedAt: 'desc' },
    include: {
      asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true } },
      personnel: { select: { id: true, fullName: true, designation: true, project: true, designationLookup: { select: { name: true } }, projectLookup: { select: { name: true } }, institution: { select: { name: true } } } },
      agreement: { select: { id: true, name: true, title: true } },
        agreementDocument: { select: { id: true, documentNumber: true, status: true, signedPdfPath: true, signedUploadedAt: true, title: true, resolvedText: true, propertyOfficerName: true, authorizedRepName: true, templateVersion: true, templateVersionId: true, templateVersionRecord: { select: { id: true, versionNumber: true, createdAt: true } } } },
    },
  });
}

/* ─── List issuances (active & returned) ─── */
export async function listIssuances(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'active' | 'returned' | 'all';
  personnelId?: string;
}) {
  const { page = 1, limit = 20, search, status = 'all', personnelId } = params;
  const where: Prisma.AssignmentWhereInput = {};

  if (status === 'active') where.returnedAt = null;
  if (status === 'returned') where.returnedAt = { not: null };
  if (personnelId) where.personnelId = personnelId;

  if (search) {
    where.OR = [
      { assignedTo: { contains: search, mode: 'insensitive' } },
      { asset: { name: { contains: search, mode: 'insensitive' } } },
      { asset: { serialNumber: { contains: search, mode: 'insensitive' } } },
      { asset: { propertyNumber: { contains: search, mode: 'insensitive' } } },
      { personnel: { fullName: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.assignment.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { assignedAt: 'desc' },
      include: {
        asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true } },
        personnel: { select: { id: true, fullName: true, designation: true, project: true, designationLookup: { select: { name: true } }, projectLookup: { select: { name: true } }, institution: { select: { name: true } } } },
        agreement: { select: { id: true, name: true, title: true } },
        agreementDocument: { select: { id: true, documentNumber: true, status: true, signedPdfPath: true, signedUploadedAt: true, title: true, resolvedText: true, propertyOfficerName: true, authorizedRepName: true, templateVersion: true, templateVersionId: true, templateVersionRecord: { select: { id: true, versionNumber: true, createdAt: true } } } },
      },
    }),
    prisma.assignment.count({ where }),
  ]);

  return {
    data: items,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/* ─── Create issuance (assign asset to personnel) ─── */
export async function createIssuance(params: {
  assetId: string;
  personnelId: string;
  condition?: string;
  notes?: string;
  agreementText?: string;
  agreementId?: string;
}, performedById: string, ipAddress?: string, userAgent?: string) {
  const { assetId, personnelId, condition, notes, agreementText, agreementId } = params;

  // Verify asset is available
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new Error('Asset not found');
  if (!['AVAILABLE', 'PENDING_ASSIGNMENT'].includes(asset.status)) throw new Error(`Asset is not available (current status: ${asset.status})`);

  // Verify personnel exists and is active
  const personnel = await prisma.personnel.findUnique({ where: { id: personnelId } });
  if (!personnel) throw new Error('Personnel not found');
  if (personnel.status !== 'active') throw new Error('Personnel is not active');
  if (!personnel.isReadyForIssuance) throw new Error('Personnel is not ready for issuance');

  // Validate agreementId references an existing template (if provided)
  let agreementTemplate: Awaited<ReturnType<typeof prisma.agreementTemplate.findUnique>> | null = null;
  let agreementTemplateVersionId: string | null = null;
  if (agreementId) {
    agreementTemplate = await prisma.agreementTemplate.findUnique({ where: { id: agreementId } });
    if (!agreementTemplate) throw new Error('Agreement template not found');
    const version = await prisma.agreementTemplateVersion.findUnique({
      where: { templateId_versionNumber: { templateId: agreementTemplate.id, versionNumber: agreementTemplate.currentVersion } },
      select: { id: true },
    });
    agreementTemplateVersionId = version?.id ?? null;
  }

  // Create immutable agreement document + assignment, then update asset status in a transaction
  const assignment = await prisma.$transaction(async (tx) => {
    const designationSnapshot = personnel.designation || null;
    const projectSnapshot = personnel.project || null;
    const document = await tx.agreementDocument.create({
      data: {
        documentNumber: makeDocumentNumber(),
        templateId: agreementId || null,
        templateVersionId: agreementTemplateVersionId,
        templateVersion: agreementTemplate?.currentVersion ?? null,
        title: agreementTemplate?.title ?? 'ISSUANCE & ACCOUNTABILITY AGREEMENT',
        resolvedText: agreementText || '',
        personnelId,
        personnelNameSnapshot: personnel.fullName,
        designationSnapshot,
        projectSnapshot,
        assetSnapshot: [{ id: asset.id, name: asset.name, serialNumber: asset.serialNumber, propertyNumber: asset.propertyNumber, condition: condition || 'Good' }],
        issuedById: performedById,
      },
    });

    const a = await tx.assignment.create({
      data: {
        assetId,
        personnelId,
        assignedTo: personnel.fullName,
        condition: condition || 'Good',
        notes: notes || null,
        agreementText: agreementText || null,
        agreementId: agreementId || null,
        agreementDocumentId: document.id,
      },
      include: {
        asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true } },
        personnel: { select: { id: true, fullName: true, designation: true, project: true, designationLookup: { select: { name: true } }, projectLookup: { select: { name: true } }, institution: { select: { name: true } } } },
        agreement: { select: { id: true, name: true, title: true } },
        agreementDocument: { select: { id: true, documentNumber: true, status: true, signedPdfPath: true, signedUploadedAt: true, title: true, resolvedText: true, propertyOfficerName: true, authorizedRepName: true, templateVersion: true, templateVersionId: true, templateVersionRecord: { select: { id: true, versionNumber: true, createdAt: true } } } },
      },
    });

    await tx.asset.update({ where: { id: assetId }, data: { status: 'ASSIGNED' } });

    return a;
  });

  await prisma.auditLog.create({
    data: {
      entityType: 'Assignment',
      entityId: assignment.id,
      action: 'CHECKOUT',
      performedById,
      ipAddress,
      userAgent,
      field: '*',
      newValue: `${asset.name} → ${personnel.fullName}`,
      severity: classifySeverity('CHECKOUT'),
      summary: generateSummary({ action: 'CHECKOUT', entityType: 'Assignment', assetName: asset.name, serialNumber: asset.serialNumber, newValue: personnel.fullName }),
    },
  });

  // Also log against the Asset entity so the Asset audit timeline shows handovers
  await prisma.auditLog.create({
    data: {
      entityType: 'Asset',
      entityId: assetId,
      action: 'CHECKOUT',
      performedById,
      ipAddress,
      userAgent,
      field: 'status',
      oldValue: asset.status,
      newValue: 'ASSIGNED',
      severity: 'HIGH',
      summary: generateSummary({ action: 'CHECKOUT', entityType: 'Asset', assetName: asset.name, serialNumber: asset.serialNumber, newValue: personnel.fullName }),
    },
  });

  return assignment;
}

/* ─── Bulk issuance (multi-asset, one agreement) ─── */
export async function bulkIssueAssets(
  params: {
    personnelId: string;
    assetIds: string[];
    condition?: string;
    notes?: string;
    agreementTemplateId?: string;
    agreementText?: string;
    propertyOfficerName?: string;
    authorizedRepName?: string;
  },
  performedById: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const { personnelId, assetIds, condition, notes, agreementTemplateId, agreementText: suppliedAgreementText, propertyOfficerName, authorizedRepName } = params;
  const errors: Array<{ assetId: string; reason: string }> = [];

  // Generate a single batch ID for all assignments in this bulk operation
  const bulkBatchId = crypto.randomUUID();

  // Verify personnel exists and is active
  const personnel = await prisma.personnel.findUnique({ where: { id: personnelId } });
  if (!personnel) throw new Error('Personnel not found');
  if (personnel.status !== 'active') throw new Error('Personnel is not active');
  if (!personnel.isReadyForIssuance) throw new Error('Personnel is not ready for issuance');

  // Verify all assets exist and are AVAILABLE/PENDING_ASSIGNMENT
  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds } },
    select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true },
  });

  const assetMap = new Map(assets.map(a => [a.id, a]));
  const validAssetIds: string[] = [];

  for (const aid of assetIds) {
    const a = assetMap.get(aid);
    if (!a) { errors.push({ assetId: aid, reason: 'Asset not found' }); continue; }
    if (!['AVAILABLE', 'PENDING_ASSIGNMENT'].includes(a.status)) { errors.push({ assetId: aid, reason: `Asset is ${a.status}` }); continue; }
    validAssetIds.push(aid);
  }

  if (validAssetIds.length === 0) {
    return { assignments: [], agreementText: null, agreementId: null, errors };
  }

  // Resolve template text with ALL valid assets
  let resolvedTemplate;
  try {
    resolvedTemplate = await resolveTemplate({
      templateId: agreementTemplateId,
      personnelId,
      assetIds: validAssetIds,
      condition,
    });
  } catch (_e: any) {
    // Template resolution failed; still try to issue without agreement text
    resolvedTemplate = { resolvedText: null, templateId: null };
  }

  const agreementText = suppliedAgreementText?.trim() || resolvedTemplate.resolvedText;
  const agreementId = resolvedTemplate.templateId;

  // Validate agreementId references an existing template (if provided)
  if (agreementId) {
    const tmpl = await prisma.agreementTemplate.findUnique({ where: { id: agreementId } });
    if (!tmpl) throw new Error('Agreement template not found');
  }

  // Create one immutable agreement document for the batch, then link all assignments to it.
  const assignments = await prisma.$transaction(async (tx) => {
    const designationSnapshot = personnel.designation || null;
    const projectSnapshot = personnel.project || null;
    const document = await tx.agreementDocument.create({
      data: {
        documentNumber: makeDocumentNumber(),
        templateId: agreementId || null,
        templateVersionId: resolvedTemplate.templateVersionId ?? null,
        templateVersion: resolvedTemplate.templateVersion ?? null,
        title: resolvedTemplate.templateTitle ?? 'ISSUANCE & ACCOUNTABILITY AGREEMENT',
        resolvedText: agreementText || '',
        bulkBatchId,
        personnelId,
        personnelNameSnapshot: personnel.fullName,
        designationSnapshot,
        projectSnapshot,
        assetSnapshot: validAssetIds.map((aid) => {
          const ad = assetMap.get(aid)!;
          return { id: ad.id, name: ad.name, serialNumber: ad.serialNumber, propertyNumber: ad.propertyNumber, condition: condition || 'Good' };
        }),
        propertyOfficerName: propertyOfficerName || null,
        authorizedRepName: authorizedRepName || null,
        issuedById: performedById,
      },
    });

    const results = [];
    for (const aid of validAssetIds) {
      const a = await tx.assignment.create({
        data: {
          assetId: aid,
          personnelId,
          assignedTo: personnel.fullName,
          condition: condition || 'Good',
          notes: notes || null,
          agreementText: agreementText || null,
          agreementId: agreementId || null,
          bulkBatchId,
          agreementDocumentId: document.id,
        },
        include: {
          asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true } },
          personnel: { select: { id: true, fullName: true, designation: true, project: true, designationLookup: { select: { name: true } }, projectLookup: { select: { name: true } }, institution: { select: { name: true } } } },
          agreement: { select: { id: true, name: true, title: true } },
          agreementDocument: { select: { id: true, documentNumber: true, status: true, signedPdfPath: true, signedUploadedAt: true, title: true, resolvedText: true, propertyOfficerName: true, authorizedRepName: true, templateVersion: true, templateVersionId: true, templateVersionRecord: { select: { id: true, versionNumber: true, createdAt: true } } } },
        },
      });

      await tx.asset.update({ where: { id: aid }, data: { status: 'ASSIGNED' } });
      results.push(a);
    }
    return results;
  });

  // Create audit logs AFTER transaction (don't bloat the transaction)
  for (const a of assignments) {
    const assetData = assetMap.get(a.assetId);
    const assetName = assetData?.name ?? a.assetId;

    await prisma.auditLog.create({
      data: {
        entityType: 'Assignment',
        entityId: a.id,
        action: 'CHECKOUT',
        performedById,
        ipAddress,
        userAgent,
        field: '*',
        newValue: `${assetName} → ${personnel.fullName}`,
        severity: classifySeverity('CHECKOUT'),
        summary: generateSummary({ action: 'CHECKOUT', entityType: 'Assignment', assetName, newValue: personnel.fullName }),
      },
    });

    await prisma.auditLog.create({
      data: {
        entityType: 'Asset',
        entityId: a.assetId,
        action: 'CHECKOUT',
        performedById,
        ipAddress,
        userAgent,
        field: 'status',
        oldValue: assetData?.status || 'AVAILABLE',
        newValue: 'ASSIGNED',
        severity: 'HIGH',
        summary: generateSummary({ action: 'CHECKOUT', entityType: 'Asset', assetName }),
      },
    });
  }

  return {
    assignments,
    agreementText,
    agreementId,
    errors: errors.length > 0 ? errors : undefined,
  };
}


/* ─── Recipient digital sign-off ─── */
export async function signIssuance(assignmentId: string, signerName: string, performedById: string, ipAddress?: string, userAgent?: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { asset: true, personnel: true },
  });
  if (!assignment) throw new Error('Issuance not found');
  if (assignment.returnedAt) throw new Error('Returned issuances cannot be signed');
  if (assignment.recipientSignedAt) throw new Error('Issuance is already signed');

  const trimmedName = signerName.trim();
  if (!trimmedName) throw new Error('Signer name is required');

  const where: Prisma.AssignmentWhereInput = assignment.bulkBatchId
    ? { bulkBatchId: assignment.bulkBatchId, returnedAt: null, recipientSignedAt: null }
    : { id: assignmentId };

  const signedAt = new Date();
  const result = await prisma.assignment.updateMany({
    where,
    data: {
      recipientSignedAt: signedAt,
      recipientSignatureName: trimmedName,
      recipientSignatureMethod: 'typed',
      recipientSignatureIp: ipAddress || null,
    },
  });

  if (assignment.agreementDocumentId) {
    await prisma.agreementDocument.update({
      where: { id: assignment.agreementDocumentId },
      data: {
        status: 'signed',
        recipientSignedAt: signedAt,
        recipientSignatureName: trimmedName,
        recipientSignatureMethod: 'typed',
        recipientSignatureIp: ipAddress || null,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      entityType: 'Assignment',
      entityId: assignmentId,
      action: 'DIGITAL_SIGNOFF',
      performedById,
      ipAddress,
      userAgent,
      field: 'recipientSignedAt',
      oldValue: 'null',
      newValue: signedAt.toISOString(),
      severity: 'HIGH',
      summary: generateSummary({ action: 'UPDATED', entityType: 'Assignment', assetName: assignment.asset.name, serialNumber: assignment.asset.serialNumber, newValue: `Signed by ${trimmedName}` }),
    },
  });

  return { signed: result.count, signedAt, signerName: trimmedName, batchId: assignment.bulkBatchId };
}

/* ─── Return issuance ─── */
export async function returnIssuance(
  assignmentId: string,
  returnCondition?: string,
  performedById: string = 'system',
  ipAddress?: string,
  userAgent?: string,
  viaQR: boolean = false,
) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { asset: true, personnel: true },
  });
  if (!assignment) throw new Error('Issuance not found');
  if (assignment.returnedAt) throw new Error('Asset already returned');

  const result = await prisma.$transaction(async (tx) => {
    const a = await tx.assignment.update({
      where: { id: assignmentId },
      data: {
        returnedAt: new Date(),
        condition: returnCondition || assignment.condition || 'Good',
      },
      include: {
        asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true } },
        personnel: { select: { id: true, fullName: true, designation: true, project: true, designationLookup: { select: { name: true } }, projectLookup: { select: { name: true } }, institution: { select: { name: true } } } },
        agreement: { select: { id: true, name: true, title: true } },
        agreementDocument: { select: { id: true, documentNumber: true, status: true, signedPdfPath: true, signedUploadedAt: true, title: true, resolvedText: true, propertyOfficerName: true, authorizedRepName: true, templateVersion: true, templateVersionId: true, templateVersionRecord: { select: { id: true, versionNumber: true, createdAt: true } } } },
      },
    });

    await tx.asset.update({ where: { id: assignment.assetId }, data: { status: 'AVAILABLE' } });

    return a;
  });

  await prisma.auditLog.create({
    data: {
      entityType: 'Assignment',
      entityId: assignmentId,
      action: 'RETURN',
      performedById,
      ipAddress,
      userAgent,
      field: 'returnedAt',
      oldValue: 'null',
      newValue: new Date().toISOString(),
      severity: classifySeverity('RETURN'),
      summary: generateSummary({
        action: 'RETURN',
        entityType: 'Assignment',
        assetName: assignment.asset.name,
        serialNumber: assignment.asset.serialNumber,
        newValue: assignment.personnel?.fullName || assignment.assignedTo || undefined,
        viaQR,
      }),
    },
  });

  // Also log against the Asset entity so the Asset audit timeline shows handovers
  await prisma.auditLog.create({
    data: {
      entityType: 'Asset',
      entityId: assignment.assetId,
      action: 'RETURN',
      performedById,
      ipAddress,
      userAgent,
      field: 'status',
      oldValue: 'ASSIGNED',
      newValue: 'AVAILABLE',
      severity: 'HIGH',
      summary: generateSummary({
        action: 'RETURN',
        entityType: 'Asset',
        assetName: assignment.asset.name,
        serialNumber: assignment.asset.serialNumber,
        newValue: assignment.personnel?.fullName || assignment.assignedTo || undefined,
        viaQR,
      }),
    },
  });

  return result;
}

/* ─── Get available assets for issuance wizard ─── */
export async function getAvailableAssets(search?: string) {
  const where: Prisma.AssetWhereInput = { status: 'AVAILABLE' };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { serialNumber: { contains: search, mode: 'insensitive' } },
      { propertyNumber: { contains: search, mode: 'insensitive' } },
    ];
  }
  return prisma.asset.findMany({
    where,
    select: { id: true, name: true, serialNumber: true, propertyNumber: true, type: true, manufacturer: true },
    orderBy: { name: 'asc' },
    take: 50,
  });
}

/* ─── Get active personnel for issuance wizard ─── */
export async function getActivePersonnel(search?: string) {
  const where: Prisma.PersonnelWhereInput = { status: 'active', isReadyForIssuance: true };
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { designation: { contains: search, mode: 'insensitive' } },
      { project: { contains: search, mode: 'insensitive' } },
    ];
  }
  return prisma.personnel.findMany({
    where,
    select: { id: true, fullName: true, designation: true, project: true, isReadyForIssuance: true, designationId: true, projectId: true, institutionId: true, designationLookup: { select: { name: true } }, projectLookup: { select: { name: true } }, institution: { select: { name: true } } },
    orderBy: { fullName: 'asc' },
    take: 50,
  });
}

/* ─── Asset locking for issuance wizard ─── */
export async function lockAssetsForIssuance(assetIds: string[], performedById: string, ipAddress?: string, userAgent?: string) {
  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds }, deletedAt: null },
    select: { id: true, name: true, serialNumber: true, status: true },
  });
  const assetMap = new Map(assets.map(a => [a.id, a]));
  const locked: typeof assets = [];
  const errors: Array<{ assetId: string; reason: string }> = [];

  await prisma.$transaction(async (tx) => {
    for (const assetId of assetIds) {
      const asset = assetMap.get(assetId);
      if (!asset) { errors.push({ assetId, reason: 'Asset not found' }); continue; }
      if (asset.status !== 'AVAILABLE') { errors.push({ assetId, reason: `Asset is ${asset.status}` }); continue; }

      const result = await tx.asset.updateMany({
        where: { id: assetId, status: 'AVAILABLE', deletedAt: null },
        data: { status: 'PENDING_ASSIGNMENT' },
      });
      if (result.count === 1) {
        locked.push({ ...asset, status: 'PENDING_ASSIGNMENT' });
        await tx.auditLog.create({
          data: {
            entityType: 'Asset',
            entityId: assetId,
            action: 'ISSUANCE_LOCK',
            performedById,
            ipAddress,
            userAgent,
            field: 'status',
            oldValue: 'AVAILABLE',
            newValue: 'PENDING_ASSIGNMENT',
            severity: 'MEDIUM',
            summary: generateSummary({ action: 'UPDATED', entityType: 'Asset', assetName: asset.name, serialNumber: asset.serialNumber, oldValue: 'AVAILABLE', newValue: 'PENDING_ASSIGNMENT' }),
          },
        });
      } else {
        errors.push({ assetId, reason: 'Asset was locked by another issuance flow' });
      }
    }
  });

  return { locked, errors: errors.length > 0 ? errors : undefined };
}

export async function releaseAssetsFromIssuance(assetIds: string[], performedById: string, ipAddress?: string, userAgent?: string) {
  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds }, status: 'PENDING_ASSIGNMENT', deletedAt: null },
    select: { id: true, name: true, serialNumber: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.asset.updateMany({
      where: { id: { in: assets.map(a => a.id) }, status: 'PENDING_ASSIGNMENT', deletedAt: null },
      data: { status: 'AVAILABLE' },
    });

    for (const asset of assets) {
      await tx.auditLog.create({
        data: {
          entityType: 'Asset',
          entityId: asset.id,
          action: 'ISSUANCE_UNLOCK',
          performedById,
          ipAddress,
          userAgent,
          field: 'status',
          oldValue: 'PENDING_ASSIGNMENT',
          newValue: 'AVAILABLE',
          severity: 'LOW',
          summary: generateSummary({ action: 'UPDATED', entityType: 'Asset', assetName: asset.name, serialNumber: asset.serialNumber, oldValue: 'PENDING_ASSIGNMENT', newValue: 'AVAILABLE' }),
        },
      });
    }
  });

  return { released: assets };
}

/* ─── Generate agreement letter text ─── */
export function generateAgreementText(params: {
  personnelName: string;
  designation?: string;
  project?: string;
  assetName: string;
  serialNumber?: string;
  propertyNumber?: string;
  date: string;
}): string {
  const { personnelName, designation, project, assetName, serialNumber, propertyNumber, date } = params;
  const formattedDate = new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `ISSUANCE AND ACCOUNTABILITY AGREEMENT

Date: ${formattedDate}

This certifies that ${personnelName}${designation ? `, ${designation}` : ''}${project ? ` (${project})` : ''} has been issued the following asset for official use:

Asset: ${assetName}${serialNumber ? `\nSerial Number: ${serialNumber}` : ''}${propertyNumber ? `\nProperty Number: ${propertyNumber}` : ''}

Terms and Conditions:
1. The issued asset shall be used solely for official business purposes.
2. The recipient shall exercise due diligence in the care and protection of the asset.
3. The asset shall not be transferred to another individual without proper documentation.
4. Any damage, loss, or theft must be reported immediately to the Property Officer.
5. The asset shall be returned upon resignation, transfer, or upon request by management.
6. The recipient assumes full accountability for the asset during the period of possession.

By signing below, the recipient acknowledges receipt and accepts the terms stated above.

________________________________________
${personnelName} (Recipient)

________________________________________
Property Officer

________________________________________
Authorized Representative`;
}

/* ─── Resolve template placeholders server-side ─── */
export async function resolveTemplate(params: {
  templateId?: string;
  personnelId: string;
  assetId?: string;
  assetIds?: string[];
  condition?: string;
}) {
  const { templateId, personnelId, assetId, assetIds, condition } = params;

  // Fetch personnel with lookup relations
  const personnel = await prisma.personnel.findUnique({
    where: { id: personnelId },
    select: {
      id: true, fullName: true, designation: true, project: true,
      designationLookup: { select: { name: true } },
      projectLookup: { select: { name: true } },
      institution: { select: { name: true } },
    },
  });
  if (!personnel) throw new Error('Personnel not found');

  // Fetch asset(s) — support single or multi
  const ids = assetIds ?? (assetId ? [assetId] : []);
  if (ids.length === 0) throw new Error('At least one assetId or assetIds required');

  const assets = await prisma.asset.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, serialNumber: true, propertyNumber: true },
  });
  if (assets.length !== ids.length) throw new Error('One or more assets not found');

  // For backward compat, also expose the first asset as singular
  const asset = assets[0];

  // Fetch template (default or specified)
  let template;
  if (templateId) {
    template = await prisma.agreementTemplate.findUnique({ where: { id: templateId } });
  }
  if (!template) {
    template = await prisma.agreementTemplate.findFirst({ where: { isDefault: true } });
  }
  if (!template) {
    template = await prisma.agreementTemplate.findFirst({ orderBy: { createdAt: 'desc' } });
  }

  // Prefer FK lookup names over scalar fields for template resolution
  // If FK lookup exists, use it; otherwise fall back to scalar field
  const designation = personnel.designationLookup?.name || personnel.designation || '';
  const project = personnel.projectLookup?.name || personnel.project || '';
  const institution = personnel.institution?.name || '';

  const resolvedDesignation = designation;
  const resolvedProject = project;
  const resolvedInstitution = institution;

  const templateContent = template?.content ?? '';
  const templateVersionRecord = template
    ? await prisma.agreementTemplateVersion.findUnique({
        where: { templateId_versionNumber: { templateId: template.id, versionNumber: template.currentVersion } },
        select: { id: true, versionNumber: true },
      })
    : null;

  // If no template exists, generate a default agreement text
  if (!templateContent) {
    const formattedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const resolvedText = `ISSUANCE AND ACCOUNTABILITY AGREEMENT

Date: ${formattedDate}

This certifies that ${personnel.fullName}${resolvedDesignation ? `, ${resolvedDesignation}` : ''}${resolvedInstitution ? ` of ${resolvedInstitution}` : ''}${resolvedProject ? ` (${resolvedProject})` : ''} has been issued the following asset for official use:

Asset: ${asset.name}${asset.serialNumber ? `\nSerial Number: ${asset.serialNumber}` : ''}${asset.propertyNumber ? `\nProperty Number: ${asset.propertyNumber}` : ''}

Terms and Conditions:
1. The issued asset shall be used solely for official business purposes.
2. The recipient shall exercise due diligence in the care and protection of the asset.
3. The asset shall not be transferred to another individual without proper documentation.
4. Any damage, loss, or theft must be reported immediately to the Property Officer.
5. The asset shall be returned upon resignation, transfer, or upon request by management.
6. The recipient assumes full accountability for the asset during the period of possession.

By signing below, the recipient acknowledges receipt and accepts the terms stated above.

________________________________________
${personnel.fullName} (Recipient)

________________________________________
Property Officer

________________________________________
Authorized Representative`;

    return {
      resolvedText,
      templateName: null,
      templateId: null,
      templateVersion: null,
      templateVersionId: null,
      templateTitle: null,
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
      headerLogo: null,
      resolvedData: {
        personnelName: personnel.fullName,
        designation: resolvedDesignation,
        project: resolvedProject,
        institution: resolvedInstitution,
        assetName: asset.name,
        serialNumber: asset.serialNumber,
        propertyNumber: asset.propertyNumber,
        condition: condition || 'Good',
        ...(assets.length > 1 ? {
          assets: assets.map(a => ({
            id: a.id,
            name: a.name,
            serialNumber: a.serialNumber,
            propertyNumber: a.propertyNumber,
            condition: condition || 'Good',
          })),
        } : {}),
        assetCount: assets.length,
      },
    };
  }

  // Use parseTemplate to resolve placeholders
  const resolved = parseTemplate(templateContent, {
    personnelName: personnel.fullName,
    designation: resolvedDesignation,
    project: resolvedProject,
    institution: resolvedInstitution,
    assetName: asset.name,
    serialNumber: asset.serialNumber || undefined,
    propertyNumber: asset.propertyNumber || undefined,
    condition: condition || 'Good',
    ...(assets.length > 1 ? {
      assets: assets.map(a => ({
        name: a.name,
        serialNumber: a.serialNumber ?? undefined,
        propertyNumber: a.propertyNumber ?? undefined,
        condition: condition || 'Good',
      })),
    } : {}),
  });

  return {
    resolvedText: resolved,
    templateName: template?.name ?? null,
    templateId: template?.id ?? null,
    templateVersion: templateVersionRecord?.versionNumber ?? template?.currentVersion ?? null,
    templateVersionId: templateVersionRecord?.id ?? null,
    templateTitle: template?.title ?? null,
    defaultPropertyOfficer: template?.defaultPropertyOfficer ?? null,
    defaultAuthorizedRep: template?.defaultAuthorizedRep ?? null,
    headerLogo: template?.headerLogo ?? null,
    // Also return the resolved data so the client can show a preview
    resolvedData: {
      personnelName: personnel.fullName,
      designation: resolvedDesignation,
      project: resolvedProject,
      institution: resolvedInstitution,
      assetName: asset.name,
      serialNumber: asset.serialNumber,
      propertyNumber: asset.propertyNumber,
      condition: condition || 'Good',
      ...(assets.length > 1 ? {
        assets: assets.map(a => ({
          id: a.id,
          name: a.name,
          serialNumber: a.serialNumber,
          propertyNumber: a.propertyNumber,
          condition: condition || 'Good',
        })),
      } : {}),
      assetCount: assets.length,
    },
  };
}