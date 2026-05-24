import { z } from 'zod';
import { PERMISSION_KEYS } from '../middleware/permissions';

const strongPassword = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const createUserSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(200),
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  email: z.string().email('Invalid email address'),
  password: strongPassword,
  role: z.enum(['ADMIN', 'STAFF_ADMIN', 'STAFF', 'GUEST']).refine(
    (val) => val !== 'GUEST',
    { message: 'GUEST role is not available for direct user creation.' }
  ),
  permissions: z.array(z.string()).optional(),
});

export const updateUserSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional(),
  role: z.enum(['ADMIN', 'STAFF_ADMIN', 'STAFF', 'GUEST']).optional(),
  password: z.string().min(8).max(100).optional(),
  permissions: z.array(z.string()).optional(),
}).refine(d => d.fullName || d.username || d.email || d.role || d.password || d.permissions, {
  message: 'Provide at least one field to update',
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'inactive'], { message: 'Status must be "active" or "inactive"' }),
});