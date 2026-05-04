import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();


// GET /api/notifications — paginated unread
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { isRead: false },
        include: { asset: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where: { isRead: false } }),
    ]);

    res.json({
      success: true,
      data: notifications,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// PATCH /api/notifications/:id/read — mark as read
router.patch('/:id/read', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const notification = await prisma.notification.findUnique({ where: { id: id as string } });

    if (!notification) {
      res.status(404).json({ success: false, error: { message: 'Notification not found' } });
      return;
    }

    const updated = await prisma.notification.update({
      where: { id: id as string },
      data: { isRead: true },
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

export default router;