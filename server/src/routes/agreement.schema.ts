import { z } from 'zod';

export const createAgreementTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(200),
  title: z.string().max(500).optional(),
  content: z.string().min(1, 'Template content is required').max(50000),
  isDefault: z.enum(['true', 'false']).optional(),
  defaultPropertyOfficer: z.string().max(200).optional(),
  defaultAuthorizedRep: z.string().max(200).optional(),
});

export const updateAgreementTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  title: z.string().max(500).optional(),
  content: z.string().max(50000).optional(),
  isDefault: z.enum(['true', 'false']).optional(),
  defaultPropertyOfficer: z.string().max(200).optional(),
  defaultAuthorizedRep: z.string().max(200).optional(),
}).refine(d => Object.keys(d).length > 0, {
  message: 'Provide at least one field to update',
});
