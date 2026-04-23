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
} from './auth.schema';

const router = Router();

// Rate limit: 5 login attempts per IP per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
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
router.post('/refresh', validate(refreshSchema), async (req: Request, res: Response) => {
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

export default router;