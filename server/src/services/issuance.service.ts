import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { classifySeverity, generateSummary } from '../utils/auditHelpers';
import { parseTemplate } from '../utils/templateParser';



/* ─── Get active issuance for asset (QR return) ─── */
export async function getActiveIssuanceForAsset(assetId: string) {
  return prisma.assignment.findFirst({
    where: { assetId, returnedAt: null },
    orderBy: { assignedAt: 'desc' },
    include: {
      asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true } },
      personnel: { select: { id: true, fullName: true, designation: true, project: true, designationLookup: { select: { name: true } }, projectLookup: { select: { name: true } }, institution: { select: { name: true } } } },
      agreement: { select: { id: true, name: true, title: true } },
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
  if (asset.status !== 'AVAILABLE') throw new Error(`Asset is not available (current status: ${asset.status})`);

  // Verify personnel exists and is active
  const personnel = await prisma.personnel.findUnique({ where: { id: personnelId } });
  if (!personnel) throw new Error('Personnel not found');
  if (personnel.status !== 'active') throw new Error('Personnel is not active');

  // Validate agreementId references an existing template (if provided)
  if (agreementId) {
    const tmpl = await prisma.agreementTemplate.findUnique({ where: { id: agreementId } });
    if (!tmpl) throw new Error('Agreement template not found');
  }

  // Create assignment + update asset status in a transaction
  const assignment = await prisma.$transaction(async (tx) => {
    const a = await tx.assignment.create({
      data: {
        assetId,
        personnelId,
        assignedTo: personnel.fullName,
        condition: condition || 'Good',
        notes: notes || null,
        agreementText: agreementText || null,
        agreementId: agreementId || null,
      },
      include: {
        asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true } },
        personnel: { select: { id: true, fullName: true, designation: true, project: true, designationLookup: { select: { name: true } }, projectLookup: { select: { name: true } }, institution: { select: { name: true } } } },
        agreement: { select: { id: true, name: true, title: true } },
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
      oldValue: 'AVAILABLE',
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
    propertyOfficerName?: string;
    authorizedRepName?: string;
  },
  performedById: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const { personnelId, assetIds, condition, notes, agreementTemplateId, propertyOfficerName, authorizedRepName } = params;
  const errors: Array<{ assetId: string; reason: string }> = [];

  // Verify personnel exists and is active
  const personnel = await prisma.personnel.findUnique({ where: { id: personnelId } });
  if (!personnel) throw new Error('Personnel not found');
  if (personnel.status !== 'active') throw new Error('Personnel is not active');

  // Verify all assets exist and are AVAILABLE
  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds } },
    select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true },
  });

  const assetMap = new Map(assets.map(a => [a.id, a]));
  const validAssetIds: string[] = [];

  for (const aid of assetIds) {
    const a = assetMap.get(aid);
    if (!a) { errors.push({ assetId: aid, reason: 'Asset not found' }); continue; }
    if (a.status !== 'AVAILABLE') { errors.push({ assetId: aid, reason: `Asset is ${a.status}` }); continue; }
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

  const agreementText = resolvedTemplate.resolvedText;
  const agreementId = resolvedTemplate.templateId;

  // Validate agreementId references an existing template (if provided)
  if (agreementId) {
    const tmpl = await prisma.agreementTemplate.findUnique({ where: { id: agreementId } });
    if (!tmpl) throw new Error('Agreement template not found');
  }

  // Create assignments + update asset statuses in a transaction
  const assignments = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const aid of validAssetIds) {
      const assetData = assetMap.get(aid)!;
      const a = await tx.assignment.create({
        data: {
          assetId: aid,
          personnelId,
          assignedTo: personnel.fullName,
          condition: condition || 'Good',
          notes: notes || null,
          agreementText: agreementText || null,
          agreementId: agreementId || null,
        },
        include: {
          asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true } },
          personnel: { select: { id: true, fullName: true, designation: true, project: true, designationLookup: { select: { name: true } }, projectLookup: { select: { name: true } }, institution: { select: { name: true } } } },
          agreement: { select: { id: true, name: true, title: true } },
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
        oldValue: 'AVAILABLE',
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
  const where: Prisma.PersonnelWhereInput = { status: 'active' };
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { designation: { contains: search, mode: 'insensitive' } },
      { project: { contains: search, mode: 'insensitive' } },
    ];
  }
  return prisma.personnel.findMany({
    where,
    select: { id: true, fullName: true, designation: true, project: true, designationId: true, projectId: true, institutionId: true, designationLookup: { select: { name: true } }, projectLookup: { select: { name: true } }, institution: { select: { name: true } } },
    orderBy: { fullName: 'asc' },
    take: 50,
  });
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