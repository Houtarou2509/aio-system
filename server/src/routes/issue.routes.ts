import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { success, error } from '../utils/response';
import { createIssueReportSchema, listIssueReportsQuerySchema, updateIssueReportSchema } from './issue.schema';
import { AUDIT_ACTIONS, logAudit } from '../services/auditLog.service';
import { sendEmail } from '../services/email.service';
import { upsertIssueReportNotification } from '../services/notification.service';

const router = Router();

router.use(authenticate);

function escapeHtml(input: unknown): string {
  const s = input === null || input === undefined ? '' : String(input);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function resolveReporterId(issue: {
  reporterId: string | null;
  reporterEmail: string | null;
}): Promise<string | null> {
  if (issue.reporterId) return issue.reporterId;
  if (!issue.reporterEmail) return null;

  const user = await prisma.user.findUnique({
    where: { email: issue.reporterEmail },
    select: { id: true },
  });
  return user?.id ?? null;
}

function isTerminalIssueStatus(status: string): boolean {
  return status === 'RESOLVED' || status === 'WONT_FIX';
}

// POST /api/issues — any authenticated user may submit
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

    // Audit log — creation (awaited but non-blocking because logAudit catches internally)
    await logAudit({
      userId: req.user!.id,
      action: AUDIT_ACTIONS.ISSUE_REPORT_CREATED,
      entityType: 'issue_report',
      entityId: issue.id,
      metadata: {
        issueId: issue.id,
        reporterRole: reporter?.role || req.user!.role || null,
        reporterEmail: reporter?.email || null,
        issueType: issue.issueType,
        status: issue.status,
      },
    });

    // Email alert to active ADMIN users (non-blocking, must not fail submission)
    (async () => {
      try {
        const admins = await prisma.user.findMany({
          where: { role: 'ADMIN', status: 'active' },
          select: { email: true },
        });
        const recipients = admins.map(u => u.email).filter(Boolean) as string[];
        if (recipients.length === 0) return;

        const typeLabels: Record<string, string> = {
          BUG: 'Bug',
          DATA_ISSUE: 'Data Issue',
          UI_ISSUE: 'UI Issue',
          ACCESS_PERMISSION: 'Access / Permission',
          OTHER: 'Other',
        };
        const issueTypeLabel = typeLabels[issue.issueType] || issue.issueType;
        const shortId = issue.id.length > 8 ? issue.id.slice(0, 8).toUpperCase() : issue.id.toUpperCase();

        await sendEmail({
          to: recipients,
          subject: `[AIO] New Issue Report #${shortId}: ${issueTypeLabel}`,
          text: [
            `A new issue report has been submitted.`,
            ``,
            `Report ID: ${issue.id}`,
            `Reporter: ${issue.reporterName || 'Unknown'} (${issue.reporterEmail || 'No email'}, ${issue.reporterRole || 'Unknown role'})`,
            `Type: ${issueTypeLabel}`,
            `Page: ${issue.pageUrl}`,
            `Description: ${issue.description}`,
            issue.stepsToReproduce ? `Steps to reproduce: ${issue.stepsToReproduce}` : '',
          ].filter(Boolean).join('\n'),
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #012061; padding: 20px; text-align: center;">
                <h2 style="color: #fff; margin: 0;">New Issue Report</h2>
              </div>
              <div style="padding: 24px; background: #fff; border: 1px solid #e2e8f0;">
                <p style="color: #334155; font-size: 15px; line-height: 1.6;">
                  <strong>Report ID:</strong> ${escapeHtml(issue.id)}<br>
                  <strong>Reporter:</strong> ${escapeHtml(issue.reporterName || 'Unknown')} (${escapeHtml(issue.reporterEmail || 'No email')}, ${escapeHtml(issue.reporterRole || 'Unknown role')})<br>
                  <strong>Type:</strong> ${escapeHtml(issueTypeLabel)}<br>
                  <strong>Page:</strong> ${escapeHtml(issue.pageUrl)}<br>
                  <strong>Description:</strong> ${escapeHtml(issue.description)}
                  ${issue.stepsToReproduce ? `<br><strong>Steps:</strong> ${escapeHtml(issue.stepsToReproduce)}` : ''}
                </p>
              </div>
              <div style="padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
                Sent from AIO-System
              </div>
            </div>
          `,
        });
      } catch {
        // Email failure must not affect issue submission
      }
    })();

    return success(res, issue, 201);
  } catch (err: any) {
    return error(res, err.message || 'Failed to submit issue report', 500);
  }
});

// GET /api/issues/summary — ADMIN only
router.get('/summary', authorize(['ADMIN']), async (_req: Request, res: Response) => {
  try {
    const counts = await prisma.issueReport.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const result: Record<string, number> = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, WONT_FIX: 0 };
    for (const row of counts) {
      result[row.status] = row._count.status;
    }

    return success(res, result, 200);
  } catch (err: any) {
    return error(res, err.message || 'Failed to get issue summary', 500);
  }
});

// GET /api/issues — ADMIN only
router.get('/', authorize(['ADMIN']), async (req: Request, res: Response) => {
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

// PATCH /api/issues/:id — ADMIN only
router.patch('/:id', authorize(['ADMIN']), validate(updateIssueReportSchema), async (req: Request, res: Response) => {
  try {
    const issueId = String(req.params.id);

    // Fetch previous state for audit metadata
    const previous = await prisma.issueReport.findUnique({ where: { id: issueId } });
    if (!previous) return error(res, 'Issue report not found', 404);

    if (req.body.adminNotes !== undefined && isTerminalIssueStatus(previous.status)) {
      const normalizedPrevious = (previous.adminNotes ?? '').trim();
      const normalizedNew = (req.body.adminNotes ?? '').trim();
      if (normalizedPrevious !== normalizedNew) {
        return error(res, 'Resolution note is locked after an issue is resolved or closed. Reopen the issue before editing the response.', 409);
      }
    }

    const issue = await prisma.issueReport.update({
      where: { id: issueId },
      data: {
        ...(req.body.status !== undefined ? { status: req.body.status } : {}),
        ...(req.body.adminNotes !== undefined ? { adminNotes: req.body.adminNotes || null } : {}),
      },
    });

    // Audit log — status change
    if (req.body.status !== undefined && req.body.status !== previous.status) {
      await logAudit({
        userId: req.user!.id,
        action: AUDIT_ACTIONS.ISSUE_REPORT_STATUS_UPDATED,
        entityType: 'issue_report',
        entityId: issueId,
        metadata: {
          issueId,
          previousStatus: previous.status,
          newStatus: req.body.status,
          reporterRole: previous.reporterRole,
          reporterEmail: previous.reporterEmail,
        },
      });

      // Notify original reporter when issue is resolved or closed as won't fix
      if (req.body.status === 'RESOLVED' || req.body.status === 'WONT_FIX') {
        const targetReporterId = await resolveReporterId(previous);
        if (targetReporterId) {
          await upsertIssueReportNotification({
            issueReportId: issueId,
            reporterId: targetReporterId,
            status: req.body.status,
            adminNotes: issue.adminNotes,
          });
        }
      }
    }

    // Audit log — notes change (only when normalized value actually changes)
    if (req.body.adminNotes !== undefined) {
      const normalizedPrevious = (previous.adminNotes ?? '').trim();
      const normalizedNew = (req.body.adminNotes ?? '').trim();
      if (normalizedPrevious !== normalizedNew) {
        await logAudit({
          userId: req.user!.id,
          action: AUDIT_ACTIONS.ISSUE_REPORT_NOTES_UPDATED,
          entityType: 'issue_report',
          entityId: issueId,
          metadata: {
            issueId,
            previousHadNotes: normalizedPrevious.length > 0,
            newHasNotes: normalizedNew.length > 0,
            reporterRole: previous.reporterRole,
            reporterEmail: previous.reporterEmail,
          },
        });
      }
    }

    return success(res, issue, 200);
  } catch (err: any) {
    if (err.code === 'P2025') return error(res, 'Issue report not found', 404);
    return error(res, err.message || 'Failed to update issue report', 400);
  }
});

export default router;
