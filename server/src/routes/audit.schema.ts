import { z } from 'zod';

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  action: z.string().optional(),
  severity: z.string().optional(),
  performedBy: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  module: z.enum(['INVENTORY', 'ACCOUNTABILITY', 'SYSTEM']).optional(),
});

export const auditCleanupSchema = z.object({
  olderThanDays: z.coerce.number().int().positive().default(365),
});

export const auditExportQuerySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  action: z.string().optional(),
  performedBy: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  module: z.enum(['INVENTORY', 'ACCOUNTABILITY', 'SYSTEM']).optional(),
});