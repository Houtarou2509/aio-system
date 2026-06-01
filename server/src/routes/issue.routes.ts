import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { success, error } from '../utils/response';
import { createIssueReportSchema, listIssueReportsQuerySchema, updateIssueReportSchema } from './issue.schema';

const router = Router();

router.use(authenticate);

router.post('/', validate(createIssueReportSchema), async (req: Request, res: Response) => {
  try {
    const reporter = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, username: true, fullName: true, email: true, role: true },
    });

    const issue = await prisma.issueReport.create({
      data: {
        reporterId: reporter?.id ?? req.user!.id,
        reporterName: reporter?.fullName || reporter?.username || null,
        reporterEmail: reporter?.email || null,
        reporterRole: reporter?.role || req.user!.role || null,
        pageUrl: req.body.pageUrl,
        issueType: req.body.issueType,
        description: req.body.description,
        stepsToReproduce: req.body.stepsToReproduce || null,
        screenshotUrl: req.body.screenshotUrl || null,
        userAgent: req.body.userAgent || String(req.headers['user-agent'] || ''),
      },
    });

    return success(res, issue, 201);
  } catch (err: any) {
    return error(res, err.message || 'Failed to submit issue report', 500);
  }
});

router.get('/', authorize(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  try {
    const query = listIssueReportsQuerySchema.parse(req.query);
    const where = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([
      prisma.issueReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.issueReport.count({ where }),
    ]);

    return success(res, items, 200, {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    });
  } catch (err: any) {
    return error(res, err.message || 'Failed to list issue reports', 400);
  }
});

router.patch('/:id', authorize(['ADMIN', 'STAFF_ADMIN']), validate(updateIssueReportSchema), async (req: Request, res: Response) => {
  try {
    const issue = await prisma.issueReport.update({
      where: { id: String(req.params.id) },
      data: {
        ...(req.body.status !== undefined ? { status: req.body.status } : {}),
        ...(req.body.adminNotes !== undefined ? { adminNotes: req.body.adminNotes || null } : {}),
      },
    });
    return success(res, issue, 200);
  } catch (err: any) {
    if (err.code === 'P2025') return error(res, 'Issue report not found', 404);
    return error(res, err.message || 'Failed to update issue report', 400);
  }
});

export default router;
