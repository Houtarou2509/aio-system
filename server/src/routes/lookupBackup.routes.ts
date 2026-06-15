import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { LookupCategory, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { success, error } from '../utils/response';
import { logAudit } from '../services/auditLog.service';

const router = Router();

// ────────────────────────────────────────────────────────────
// Authorization: ADMIN or STAFF_ADMIN only
// ────────────────────────────────────────────────────────────
const lookupAdminAuth = [authenticate, authorize(['ADMIN', 'STAFF_ADMIN'])];

// ────────────────────────────────────────────────────────────
// Inventory category mapping
// ────────────────────────────────────────────────────────────
const INVENTORY_GROUPS: { key: string; category: LookupCategory }[] = [
  { key: 'assetTypes', category: LookupCategory.ASSET_TYPE },
  { key: 'manufacturers', category: LookupCategory.MANUFACTURER },
  { key: 'locations', category: LookupCategory.LOCATION },
  { key: 'owners', category: LookupCategory.OWNER },
];

const INVENTORY_CATEGORY_TO_KEY: Record<LookupCategory, string> = {
  [LookupCategory.ASSET_TYPE]: 'assetTypes',
  [LookupCategory.MANUFACTURER]: 'manufacturers',
  [LookupCategory.LOCATION]: 'locations',
  [LookupCategory.OWNER]: 'owners',
  [LookupCategory.ASSIGNED_TO]: 'assignedTo', // never exported
};

// ────────────────────────────────────────────────────────────
// Accountability group mapping
// ────────────────────────────────────────────────────────────
const ACCOUNTABILITY_GROUPS = ['designations', 'institutions', 'projects'] as const;

// ────────────────────────────────────────────────────────────
// Zod schemas for import bundle
// ────────────────────────────────────────────────────────────
const inventoryValueSchema = z.object({
  value: z.string(),
  isActive: z.boolean(),
});

const designationValueSchema = z.object({
  name: z.string(),
  status: z.enum(['active', 'inactive']),
});

const institutionValueSchema = z.object({
  name: z.string(),
  status: z.enum(['active', 'inactive']),
});

const projectValueSchema = z.object({
  name: z.string(),
  status: z.enum(['active', 'inactive', 'completed', 'archived']),
});

const bundleSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string().datetime().optional(),
  source: z.string().optional(),
  modules: z.object({
    inventory: z.object({
      assetTypes: z.array(inventoryValueSchema).default([]),
      manufacturers: z.array(inventoryValueSchema).default([]),
      locations: z.array(inventoryValueSchema).default([]),
      owners: z.array(inventoryValueSchema).default([]),
    }),
    accountability: z.object({
      designations: z.array(designationValueSchema).default([]),
      institutions: z.array(institutionValueSchema).default([]),
      projects: z.array(projectValueSchema).default([]),
    }),
  }),
});

// Result helpers
interface GroupResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
}

interface ImportResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  groups: Record<string, GroupResult>;
  skippedItems: Array<{ group: string; reason: string }>;
}

function emptyGroup(): GroupResult {
  return { created: 0, updated: 0, unchanged: 0, skipped: 0 };
}

function emptyResult(): ImportResult {
  return {
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    groups: {},
    skippedItems: [],
  };
}

function recordGroupChange(result: ImportResult, group: string, change: keyof GroupResult) {
  if (!result.groups[group]) result.groups[group] = emptyGroup();
  result.groups[group][change]++;
  result[change]++;
}

// ────────────────────────────────────────────────────────────
// GET /api/lookup-backup/export
// ────────────────────────────────────────────────────────────
router.get(
  '/export',
  ...lookupAdminAuth,
  async (req: Request, res: Response) => {
    try {
      // Inventory lookups (all values, active and inactive)
      const inventoryValues = await prisma.lookupValue.findMany({
        where: {
          category: {
            in: INVENTORY_GROUPS.map(g => g.category),
          },
        },
        orderBy: { value: 'asc' },
      });

      const inventoryModule: Record<string, Array<{ value: string; isActive: boolean }>> = {};
      for (const { key } of INVENTORY_GROUPS) {
        inventoryModule[key] = [];
      }
      for (const v of inventoryValues) {
        const key = INVENTORY_CATEGORY_TO_KEY[v.category];
        if (!inventoryModule[key]) continue;
        inventoryModule[key].push({ value: v.value, isActive: v.isActive });
      }

      // Accountability lookups
      const [designations, institutions, projects] = await Promise.all([
        prisma.designationLookup.findMany({ orderBy: { name: 'asc' } }),
        prisma.institutionLookup.findMany({ orderBy: { name: 'asc' } }),
        prisma.projectLookup.findMany({ orderBy: { name: 'asc' } }),
      ]);

      const bundle = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        source: 'aio-system',
        modules: {
          inventory: inventoryModule,
          accountability: {
            designations: designations.map(d => ({ name: d.name, status: d.status })),
            institutions: institutions.map(i => ({ name: i.name, status: i.status })),
            projects: projects.map(p => ({ name: p.name, status: p.status })),
          },
        },
      };

      await logAudit({
        userId: req.user!.id,
        action: 'LOOKUP_BACKUP_EXPORT',
        entityType: 'System',
        entityId: 'lookup-backup',
        metadata: {
          inventoryCount: inventoryValues.length,
          designationCount: designations.length,
          institutionCount: institutions.length,
          projectCount: projects.length,
        },
        ipAddress: Array.isArray(req.ip) ? req.ip[0] : req.ip ?? null,
      });

      return success(res, bundle);
    } catch (err: any) {
      console.error('[LOOKUP_BACKUP_EXPORT] error:', err);
      return error(res, err.message || 'Failed to export lookup backup', 500);
    }
  }
);

