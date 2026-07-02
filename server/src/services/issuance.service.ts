import { AUDIT_ACTIONS, logAudit } from './auditLog.service';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import * as crypto from 'crypto';
import { classifySeverity, generateSummary } from '../utils/auditHelpers';
import { parseTemplate } from '../utils/templateParser';
import { FALLBACK_AGREEMENT_TEMPLATE, FALLBACK_AGREEMENT_TITLE, makeDocumentNumber, sanitizeAgreementText } from './agreement.service';

const SIGNATORY_MODES = ['recipientOnly', 'recipientPropertyOfficer', 'recipientPropertyOfficerAuthorizedRep'] as const;
type SignatoryMode = typeof SIGNATORY_MODES[number];
function normalizeSignatoryMode(value: string | null | undefined, fallback: SignatoryMode = 'recipientPropertyOfficerAuthorizedRep'): SignatoryMode {
  return SIGNATORY_MODES.includes(value as SignatoryMode) ? (value as SignatoryMode) : fallback;
}

function resolveAssetStatusAfterReturn(returnCondition?: string): 'AVAILABLE' | 'MAINTENANCE' | 'LOST' {
  const normalized = (returnCondition || '').trim().toLowerCase();
  if (/\b(lost|missing|stolen|not returned)\b/.test(normalized)) return 'LOST';
  if (/\b(damaged|defective|broken|cracked|poor|repair|unserviceable|not working)\b/.test(normalized)) return 'MAINTENANCE';
  return 'AVAILABLE';
}

/* ─── Write an AssetConditionLog entry (never throws to caller) ─── */
export async function createConditionLog(params: {
  assetId: string;
  assignmentId?: string;
  event: 'issued' | 'returned' | 'transferred' | 'manual';
  condition: string;
  note?: string | null;
  recordedById?: string | null;
}): Promise<void> {
  try {
    await prisma.assetConditionLog.create({
      data: {
        assetId: params.assetId,
        assignmentId: params.assignmentId ?? null,
        event: params.event,
        condition: params.condition,
        note: params.note ?? null,
        recordedById: params.recordedById ?? null,
      },
    });
  } catch (err) {
    console.error('[createConditionLog] Error:', err);
    // Must not throw to caller
  }
}



/* ─── Auto-close AgreementDocument when all linked assets are returned ─── */
export async function checkAndCloseAgreementDocument(agreementDocumentId: string): Promise<void> {
  try {
    if (!agreementDocumentId) return;

    const activeAssignments = await prisma.assignment.findMany({
      where: {
        agreementDocumentId,
        returnedAt: null,
      },
      select: { id: true },
    });

    if (activeAssignments.length === 0) {
      // All linked assignments have been returned — close the document
      await prisma.agreementDocument.update({
        where: { id: agreementDocumentId },
        data: { status: 'returned' },
      });
    }
  } catch (err) {
    console.error('[checkAndCloseAgreementDocument] Error:', err);
    // Must not throw to caller
  }
}

