import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();


// GET /api/notifications — paginated (unread by default, all when ?all=true)
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const showAll = req.query.all === 'true';

    const where = {
      AND: [
        showAll ? {} : { isRead: false },
        {
          OR: [
            { recipientUserId: userId },
            { recipientUserId: null }, // legacy/global notifications
          ],
        },
      ],
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: {
          asset: { select: { id: true, name: true } },
          issueReport: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
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

// PATCH /api/notifications/read-all — mark all notifications as read
router.patch('/read-all', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await prisma.notification.updateMany({
      where: {
        isRead: false,
        OR: [
          { recipientUserId: userId },
          { recipientUserId: null },
        ],
      },
      data: { isRead: true },
    });
    res.json({ success: true, data: { marked: result.count } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// PATCH /api/notifications/:id/read — mark single notification as read
router.patch('/:id/read', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const notification = await prisma.notification.findUnique({ where: { id: id as string } });

    if (!notification) {
      res.status(404).json({ success: false, error: { message: 'Notification not found' } });
      return;
    }

    // Only the intended recipient can mark a targeted notification read.
    // Legacy/global notifications (recipientUserId null) can be marked read by any authenticated user.
    if (notification.recipientUserId && notification.recipientUserId !== userId) {
      res.status(403).json({ success: false, error: { message: 'Forbidden' } });
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
