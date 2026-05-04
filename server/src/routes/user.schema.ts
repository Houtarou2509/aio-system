import { z } from 'zod';

export const createUserSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(200),
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  role: z.enum(['ADMIN', 'STAFF_ADMIN', 'STAFF', 'GUEST']),
});

export const updateUserSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional(),
  role: z.enum(['ADMIN', 'STAFF_ADMIN', 'STAFF', 'GUEST']).optional(),
  password: z.string().min(6).max(100).optional(),
}).refine(d => d.fullName || d.username || d.email || d.role || d.password, {
  message: 'Provide at least one field to update',
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'inactive'], { message: 'Status must be "active" or "inactive"' }),
});
