import { z } from 'zod';

export const createIssuanceSchema = z.object({
  assetId: z.string().uuid(),
  personnelId: z.string().uuid(),
  condition: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  agreementText: z.string().max(20000).optional(),
  agreementId: z.string().uuid().optional(),
});

export const returnIssuanceSchema = z.object({
  condition: z.string().min(1, 'Condition is required').max(100).optional(),
});

export const resolveTemplateSchema = z.object({
  personnelId: z.string().uuid(),
  assetId: z.string().uuid(),
  condition: z.string().max(100).optional(),
  templateId: z.string().uuid().optional(),
});

export const bulkIssuanceSchema = z.object({
  personnelId: z.string().uuid(),
  assetIds: z.array(z.string().uuid()).min(1).max(50),
  condition: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  agreementTemplateId: z.string().uuid().optional(),
  propertyOfficerName: z.string().max(200).optional(),
  authorizedRepName: z.string().max(200).optional(),
});

export const resolveBulkTemplateSchema = z.object({
  personnelId: z.string().uuid(),
  assetIds: z.array(z.string().uuid()).min(1).max(50),
  condition: z.string().max(100).optional(),
  templateId: z.string().uuid().optional(),
});
