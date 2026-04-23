import { Router, Request, Response } from 'express';
import * as backupService from '../services/backup.service';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { success, error } from '../utils/response';
import { listBackupsQuerySchema } from './backup.schema';

const router = Router();

router.use(authenticate);

// POST /api/backups/now — manual trigger (Admin only)
router.post('/now', authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await backupService.runBackup(req.user!.id);
    return success(res, result, 201);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// GET /api/backups — list backup logs
router.get('/', authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const query = listBackupsQuerySchema.parse(req.query);
    const result = await backupService.listBackups(query.page, query.limit);
    return success(res, result.items, 200, { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages });
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

export default router;