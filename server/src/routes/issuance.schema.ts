import { z } from 'zod';

export const createIssuanceSchema = z.object({
  assetId: z.string().uuid(),
  personnelId: z.string().uuid(),
  condition: z.string().max(100).optional(),
  notes: z.string().max(1000).optional().nullable(),
  agreementText: z.string().max(20000).optional().nullable(),
  agreementId: z.string().uuid().optional().nullable(),
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
  notes: z.string().max(1000).optional().nullable(),
  agreementTemplateId: z.string().uuid().optional().nullable(),
  agreementText: z.string().max(100000).optional().nullable(),
  propertyOfficerName: z.string().max(200).optional().nullable(),
  authorizedRepName: z.string().max(200).optional().nullable(),
});

export const resolveBulkTemplateSchema = z.object({
  personnelId: z.string().uuid(),
  assetIds: z.array(z.string().uuid()).min(1).max(50),
  condition: z.string().max(100).optional(),
  templateId: z.string().uuid().optional(),
});
export const assetLockSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(50),
});

export const signIssuanceSchema = z.object({
  signerName: z.string().min(2).max(120),
});
