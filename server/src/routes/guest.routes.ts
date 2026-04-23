import { Router, Request, Response } from 'express';
import * as guestService from '../services/guest.service';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { success, error } from '../utils/response';
import { createGuestTokenSchema } from './label.schema';

const router = Router();

// Public: GET /api/guest/a/:token — no auth required, rate limited
router.get('/a/:token', guestService.guestRateLimiter, async (req: Request, res: Response) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const asset = await guestService.getAssetByGuestToken(String(req.params.token), Array.isArray(ip) ? ip[0] : String(ip));
    return success(res, asset, 200);
  } catch (err: any) {
    return error(res, err.message, 404);
  }
});

// Authenticated routes below
router.use(authenticate);

// POST /api/guest/tokens — create guest token
router.post('/tokens', authorize(['ADMIN', 'STAFF_ADMIN']), validate(createGuestTokenSchema), async (req: Request, res: Response) => {
  try {
    const { assetId, expiresAt, maxAccess } = req.body;
    const token = await guestService.createGuestToken(assetId, expiresAt, maxAccess);
    return success(res, token, 201);
  } catch (err: any) {
    return error(res, err.message, err.message === 'Asset not found' ? 404 : 400);
  }
});

// GET /api/guest/tokens — list tokens (optional ?assetId= filter)
router.get('/tokens', authorize(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  try {
    const assetId = req.query.assetId as string | undefined;
    const tokens = await guestService.listGuestTokens(assetId);
    return success(res, tokens, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// DELETE /api/guest/tokens/:id — revoke token (Admin only)
router.delete('/tokens/:id', authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    await guestService.revokeGuestToken(String(req.params.id));
    return success(res, { revoked: true }, 200);
  } catch (err: any) {
    return error(res, err.message, err.message === 'Token not found' ? 404 : 400);
  }
});

export default router;