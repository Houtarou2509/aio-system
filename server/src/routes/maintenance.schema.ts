import { z } from 'zod';

export const createMaintenanceSchema = z.object({
  technicianName: z.string().min(1, 'Technician name is required'),
  description: z.string().min(1, 'Description is required'),
  cost: z.coerce.number().nonnegative().default(0),
  date: z.string().min(1).optional().transform(v => v ? new Date(v).toISOString() : undefined),
});

export const updateMaintenanceSchema = createMaintenanceSchema.partial();

export const listMaintenanceQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});