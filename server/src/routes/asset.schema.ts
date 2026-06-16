import { z } from 'zod';

export const createAssetSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
  manufacturer: z.string().optional(),
  owner: z.string().optional(),
  serialNumber: z.string().optional(),
  purchasePrice: z.coerce.number({
    required_error: 'Purchase price is required.',
    invalid_type_error: 'Purchase price must be a number.',
  }).nonnegative('Purchase price cannot be negative.'),
  purchaseDate: z.string({
    required_error: 'Purchase date is required.',
  }).min(1, 'Purchase date is required.').transform(v => new Date(v).toISOString()),
  status: z.enum(['AVAILABLE', 'PENDING_ASSIGNMENT', 'MAINTENANCE', 'RETIRED', 'LOST']).default('AVAILABLE'),
  location: z.string().optional(),
  assignedTo: z.string().optional(),
  propertyNumber: z.string().optional(),
  remarks: z.string().optional(),
  warrantyExpiry: z.string().optional().nullable(),
  warrantyNotes: z.string().max(500).optional().nullable(),
  depreciationMethod: z.string().optional().default('straight_line'),
  usefulLifeYears: z.coerce.number().int().min(1).max(50).optional().default(5),
  salvageValue: z.coerce.number().nonnegative().optional().default(0),
  supplierId: z.string().uuid().optional().nullable(),
});

// Status values allowed in updates — includes ASSIGNED since an asset already
// in that state must pass validation when editing non-assignment fields.
const assetStatusSchema = z.enum([
  'AVAILABLE',
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'MAINTENANCE',
  'RETIRED',
  'LOST',
]);

export const updateAssetSchema = createAssetSchema
  .omit({ status: true })
  .extend({
    status: assetStatusSchema.optional(),
  })
  .partial();

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
  status: z.enum(['AVAILABLE', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST']).optional(),
  location: z.string().optional(),
  owner: z.string().optional(),
  assignedTo: z.string().optional(),
  manufacturer: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'purchasePrice', 'type', 'status', 'purchaseDate', 'propertyNumber']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  purchaseDateFrom: z.string().optional(),
  purchaseDateTo: z.string().optional(),
  warrantyExpiryFrom: z.string().optional(),
  warrantyExpiryTo: z.string().optional(),
});

export const exportAssetsQuerySchema = listAssetsQuerySchema.omit({ page: true, limit: true });

export const exportSelectedCsvSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(200),
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

export const bulkAssignSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(50),
  personnelId: z.string().uuid(),
  notes: z.string().optional(),
});

export const bulkReturnSchema = z.object({
  issuanceIds: z.array(z.string().uuid()).min(1).max(50),
  condition: z.string().min(1).default('Good'),
});

export const bulkUpdateSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(100),
  location: z.string().optional(),
  status: z.enum(['AVAILABLE', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST']).optional(),
}).refine((data) => data.location || data.status, {
  message: 'At least one of location or status is required',
});