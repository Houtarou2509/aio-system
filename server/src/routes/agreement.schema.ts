import { z } from 'zod';

export const createAgreementTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(200),
  title: z.string().max(500).optional(),
  content: z.string().min(1, 'Template content is required').max(50000),
  contentJson: z.unknown().optional().nullable(),
  isDefault: z.enum(['true', 'false']).optional(),
  defaultPropertyOfficer: z.string().max(200).optional(),
  defaultAuthorizedRep: z.string().max(200).optional(),
  letterheadPath: z.string().max(500).optional(),
});

export const updateAgreementTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  title: z.string().max(500).optional(),
  content: z.string().max(50000).optional(),
  contentJson: z.unknown().optional().nullable(),
  isDefault: z.enum(['true', 'false']).optional(),
  defaultPropertyOfficer: z.string().max(200).optional(),
  defaultAuthorizedRep: z.string().max(200).optional(),
  letterheadPath: z.string().max(500).optional(),
}).refine(d => Object.keys(d).length > 0, {
  message: 'Provide at least one field to update',
});

const pdfAssetSchema = z.object({
  name: z.string().min(1).max(500),
  serialNumber: z.string().max(200).optional().nullable(),
  propertyNumber: z.string().max(200).optional().nullable(),
  condition: z.string().max(100).optional().nullable(),
});

export const agreementPdfSchema = z.object({
  personnelName: z.string().min(1).max(500),
  designation: z.string().max(500).optional().nullable(),
  position: z.string().max(500).optional().nullable(),
  project: z.string().max(500).optional().nullable(),
  institution: z.string().max(500).optional().nullable(),
  assetName: z.string().min(1).max(500),
  serialNumber: z.string().max(200).optional().nullable(),
  propertyNumber: z.string().max(200).optional().nullable(),
  condition: z.string().max(100).optional().nullable(),
  templateId: z.string().uuid().optional().nullable(),
  agreementText: z.string().max(100000).optional().nullable(),
  title: z.string().max(500).optional().nullable(),
  propertyOfficerName: z.string().max(200).optional().nullable(),
  authorizedRepName: z.string().max(200).optional().nullable(),
  assets: z.array(pdfAssetSchema).max(100).optional(),
  recipientSignedAt: z.union([z.string(), z.date()]).optional().nullable(),
  recipientSignatureName: z.string().max(200).optional().nullable(),
  documentNumber: z.string().max(100).optional().nullable(),
  agreementDocumentId: z.string().uuid().optional().nullable(),
  renderMode: z.enum(['preprinted', 'fullDigital']).default('preprinted'),
});

export const templatePreviewSchema = z.object({
  content: z.string().max(50000),
  mode: z.enum(['single', 'multiple']).default('single'),
});

export const templateValidationSchema = z.object({
  content: z.string().max(50000),
});

export const backfillAgreementDocumentsSchema = z.object({
  dryRun: z.boolean().optional().default(false),
});

export const sanitizeAgreementDocumentsSchema = z.object({
  dryRun: z.boolean().optional().default(true),
  documentNumber: z.string().max(100).optional().nullable(),
});
