import { PrismaClient, Prisma } from '@prisma/client';
import { classifySeverity, generateSummary } from '../utils/auditHelpers';

const prisma = new PrismaClient();

/* ─── List personnel with pagination & search ─── */
export async function listPersonnel(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  project?: string;
}) {
  const { page = 1, limit = 20, search, status, project } = params;
  const where: Prisma.PersonnelWhereInput = {};

  // Default to active-only; pass 'all' to see everything, 'inactive' for soft-deleted
  if (status) {
    if (status !== 'all') where.status = status;
  } else {
    where.status = 'active';
  }
  if (project) where.project = { contains: project, mode: 'insensitive' };

  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { designation: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { designationLookup: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.personnel.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { fullName: 'asc' },
      include: {
        _count: { select: { assignments: { where: { returnedAt: null } } } },
        designationLookup: { select: { id: true, name: true } },
        institution: { select: { id: true, name: true } },
        projectLookup: { select: { id: true, name: true } },
      },
    }),
    prisma.personnel.count({ where }),
  ]);

  return {
    data: items.map(p => ({
      ...p,
      activeAssignments: p._count.assignments,
    })),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/* ─── Get single personnel with possession history ─── */
export async function getPersonnel(id: string) {
  const personnel = await prisma.personnel.findUnique({
    where: { id },
    include: {
      historyLogs: {
        orderBy: { loggedAt: 'desc' },
      },
      assignments: {
        orderBy: { assignedAt: 'desc' },
        include: {
          asset: {
            select: { id: true, name: true, serialNumber: true, propertyNumber: true, status: true },
          },
        },
      },
      designationLookup: { select: { id: true, name: true } },
      institution: { select: { id: true, name: true } },
      projectLookup: { select: { id: true, name: true } },
    },
  });

  if (!personnel) throw new Error('Personnel not found');
  return personnel;
}

/* ─── Create personnel ─── */
export async function createPersonnel(
  data: Prisma.PersonnelCreateInput,
  performedById: string,
  ipAddress?: string,
  userAgent?: string,
) {
  // Check for duplicate name + designation combination
  const existing = await prisma.personnel.findFirst({
    where: {
      fullName: data.fullName,
      designation: data.designation ?? null,
      status: 'active',
    },
  });
  if (existing) {
    throw new Error(`A personnel record for "${data.fullName}" with the same designation already exists.`);
  }

  // Safety check: reject deactivated lookup references
  // Raw input may carry scalar IDs that Prisma resolves at runtime
  const raw = data as any;
  if (raw.designationId) {
    const desig = await prisma.designationLookup.findUnique({ where: { id: raw.designationId } });
    if (!desig || desig.status !== 'active') {
      throw new Error(`Designation "${desig?.name ?? 'unknown'}" is not active and cannot be assigned.`);
    }
  }
  if (raw.institutionId) {
    const inst = await prisma.institutionLookup.findUnique({ where: { id: raw.institutionId } });
    if (!inst || inst.status !== 'active') {
      throw new Error(`Institution "${inst?.name ?? 'unknown'}" is not active and cannot be assigned.`);
    }
  }
  if (raw.projectId) {
    const proj = await prisma.projectLookup.findUnique({ where: { id: raw.projectId } });
    if (!proj || proj.status !== 'active') {
      throw new Error(`Project "${proj?.name ?? 'unknown'}" is not active and cannot be assigned.`);
    }
  }

  const personnel = await prisma.personnel.create({ data });

  // Auto-log profile history
  await prisma.profileHistory.create({
    data: {
      profileId: personnel.id,
      designation: personnel.designationId
        ? (await prisma.designationLookup.findUnique({ where: { id: personnel.designationId! } }))?.name ?? null
        : personnel.designation,
      institutionName: personnel.institutionId
        ? (await prisma.institutionLookup.findUnique({ where: { id: personnel.institutionId! } }))?.name ?? null
        : null,
      projectName: personnel.projectId
        ? (await prisma.projectLookup.findUnique({ where: { id: personnel.projectId! } }))?.name ?? null
        : null,
      projectYear: personnel.projectYear,
      hiredDate: personnel.hiredDate,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: 'Personnel',
      entityId: personnel.id,
      action: 'CREATE',
      performedById,
      ipAddress,
      userAgent,
      field: '*',
      newValue: JSON.stringify(data),
      severity: 'LOW',
      summary: generateSummary({ action: 'CREATE', entityType: 'Personnel', assetName: personnel.fullName }),
    },
  });

  return personnel;
}

/* ─── Update personnel ─── */
export async function updatePersonnel(
  id: string,
  data: Prisma.PersonnelUpdateInput,
  performedById: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const existing = await prisma.personnel.findUnique({ where: { id } });
  if (!existing) throw new Error('Personnel not found');

  // Safety check: reject deactivated lookup references
  const raw = data as any;
  if (raw.designationId) {
    const desig = await prisma.designationLookup.findUnique({ where: { id: raw.designationId } });
    if (!desig || desig.status !== 'active') {
      throw new Error(`Designation "${desig?.name ?? 'unknown'}" is not active and cannot be assigned.`);
    }
  }
  if (raw.institutionId) {
    const inst = await prisma.institutionLookup.findUnique({ where: { id: raw.institutionId } });
    if (!inst || inst.status !== 'active') {
      throw new Error(`Institution "${inst?.name ?? 'unknown'}" is not active and cannot be assigned.`);
    }
  }
  if (raw.projectId) {
    const proj = await prisma.projectLookup.findUnique({ where: { id: raw.projectId } });
    if (!proj || proj.status !== 'active') {
      throw new Error(`Project "${proj?.name ?? 'unknown'}" is not active and cannot be assigned.`);
    }
  }

  // Check if any tracked employment fields changed
  const trackedFields = ['designation', 'designationId', 'institutionId', 'projectId', 'projectYear', 'hiredDate'] as const;
  let hasChanges = false;

  for (const field of trackedFields) {
    const newVal = (data as any)[field];
    const oldVal = (existing as any)[field];
    if (newVal !== undefined && String(oldVal ?? '') !== String(newVal ?? '')) {
      hasChanges = true;
      break;
    }
  }

  // Only log profile history if tracked employment fields changed
  if (hasChanges) {
    // Resolve institution/project/designation names from OLD IDs (before update)
    const oldInstName = existing.institutionId
      ? (await prisma.institutionLookup.findUnique({ where: { id: existing.institutionId } }))?.name ?? null
      : null;
    const oldProjName = existing.projectId
      ? (await prisma.projectLookup.findUnique({ where: { id: existing.projectId } }))?.name ?? null
      : null;
    const oldDesigName = existing.designationId
      ? (await prisma.designationLookup.findUnique({ where: { id: existing.designationId } }))?.name ?? null
      : existing.designation;

    await prisma.profileHistory.create({
      data: {
        profileId: id,
        designation: oldDesigName,
        institutionName: oldInstName,
        projectName: oldProjName,
        projectYear: existing.projectYear,
        hiredDate: existing.hiredDate,
      },
    });
  }

  const personnel = await prisma.personnel.update({ where: { id }, data });

  // Project sync: if project changed, update notes on all active assignments
  if (data.project !== undefined && data.project !== existing.project) {
    await prisma.assignment.updateMany({
      where: { personnelId: id, returnedAt: null },
      data: { notes: `Project: ${data.project}` },
    });
  }

  for (const [key, newVal] of Object.entries(data)) {
    const oldVal = (existing as any)[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      await prisma.auditLog.create({
        data: {
          entityType: 'Personnel',
          entityId: id,
          action: 'UPDATE',
          performedById,
          ipAddress,
          userAgent,
          field: key,
          oldValue: String(oldVal ?? ''),
          newValue: String(newVal ?? ''),
          severity: classifySeverity('UPDATE', key),
          summary: generateSummary({
            action: 'UPDATE',
            entityType: 'Personnel',
            field: key,
            oldValue: String(oldVal ?? ''),
            newValue: String(newVal ?? ''),
            assetName: existing.fullName,
          }),
        },
      });
    }
  }

  return personnel;
}

/* ─── Delete personnel (soft — set status inactive) ─── */
export async function deletePersonnel(
  id: string,
  performedById: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const existing = await prisma.personnel.findUnique({
    where: { id },
    include: {
      _count: { select: { assignments: { where: { returnedAt: null } } } },
    },
  });
  if (!existing) throw new Error('Personnel not found');

  // Prevent deletion if they still hold active assets
  if (existing._count.assignments > 0) {
    throw new Error(`Cannot deactivate: ${existing.fullName} still holds ${existing._count.assignments} active asset(s). Return all items first.`);
  }

  const personnel = await prisma.personnel.update({
    where: { id },
    data: { status: 'inactive' },
  });

  await prisma.auditLog.create({
    data: {
      entityType: 'Personnel',
      entityId: id,
      action: 'SOFT_DELETE',
      performedById,
      ipAddress,
      userAgent,
      severity: 'HIGH',
      summary: generateSummary({ action: 'DELETE', entityType: 'Personnel', assetName: existing.fullName }),
    },
  });

  return personnel;
}