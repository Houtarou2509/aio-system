import { Router, Request, Response } from 'express';
import * as prService from '../services/purchase-request.service';
import { authenticate, authorize } from '../middleware/auth';
import { success, error } from '../utils/response';

const router = Router();

function getClientIp(req: Request): string {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  return Array.isArray(ip) ? ip[0] : String(ip);
}

// All routes require auth
router.use(authenticate);

// GET /api/purchase-requests — list (filtered by role)
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const result = await prService.listRequests(userId, role);
    return success(res, result.items, 200, { total: result.total } as any);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// POST /api/purchase-requests — create (Staff, STAFF_ADMIN, Admin)
router.post('/', authorize(['ADMIN', 'STAFF_ADMIN', 'STAFF']), async (req: Request, res: Response) => {
  try {
    const { assetName, type, reason, notes } = req.body;
    if (!assetName || !type || !reason) {
      return error(res, 'assetName, type, and reason are required', 400);
    }
    const request = await prService.createRequest(
      { assetName, type, reason, notes },
      req.user!.id,
      getClientIp(req),
      String(req.headers['user-agent'] || ''),
    );
    return success(res, request, 201);
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

// PATCH /api/purchase-requests/:id/approve — Admin only
router.patch('/:id/approve', authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const request = await prService.approveRequest(
      String(req.params.id),
      req.user!.id,
      getClientIp(req),
      String(req.headers['user-agent'] || ''),
    );
    return success(res, request, 200);
  } catch (err: any) {
    const status = err.message.includes('not found') ? 404 : 400;
    return error(res, err.message, status);
  }
});

// PATCH /api/purchase-requests/:id/reject — Admin only
router.patch('/:id/reject', authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return error(res, 'Rejection reason is required', 400);
    }
    const request = await prService.rejectRequest(
      String(req.params.id),
      req.user!.id,
      reason,
      getClientIp(req),
      String(req.headers['user-agent'] || ''),
    );
    return success(res, request, 200);
  } catch (err: any) {
    const status = err.message.includes('not found') ? 404 : 400;
    return error(res, err.message, status);
  }
});

export default router;
