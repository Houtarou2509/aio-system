import { Router, Request, Response } from 'express';
import * as auditService from '../services/audit.service';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { success, error } from '../utils/response';
import { auditQuerySchema, auditCleanupSchema, auditExportQuerySchema } from './audit.schema';

const router = Router();

router.use(authenticate);

// GET /api/audit — query audit logs with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = auditQuerySchema.parse(req.query);
    const result = await auditService.queryAuditLogs(query);
    return success(res, result.items, 200, { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages });
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

// GET /api/audit/export — export filtered logs as CSV (Admin, Staff-Admin only)
router.get('/export', authorize(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  try {
    const query = auditExportQuerySchema.parse(req.query);
    const csv = await auditService.exportAuditLogsCsv(query);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
    return res.send(csv);
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

// DELETE /api/audit/cleanup — delete logs older than N days (Admin only)
router.delete('/cleanup', authorize(['ADMIN']), validate(auditCleanupSchema), async (req: Request, res: Response) => {
  try {
    const { olderThanDays } = req.body;
    const result = await auditService.cleanupAuditLogs(olderThanDays);
    return success(res, result, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// GET /api/audit/:entityId — all audit events for one entity
router.get('/:entityId', async (req: Request, res: Response) => {
  try {
    const timeline = await auditService.getEntityAuditTimeline(String(req.params.entityId));
    return success(res, timeline, 200);
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

// POST /api/audit/:id/revert — revert a field to its previous value (Admin only)
router.post('/:id/revert', authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await auditService.revertAuditEntry(String(req.params.id));
    return success(res, result, 200);
  } catch (err: any) {
    return error(res, err.message, err.message === 'Audit log not found' ? 404 : 400);
  }
});

export default router;