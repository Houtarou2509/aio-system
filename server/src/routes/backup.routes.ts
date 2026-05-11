import { Router, Request, Response } from 'express';
import fs from 'fs';
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

// GET /api/backups/stats — summary stats
router.get('/stats', authorize(['ADMIN']), async (_req: Request, res: Response) => {
  try {
    const stats = await backupService.getBackupStats();
    return success(res, stats);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// GET /api/backups/:id/download — download backup file
router.get('/:id/download', authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const backup = await backupService.getBackupById(String(req.params.id));
    if (!backup) return error(res, 'Backup not found', 404);
    if (!backup.filePath) return error(res, 'No file attached to this backup', 404);
    if (!fs.existsSync(backup.filePath)) return error(res, 'Backup file no longer exists on disk', 404);
    res.download(backup.filePath);
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