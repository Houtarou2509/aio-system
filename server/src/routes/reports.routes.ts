import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { success, error } from '../utils/response';
import * as reportsService from '../services/reports.service';

const router = Router();
router.use(authenticate);

// GET /api/reports/inventory-valuation
router.get('/inventory-valuation', async (_req: Request, res: Response) => {
  try {
    const data = await reportsService.getInventoryValuation();
    return success(res, data, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// GET /api/reports/asset-utilization
router.get('/asset-utilization', async (_req: Request, res: Response) => {
  try {
    const data = await reportsService.getAssetUtilization();
    return success(res, data, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// GET /api/reports/maintenance-costs
router.get('/maintenance-costs', async (_req: Request, res: Response) => {
  try {
    const data = await reportsService.getMaintenanceCosts();
    return success(res, data, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// GET /api/reports/depreciation-summary
router.get('/depreciation-summary', async (_req: Request, res: Response) => {
  try {
    const data = await reportsService.getDepreciationSummary();
    return success(res, data, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

export default router;
