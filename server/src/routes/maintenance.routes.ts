import { Router, Request, Response } from 'express';
import * as maintenanceService from '../services/maintenance.service';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { success, error } from '../utils/response';
import { createMaintenanceSchema, updateMaintenanceSchema, listMaintenanceQuerySchema } from './maintenance.schema';

const router = Router();

function getClientIp(req: Request): string {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  return Array.isArray(ip) ? ip[0] : String(ip);
}

router.use(authenticate);

// GET /api/assets/:assetId/maintenance
router.get('/:assetId/maintenance', async (req: Request, res: Response) => {
  try {
    const query = listMaintenanceQuerySchema.parse(req.query);
    const result = await maintenanceService.listMaintenanceLogs(String(req.params.assetId), query.page, query.limit);
    return success(res, result.items, 200, { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } as any);
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

// POST /api/assets/:assetId/maintenance
router.post('/:assetId/maintenance', authorize(['ADMIN', 'STAFF_ADMIN', 'STAFF']), validate(createMaintenanceSchema), async (req: Request, res: Response) => {
  try {
    const data: any = { ...req.body };
    if (data.date) data.date = new Date(data.date);
    const log = await maintenanceService.createMaintenanceLog(String(req.params.assetId), data, req.user!.id, getClientIp(req));
    return success(res, log, 201);
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

// PUT /api/assets/:assetId/maintenance/:logId
router.put('/:assetId/maintenance/:logId', authorize(['ADMIN', 'STAFF_ADMIN', 'STAFF']), validate(updateMaintenanceSchema), async (req: Request, res: Response) => {
  try {
    const log = await maintenanceService.updateMaintenanceLog(String(req.params.logId), req.body, req.user!.id, getClientIp(req));
    return success(res, log, 200);
  } catch (err: any) {
    return error(res, err.message, err.message === 'Maintenance log not found' ? 404 : 400);
  }
});

// DELETE /api/assets/:assetId/maintenance/:logId
router.delete('/:assetId/maintenance/:logId', authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    await maintenanceService.deleteMaintenanceLog(String(req.params.logId), req.user!.id, getClientIp(req));
    return success(res, { deleted: true }, 200);
  } catch (err: any) {
    return error(res, err.message, err.message === 'Maintenance log not found' ? 404 : 400);
  }
});

export default router;