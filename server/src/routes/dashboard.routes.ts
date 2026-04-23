import { Router, Request, Response } from 'express';
import * as dashboardService from '../services/dashboard.service';
import { authenticate } from '../middleware/auth';
import { success, error } from '../utils/response';

const router = Router();

router.use(authenticate);

// GET /api/dashboard/stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await dashboardService.getDashboardStats();
    return success(res, stats, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// GET /api/dashboard/warranties-expiring
router.get('/warranties-expiring', async (_req: Request, res: Response) => {
  try {
    const result = await dashboardService.getWarrantiesExpiring();
    return success(res, result, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// GET /api/dashboard/location-stats
router.get('/location-stats', async (_req: Request, res: Response) => {
  try {
    const result = await dashboardService.getLocationStats();
    return success(res, result, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// GET /api/dashboard/age-stats
router.get('/age-stats', async (_req: Request, res: Response) => {
  try {
    const result = await dashboardService.getAgeStats();
    return success(res, result, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

export default router;