/* ─── Get active issuance for asset (QR return) ─── */
export async function getActiveIssuanceForAsset(assetId: string) {
  return prisma.assignment.findFirst({
    where: { assetId, returnedAt: null },
    orderBy: { assignedAt: 'desc' },
    include: {
      asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true } },
      personnel: { select: { id: true, fullName: true, designation: true, project: true, designationLookup: { select: { name: true } }, projectLookup: { select: { name: true } }, institution: { select: { name: true } } } },
      agreement: { select: { id: true, name: true, title: true } },
        agreementDocument: { select: { id: true, documentNumber: true, status: true, signedPdfPath: true, signedUploadedAt: true, title: true, resolvedText: true, propertyOfficerName: true, authorizedRepName: true, secondarySignatoryTitle: true, firstSignatoryTitle: true, templateVersion: true, templateVersionId: true, templateVersionRecord: { select: { id: true, versionNumber: true, createdAt: true } } } },
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
        agreementDocument: { select: { id: true, documentNumber: true, status: true, signedPdfPath: true, signedUploadedAt: true, title: true, resolvedText: true, propertyOfficerName: true, authorizedRepName: true, secondarySignatoryTitle: true, firstSignatoryTitle: true, templateVersion: true, templateVersionId: true, templateVersionRecord: { select: { id: true, versionNumber: true, createdAt: true } } } },
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
  propertyOfficerName?: string;
  authorizedRepName?: string;
  secondarySignatoryTitle?: string;
  firstSignatoryTitle?: string;
  signatoryMode?: string;
}, performedById: string, ipAddress?: string, userAgent?: string) {
  const { assetId, personnelId, condition, notes, agreementText, agreementId, propertyOfficerName, authorizedRepName, secondarySignatoryTitle, firstSignatoryTitle, signatoryMode: suppliedSignatoryMode } = params;

  // Verify asset is available
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new Error('Asset not found');
  if (!['AVAILABLE', 'PENDING_ASSIGNMENT'].includes(asset.status)) throw new Error(`Asset is not available (current status: ${asset.status})`);

  // Verify personnel exists and is active
  const personnel = await prisma.personnel.findUnique({ where: { id: personnelId } });
  if (!personnel) throw new Error('Personnel not found');
  if (personnel.status !== 'active') throw new Error('Personnel is not active');
  if (!personnel.isReadyForIssuance) throw new Error('Personnel is not ready for issuance');

  // Validate agreementId references an existing template (if provided), then resolve
  // clean agreement text for immutable snapshots. Single issuance must behave like
  // bulk issuance: if the caller does not send agreementText, generate a fallback
  // from the explicit default template or the code-owned DRDF fallback.
  let agreementTemplate: Awaited<ReturnType<typeof prisma.agreementTemplate.findUnique>> | null = null;
  if (agreementId) {
    agreementTemplate = await prisma.agreementTemplate.findUnique({ where: { id: agreementId } });
    if (!agreementTemplate) throw new Error('Agreement template not found');
  }

  const resolvedTemplate = (!agreementText?.trim() || agreementId)
    ? await resolveTemplate({
        templateId: agreementId,
        personnelId,
        assetIds: [assetId],
        condition,
      })
    : null;
  const cleanAgreementText = sanitizeAgreementText(agreementText?.trim() || resolvedTemplate?.resolvedText || '');
  const documentTemplateId = resolvedTemplate?.templateId ?? agreementId ?? null;
  const documentTemplateVersionId = resolvedTemplate?.templateVersionId ?? null;
  const documentTemplateVersion = resolvedTemplate?.templateVersion ?? agreementTemplate?.currentVersion ?? null;
  const documentTitle = resolvedTemplate?.templateTitle ?? agreementTemplate?.title ?? 'ISSUANCE & ACCOUNTABILITY AGREEMENT';

  // Resolve signatory mode/names from explicit request, explicit template, or resolved default template.
  const effectiveSignatoryMode = normalizeSignatoryMode(
    suppliedSignatoryMode || agreementTemplate?.signatoryMode || resolvedTemplate?.signatoryMode || null
  );
  const effectivePropertyOfficerName = (effectiveSignatoryMode === 'recipientPropertyOfficer' || effectiveSignatoryMode === 'recipientPropertyOfficerAuthorizedRep')
    ? (propertyOfficerName || agreementTemplate?.defaultPropertyOfficer || resolvedTemplate?.defaultPropertyOfficer || null)
    : null;
  const effectiveAuthorizedRepName = effectiveSignatoryMode === 'recipientPropertyOfficerAuthorizedRep'
    ? (authorizedRepName || agreementTemplate?.defaultAuthorizedRep || resolvedTemplate?.defaultAuthorizedRep || null)
    : null;
  const effectiveSecondarySignatoryTitle = (effectiveSignatoryMode === 'recipientPropertyOfficer' || effectiveSignatoryMode === 'recipientPropertyOfficerAuthorizedRep')
    ? (secondarySignatoryTitle || agreementTemplate?.secondarySignatoryTitle || resolvedTemplate?.secondarySignatoryTitle || null)
    : null;
  const effectiveFirstSignatoryTitle = effectiveSignatoryMode === 'recipientPropertyOfficerAuthorizedRep'
    ? (firstSignatoryTitle || agreementTemplate?.firstSignatoryTitle || resolvedTemplate?.firstSignatoryTitle || null)
    : null;

  // Create immutable agreement document + assignment, then update asset status in a transaction
  const assignment = await prisma.$transaction(async (tx) => {
    const designationSnapshot = personnel.designation || null;
    const projectSnapshot = personnel.project || null;
    const document = await tx.agreementDocument.create({
      data: {
        documentNumber: makeDocumentNumber(),
        templateId: documentTemplateId,
        templateVersionId: documentTemplateVersionId,
        templateVersion: documentTemplateVersion,
        title: documentTitle,
        resolvedText: cleanAgreementText,
        personnelId,
        personnelNameSnapshot: personnel.fullName,
        designationSnapshot,
        projectSnapshot,
        assetSnapshot: [{ id: asset.id, name: asset.name, serialNumber: asset.serialNumber, propertyNumber: asset.propertyNumber, condition: condition || 'Good' }],
        signatoryMode: effectiveSignatoryMode,
        propertyOfficerName: effectivePropertyOfficerName,
        authorizedRepName: effectiveAuthorizedRepName,
        secondarySignatoryTitle: effectiveSecondarySignatoryTitle,
        firstSignatoryTitle: effectiveFirstSignatoryTitle,
        issuedById: performedById,
      },
    });

    const a = await tx.assignment.create({
      data: {
        assetId,
        personnelId,
        assignedTo: personnel.fullName,
        condition: condition || 'Good',
        conditionAtIssue: condition || 'Good',
        accountabilityStatus: 'PENDING_SIGNATURE',
        notes: notes || null,
        agreementText: cleanAgreementText || null,
        agreementId: agreementId || null,
        agreementDocumentId: document.id,
      },
      include: {
        asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true } },
        personnel: { select: { id: true, fullName: true, designation: true, project: true, designationLookup: { select: { name: true } }, projectLookup: { select: { name: true } }, institution: { select: { name: true } } } },
        agreement: { select: { id: true, name: true, title: true } },
        agreementDocument: { select: { id: true, documentNumber: true, status: true, signedPdfPath: true, signedUploadedAt: true, title: true, resolvedText: true, propertyOfficerName: true, authorizedRepName: true, secondarySignatoryTitle: true, firstSignatoryTitle: true, templateVersion: true, templateVersionId: true, templateVersionRecord: { select: { id: true, versionNumber: true, createdAt: true } } } },
      },
    });

    await tx.asset.update({ where: { id: assetId }, data: { status: 'ASSIGNED', assignedTo: personnel.fullName } });

    return a;
  });

  // Archive accountability form for normal issuance (outside transaction)
  try {
    const { recordAccountabilityFormArchive } = await import('../services/document-archive.service');
    await recordAccountabilityFormArchive(assignment.agreementDocument!.id, performedById, {
      title: assignment.agreementDocument!.title,
      documentNumber: assignment.agreementDocument!.documentNumber,
      personnelId: assignment.personnel?.id ?? personnelId,
      assignmentId: assignment.id,
      assetId: assignment.asset.id,
    });
  } catch (archiveErr) {
    console.error('[createIssuance] archive creation failed:', archiveErr);
  }

  logAudit({
    userId: performedById ?? null,
    action: AUDIT_ACTIONS.ISSUANCE_CREATED,
    entityType: 'Assignment',
    entityId: assignment.id,
    ipAddress: ipAddress ?? null,
    metadata: {
      assetId,
      personnelId,
      documentNumber: assignment.agreementDocument?.documentNumber ?? null,
      userAgent,
      field: '*',
      newValue: `${asset.name} → ${personnel.fullName}`,
      severity: classifySeverity('CHECKOUT'),
      summary: generateSummary({ action: 'CHECKOUT', entityType: 'Assignment', assetName: asset.name, serialNumber: asset.serialNumber, newValue: personnel.fullName }),
    },
  }).catch(() => {});

  // Also log against the Asset entity so the Asset audit timeline shows handovers.
  logAudit({
    userId: performedById ?? null,
    action: 'CHECKOUT',
    entityType: 'Asset',
    entityId: assetId,
    ipAddress: ipAddress ?? null,
    metadata: {
      userAgent,
      field: 'status',
      oldValue: asset.status,
      newValue: 'ASSIGNED',
      severity: 'HIGH',
      summary: generateSummary({ action: 'CHECKOUT', entityType: 'Asset', assetName: asset.name, serialNumber: asset.serialNumber, newValue: personnel.fullName }),
    },
  }).catch(() => {});

  // Condition log for issuance
  createConditionLog({
    assetId,
    assignmentId: assignment.id,
    event: 'issued',
    condition: condition || 'Good',
    note: notes || null,
    recordedById: performedById,
  }).catch(() => {});

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
    secondarySignatoryTitle?: string;
    firstSignatoryTitle?: string;
    signatoryMode?: string;
  },
  performedById: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const { personnelId, assetIds, condition, notes, agreementTemplateId, agreementText: suppliedAgreementText, propertyOfficerName, authorizedRepName, secondarySignatoryTitle, firstSignatoryTitle, signatoryMode: suppliedSignatoryMode } = params;
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

  const agreementText = sanitizeAgreementText(suppliedAgreementText?.trim() || resolvedTemplate.resolvedText);
  const agreementId = resolvedTemplate.templateId;

  let agreementTemplate: Awaited<ReturnType<typeof prisma.agreementTemplate.findUnique>> | null = null;
  if (agreementId) {
    agreementTemplate = await prisma.agreementTemplate.findUnique({ where: { id: agreementId } });
    if (!agreementTemplate) throw new Error('Agreement template not found');
  }

  // Resolve signatory mode/names from explicit request, explicit template, or resolved default template.
  const effectiveSignatoryMode = normalizeSignatoryMode(
    suppliedSignatoryMode || agreementTemplate?.signatoryMode || resolvedTemplate.signatoryMode || null
  );
  const effectivePropertyOfficerName = (effectiveSignatoryMode === 'recipientPropertyOfficer' || effectiveSignatoryMode === 'recipientPropertyOfficerAuthorizedRep')
    ? (propertyOfficerName || agreementTemplate?.defaultPropertyOfficer || resolvedTemplate.defaultPropertyOfficer || null)
    : null;
  const effectiveAuthorizedRepName = effectiveSignatoryMode === 'recipientPropertyOfficerAuthorizedRep'
    ? (authorizedRepName || agreementTemplate?.defaultAuthorizedRep || resolvedTemplate.defaultAuthorizedRep || null)
    : null;
  const effectiveSecondarySignatoryTitle = (effectiveSignatoryMode === 'recipientPropertyOfficer' || effectiveSignatoryMode === 'recipientPropertyOfficerAuthorizedRep')
    ? (secondarySignatoryTitle || agreementTemplate?.secondarySignatoryTitle || resolvedTemplate.secondarySignatoryTitle || null)
    : null;
  const effectiveFirstSignatoryTitle = effectiveSignatoryMode === 'recipientPropertyOfficerAuthorizedRep'
    ? (firstSignatoryTitle || agreementTemplate?.firstSignatoryTitle || resolvedTemplate.firstSignatoryTitle || null)
    : null;

  // Create one immutable agreement document for the batch, then link all assignments to it.
  const { assignments, agreementDocument } = await prisma.$transaction(async (tx) => {
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
        signatoryMode: effectiveSignatoryMode,
        propertyOfficerName: effectivePropertyOfficerName,
        authorizedRepName: effectiveAuthorizedRepName,
        secondarySignatoryTitle: effectiveSecondarySignatoryTitle,
        firstSignatoryTitle: effectiveFirstSignatoryTitle,
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
          conditionAtIssue: condition || 'Good',
          accountabilityStatus: 'PENDING_SIGNATURE',
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
          agreementDocument: { select: { id: true, documentNumber: true, status: true, signedPdfPath: true, signedUploadedAt: true, title: true, resolvedText: true, propertyOfficerName: true, authorizedRepName: true, secondarySignatoryTitle: true, firstSignatoryTitle: true, templateVersion: true, templateVersionId: true, templateVersionRecord: { select: { id: true, versionNumber: true, createdAt: true } } } },
        },
      });

      await tx.asset.update({ where: { id: aid }, data: { status: 'ASSIGNED', assignedTo: personnel.fullName } });
      results.push(a);
    }
    return { assignments: results, agreementDocument: document };
  });

  // Archive accountability form for bulk issuance
  try {
    const { recordAccountabilityFormArchive } = await import('../services/document-archive.service');
    await recordAccountabilityFormArchive(agreementDocument.id, performedById, {
      title: agreementDocument.title,
      documentNumber: agreementDocument.documentNumber,
      personnelId,
      assetId: validAssetIds.length === 1 ? validAssetIds[0] : null,
    });
  } catch (archiveErr) {
    console.error('[bulkIssueAssets] archive creation failed:', archiveErr);
  }

  logAudit({
    userId: performedById ?? null,
    action: AUDIT_ACTIONS.ISSUANCE_BULK_CREATED,
    entityType: 'AgreementDocument',
    entityId: agreementDocument.id,
    ipAddress: ipAddress ?? null,
    metadata: {
      bulkBatchId,
      assetCount: validAssetIds.length,
      personnelId,
      userAgent,
    },
  }).catch(() => {});

  // Create audit logs AFTER transaction (don't bloat the transaction)
  for (const a of assignments) {
    const assetData = assetMap.get(a.assetId);
    const assetName = assetData?.name ?? a.assetId;

    logAudit({
      userId: performedById ?? null,
      action: 'CHECKOUT',
      entityType: 'Assignment',
      entityId: a.id,
      ipAddress: ipAddress ?? null,
      metadata: {
        userAgent,
        field: '*',
        newValue: `${assetName} → ${personnel.fullName}`,
        severity: classifySeverity('CHECKOUT'),
        summary: generateSummary({ action: 'CHECKOUT', entityType: 'Assignment', assetName, newValue: personnel.fullName }),
      },
    }).catch(() => {});

    logAudit({
      userId: performedById ?? null,
      action: 'CHECKOUT',
      entityType: 'Asset',
      entityId: a.assetId,
      ipAddress: ipAddress ?? null,
      metadata: {
        userAgent,
        field: 'status',
        oldValue: assetData?.status || 'AVAILABLE',
        newValue: 'ASSIGNED',
        severity: 'HIGH',
        summary: generateSummary({ action: 'CHECKOUT', entityType: 'Asset', assetName }),
      },
    }).catch(() => {});
  }

  // Condition logs for bulk issuance
  for (const a of assignments) {
    createConditionLog({
      assetId: a.assetId,
      assignmentId: a.id,
      event: 'issued',
      condition: condition || 'Good',
      note: notes || null,
      recordedById: performedById,
    }).catch(() => {});
  }

  return {
    assignments,
    agreementText,
    agreementId,
    agreementDocumentId: agreementDocument.id,
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
      accountabilityStatus: 'ACTIVE',
    },
  });

  if (assignment.agreementDocumentId) {
    // Compute signature hash for tamper-evidence
    const doc = await prisma.agreementDocument.findUnique({ where: { id: assignment.agreementDocumentId } });
    const signatureHash = crypto
      .createHash('sha256')
      .update([doc?.documentNumber || '', trimmedName, signedAt.toISOString()].join('|'))
      .digest('hex');

    await prisma.agreementDocument.update({
      where: { id: assignment.agreementDocumentId },
      data: {
        status: 'signed',
        recipientSignedAt: signedAt,
        recipientSignatureName: trimmedName,
        recipientSignatureMethod: 'typed',
        recipientSignatureIp: ipAddress || null,
        signatureHash,
      },
    });
  }

  logAudit({
    userId: performedById ?? null,
    action: AUDIT_ACTIONS.ISSUANCE_SIGNED,
    entityType: 'Assignment',
    entityId: assignment.id,
    ipAddress: ipAddress ?? null,
    metadata: {
      userAgent,
      field: 'recipientSignedAt',
      oldValue: 'null',
      newValue: signedAt.toISOString(),
      severity: 'HIGH',
      summary: generateSummary({ action: 'UPDATED', entityType: 'Assignment', assetName: assignment.asset.name, serialNumber: assignment.asset.serialNumber, newValue: `Signed by ${trimmedName}` }),
    },
  }).catch(() => {});

  return { signed: result.count, signedAt, signerName: trimmedName, batchId: assignment.bulkBatchId };
}

