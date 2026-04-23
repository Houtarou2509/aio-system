import { z } from 'zod';

export const createAssetSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
  manufacturer: z.string().optional(),
  serialNumber: z.string().optional(),
  purchasePrice: z.coerce.number().nonnegative().optional(),
  purchaseDate: z.string().optional().transform(v => v ? new Date(v).toISOString() : undefined),
  status: z.enum(['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST']).default('AVAILABLE'),
  location: z.string().optional(),
  assignedTo: z.string().optional(),
  propertyNumber: z.string().optional(),
  remarks: z.string().optional(),
  warrantyExpiry: z.string().optional().nullable(),
  warrantyNotes: z.string().max(500).optional().nullable(),
});

export const updateAssetSchema = createAssetSchema.partial();

export const checkoutSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  notes: z.string().optional(),
});

export const returnSchema = z.object({
  condition: z.string().min(1, 'Condition is required'),
  notes: z.string().optional(),
});

export const listAssetsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  type: z.string().optional(),
  status: z.enum(['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST']).optional(),
  location: z.string().optional(),
  assignedTo: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'purchasePrice', 'type', 'status', 'purchaseDate', 'propertyNumber']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const bulkStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'At least one ID is required'),
  status: z.enum(['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED']),
});

export const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'At least one ID is required'),
});

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});