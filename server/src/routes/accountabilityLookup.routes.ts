import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { success, error } from '../utils/response';
import { logAudit } from '../services/auditLog.service';

const router = Router();


// ── Validation schemas ──
const nameSchema = z.object({ name: z.string().min(1, 'Name is required').max(100) });
const designationPatchSchema = z.object({ name: z.string().min(1).max(100).optional(), status: z.enum(['active', 'inactive']).optional(), forceDeactivate: z.boolean().optional() });
const institutionPatchSchema = z.object({ name: z.string().min(1).max(100).optional(), status: z.enum(['active', 'inactive']).optional(), forceDeactivate: z.boolean().optional() });
const projectPatchSchema = z.object({ name: z.string().min(1).max(100).optional(), status: z.enum(['active', 'inactive', 'completed', 'archived']).optional(), forceDeactivate: z.boolean().optional() });

// ═══════════════════════════════════════════════════════════
// DESIGNATIONS
// ═══════════════════════════════════════════════════════════
const designationsRouter = Router();

designationsRouter.get('/', authenticate, async (req: Request, res: Response) => {
  const where: any = {};
  if (req.query.activeOnly === 'true') where.status = 'active';
  const items = await prisma.designationLookup.findMany({ where, orderBy: { name: 'asc' } });
  return success(res, items);
});

designationsRouter.get('/active', authenticate, async (_req: Request, res: Response) => {
  const items = await prisma.designationLookup.findMany({
    where: { status: 'active' },
    orderBy: { name: 'asc' },
  });
  return success(res, items);
});

designationsRouter.post('/', authenticate, authorize(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) return error(res, parsed.error.errors[0].message, 422);

  const dup = await prisma.designationLookup.findFirst({
    where: { name: { equals: parsed.data.name, mode: 'insensitive' } },
  });
  if (dup) return error(res, `"${parsed.data.name}" already exists`, 409);

  const created = await prisma.designationLookup.create({ data: { name: parsed.data.name } });
  return success(res, created, 201);
});

designationsRouter.patch('/:id', authenticate, authorize(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return error(res, 'Invalid ID', 400);

  const parsed = designationPatchSchema.safeParse(req.body);
  if (!parsed.success) return error(res, parsed.error.errors[0].message, 422);
  if (!parsed.data.name && !parsed.data.status) return error(res, 'Provide at least one of: name, status', 422);

  const item = await prisma.designationLookup.findUnique({ where: { id } });
  if (!item) return error(res, 'Designation not found', 404);

  // Check for duplicate name if renaming
  if (parsed.data.name && parsed.data.name.toLowerCase() !== item.name.toLowerCase()) {
    const dup = await prisma.designationLookup.findFirst({
      where: { name: { equals: parsed.data.name, mode: 'insensitive' }, id: { not: id } },
    });
    if (dup) return error(res, `"${parsed.data.name}" already exists`, 409);
  }

  try {
    const data: any = {};
    if (parsed.data.name) data.name = parsed.data.name;
    if (parsed.data.status) data.status = parsed.data.status;

    // Reference check when deactivating
    if (parsed.data.status === 'inactive') {
      const affectedCount = await prisma.personnel.count({
        where: { designationId: id, status: 'active' },
      });
      if (affectedCount > 0 && !parsed.data.forceDeactivate) {
        return error(res, `${affectedCount} active profile(s) use this value. Reassign or deactivate those profiles before deactivating this lookup.`, 409, { code: 'LOOKUP_IN_USE', affectedCount });
      }
      if (affectedCount > 0 && parsed.data.forceDeactivate) {
        await logAudit({
          userId: (req as any).user?.id ?? null,
          action: 'lookup.force_deactivated',
          entityType: 'DesignationLookup',
          entityId: String(id),
          metadata: { affectedPersonnelCount: affectedCount, lookupName: item.name },
          ipAddress: Array.isArray(req.ip) ? req.ip[0] : req.ip,
        });
      }
    }

    const updated = await prisma.designationLookup.update({ where: { id }, data });
    console.log(`[LOOKUP-PATCH] Designation ${id} ("${item.name}") → ${JSON.stringify(data)}`);
    return success(res, updated);
  } catch (e: any) {
    console.error(`[LOOKUP-PATCH] FK Error on Designation ${id}:`, e.message);
    if (e.code === 'P2003') {
      return error(res, 'Cannot deactivate: designation is linked to active personnel records.', 409);
    }
    throw e;
  }
});

