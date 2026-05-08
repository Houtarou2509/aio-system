import { z } from 'zod';

export const disposeAssetSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500),
  method: z.enum(['DONATED', 'SOLD', 'SCRAPPED', 'RETURNED_TO_VENDOR', 'OTHER']),
  date: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
});
