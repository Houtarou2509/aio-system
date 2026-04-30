import { PrismaClient, Prisma } from '@prisma/client';
import { classifySeverity, generateSummary } from '../utils/auditHelpers';

const prisma = new PrismaClient();

/* ─── Get active issuance for asset (QR return) ─── */
export async function getActiveIssuanceForAsset(assetId: string) {
  return prisma.assignment.findFirst({
    where: { assetId, returnedAt: null },
    orderBy: { assignedAt: 'desc' },
    include: {
      asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true } },
      personnel: { select: { id: true, fullName: true, designation: true, project: true } },
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
        personnel: { select: { id: true, fullName: true, designation: true, project: true } },
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
}, performedById: string, ipAddress?: string, userAgent?: string) {
  const { assetId, personnelId, condition, notes, agreementText } = params;

  // Verify asset is available
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new Error('Asset not found');
  if (asset.status !== 'AVAILABLE') throw new Error(`Asset is not available (current status: ${asset.status})`);

  // Verify personnel exists and is active
  const personnel = await prisma.personnel.findUnique({ where: { id: personnelId } });
  if (!personnel) throw new Error('Personnel not found');
  if (personnel.status !== 'active') throw new Error('Personnel is not active');

  // Create assignment + update asset status in a transaction
  const assignment = await prisma.$transaction(async (tx) => {
    const a = await tx.assignment.create({
      data: {
        assetId,
        personnelId,
        assignedTo: personnel.fullName,
        condition: condition || 'Good',
        notes: notes || agreementText || null,
      },
      include: {
        asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true } },
        personnel: { select: { id: true, fullName: true, designation: true, project: true } },
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
        personnel: { select: { id: true, fullName: true, designation: true, project: true } },
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
    select: { id: true, fullName: true, designation: true, project: true },
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