/* ─── Return issuance ─── */
export async function returnIssuance(
  assignmentId: string,
  returnCondition?: string | null,
  performedById: string = 'system',
  ipAddress?: string,
  userAgent?: string,
  viaQR: boolean = false,
  returnNote?: string | null,
  legacyReturnRemarks?: string | null,
) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { asset: true, personnel: true },
  });
  if (!assignment) throw new Error('Issuance not found');
  if (assignment.returnedAt) throw new Error('Asset already returned');

  const returnedAt = new Date();
  const storedReturnCondition = returnCondition?.trim() || null;
  const storedReturnNote = returnNote?.trim() || null;
  const legacyRemarks = legacyReturnRemarks?.trim() || null;
  const finalReturnCondition = storedReturnCondition || assignment.condition || 'Good';
  const assetStatusAfterReturn = resolveAssetStatusAfterReturn(finalReturnCondition);

  const result = await prisma.$transaction(async (tx) => {
    const a = await tx.assignment.update({
      where: { id: assignmentId },
      data: {
        returnedAt,
        condition: finalReturnCondition,
        conditionAtReturn: finalReturnCondition,
        returnCondition: storedReturnCondition,
        returnNote: storedReturnNote,
        returnedById: performedById,
        returnRemarks: storedReturnNote || legacyRemarks,
        returnedReceivedById: performedById,
        accountabilityStatus: 'RETURNED',
        accountabilityClosedAt: returnedAt,
      },
      include: {
        asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true } },
        personnel: { select: { id: true, fullName: true, designation: true, project: true, designationLookup: { select: { name: true } }, projectLookup: { select: { name: true } }, institution: { select: { name: true } } } },
        agreement: { select: { id: true, name: true, title: true } },
        agreementDocument: { select: { id: true, documentNumber: true, status: true, signedPdfPath: true, signedUploadedAt: true, title: true, resolvedText: true, propertyOfficerName: true, authorizedRepName: true, secondarySignatoryTitle: true, firstSignatoryTitle: true, templateVersion: true, templateVersionId: true, templateVersionRecord: { select: { id: true, versionNumber: true, createdAt: true } } } },
      },
    });

    await tx.asset.update({ where: { id: assignment.assetId }, data: { status: assetStatusAfterReturn, assignedTo: null } });

    return a;
  });

  logAudit({
    userId: performedById ?? null,
    action: AUDIT_ACTIONS.ISSUANCE_RETURNED,
    entityType: 'Assignment',
    entityId: assignment.id,
    ipAddress: ipAddress ?? null,
    metadata: {
      returnCondition: finalReturnCondition,
      assetId: assignment.assetId,
      userAgent,
      field: 'returnedAt',
      oldValue: 'null',
      newValue: returnedAt.toISOString(),
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
  }).catch(() => {});

  // Also log against the Asset entity so the Asset audit timeline shows handovers
  logAudit({
    userId: performedById ?? null,
    action: 'RETURN',
    entityType: 'Asset',
    entityId: assignment.assetId,
    ipAddress: ipAddress ?? null,
    metadata: {
      userAgent,
      field: 'status',
      oldValue: 'ASSIGNED',
      newValue: assetStatusAfterReturn,
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
  }).catch(() => {});

  // Condition log for return
  createConditionLog({
    assetId: assignment.assetId,
    assignmentId: assignment.id,
    event: 'returned',
    condition: finalReturnCondition,
    note: storedReturnNote || null,
    recordedById: performedById,
  }).catch(() => {});

  // Auto-close AgreementDocument if all linked assets are now returned
  if (assignment.agreementDocumentId) {
    await checkAndCloseAgreementDocument(assignment.agreementDocumentId);
  }

  // Archive return form receipt
  try {
    const { makeDocumentNumber } = await import('../services/agreement.service');
    const { recordReturnFormArchive } = await import('../services/document-archive.service');
    await recordReturnFormArchive(assignment.id, performedById, {
      title: `Return Receipt — ${assignment.asset.name}`,
      documentNumber: makeDocumentNumber('RET'),
      assetId: assignment.assetId,
      personnelId: assignment.personnelId,
    });
  } catch (archiveErr) {
    console.error('[returnIssuance] archive creation failed:', archiveErr);
  }

  return result;
}

/* ─── Bulk return issuances ─── */
export async function bulkReturnAssets(
  assignmentIds: string[],
  returnCondition?: string | null,
  returnNote?: string | null,
  returnedById: string = 'system',
  ipAddress?: string,
  userAgent?: string,
) {
  const uniqueAssignmentIds = [...new Set(assignmentIds)];
  if (uniqueAssignmentIds.length !== assignmentIds.length) {
    throw new Error('Duplicate assignment IDs are not allowed');
  }

  const assignments = await prisma.assignment.findMany({
    where: { id: { in: uniqueAssignmentIds } },
    include: { asset: true, personnel: true },
  });
  const assignmentMap = new Map(assignments.map((assignment) => [assignment.id, assignment]));

  const invalidDetails: Array<{ assignmentId: string; reason: string }> = [];
  for (const assignmentId of uniqueAssignmentIds) {
    const assignment = assignmentMap.get(assignmentId);
    if (!assignment) {
      invalidDetails.push({ assignmentId, reason: 'Assignment not found' });
      continue;
    }
    if (assignment.returnedAt) {
      invalidDetails.push({ assignmentId, reason: 'Assignment is already returned' });
    }
  }

  if (invalidDetails.length > 0) {
    const reasons = invalidDetails.map((detail) => `${detail.assignmentId}: ${detail.reason}`).join('; ');
    throw new Error(`Bulk return failed. ${reasons}`);
  }

  const returnedAt = new Date();
  const storedReturnCondition = returnCondition?.trim() || null;
  const storedReturnNote = returnNote?.trim() || null;

  const updatedAssignments = await prisma.$transaction(async (tx) => {
    const updates = [];
    for (const assignmentId of uniqueAssignmentIds) {
      const assignment = assignmentMap.get(assignmentId)!;
      const finalReturnCondition = storedReturnCondition || assignment.condition || 'Good';
      const updatedAssignment = await tx.assignment.update({
        where: { id: assignmentId },
        data: {
          returnedAt,
          condition: finalReturnCondition,
          conditionAtReturn: finalReturnCondition,
          returnCondition: storedReturnCondition,
          returnNote: storedReturnNote,
          returnedById,
          returnRemarks: storedReturnNote,
          returnedReceivedById: returnedById,
          accountabilityStatus: 'RETURNED',
          accountabilityClosedAt: returnedAt,
        },
        include: {
          asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true } },
          personnel: { select: { id: true, fullName: true, designation: true, project: true, designationLookup: { select: { name: true } }, projectLookup: { select: { name: true } }, institution: { select: { name: true } } } },
          agreement: { select: { id: true, name: true, title: true } },
          agreementDocument: { select: { id: true, documentNumber: true, status: true, signedPdfPath: true, signedUploadedAt: true, title: true, resolvedText: true, propertyOfficerName: true, authorizedRepName: true, secondarySignatoryTitle: true, firstSignatoryTitle: true, templateVersion: true, templateVersionId: true, templateVersionRecord: { select: { id: true, versionNumber: true, createdAt: true } } } },
        },
      });

      const assetReturnStatus = resolveAssetStatusAfterReturn(storedReturnCondition ?? assignment.condition ?? 'Good');
      await tx.asset.update({ where: { id: assignment.assetId }, data: { status: assetReturnStatus, assignedTo: null } });
      updates.push(updatedAssignment);
    }
    return updates;
  });

  for (const assignment of assignments) {
    const finalReturnCondition = storedReturnCondition || assignment.condition || 'Good';
    logAudit({
      userId: returnedById ?? null,
      action: AUDIT_ACTIONS.ISSUANCE_RETURNED,
      entityType: 'Assignment',
      entityId: assignment.id,
      ipAddress: ipAddress ?? null,
      metadata: {
        returnCondition: finalReturnCondition,
        returnNote: storedReturnNote,
        assetId: assignment.assetId,
        bulkReturn: true,
        userAgent,
        field: 'returnedAt',
        oldValue: 'null',
        newValue: returnedAt.toISOString(),
        severity: classifySeverity('RETURN'),
        summary: generateSummary({
          action: 'RETURN',
          entityType: 'Assignment',
          assetName: assignment.asset.name,
          serialNumber: assignment.asset.serialNumber,
          newValue: assignment.personnel?.fullName || assignment.assignedTo || undefined,
        }),
      },
    }).catch(() => {});
  }

  // Condition logs for bulk return
  for (const assignment of assignments) {
    const finalCond = storedReturnCondition || assignment.condition || 'Good';
    createConditionLog({
      assetId: assignment.assetId,
      assignmentId: assignment.id,
      event: 'returned',
      condition: finalCond,
      note: storedReturnNote || null,
      recordedById: returnedById,
    }).catch(() => {});
  }

  // Auto-close AgreementDocuments if all linked assets are now returned
  const checkedDocIds = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.agreementDocumentId && !checkedDocIds.has(assignment.agreementDocumentId)) {
      checkedDocIds.add(assignment.agreementDocumentId);
      await checkAndCloseAgreementDocument(assignment.agreementDocumentId);
    }
  }

  // Archive return form receipts
  try {
    const { makeDocumentNumber } = await import('../services/agreement.service');
    const { recordReturnFormArchive } = await import('../services/document-archive.service');
    for (const assignment of assignments) {
      await recordReturnFormArchive(assignment.id, returnedById, {
        title: `Return Receipt — ${assignment.asset.name}`,
        documentNumber: makeDocumentNumber('RET'),
        assetId: assignment.assetId,
        personnelId: assignment.personnelId,
      });
    }
  } catch (archiveErr) {
    console.error('[bulkReturnAssets] archive creation failed:', archiveErr);
  }

  return {
    returned: updatedAssignments.length,
    skipped: 0,
    details: updatedAssignments.map((assignment) => ({
      assignmentId: assignment.id,
      assetId: assignment.assetId,
      assetName: assignment.asset?.name ?? null,
      returnedAt: assignment.returnedAt,
      status: 'returned',
    })),
  };
}