// ═══════════════════════════════════════════════════════════
// INSTITUTIONS
// ═══════════════════════════════════════════════════════════
const institutionsRouter = Router();

institutionsRouter.get('/', authenticate, async (req: Request, res: Response) => {
  const where: any = {};
  if (req.query.activeOnly === 'true') where.status = 'active';
  const items = await prisma.institutionLookup.findMany({ where, orderBy: { name: 'asc' } });
  return success(res, items);
});

institutionsRouter.get('/active', authenticate, async (_req: Request, res: Response) => {
  const items = await prisma.institutionLookup.findMany({
    where: { status: 'active' },
    orderBy: { name: 'asc' },
  });
  return success(res, items);
});

institutionsRouter.post('/', authenticate, authorize(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) return error(res, parsed.error.errors[0].message, 422);

  const dup = await prisma.institutionLookup.findFirst({
    where: { name: { equals: parsed.data.name, mode: 'insensitive' } },
  });
  if (dup) return error(res, `"${parsed.data.name}" already exists`, 409);

  const created = await prisma.institutionLookup.create({ data: { name: parsed.data.name } });
  return success(res, created, 201);
});

institutionsRouter.patch('/:id', authenticate, authorize(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return error(res, 'Invalid ID', 400);

  const parsed = institutionPatchSchema.safeParse(req.body);
  if (!parsed.success) return error(res, parsed.error.errors[0].message, 422);
  if (!parsed.data.name && !parsed.data.status) return error(res, 'Provide at least one of: name, status', 422);

  const item = await prisma.institutionLookup.findUnique({ where: { id } });
  if (!item) return error(res, 'Institution not found', 404);

  // Check for duplicate name if renaming
  if (parsed.data.name && parsed.data.name.toLowerCase() !== item.name.toLowerCase()) {
    const dup = await prisma.institutionLookup.findFirst({
      where: { name: { equals: parsed.data.name, mode: 'insensitive' }, id: { not: id } },
    });
    if (dup) return error(res, `"${parsed.data.name}" already exists`, 409);
  }

  try {
    const data: any = {};
    if (parsed.data.name) data.name = parsed.data.name;
    if (parsed.data.status) data.status = parsed.data.status;

    // Reference check when deactivating
    if (parsed.data.status === 'inactive') {
      const affectedCount = await prisma.personnel.count({
        where: { institutionId: id, status: 'active' },
      });
      if (affectedCount > 0 && !parsed.data.forceDeactivate) {
        return error(res, `${affectedCount} active profile(s) use this value. Reassign or deactivate those profiles before deactivating this lookup.`, 409, { code: 'LOOKUP_IN_USE', affectedCount });
      }
      if (affectedCount > 0 && parsed.data.forceDeactivate) {
        await logAudit({
          userId: (req as any).user?.id ?? null,
          action: 'lookup.force_deactivated',
          entityType: 'InstitutionLookup',
          entityId: String(id),
          metadata: { affectedPersonnelCount: affectedCount, lookupName: item.name },
          ipAddress: Array.isArray(req.ip) ? req.ip[0] : req.ip,
        });
      }
    }

    const updated = await prisma.institutionLookup.update({ where: { id }, data });
    console.log(`[LOOKUP-PATCH] Institution ${id} ("${item.name}") → ${JSON.stringify(data)}`);
    return success(res, updated);
  } catch (e: any) {
    console.error(`[LOOKUP-PATCH] FK Error on Institution ${id}:`, e.message);
    if (e.code === 'P2003') {
      return error(res, 'Cannot deactivate: institution is linked to active personnel records.', 409);
    }
    throw e;
  }
});

