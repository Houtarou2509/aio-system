import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { success, error } from '../utils/response';

const router = Router();
const prisma = new PrismaClient();

// ── Validation schemas ──
const nameSchema = z.object({ name: z.string().min(1, 'Name is required').max(100) });
const designationStatusSchema = z.object({ status: z.enum(['active', 'inactive']) });
const institutionStatusSchema = z.object({ status: z.enum(['active', 'inactive']) });
const projectStatusSchema = z.object({ status: z.enum(['active', 'inactive', 'completed', 'archived']) });

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

  const parsed = designationStatusSchema.safeParse(req.body);
  if (!parsed.success) return error(res, parsed.error.errors[0].message, 422);

  const item = await prisma.designationLookup.findUnique({ where: { id } });
  if (!item) return error(res, 'Designation not found', 404);

  try {
    const updated = await prisma.designationLookup.update({ where: { id }, data: { status: parsed.data.status } });
    console.log(`[LOOKUP-DEACTIVATE] Designation ${id} ("${updated.name}") status: ${item.status} → ${updated.status}`);
    return success(res, updated);
  } catch (e: any) {
    console.error(`[LOOKUP-DEACTIVATE] FK Error on Designation ${id}:`, e.message);
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

  const parsed = institutionStatusSchema.safeParse(req.body);
  if (!parsed.success) return error(res, parsed.error.errors[0].message, 422);

  const item = await prisma.institutionLookup.findUnique({ where: { id } });
  if (!item) return error(res, 'Institution not found', 404);

  try {
    const updated = await prisma.institutionLookup.update({ where: { id }, data: { status: parsed.data.status } });
    console.log(`[LOOKUP-DEACTIVATE] Institution ${id} ("${updated.name}") status: ${item.status} → ${updated.status}`);
    return success(res, updated);
  } catch (e: any) {
    console.error(`[LOOKUP-DEACTIVATE] FK Error on Institution ${id}:`, e.message);
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

  const parsed = projectStatusSchema.safeParse(req.body);
  if (!parsed.success) return error(res, parsed.error.errors[0].message, 422);

  const item = await prisma.projectLookup.findUnique({ where: { id } });
  if (!item) return error(res, 'Project not found', 404);

  try {
    const updated = await prisma.projectLookup.update({ where: { id }, data: { status: parsed.data.status } });
    console.log(`[LOOKUP-DEACTIVATE] Project ${id} ("${updated.name}") status: ${item.status} → ${updated.status}`);
    return success(res, updated);
  } catch (e: any) {
    console.error(`[LOOKUP-DEACTIVATE] FK Error on Project ${id}:`, e.message);
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
