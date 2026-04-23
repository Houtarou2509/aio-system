import { z } from 'zod';

export const generatePdfSchema = z.object({
  assetIds: z.array(z.string()).min(1).max(50),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1),
  format: z.enum(['DYMO_99017', 'DYMO_99012', 'BROTHER_62', 'BROTHER_38', 'BROTHER_29', 'AVERY_L7160', 'A4']),
  barcodeType: z.enum(['CODE128', 'QR', 'DATAMATRIX']),
  fields: z.array(z.string()),
  config: z.record(z.any()).optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const createGuestTokenSchema = z.object({
  assetId: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
  maxAccess: z.coerce.number().int().positive().optional(),
});