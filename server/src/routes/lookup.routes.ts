import { Router, Request, Response } from 'express';
import { PrismaClient, LookupCategory } from '@prisma/client';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { success, error } from '../utils/response';

const router = Router();
const prisma = new PrismaClient();

// Map URL param to LookupCategory enum
const categoryMap: Record<string, LookupCategory> = {
  'asset-types': LookupCategory.ASSET_TYPE,
  'manufacturers': LookupCategory.MANUFACTURER,
  'locations': LookupCategory.LOCATION,
  'assigned-to': LookupCategory.ASSIGNED_TO,
};

function resolveCategory(param: string): LookupCategory | null {
  return categoryMap[param] ?? null;
}

// -------------------------------------------------------
// GET /api/lookups/:category
// Returns all ACTIVE values for a category — any authenticated user
// -------------------------------------------------------
router.get(
  '/:category',
  authenticate,
  async (req: Request, res: Response) => {
    const category = resolveCategory(String(req.params.category));
    if (!category) {
      return error(res, 'Invalid category. Use: asset-types, manufacturers, locations, assigned-to', 400);
    }

    const values = await prisma.lookupValue.findMany({
      where: { category, isActive: true },
      orderBy: { value: 'asc' },
    });

    return success(res, values, 200, { total: values.length });
  }
);

// -------------------------------------------------------
// GET /api/lookups/:category/all
// Returns ALL values including inactive — Admin/Staff-Admin
// -------------------------------------------------------
router.get(
  '/:category/all',
  authenticate,
  authorize(['ADMIN', 'STAFF_ADMIN']),
  async (req: Request, res: Response) => {
    const category = resolveCategory(String(req.params.category));
    if (!category) {
      return error(res, 'Invalid category', 400);
    }

    const values = await prisma.lookupValue.findMany({
      where: { category },
      orderBy: { value: 'asc' },
    });

    return success(res, values, 200, { total: values.length });
  }
);

// -------------------------------------------------------
// POST /api/lookups/:category
// Add a new lookup value — Admin/Staff-Admin only
// -------------------------------------------------------
const createSchema = z.object({
  value: z.string().min(1, 'Value is required').max(100),
});

router.post(
  '/:category',
  authenticate,
  authorize(['ADMIN', 'STAFF_ADMIN']),
  async (req: Request, res: Response) => {
    const category = resolveCategory(String(req.params.category));
    if (!category) {
      return error(res, 'Invalid category', 400);
    }

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, parsed.error.errors[0].message, 422);
    }

    const { value } = parsed.data;

    // Case-insensitive duplicate check
    const existing = await prisma.lookupValue.findFirst({
      where: {
        category,
        value: { equals: value, mode: 'insensitive' },
      },
    });

    if (existing) {
      return error(res, `"${value}" already exists in this category`, 409);
    }

    const created = await prisma.lookupValue.create({
      data: { category, value, isActive: true },
    });

    return success(res, created, 201);
  }
);

// -------------------------------------------------------
// PATCH /api/lookups/:id
// Edit value text or toggle isActive — Admin/Staff-Admin
// -------------------------------------------------------
const updateSchema = z.object({
  value: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
}).refine(
  (d) => d.value !== undefined || d.isActive !== undefined,
  { message: 'Provide value or isActive to update' }
);

router.patch(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'STAFF_ADMIN']),
  async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      return error(res, 'Invalid ID', 400);
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, parsed.error.errors[0].message, 422);
    }

    const existing = await prisma.lookupValue.findUnique({ where: { id } });
    if (!existing) {
      return error(res, 'Lookup value not found', 404);
    }

    // If renaming, check for duplicate
    if (parsed.data.value) {
      const duplicate = await prisma.lookupValue.findFirst({
        where: {
          category: existing.category,
          value: { equals: parsed.data.value, mode: 'insensitive' },
          NOT: { id },
        },
      });
      if (duplicate) {
        return error(res, `"${parsed.data.value}" already exists in this category`, 409);
      }
    }

    const updated = await prisma.lookupValue.update({
      where: { id },
      data: parsed.data,
    });

    return success(res, updated, 200);
  }
);

