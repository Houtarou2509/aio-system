import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import * as authService from '../services/auth.service';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { success, error } from '../utils/response';
import {
  loginSchema,
  refreshSchema,
  twoFaVerifySchema,
  twoFaValidateSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from './auth.schema';

const router = Router();

// Rate limit: 10 login attempts per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT || '10', 10),
  message: { success: false, data: null, error: { message: 'Too many login attempts, try again later' }, meta: null },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/login
router.post('/login', loginLimiter, validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password, twoFactorToken } = req.body;
    const result = await authService.login(email, password, twoFactorToken);
    return success(res, result, 200);
  } catch (err: any) {
    return error(res, err.message, 401);
  }
});

// POST /api/auth/refresh
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, data: null, error: { message: 'Too many refresh attempts, try again later' }, meta: null },
  standardHeaders: true,
  legacyHeaders: false,
});
router.post('/refresh', refreshLimiter, validate(refreshSchema), async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshToken(refreshToken);
    return success(res, result, 200);
  } catch (err: any) {
    return error(res, err.message, 401);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (refreshToken) authService.logout(refreshToken);
  return success(res, { loggedOut: true }, 200);
});

// POST /api/auth/2fa/setup
router.post('/2fa/setup', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await authService.setup2Fa(req.user!.id);
    return success(res, result, 200);
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

// POST /api/auth/2fa/verify
router.post('/2fa/verify', authenticate, validate(twoFaVerifySchema), async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    const result = await authService.verify2Fa(req.user!.id, token);
    return success(res, result, 200);
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

// POST /api/auth/2fa/validate
router.post('/2fa/validate', validate(twoFaValidateSchema), async (req: Request, res: Response) => {
  try {
    const { userId, token } = req.body;
    const result = await authService.validate2Fa(userId, token);
    return success(res, result, 200);
  } catch (err: any) {
    return error(res, err.message, 401);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await authService.getMe(req.user!.id);
    return success(res, user, 200);
  } catch (err: any) {
    return error(res, err.message, 404);
  }
});

// POST /api/auth/forgot-password
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, data: null, error: { message: 'Too many requests, try again later' }, meta: null },
  standardHeaders: true,
  legacyHeaders: false,
});
router.post('/forgot-password', forgotLimiter, validate(forgotPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const result = await authService.forgotPassword(email);
    return success(res, result, 200);
  } catch (err: any) {
    return success(res, { message: 'If that email exists, a reset link has been sent.' }, 200);
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', validate(resetPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    const result = await authService.resetPassword(token, password);
    return success(res, result, 200);
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

// POST /api/auth/change-password — self-service password change, authenticate only (no role/permission required)
router.post('/change-password', authenticate, validate(changePasswordSchema), async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await authService.changePassword(req.user!.id, newPassword, currentPassword);
    return success(res, result, 200);
  } catch (err: any) {
    const status = err.message.includes('not found') ? 404
      : err.message.includes('incorrect') ? 400
      : err.message.includes('required') ? 400
      : 400;
    return error(res, err.message, status);
  }
});

export default router;