import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { success, error } from '../utils/response';

const router = Router();
const prisma = new PrismaClient();

// GET /api/maintenance/upcoming
router.get('/upcoming', authenticate, async (_req: Request, res: Response) => {
  try {
    // Mark overdue: scheduledDate < today and status still pending
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.maintenanceSchedule.updateMany({
      where: {
        status: 'pending',
        scheduledDate: { lt: today },
      },
      data: { status: 'overdue' },
    });

    const schedules = await prisma.maintenanceSchedule.findMany({
      where: {
        status: { in: ['pending', 'overdue'] },
      },
      orderBy: { scheduledDate: 'asc' },
      take: 10,
      include: {
        asset: {
          select: { id: true, name: true },
        },
      },
    });

    return success(res, schedules, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

export default router;