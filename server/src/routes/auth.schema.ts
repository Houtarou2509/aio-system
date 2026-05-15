import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
  twoFactorToken: z.string().optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token required'),
});

export const twoFaSetupSchema = z.object({});

export const twoFaVerifySchema = z.object({
  token: z.string().length(6, 'TOTP token must be 6 digits'),
});

export const twoFaValidateSchema = z.object({
  userId: z.string().min(1),
  token: z.string().length(6, 'TOTP token must be 6 digits'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email is required'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
});