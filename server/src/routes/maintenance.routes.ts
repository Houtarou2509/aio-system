import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import * as maintenanceService from '../services/maintenance.service';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { success, error } from '../utils/response';
import { createMaintenanceSchema, updateMaintenanceSchema, listMaintenanceQuerySchema } from './maintenance.schema';

const router = Router();
router.use(authenticate);

/* ── Helpers ─────────────────────────────────────────── */

function getClientIp(req: Request): string {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  return Array.isArray(ip) ? ip[0] : String(ip);
}

const FREQUENCY_MONTHS: Record<string, number> = {
  none: 0,
  '3months': 3,
  '6months': 6,
  yearly: 12,
};

/* ═══════════════════════════════════════════════════════
   Maintenance Logs — /api/assets/:assetId/maintenance
   ═══════════════════════════════════════════════════════ */

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
    const log = await maintenanceService.createMaintenanceLog(String(req.params.assetId), data, req.user!.id, getClientIp(req), String(req.headers['user-agent'] || ''));
    return success(res, log, 201);
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

// PUT /api/assets/:assetId/maintenance/:logId
router.put('/:assetId/maintenance/:logId', authorize(['ADMIN', 'STAFF_ADMIN', 'STAFF']), validate(updateMaintenanceSchema), async (req: Request, res: Response) => {
  try {
    const log = await maintenanceService.updateMaintenanceLog(String(req.params.logId), req.body, req.user!.id, getClientIp(req), String(req.headers['user-agent'] || ''));
    return success(res, log, 200);
  } catch (err: any) {
    return error(res, err.message, err.message === 'Maintenance log not found' ? 404 : 400);
  }
});

// DELETE /api/assets/:assetId/maintenance/:logId
router.delete('/:assetId/maintenance/:logId', authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    await maintenanceService.deleteMaintenanceLog(String(req.params.logId), req.user!.id, getClientIp(req), String(req.headers['user-agent'] || ''));
    return success(res, { deleted: true }, 200);
  } catch (err: any) {
    return error(res, err.message, err.message === 'Maintenance log not found' ? 404 : 400);
  }
});

/* ═══════════════════════════════════════════════════════
   Maintenance Schedules — /api/assets/:id/schedules
   ═══════════════════════════════════════════════════════ */

// GET /api/assets/:id/schedules
router.get('/:id/schedules', async (req: Request, res: Response) => {
  try {
    const assetId = req.params.id as string;
    const schedules = await prisma.maintenanceSchedule.findMany({
      where: { assetId },
      orderBy: [
        { status: 'asc' },
        { scheduledDate: 'asc' },
      ],
    });

    const pending = schedules
      .filter(s => s.status === 'pending' || s.status === 'overdue')
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
    const done = schedules
      .filter(s => s.status === 'done')
      .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0));

    return success(res, [...pending, ...done], 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// POST /api/assets/:id/schedules
router.post('/:id/schedules', authorize(['ADMIN', 'STAFF_ADMIN', 'STAFF']), async (req: Request, res: Response) => {
  try {
    const assetId = req.params.id as string;
    const { title, scheduledDate, notes, frequency } = req.body;

    if (!title || !title.trim()) return error(res, 'Title is required', 400);
    if (!scheduledDate) return error(res, 'Scheduled date is required', 400);

    const parsedDate = new Date(scheduledDate);
    if (isNaN(parsedDate.getTime())) return error(res, 'Invalid date format', 400);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsedDate < today) return error(res, 'Date must be today or in the future', 400);

    const freq = frequency || 'none';
    if (!FREQUENCY_MONTHS.hasOwnProperty(freq)) return error(res, 'Invalid frequency value', 400);

    const asset = await prisma.asset.findUnique({ where: { id: assetId, deletedAt: null } });
    if (!asset) return error(res, 'Asset not found', 404);

    const schedule = await prisma.maintenanceSchedule.create({
      data: {
        assetId,
        title: title.trim(),
        scheduledDate: parsedDate,
        notes: notes?.trim() || null,
        frequency: freq,
        status: 'pending',
        createdById: req.user!.id,
      },
    });

    return success(res, schedule, 201);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// PATCH /api/assets/:id/schedules/:scheduleId/done
router.patch('/:id/schedules/:scheduleId/done', authorize(['ADMIN', 'STAFF_ADMIN', 'STAFF']), async (req: Request, res: Response) => {
  try {
    const assetId = req.params.id as string;
    const scheduleId = req.params.scheduleId as string;

    const schedule = await prisma.maintenanceSchedule.findFirst({ where: { id: scheduleId, assetId } });
    if (!schedule) return error(res, 'Schedule not found', 404);

    const now = new Date();

    const updated = await prisma.maintenanceSchedule.update({
      where: { id: scheduleId },
      data: { status: 'done', completedAt: now },
    });

    // Auto-create next recurring schedule if frequency is set
    const freq = schedule.frequency || 'none';
    const months = FREQUENCY_MONTHS[freq] || 0;
    if (months > 0) {
      const nextDate = new Date(schedule.scheduledDate);
      nextDate.setMonth(nextDate.getMonth() + months);
      if (nextDate <= now) nextDate.setMonth(now.getMonth() + months);

      await prisma.maintenanceSchedule.create({
        data: {
          assetId,
          title: schedule.title,
          scheduledDate: nextDate,
          notes: schedule.notes,
          frequency: schedule.frequency,
          status: 'pending',
          createdById: schedule.createdById,
        },
      });
    }

    return success(res, updated, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// DELETE /api/assets/:id/schedules/:scheduleId
router.delete('/:id/schedules/:scheduleId', authorize(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  try {
    const assetId = req.params.id as string;
    const scheduleId = req.params.scheduleId as string;

    const schedule = await prisma.maintenanceSchedule.findFirst({ where: { id: scheduleId, assetId } });
    if (!schedule) return error(res, 'Schedule not found', 404);

    await prisma.maintenanceSchedule.delete({ where: { id: scheduleId } });
    return success(res, { success: true }, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

/* ═══════════════════════════════════════════════════════
   Upcoming Maintenance — /api/maintenance/upcoming
   ═══════════════════════════════════════════════════════ */

// GET /api/maintenance/upcoming
router.get('/upcoming', async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Mark overdue: scheduledDate < today and status still pending
    await prisma.maintenanceSchedule.updateMany({
      where: { status: 'pending', scheduledDate: { lt: today } },
      data: { status: 'overdue' },
    });

    const schedules = await prisma.maintenanceSchedule.findMany({
      where: { status: { in: ['pending', 'overdue'] } },
      orderBy: { scheduledDate: 'asc' },
      take: 10,
      include: { asset: { select: { id: true, name: true } } },
    });

    return success(res, schedules, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

export default router;
