import { z } from 'zod';

export const createPersonnelSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(200),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().max(50).optional().nullable().or(z.literal('')),
  designation: z.string().max(200).optional().nullable().or(z.literal('')),
  project: z.string().max(200).optional().nullable().or(z.literal('')),
  department: z.string().max(200).optional().nullable().or(z.literal('')),
  institution: z.string().max(200).optional().nullable().or(z.literal('')),
  designationId: z.number().int().positive().optional().nullable(),
  institutionId: z.number().int().positive().optional().nullable(),
  projectId: z.number().int().positive().optional().nullable(),
  projectYear: z.string().max(50).optional().nullable().or(z.literal('')),
  employmentHistory: z.string().max(5000).optional().nullable().or(z.literal('')),
  hiredDate: z.string().optional().nullable(),
  personnelType: z.enum(['employee', 'contractor']).default('employee').optional(),
  contractDurationMonths: z.number().int().min(1).max(24).nullable().optional(),
  contractStartDate: z.string().datetime().nullable().optional(),
  contractEndDate: z.string().datetime().nullable().optional(),
});

export const updatePersonnelSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().max(50).optional().nullable().or(z.literal('')),
  designation: z.string().max(200).optional().nullable().or(z.literal('')),
  project: z.string().max(200).optional().nullable().or(z.literal('')),
  department: z.string().max(200).optional().nullable().or(z.literal('')),
  institution: z.string().max(200).optional().nullable().or(z.literal('')),
  designationId: z.number().int().positive().optional().nullable(),
  institutionId: z.number().int().positive().optional().nullable(),
  projectId: z.number().int().positive().optional().nullable(),
  projectYear: z.string().max(50).optional().nullable().or(z.literal('')),
  hiredDate: z.string().optional().nullable(),
  personnelType: z.enum(['employee', 'contractor']).optional(),
  contractDurationMonths: z.number().int().min(1).max(24).nullable().optional(),
  contractStartDate: z.string().datetime().nullable().optional(),
  contractEndDate: z.string().datetime().nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).refine(d => Object.keys(d).length > 0, {
  message: 'Provide at least one field to update',
});