// ═══════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════
const projectsRouter = Router();

projectsRouter.get('/', authenticate, async (req: Request, res: Response) => {
  const where: any = {};
  if (req.query.activeOnly === 'true') where.status = 'active';
  const items = await prisma.projectLookup.findMany({ where, orderBy: { name: 'asc' } });
  return success(res, items);
});

projectsRouter.get('/active', authenticate, async (_req: Request, res: Response) => {
  const items = await prisma.projectLookup.findMany({
    where: { status: 'active' },
    orderBy: { name: 'asc' },
  });
  return success(res, items);
});

projectsRouter.post('/', authenticate, authorize(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) return error(res, parsed.error.errors[0].message, 422);

  const dup = await prisma.projectLookup.findFirst({
    where: { name: { equals: parsed.data.name, mode: 'insensitive' } },
  });
  if (dup) return error(res, `"${parsed.data.name}" already exists`, 409);

  const created = await prisma.projectLookup.create({ data: { name: parsed.data.name } });
  return success(res, created, 201);
});

projectsRouter.patch('/:id', authenticate, authorize(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return error(res, 'Invalid ID', 400);

  const parsed = projectPatchSchema.safeParse(req.body);
  if (!parsed.success) return error(res, parsed.error.errors[0].message, 422);
  if (!parsed.data.name && !parsed.data.status) return error(res, 'Provide at least one of: name, status', 422);

  const item = await prisma.projectLookup.findUnique({ where: { id } });
  if (!item) return error(res, 'Project not found', 404);

  // Check for duplicate name if renaming
  if (parsed.data.name && parsed.data.name.toLowerCase() !== item.name.toLowerCase()) {
    const dup = await prisma.projectLookup.findFirst({
      where: { name: { equals: parsed.data.name, mode: 'insensitive' }, id: { not: id } },
    });
    if (dup) return error(res, `"${parsed.data.name}" already exists`, 409);
  }

  const deactivationStatuses = ['inactive', 'completed', 'archived'];

  try {
    const data: any = {};
    if (parsed.data.name) data.name = parsed.data.name;
    if (parsed.data.status) data.status = parsed.data.status;

    // Reference check when deactivating
    if (parsed.data.status && deactivationStatuses.includes(parsed.data.status)) {
      const affectedCount = await prisma.personnel.count({
        where: { projectId: id, status: 'active' },
      });
      if (affectedCount > 0 && !parsed.data.forceDeactivate) {
        return error(res, `${affectedCount} active profile(s) use this value. Reassign or deactivate those profiles before deactivating this lookup.`, 409, { code: 'LOOKUP_IN_USE', affectedCount });
      }
      if (affectedCount > 0 && parsed.data.forceDeactivate) {
        await logAudit({
          userId: (req as any).user?.id ?? null,
          action: 'lookup.force_deactivated',
          entityType: 'ProjectLookup',
          entityId: String(id),
          metadata: { affectedPersonnelCount: affectedCount, lookupName: item.name, newStatus: parsed.data.status },
          ipAddress: Array.isArray(req.ip) ? req.ip[0] : req.ip,
        });
      }
    }

    const updated = await prisma.projectLookup.update({ where: { id }, data });
    console.log(`[LOOKUP-PATCH] Project ${id} ("${item.name}") → ${JSON.stringify(data)}`);
    return success(res, updated);
  } catch (e: any) {
    console.error(`[LOOKUP-PATCH] FK Error on Project ${id}:`, e.message);
    if (e.code === 'P2003' || (e.meta?.field_name && typeof e.meta?.field_name === 'string' && e.meta.field_name.includes('Foreign'))) {
      return error(res, 'Cannot deactivate: project is linked to active personnel records. Remove those links first.', 409);
    }
    if (e.code === 'P2002') {
      return error(res, 'A project with this name already exists.', 409);
    }
    throw e;
  }
});

// ── Mount sub-routers ──
router.use('/designations', designationsRouter);
router.use('/institutions', institutionsRouter);
router.use('/projects', projectsRouter);

export default router;