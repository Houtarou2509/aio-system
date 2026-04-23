import { z } from 'zod';

export const suggestSchema = z.object({
  assetName: z.string().min(1, 'Asset name is required'),
});