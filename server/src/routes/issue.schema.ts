import { z } from 'zod';

export const createIssueReportSchema = z.object({
  pageUrl: z.string().trim().min(1).max(1000),
  issueType: z.enum(['BUG', 'DATA_ISSUE', 'UI_ISSUE', 'ACCESS_PERMISSION', 'OTHER']),
  description: z.string().trim().min(5).max(5000),
  stepsToReproduce: z.string().trim().max(5000).optional().nullable(),
  screenshotUrl: z.string().trim().max(1000).optional().nullable(),
  userAgent: z.string().trim().max(1000).optional().nullable(),
});

export const listIssueReportsQuerySchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const updateIssueReportSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX']).optional(),
  adminNotes: z.string().trim().max(5000).optional().nullable(),
}).refine((data) => data.status !== undefined || data.adminNotes !== undefined, {
  message: 'At least one field is required',
});
