import { Router, Request, Response } from 'express';
import { getAccountabilityReport, type AccountabilityReportResult } from '../services/accountability.service';
import { authenticate, hasPermission } from '../middleware/auth';
import { success, error } from '../utils/response';

const router = Router();

/* ─── GET /api/accountability/report ─── */

router.get(
  '/report',
  authenticate,
  hasPermission('issuances:view'),
  async (req: Request, res: Response) => {
    try {
      const personnelId = req.query.personnelId as string | undefined;
      const project = req.query.project as string | undefined;
      const status = req.query.status as 'active' | 'returned' | 'all' | undefined;
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const overdueAfterDays = req.query.overdueAfterDays
        ? parseInt(req.query.overdueAfterDays as string, 10)
        : undefined;
      const documentNumber = req.query.documentNumber as string | undefined;
      const format = (req.query.format as string) === 'csv' ? 'csv' : 'json';
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

      // Validate overdueAfterDays
      if (overdueAfterDays !== undefined && (isNaN(overdueAfterDays) || overdueAfterDays < 0)) {
        return error(res, 'overdueAfterDays must be a non-negative integer', 400);
      }

      // Validate status
      const validStatuses = ['active', 'returned', 'all', undefined];
      if (!validStatuses.includes(status)) {
        return error(res, 'status must be "active", "returned", or "all"', 400);
      }

      const result = await getAccountabilityReport({
        personnelId,
        project,
        status: status || 'all',
        from,
        to,
        overdueAfterDays,
        documentNumber,
        format,
        page,
        limit,
      });

      if (format === 'csv') {
        const csv = result as unknown as string;
        const filename = `accountability-report-${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csv);
      }

      const reportData = result as AccountabilityReportResult;
      return success(res, reportData.data, 200, {
        total: reportData.total,
        page: reportData.page,
        limit: reportData.limit,
        totalPages: Math.ceil(reportData.total / reportData.limit),
      });
    } catch (err: any) {
      console.error('[Accountability Report Error]', err);
      return error(res, err.message || 'Failed to generate accountability report', 500);
    }
  }
);

export default router;