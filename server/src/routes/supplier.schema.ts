import { z } from 'zod';

export const createSupplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contactPerson: z.string().optional().nullable(),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateSupplierSchema = createSupplierSchema.partial();