// -------------------------------------------------------
// POST /api/lookups/migrate
// Seed lookups from existing asset data — Admin only
// -------------------------------------------------------
router.post(
  '/migrate',
  authenticate,
  authorize(['ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const assets = await prisma.asset.findMany({
        select: { type: true, manufacturer: true, location: true, assignedTo: true },
        where: { deletedAt: null },
      });

      if (assets.length === 0) {
        return success(res, { message: 'No assets to migrate' }, 200);
      }

      const typeSet = new Set<string>();
      const mfrSet = new Set<string>();
      const locSet = new Set<string>();
      const assSet = new Set<string>();

      for (const a of assets) {
        if (a.type) typeSet.add(a.type.charAt(0).toUpperCase() + a.type.slice(1).toLowerCase());
        if (a.manufacturer) mfrSet.add(a.manufacturer);
        if (a.location) locSet.add(a.location);
        if (a.assignedTo) assSet.add(a.assignedTo);
      }

      const upsert = async (category: LookupCategory, value: string) => {
        await prisma.lookupValue.upsert({
          where: { category_value: { category, value } },
          update: {},
          create: { category, value, isActive: true },
        });
      };

      let count = 0;
      for (const v of typeSet) { await upsert(LookupCategory.ASSET_TYPE, v); count++; }
      for (const v of mfrSet) { await upsert(LookupCategory.MANUFACTURER, v); count++; }
      for (const v of locSet) { await upsert(LookupCategory.LOCATION, v); count++; }
      for (const v of assSet) { await upsert(LookupCategory.ASSIGNED_TO, v); count++; }

      await prisma.auditLog.create({
        data: {
          entityType: 'System',
          entityId: 'lookup-migration',
          action: 'MIGRATE_LOOKUPS',
          performedById: req.user!.id,
          field: '*',
          newValue: `Migrated ${count} lookup values from ${assets.length} assets`,
        },
      });

      return success(res, { migrated: count, assets: assets.length }, 200);
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  }
);

// ───────────────────────────────────────────────────────
// GET /api/lookups/institutions
// Returns all institutions — any authenticated user
// ───────────────────────────────────────────────────────
router.get(
  '/institutions',
  authenticate,
  async (_req: Request, res: Response) => {
    const institutions = await prisma.institutionLookup.findMany({
      orderBy: { name: 'asc' },
    });
    return success(res, institutions, 200, { total: institutions.length });
  }
);

// ───────────────────────────────────────────────────────
// POST /api/lookups/institutions
// Add a new institution — Admin/Staff-Admin
// ───────────────────────────────────────────────────────
const institutionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

router.post(
  '/institutions',
  authenticate,
  authorize(['ADMIN', 'STAFF_ADMIN']),
  async (req: Request, res: Response) => {
    const parsed = institutionSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, parsed.error.errors[0].message, 422);
    }

    const existing = await prisma.institutionLookup.findFirst({
      where: { name: { equals: parsed.data.name, mode: 'insensitive' } },
    });
    if (existing) {
      return error(res, `"${parsed.data.name}" already exists`, 409);
    }

    const created = await prisma.institutionLookup.create({
      data: { name: parsed.data.name },
    });
    return success(res, created, 201);
  }
);

// ───────────────────────────────────────────────────────
// GET /api/lookups/projects
// Returns all projects — any authenticated user
// ───────────────────────────────────────────────────────
router.get(
  '/projects',
  authenticate,
  async (_req: Request, res: Response) => {
    const projects = await prisma.projectLookup.findMany({
      orderBy: { name: 'asc' },
    });
    return success(res, projects, 200, { total: projects.length });
  }
);

// ───────────────────────────────────────────────────────
// POST /api/lookups/projects
// Add a new project — Admin/Staff-Admin
// ───────────────────────────────────────────────────────
const projectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  status: z.enum(['active', 'completed', 'archived']).optional(),
});

router.post(
  '/projects',
  authenticate,
  authorize(['ADMIN', 'STAFF_ADMIN']),
  async (req: Request, res: Response) => {
    const parsed = projectSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, parsed.error.errors[0].message, 422);
    }

    const existing = await prisma.projectLookup.findFirst({
      where: { name: { equals: parsed.data.name, mode: 'insensitive' } },
    });
    if (existing) {
      return error(res, `"${parsed.data.name}" already exists`, 409);
    }

    const created = await prisma.projectLookup.create({
      data: { name: parsed.data.name, status: parsed.data.status },
    });
    return success(res, created, 201);
  }
);

export default router;