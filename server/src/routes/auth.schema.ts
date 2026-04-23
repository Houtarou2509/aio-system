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