// ────────────────────────────────────────────────────────────
// POST /api/lookup-backup/import
// ────────────────────────────────────────────────────────────
router.post(
  '/import',
  ...lookupAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const parsed = bundleSchema.safeParse(req.body);
      if (!parsed.success) {
        const messages = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return error(res, `Invalid backup format: ${messages}`, 422);
      }

      const bundle = parsed.data;
      const result = emptyResult();

      await prisma.$transaction(async (tx) => {
        // ── Inventory module ──
        for (const { key, category } of INVENTORY_GROUPS) {
          const items = bundle.modules.inventory[key as keyof typeof bundle.modules.inventory] ?? [];
          const seenValues = new Set<string>();

          for (const item of items) {
            const rawValue = item.value?.trim();
            if (!rawValue) {
              result.skippedItems.push({ group: `inventory.${key}`, reason: 'Blank value' });
              recordGroupChange(result, `inventory.${key}`, 'skipped');
              continue;
            }

            const valueKey = rawValue.toLowerCase();
            if (seenValues.has(valueKey)) {
              result.skippedItems.push({ group: `inventory.${key}`, reason: `Duplicate value: "${rawValue}"` });
              recordGroupChange(result, `inventory.${key}`, 'skipped');
              continue;
            }
            seenValues.add(valueKey);

            const existing = await tx.lookupValue.findFirst({
              where: { category, value: { equals: rawValue, mode: 'insensitive' } },
            });

            if (existing) {
              if (existing.isActive === item.isActive) {
                recordGroupChange(result, `inventory.${key}`, 'unchanged');
              } else {
                await tx.lookupValue.update({
                  where: { id: existing.id },
                  data: { isActive: item.isActive },
                });
                recordGroupChange(result, `inventory.${key}`, 'updated');
              }
            } else {
              await tx.lookupValue.create({
                data: { category, value: rawValue, isActive: item.isActive },
              });
              recordGroupChange(result, `inventory.${key}`, 'created');
            }
          }
        }

        // ── Accountability module ──
        for (const groupKey of ACCOUNTABILITY_GROUPS) {
          const items = bundle.modules.accountability[groupKey];
          const seenNames = new Set<string>();

          for (const item of items) {
            const rawName = item.name?.trim();
            if (!rawName) {
              result.skippedItems.push({ group: `accountability.${groupKey}`, reason: 'Blank name' });
              recordGroupChange(result, `accountability.${groupKey}`, 'skipped');
              continue;
            }

            const nameKey = rawName.toLowerCase();
            if (seenNames.has(nameKey)) {
              result.skippedItems.push({ group: `accountability.${groupKey}`, reason: `Duplicate name: "${rawName}"` });
              recordGroupChange(result, `accountability.${groupKey}`, 'skipped');
              continue;
            }
            seenNames.add(nameKey);

            const status = item.status;

            if (groupKey === 'designations') {
              const existing = await tx.designationLookup.findFirst({
                where: { name: { equals: rawName, mode: 'insensitive' } },
              });

              if (existing) {
                if (existing.status === status) {
                  recordGroupChange(result, `accountability.${groupKey}`, 'unchanged');
                } else {
                  await tx.designationLookup.update({ where: { id: existing.id }, data: { status } });
                  recordGroupChange(result, `accountability.${groupKey}`, 'updated');
                }
              } else {
                await tx.designationLookup.create({ data: { name: rawName, status } });
                recordGroupChange(result, `accountability.${groupKey}`, 'created');
              }
            } else if (groupKey === 'institutions') {
              const existing = await tx.institutionLookup.findFirst({
                where: { name: { equals: rawName, mode: 'insensitive' } },
              });

              if (existing) {
                if (existing.status === status) {
                  recordGroupChange(result, `accountability.${groupKey}`, 'unchanged');
                } else {
                  await tx.institutionLookup.update({ where: { id: existing.id }, data: { status } });
                  recordGroupChange(result, `accountability.${groupKey}`, 'updated');
                }
              } else {
                await tx.institutionLookup.create({ data: { name: rawName, status } });
                recordGroupChange(result, `accountability.${groupKey}`, 'created');
              }
            } else if (groupKey === 'projects') {
              const existing = await tx.projectLookup.findFirst({
                where: { name: { equals: rawName, mode: 'insensitive' } },
              });

              if (existing) {
                if (existing.status === status) {
                  recordGroupChange(result, `accountability.${groupKey}`, 'unchanged');
                } else {
                  await tx.projectLookup.update({ where: { id: existing.id }, data: { status } });
                  recordGroupChange(result, `accountability.${groupKey}`, 'updated');
                }
              } else {
                await tx.projectLookup.create({ data: { name: rawName, status } });
                recordGroupChange(result, `accountability.${groupKey}`, 'created');
              }
            }
          }
        }
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });

      await logAudit({
        userId: req.user!.id,
        action: 'LOOKUP_BACKUP_IMPORT',
        entityType: 'System',
        entityId: 'lookup-backup',
        metadata: {
          created: result.created,
          updated: result.updated,
          unchanged: result.unchanged,
          skipped: result.skipped,
          groups: result.groups,
        },
        ipAddress: Array.isArray(req.ip) ? req.ip[0] : req.ip ?? null,
      });

      return success(res, result);
    } catch (err: any) {
      console.error('[LOOKUP_BACKUP_IMPORT] error:', err);
      return error(res, err.message || 'Failed to import lookup backup', 500);
    }
  }
);

export default router;
