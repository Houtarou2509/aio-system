import { z } from 'zod';

const dateInputSchema = z.string().refine((v) => {
  if (!v) return true;
  const d = new Date(v);
  return !isNaN(d.getTime());
}, { message: 'Invalid date' });

export const documentTypeEnum = z.enum(['ACCOUNTABILITY_FORM', 'SIGNED_AGREEMENT', 'RETURN_FORM', 'PURCHASE_DOCUMENT', 'DISPOSAL_DOCUMENT']);
export const statusEnum = z.enum(['ACTIVE', 'SUPERSEDED', 'VOID']);

export const listDocumentsSchema = z.object({
  search: z.string().optional(),
  documentType: documentTypeEnum.optional(),
  status: statusEnum.optional(),
  dateFrom: dateInputSchema.optional(),
  dateTo: dateInputSchema.optional(),
  assetId: z.string().uuid().optional(),
  personnelId: z.string().uuid().optional(),
  purchaseRequestId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  page: z.string().transform((v) => Number(v)).optional(),
  limit: z.string().transform((v) => Number(v)).optional(),
});

export const uploadDocumentSchema = z.object({
  documentType: documentTypeEnum,
  title: z.string().min(1).max(255),
  documentNumber: z.string().min(1).max(100).optional(),
  sourceEntityType: z.string().max(100).optional(),
  sourceEntityId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  personnelId: z.string().uuid().optional(),
  purchaseRequestId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  status: statusEnum.optional(),
});