/* ─── Transfer asset from one personnel to another ─── */
export async function transferAsset(
  params: {
    fromAssignmentId: string;
    toPersonnelId: string;
    condition?: string | null;
    transferNote?: string | null;
    agreementTemplateId?: string | null;
  },
  performedById: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const { fromAssignmentId, toPersonnelId, condition, transferNote, agreementTemplateId } = params;

  // Fetch the current assignment
  const currentAssignment = await prisma.assignment.findUnique({
    where: { id: fromAssignmentId },
    include: { asset: true, personnel: true },
  });
  if (!currentAssignment) throw new Error('Assignment not found');
  if (currentAssignment.returnedAt) throw new Error('Assignment is not active — already returned');

  // Verify target personnel
  const toPersonnel = await prisma.personnel.findUnique({ where: { id: toPersonnelId } });
  if (!toPersonnel) throw new Error('Target personnel not found');
  if (toPersonnel.status !== 'active') throw new Error('Target personnel is not active');
  if (!toPersonnel.isReadyForIssuance) throw new Error('Target personnel is not ready for issuance');

  const assetId = currentAssignment.assetId;
  const asset = currentAssignment.asset;
  const fromPersonnelId = currentAssignment.personnelId;
  const now = new Date();
  const transferCondition = condition?.trim() || currentAssignment.condition || 'Good';

  // Resolve agreement template for the new assignment (if provided)
  let resolvedTemplate: Awaited<ReturnType<typeof resolveTemplate>> | null = null;
  let agreementDocumentResult: any = null;

  if (agreementTemplateId) {
    resolvedTemplate = await resolveTemplate({
      templateId: agreementTemplateId,
      personnelId: toPersonnelId,
      assetIds: [assetId],
      condition: transferCondition,
    });
  } else {
    // Use the default template
    try {
      resolvedTemplate = await resolveTemplate({
        personnelId: toPersonnelId,
        assetIds: [assetId],
        condition: transferCondition,
      });
    } catch (_e) {
      resolvedTemplate = null;
    }
  }

  const cleanAgreementText = sanitizeAgreementText(resolvedTemplate?.resolvedText || '');
  const documentTemplateId = resolvedTemplate?.templateId ?? agreementTemplateId ?? null;
  const documentTemplateVersionId = resolvedTemplate?.templateVersionId ?? null;
  const documentTemplateVersion = resolvedTemplate?.templateVersion ?? null;
  const documentTitle = resolvedTemplate?.templateTitle ?? 'ISSUANCE & ACCOUNTABILITY AGREEMENT';

  const designationSnapshot = toPersonnel.designation || null;
  const projectSnapshot = toPersonnel.project || null;

  // Run everything in a transaction — asset stays ASSIGNED throughout
  const result = await prisma.$transaction(async (tx) => {
    // 1. Close the old assignment
    const oldAssignment = await tx.assignment.update({
      where: { id: fromAssignmentId },
      data: {
        returnedAt: now,
        returnCondition: transferCondition,
        conditionAtReturn: transferCondition,
        returnNote: transferNote || null,
        returnRemarks: transferNote || null,
        returnedById: performedById,
        accountabilityStatus: 'TRANSFERRED',
        accountabilityClosedAt: now,
      },
    });

    // 2. Create new AgreementDocument for the receiving personnel (if template resolved)
    let newAgreementDocumentId: string | null = null;
    if (resolvedTemplate && cleanAgreementText) {
      const doc = await tx.agreementDocument.create({
        data: {
          documentNumber: makeDocumentNumber(),
          templateId: documentTemplateId,
          templateVersionId: documentTemplateVersionId,
          templateVersion: documentTemplateVersion,
          title: documentTitle,
          resolvedText: cleanAgreementText,
          personnelId: toPersonnelId,
          personnelNameSnapshot: toPersonnel.fullName,
          designationSnapshot,
          projectSnapshot,
          assetSnapshot: [{
            id: asset.id,
            name: asset.name,
            serialNumber: asset.serialNumber,
            propertyNumber: asset.propertyNumber,
            condition: transferCondition,
          }],
          propertyOfficerName: resolvedTemplate?.template?.defaultPropertyOfficer || null,
          authorizedRepName: resolvedTemplate?.template?.defaultAuthorizedRep || null,
          secondarySignatoryTitle: resolvedTemplate?.template?.secondarySignatoryTitle || null,
          firstSignatoryTitle: resolvedTemplate?.template?.firstSignatoryTitle || null,
          signatoryMode: resolvedTemplate?.template?.signatoryMode || 'recipientPropertyOfficerAuthorizedRep',
          issuedById: performedById,
        },
      });
      newAgreementDocumentId = doc.id;
      agreementDocumentResult = doc;
    }

    // 3. Create new assignment for the receiving personnel
    const newAssignment = await tx.assignment.create({
      data: {
        assetId,
        personnelId: toPersonnelId,
        assignedTo: toPersonnel.fullName,
        condition: transferCondition,
        conditionAtIssue: transferCondition,
        accountabilityStatus: 'PENDING_SIGNATURE',
        notes: transferNote || null,
        agreementText: cleanAgreementText || null,
        agreementId: documentTemplateId || null,
        agreementDocumentId: newAgreementDocumentId,
      },
      include: {
        asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true } },
        personnel: { select: { id: true, fullName: true, designation: true, project: true, designationLookup: { select: { name: true } }, projectLookup: { select: { name: true } }, institution: { select: { name: true } } } },
        agreement: { select: { id: true, name: true, title: true } },
        agreementDocument: { select: { id: true, documentNumber: true, status: true, signedPdfPath: true, signedUploadedAt: true, title: true, resolvedText: true, propertyOfficerName: true, authorizedRepName: true, secondarySignatoryTitle: true, firstSignatoryTitle: true, templateVersion: true, templateVersionId: true, templateVersionRecord: { select: { id: true, versionNumber: true, createdAt: true } } } },
      },
    });

    // 4. Asset.status stays ASSIGNED — update assignedTo to new personnel
    await tx.asset.update({ where: { id: assetId }, data: { assignedTo: toPersonnel.fullName } });

    // 5. Auto-close old AgreementDocument if all its assignments are now closed
    if (currentAssignment.agreementDocumentId) {
      const activeAssignments = await tx.assignment.findMany({
        where: {
          agreementDocumentId: currentAssignment.agreementDocumentId,
          returnedAt: null,
        },
        select: { id: true },
      });
      if (activeAssignments.length === 0) {
        await tx.agreementDocument.update({
          where: { id: currentAssignment.agreementDocumentId },
          data: { status: 'returned' },
        });
      }
    }

    return { oldAssignment, newAssignment };
  });

  // Audit logs (outside transaction — fire-and-forget)
  logAudit({
    userId: performedById ?? null,
    action: AUDIT_ACTIONS.ISSUANCE_TRANSFERRED,
    entityType: 'Assignment',
    entityId: result.newAssignment.id,
    ipAddress: ipAddress ?? null,
    metadata: {
      fromAssignmentId,
      fromPersonnelId: fromPersonnelId || currentAssignment.assignedTo,
      toPersonnelId,
      assetId,
      assetName: asset.name,
      serialNumber: asset.serialNumber,
      condition: transferCondition,
      transferNote,
      userAgent,
      field: '*',
      newValue: `Transfer: ${currentAssignment.assignedTo || fromPersonnelId} → ${toPersonnel.fullName}`,
      severity: 'HIGH',
      summary: generateSummary({
        action: 'TRANSFER',
        entityType: 'Assignment',
        assetName: asset.name,
        serialNumber: asset.serialNumber,
        oldValue: currentAssignment.assignedTo || fromPersonnelId || undefined,
        newValue: toPersonnel.fullName,
      }),
    },
  }).catch(() => {});

  // Also log against the Asset entity
  logAudit({
    userId: performedById ?? null,
    action: 'TRANSFER',
    entityType: 'Asset',
    entityId: assetId,
    ipAddress: ipAddress ?? null,
    metadata: {
      userAgent,
      field: 'assignedTo',
      oldValue: currentAssignment.assignedTo || fromPersonnelId,
      newValue: toPersonnel.fullName,
      severity: 'HIGH',
      summary: generateSummary({
        action: 'TRANSFER',
        entityType: 'Asset',
        assetName: asset.name,
        serialNumber: asset.serialNumber,
        oldValue: currentAssignment.assignedTo || fromPersonnelId || undefined,
        newValue: toPersonnel.fullName,
      }),
    },
  }).catch(() => {});

  // Log the return side of the old assignment
  logAudit({
    userId: performedById ?? null,
    action: AUDIT_ACTIONS.ISSUANCE_RETURNED,
    entityType: 'Assignment',
    entityId: fromAssignmentId,
    ipAddress: ipAddress ?? null,
    metadata: {
      assetId,
      transfer: true,
      transferredTo: toPersonnelId,
      condition: transferCondition,
      transferNote,
      userAgent,
      field: 'returnedAt',
      oldValue: 'null',
      newValue: now.toISOString(),
      severity: classifySeverity('RETURN'),
      summary: generateSummary({
        action: 'RETURN',
        entityType: 'Assignment',
        assetName: asset.name,
        serialNumber: asset.serialNumber,
        newValue: `${toPersonnel.fullName} (transfer)`,
      }),
    },
  }).catch(() => {});

  // Condition log for transfer (new assignment)
  createConditionLog({
    assetId,
    assignmentId: result.newAssignment.id,
    event: 'transferred',
    condition: transferCondition,
    note: transferNote || null,
    recordedById: performedById,
  }).catch(() => {});

  return {
    oldAssignment: result.oldAssignment,
    newAssignment: result.newAssignment,
    agreementDocument: agreementDocumentResult,
  };
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
            logAudit({
          userId: performedById ?? null,
          action: 'ISSUANCE_LOCK',
  entityType: 'Asset',
  entityId: assetId ?? null,
  ipAddress: ipAddress ?? null,
  metadata: {
    "userAgent": userAgent,
    "field": 'status',
    "oldValue": 'AVAILABLE',
    "newValue": 'PENDING_ASSIGNMENT',
    "severity": 'MEDIUM',
    "summary": generateSummary({ action: 'UPDATED', entityType: 'Asset', assetName: asset.name, serialNumber: asset.serialNumber, oldValue: 'AVAILABLE', newValue: 'PENDING_ASSIGNMENT' }),
  },
}).catch(() => {});
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
      logAudit({
        userId: performedById ?? null,
        action: 'ISSUANCE_UNLOCK',
  entityType: 'Asset',
  entityId: asset.id ?? null,
  ipAddress: ipAddress ?? null,
  metadata: {
    "userAgent": userAgent,
    "field": 'status',
    "oldValue": 'PENDING_ASSIGNMENT',
    "newValue": 'AVAILABLE',
    "severity": 'LOW',
    "summary": generateSummary({ action: 'UPDATED', entityType: 'Asset', assetName: asset.name, serialNumber: asset.serialNumber, oldValue: 'PENDING_ASSIGNMENT', newValue: 'AVAILABLE' }),
  },
}).catch(() => {});
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
  secondarySignatoryTitle?: string | null;
  firstSignatoryTitle?: string | null;
}): string {
  const { personnelName, designation, project, assetName, serialNumber, propertyNumber, date } = params;
  const secondaryTitle = params.secondarySignatoryTitle?.trim() || 'Property Officer';
  const firstTitle = params.firstSignatoryTitle?.trim() || 'Authorized Representative';
  const formattedDate = new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `ISSUANCE AND ACCOUNTABILITY AGREEMENT

Date: ${formattedDate}

This certifies that ${personnelName}${designation ? `, ${designation}` : ''}${project ? ` (${project})` : ''} has been issued the following asset for official use:

Asset: ${assetName}${serialNumber ? `\nSerial Number: ${serialNumber}` : ''}${propertyNumber ? `\nProperty Number: ${propertyNumber}` : ''}

Terms and Conditions:
1. The issued asset shall be used solely for official business purposes.
2. The recipient shall exercise due diligence in the care and protection of the asset.
3. The asset shall not be transferred to another individual without proper documentation.
4. Any damage, loss, or theft must be reported immediately to the ${secondaryTitle}.
5. The asset shall be returned upon resignation, transfer, or upon request by management.
6. The recipient assumes full accountability for the asset during the period of possession.

By signing below, the recipient acknowledges receipt and accepts the terms stated above.

________________________________________
${personnelName} (Recipient)

________________________________________
${secondaryTitle}

________________________________________
${firstTitle}`;
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

  // Fetch the requested template or the explicit default. Do not use arbitrary "most recent" templates.
  let template;
  if (templateId) {
    template = await prisma.agreementTemplate.findUnique({ where: { id: templateId } });
  }
  if (!template) {
    template = await prisma.agreementTemplate.findFirst({ where: { isDefault: true } });
  }

  // Prefer FK lookup names over scalar fields for template resolution
  // If FK lookup exists, use it; otherwise fall back to scalar field
  const designation = personnel.designationLookup?.name || personnel.designation || '';
  const project = personnel.projectLookup?.name || personnel.project || '';
  const institution = personnel.institution?.name || '';

  const resolvedDesignation = designation;
  const resolvedProject = project;
  const resolvedInstitution = institution;

  const usingFallbackTemplate = !template?.content?.trim();
  const templateContent = usingFallbackTemplate ? FALLBACK_AGREEMENT_TEMPLATE : (template?.content ?? FALLBACK_AGREEMENT_TEMPLATE);
  const templateVersionRecord = template && !usingFallbackTemplate
    ? await prisma.agreementTemplateVersion.findUnique({
        where: { templateId_versionNumber: { templateId: template.id, versionNumber: template.currentVersion } },
        select: { id: true, versionNumber: true },
      })
    : null;

  // Use parseTemplate to resolve placeholders
  const resolved = sanitizeAgreementText(parseTemplate(templateContent, {
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
  }));

  return {
    resolvedText: resolved,
    templateName: usingFallbackTemplate ? null : template?.name ?? null,
    templateId: usingFallbackTemplate ? null : template?.id ?? null,
    templateVersion: usingFallbackTemplate ? null : templateVersionRecord?.versionNumber ?? template?.currentVersion ?? null,
    templateVersionId: usingFallbackTemplate ? null : templateVersionRecord?.id ?? null,
    templateTitle: usingFallbackTemplate ? FALLBACK_AGREEMENT_TITLE : template?.title ?? null,
    defaultPropertyOfficer: usingFallbackTemplate ? null : template?.defaultPropertyOfficer ?? null,
    defaultAuthorizedRep: usingFallbackTemplate ? null : template?.defaultAuthorizedRep ?? null,
    secondarySignatoryTitle: usingFallbackTemplate ? null : template?.secondarySignatoryTitle ?? null,
    firstSignatoryTitle: usingFallbackTemplate ? null : template?.firstSignatoryTitle ?? null,
    signatoryMode: usingFallbackTemplate ? 'recipientPropertyOfficerAuthorizedRep' : template?.signatoryMode ?? 'recipientPropertyOfficerAuthorizedRep',
    headerLogo: usingFallbackTemplate ? null : template?.headerLogo ?? null,
    template: usingFallbackTemplate ? null : template ?? null,
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