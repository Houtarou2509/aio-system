import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { vi } from 'vitest';

const sendEmailCalls: any[] = [];

vi.mock('../../server/src/services/email.service', () => ({
  sendEmail: vi.fn().mockImplementation(async (options: any) => {
    sendEmailCalls.push(options);
    return true;
  }),
}));

import { app } from '../../server/src/index';
import { prisma, type UserFixture, createAsset } from '../fixtures/assets';
import bcrypt from 'bcryptjs';
import { DEFAULT_PERMISSIONS } from '../../server/src/middleware/permissions';

let users: Record<string, UserFixture>;
let createdUserIds: string[] = [];

describe('Support diagnostics and issue reports', () => {
  beforeAll(async () => {
    const suffix = Date.now();
    users = {};
    for (const def of [
      { username: `support_admin_${suffix}`, email: `support_admin_${suffix}@test.local`, password: 'admin123', role: 'ADMIN' as const },
      { username: `support_staffadmin_${suffix}`, email: `support_staffadmin_${suffix}@test.local`, password: 'sa123', role: 'STAFF_ADMIN' as const },
      { username: `support_staff_${suffix}`, email: `support_staff_${suffix}@test.local`, password: 'staff123', role: 'STAFF' as const },
      { username: `support_guest_${suffix}`, email: `support_guest_${suffix}@test.local`, password: 'guest123', role: 'GUEST' as const },
    ]) {
      const hash = await bcrypt.hash(def.password, 4);
      const perms = JSON.stringify(DEFAULT_PERMISSIONS[def.role] || []);
      const user = await prisma.user.create({
        data: {
          username: def.username,
          email: def.email,
          passwordHash: hash,
          role: def.role,
          permissions: perms,
          twoFactorEnabled: false,
          backupCodes: '[]',
        },
      });
      createdUserIds.push(user.id);
      const login = await request(app).post('/api/auth/login').send({ email: def.email, password: def.password });
      users[def.role] = {
        id: user.id,
        username: def.username,
        email: def.email,
        password: def.password,
        role: def.role,
        accessToken: login.body.data.accessToken,
        refreshToken: login.body.data.refreshToken,
      };
    }
  }, 20_000);

  beforeEach(async () => {
    await prisma.issueReport.deleteMany({});
    await prisma.auditLog.deleteMany({ where: { entityType: 'issue_report' } });
    await prisma.notification.deleteMany({});
    sendEmailCalls.length = 0;
  });

  afterAll(async () => {
    await prisma.issueReport.deleteMany({});
    await prisma.auditLog.deleteMany({ where: { entityType: 'issue_report' } });
    await prisma.notification.deleteMany({});
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  // ── Submission: open to any authenticated user ─────────────────────

  it('allows a normal staff user to submit an issue report with user context captured', async () => {
    const res = await request(app)
      .post('/api/issues')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`)
      .send({
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'Asset modal does not close after saving.',
        stepsToReproduce: 'Open asset, edit, save.',
        userAgent: 'vitest-agent',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.description).toBe('Asset modal does not close after saving.');
    expect(res.body.data.reporterId).toBe(users.STAFF.id);
    expect(res.body.data.reporterEmail).toBe(users.STAFF.email);
    expect(res.body.data.reporterRole).toBe('STAFF');
    expect(res.body.data.status).toBe('OPEN');
  });

  it('allows STAFF_ADMIN to submit an issue report', async () => {
    const res = await request(app)
      .post('/api/issues')
      .set('Authorization', `Bearer ${users.STAFF_ADMIN.accessToken}`)
      .send({
        pageUrl: 'http://localhost:3000/aio-system/issuances',
        issueType: 'DATA_ISSUE',
        description: 'Returned asset still looks active.',
        userAgent: 'vitest-agent',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.reporterRole).toBe('STAFF_ADMIN');
    expect(res.body.data.status).toBe('OPEN');
  });

  it('allows ADMIN to submit an issue report', async () => {
    const res = await request(app)
      .post('/api/issues')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        pageUrl: 'http://localhost:3000/aio-system/dashboard',
        issueType: 'UI_ISSUE',
        description: 'Dashboard chart not rendering on Safari.',
        userAgent: 'vitest-agent',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.reporterRole).toBe('ADMIN');
  });

  it('allows GUEST to submit an issue report', async () => {
    const res = await request(app)
      .post('/api/issues')
      .set('Authorization', `Bearer ${users.GUEST.accessToken}`)
      .send({
        pageUrl: 'http://localhost:3000/aio-system/assets/abc123',
        issueType: 'ACCESS_PERMISSION',
        description: 'Cannot view asset details as guest.',
        userAgent: 'vitest-agent',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.reporterRole).toBe('GUEST');
  });

  // ── Listing: ADMIN-only ────────────────────────────────────────────

  it('allows ADMIN to list issue reports', async () => {
    const list = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);
  });

  it('blocks STAFF_ADMIN from listing issue reports', async () => {
    const res = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${users.STAFF_ADMIN.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('blocks STAFF from listing issue reports', async () => {
    const res = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('blocks GUEST from listing issue reports', async () => {
    const res = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${users.GUEST.accessToken}`);
    expect(res.status).toBe(403);
  });

  // ── Summary: ADMIN-only ────────────────────────────────────────────

  it('allows ADMIN to get issue summary counts', async () => {
    // Create a couple of issues with different statuses
    await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF.id,
        reporterName: users.STAFF.username,
        reporterEmail: users.STAFF.email,
        reporterRole: 'STAFF',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'Open bug report.',
        userAgent: 'vitest-agent',
        status: 'OPEN',
      },
    });
    await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF.id,
        reporterName: users.STAFF.username,
        reporterEmail: users.STAFF.email,
        reporterRole: 'STAFF',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'DATA_ISSUE',
        description: 'In progress data issue.',
        userAgent: 'vitest-agent',
        status: 'IN_PROGRESS',
      },
    });

    const res = await request(app)
      .get('/api/issues/summary')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data ?? res.body;
    expect(data.OPEN).toBe(1);
    expect(data.IN_PROGRESS).toBe(1);
    expect(data.RESOLVED).toBe(0);
    expect(data.WONT_FIX).toBe(0);
  });

  it('blocks STAFF_ADMIN from getting issue summary', async () => {
    const res = await request(app)
      .get('/api/issues/summary')
      .set('Authorization', `Bearer ${users.STAFF_ADMIN.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('blocks STAFF from getting issue summary', async () => {
    const res = await request(app)
      .get('/api/issues/summary')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`);
    expect(res.status).toBe(403);
  });

  // ── Update: ADMIN-only ─────────────────────────────────────────────

  it('allows ADMIN to update issue report status and notes', async () => {
    const created = await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF.id,
        reporterName: users.STAFF.username,
        reporterEmail: users.STAFF.email,
        reporterRole: 'STAFF',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'UI_ISSUE',
        description: 'Button label overlaps on mobile.',
        userAgent: 'vitest-agent',
      },
    });

    const patched = await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ status: 'IN_PROGRESS', adminNotes: 'Assigned for rollout fix.' });

    expect(patched.status).toBe(200);
    expect(patched.body.data.status).toBe('IN_PROGRESS');
    expect(patched.body.data.adminNotes).toBe('Assigned for rollout fix.');
  });

  it('blocks STAFF_ADMIN from updating issue reports', async () => {
    const created = await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF.id,
        reporterName: users.STAFF.username,
        reporterEmail: users.STAFF.email,
        reporterRole: 'STAFF',
        pageUrl: 'http://localhost:3000/aio-system/issuances',
        issueType: 'DATA_ISSUE',
        description: 'Returned asset still looks active.',
        userAgent: 'vitest-agent',
      },
    });

    const res = await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.STAFF_ADMIN.accessToken}`)
      .send({ status: 'RESOLVED' });
    expect(res.status).toBe(403);
  });

  it('blocks STAFF from updating issue reports', async () => {
    const created = await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF.id,
        reporterName: users.STAFF.username,
        reporterEmail: users.STAFF.email,
        reporterRole: 'STAFF',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'Some bug.',
        userAgent: 'vitest-agent',
      },
    });

    const res = await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`)
      .send({ status: 'WONT_FIX' });
    expect(res.status).toBe(403);
  });

  it('blocks GUEST from updating issue reports', async () => {
    const created = await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF.id,
        reporterName: users.STAFF.username,
        reporterEmail: users.STAFF.email,
        reporterRole: 'STAFF',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'Some bug.',
        userAgent: 'vitest-agent',
      },
    });

    const res = await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.GUEST.accessToken}`)
      .send({ status: 'RESOLVED' });
    expect(res.status).toBe(403);
  });

  // ── Email alerting: creation succeeds even if email fails ───────────

  it('issue creation still succeeds if email sending is skipped (no SMTP)', async () => {
    // No SMTP configured in test env, so email will be skipped
    const res = await request(app)
      .post('/api/issues')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`)
      .send({
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'Testing email fallback.',
        userAgent: 'vitest-agent',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.description).toBe('Testing email fallback.');
    expect(res.body.data.status).toBe('OPEN');
  });

  // ── Audit logging ──────────────────────────────────────────────────

  it('creates an audit log when an issue report is created', async () => {
    await request(app)
      .post('/api/issues')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`)
      .send({
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'Audit log creation test.',
        userAgent: 'vitest-agent',
      });

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'issue_report', action: 'issue_report.created' },
    });

    expect(logs.length).toBe(1);
    expect(logs[0].userId).toBe(users.STAFF.id);
    const meta = logs[0].metadata as any;
    expect(meta.issueType).toBe('BUG');
    expect(meta.reporterRole).toBe('STAFF');
  });

  it('creates an audit log when ADMIN changes issue status', async () => {
    const created = await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF.id,
        reporterName: users.STAFF.username,
        reporterEmail: users.STAFF.email,
        reporterRole: 'STAFF',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'UI_ISSUE',
        description: 'Audit status change test.',
        userAgent: 'vitest-agent',
        status: 'OPEN',
      },
    });

    await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ status: 'IN_PROGRESS' });

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'issue_report', action: 'issue_report.status_updated' },
    });

    expect(logs.length).toBe(1);
    expect(logs[0].userId).toBe(users.ADMIN.id);
    const meta = logs[0].metadata as any;
    expect(meta.previousStatus).toBe('OPEN');
    expect(meta.newStatus).toBe('IN_PROGRESS');
  });

  it('creates an audit log when ADMIN updates notes', async () => {
    const created = await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF.id,
        reporterName: users.STAFF.username,
        reporterEmail: users.STAFF.email,
        reporterRole: 'STAFF',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'Audit notes test.',
        userAgent: 'vitest-agent',
      },
    });

    await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ adminNotes: 'Looking into this.' });

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'issue_report', action: 'issue_report.notes_updated' },
    });

    expect(logs.length).toBe(1);
    const meta = logs[0].metadata as any;
    expect(meta.previousHadNotes).toBe(false);
    expect(meta.newHasNotes).toBe(true);
  });

  it('does not create a status audit log when status is unchanged', async () => {
    const created = await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF.id,
        reporterName: users.STAFF.username,
        reporterEmail: users.STAFF.email,
        reporterRole: 'STAFF',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'No status change test.',
        userAgent: 'vitest-agent',
        status: 'OPEN',
      },
    });

    // Update with same status — should NOT create a status_updated audit log
    await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ status: 'OPEN' });

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'issue_report', action: 'issue_report.status_updated' },
    });

    expect(logs.length).toBe(0);
  });

  it('does not create a notes audit log when adminNotes is unchanged after trimming', async () => {
    const created = await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF.id,
        reporterName: users.STAFF.username,
        reporterEmail: users.STAFF.email,
        reporterRole: 'STAFF',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'No notes change test.',
        userAgent: 'vitest-agent',
        adminNotes: 'Existing note',
        status: 'OPEN',
      },
    });

    await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ adminNotes: 'Existing note' });

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'issue_report', action: 'issue_report.notes_updated' },
    });

    expect(logs.length).toBe(0);
  });

  // ── Email alerting recipients and content safety ────────────────────

  it('sends issue alert only to active ADMIN users, not STAFF_ADMIN', async () => {
    // Create an inactive admin to ensure only active ADMIN is included
    const inactiveAdminSuffix = Date.now();
    const inactiveAdmin = await prisma.user.create({
      data: {
        username: `support_inactive_admin_${inactiveAdminSuffix}`,
        email: `support_inactive_admin_${inactiveAdminSuffix}@test.local`,
        passwordHash: await bcrypt.hash('inactive123', 4),
        role: 'ADMIN',
        status: 'inactive',
        permissions: JSON.stringify(DEFAULT_PERMISSIONS.ADMIN || []),
        twoFactorEnabled: false,
        backupCodes: '[]',
      },
    });
    createdUserIds.push(inactiveAdmin.id);

    const res = await request(app)
      .post('/api/issues')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`)
      .send({
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'Recipient filter test.',
        userAgent: 'vitest-agent',
      });

    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(sendEmailCalls.length).toBe(1));
    const callArgs = sendEmailCalls[0];
    expect(callArgs.to).toContain(users.ADMIN.email);
    expect(callArgs.to).not.toContain(users.STAFF_ADMIN.email);
    expect(callArgs.to).not.toContain(users.STAFF.email);
    expect(callArgs.to).not.toContain(users.GUEST.email);
    expect(callArgs.to).not.toContain(inactiveAdmin.email);
  });

  it('escapes HTML and script-like content in issue alert email HTML', async () => {
    const xssDescription = '<script>alert("xss")</script>';
    const xssSteps = '<img src=x onerror=alert(1)>';
    const xssPageUrl = 'http://localhost:3000/aio-system/assets?q=<script>';

    const res = await request(app)
      .post('/api/issues')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`)
      .send({
        pageUrl: xssPageUrl,
        issueType: 'BUG',
        description: xssDescription,
        stepsToReproduce: xssSteps,
        userAgent: 'vitest-agent',
      });

    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(sendEmailCalls.length).toBe(1));
    const callArgs = sendEmailCalls[0];

    // HTML must contain escaped versions, not raw tags
    expect(callArgs.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(callArgs.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(callArgs.html).toContain('q=&lt;script&gt;');
    expect(callArgs.html).not.toContain('<script>alert');
    expect(callArgs.html).not.toContain('<img src=x onerror=alert(1)>');

    // Plain text should keep the raw unsafe content (safe string conversion only)
    expect(callArgs.text).toContain(xssDescription);
    expect(callArgs.text).toContain(xssSteps);
  });

  it('creates ISSUE_REPORT_RESOLVED notification when STAFF_ADMIN submits and ADMIN resolves', async () => {
    const created = await request(app)
      .post('/api/issues')
      .set('Authorization', `Bearer ${users.STAFF_ADMIN.accessToken}`)
      .send({
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'Exact reporter flow test.',
        userAgent: 'vitest-agent',
      });
    expect(created.status).toBe(201);
    const issueId = created.body.data.id;

    // Issue appears in ADMIN list
    const adminList = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.some((i: any) => i.id === issueId)).toBe(true);

    // ADMIN resolves with response
    const patched = await request(app)
      .patch(`/api/issues/${issueId}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ status: 'RESOLVED', adminNotes: 'Done' });
    expect(patched.status).toBe(200);

    // DB notification exists
    const dbNotif = await prisma.notification.findFirst({
      where: {
        recipientUserId: users.STAFF_ADMIN.id,
        issueReportId: issueId,
        type: 'ISSUE_REPORT_RESOLVED',
        isRead: false,
      },
    });
    expect(dbNotif).toBeTruthy();
    expect(dbNotif?.message).toContain('resolved');
    expect(dbNotif?.message).toContain('Done');

    // Returned to reporter via API
    const reporterList = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${users.STAFF_ADMIN.accessToken}`);
    expect(reporterList.status).toBe(200);
    const reporterData = reporterList.body.data ?? [];
    expect(reporterData.some((n: any) =>
      n.type === 'ISSUE_REPORT_RESOLVED' &&
      n.issueReportId === issueId &&
      n.message.includes('Done'),
    )).toBe(true);

    // Not returned to unrelated users
    const adminNotifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);
    expect(adminNotifications.status).toBe(200);
    const adminData = adminNotifications.body.data ?? [];
    expect(adminData.some((n: any) =>
      n.type === 'ISSUE_REPORT_RESOLVED' && n.issueReportId === issueId,
    )).toBe(false);
  });

  it('falls back to reporterEmail lookup when reporterId is null', async () => {
    const created = await prisma.issueReport.create({
      data: {
        reporterId: null,
        reporterName: users.STAFF_ADMIN.username,
        reporterEmail: users.STAFF_ADMIN.email,
        reporterRole: 'STAFF_ADMIN',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'Fallback reporterId test.',
        userAgent: 'vitest-agent',
        status: 'OPEN',
      },
    });

    await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ status: 'RESOLVED' });

    const dbNotif = await prisma.notification.findFirst({
      where: {
        recipientUserId: users.STAFF_ADMIN.id,
        issueReportId: created.id,
        type: 'ISSUE_REPORT_RESOLVED',
      },
    });
    expect(dbNotif).toBeTruthy();
  });

  it('dashboard upcoming maintenance endpoint returns schedules with valid asset relation', async () => {
    // The production backend enforces a valid assetId FK with onDelete Cascade,
    // so a schedule cannot exist with a null asset unless the asset relation was skipped.
    // The real crash path is in the frontend (DashboardWidgets / DashboardPage) rendering
    // when asset is null. Frontend unit tests in client/src/__tests__/ cover that path.
    // This backend-only test ensures the endpoint still returns a valid schedule with an asset
    // and that the service query does not throw.
    const asset = await createAsset({ adminToken: users.ADMIN.accessToken });

    const schedule = await prisma.maintenanceSchedule.create({
      data: {
        assetId: asset.id,
        createdById: users.ADMIN.id,
        title: 'Orphan check',
        scheduledDate: new Date(),
        status: 'overdue',
        frequency: 'monthly',
      },
    });

    const res = await request(app)
      .get('/api/maintenance/upcoming')
      .set('Authorization', `Bearer ${users.STAFF_ADMIN.accessToken}`);
    expect(res.status).toBe(200);
    const returned = res.body.data ?? [];
    const match = returned.find((s: any) => s.id === schedule.id);
    expect(match).toBeTruthy();
    expect(match.asset).toBeTruthy();
    expect(match.asset.name).toBeTruthy();
  });

  it('renders issue report notification asset title as Issue Report', async () => {
    const issue = await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF_ADMIN.id,
        reporterName: users.STAFF_ADMIN.username,
        reporterEmail: users.STAFF_ADMIN.email,
        reporterRole: 'STAFF_ADMIN',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'Render test.',
        userAgent: 'vitest-agent',
        status: 'RESOLVED',
      },
    });

    const created = await prisma.notification.create({
      data: {
        type: 'ISSUE_REPORT_RESOLVED' as any,
        message: 'Your issue report has been resolved. Admin note: Fixed.',
        issueReportId: issue.id,
        recipientUserId: users.STAFF_ADMIN.id,
        assetId: null,
        isRead: false,
      },
    });

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${users.STAFF_ADMIN.accessToken}`);
    expect(res.status).toBe(200);
    const notif = (res.body.data ?? []).find((n: any) => n.issueReportId === issue.id);
    expect(notif).toBeTruthy();
    expect(notif.asset).toBeNull();
  });

  // ── Reporter notifications on closure ──────────────────────────────

  it('notifies the original STAFF_ADMIN reporter when ADMIN marks issue RESOLVED', async () => {
    const created = await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF_ADMIN.id,
        reporterName: users.STAFF_ADMIN.username,
        reporterEmail: users.STAFF_ADMIN.email,
        reporterRole: 'STAFF_ADMIN',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'STAFF_ADMIN submitted issue.',
        userAgent: 'vitest-agent',
        status: 'OPEN',
      },
    });

    const patched = await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ status: 'RESOLVED', adminNotes: 'Done!' });

    expect(patched.status).toBe(200);

    const reporterNotifs = await prisma.notification.findMany({
      where: { recipientUserId: users.STAFF_ADMIN.id, issueReportId: created.id },
    });
    expect(reporterNotifs.length).toBe(1);
    expect(reporterNotifs[0].type).toBe('ISSUE_REPORT_RESOLVED');
    expect(reporterNotifs[0].message).toContain(`#${created.id.slice(0, 8).toUpperCase()}`);
    expect(reporterNotifs[0].message).toContain('resolved');
    expect(reporterNotifs[0].message).toContain('Admin note: Done!');
    expect(reporterNotifs[0].isRead).toBe(false);

    // Other users should not receive this reporter-targeted notification
    const otherNotifs = await prisma.notification.findMany({
      where: { issueReportId: created.id, NOT: { recipientUserId: users.STAFF_ADMIN.id } },
    });
    expect(otherNotifs.length).toBe(0);
  });

  it('rejects adminNotes updates after an issue is already resolved', async () => {
    const created = await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF_ADMIN.id,
        reporterName: users.STAFF_ADMIN.username,
        reporterEmail: users.STAFF_ADMIN.email,
        reporterRole: 'STAFF_ADMIN',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'Separate patch test.',
        userAgent: 'vitest-agent',
        status: 'OPEN',
      },
    });

    const resolved = await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ status: 'RESOLVED' });
    expect(resolved.status).toBe(200);

    const rejected = await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ adminNotes: 'Done!' });
    expect(rejected.status).toBe(409);

    const reporterNotifs = await prisma.notification.findMany({
      where: { recipientUserId: users.STAFF_ADMIN.id, issueReportId: created.id },
    });
    expect(reporterNotifs.length).toBe(1);
    expect(reporterNotifs[0].type).toBe('ISSUE_REPORT_RESOLVED');
    expect(reporterNotifs[0].message).toContain('resolved');
    expect(reporterNotifs[0].message).not.toContain('Done!');
    expect(reporterNotifs[0].isRead).toBe(false);

    const issue = await prisma.issueReport.findUnique({ where: { id: created.id } });
    expect(issue?.adminNotes).toBeNull();
  });

  it('does not update a read resolved notification when locked adminNotes edit is rejected', async () => {
    const created = await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF_ADMIN.id,
        reporterName: users.STAFF_ADMIN.username,
        reporterEmail: users.STAFF_ADMIN.email,
        reporterRole: 'STAFF_ADMIN',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'Read update test.',
        userAgent: 'vitest-agent',
        status: 'RESOLVED',
        adminNotes: 'Initial note.',
      },
    });

    const existing = await prisma.notification.create({
      data: {
        type: 'ISSUE_REPORT_RESOLVED',
        message: `Your issue report #${created.id.slice(0, 8).toUpperCase()} has been resolved. Admin note: Initial note.`,
        issueReportId: created.id,
        recipientUserId: users.STAFF_ADMIN.id,
        isRead: true,
      },
    });

    const rejected = await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ adminNotes: 'Updated note.' });
    expect(rejected.status).toBe(409);

    const notif = await prisma.notification.findUnique({ where: { id: existing.id } });
    expect(notif?.isRead).toBe(true);
    expect(notif?.message).toContain('Initial note.');
    expect(notif?.message).not.toContain('Updated note.');
  });

  it('does not duplicate RESOLVED notification when status is unchanged', async () => {
    const created = await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF_ADMIN.id,
        reporterName: users.STAFF_ADMIN.username,
        reporterEmail: users.STAFF_ADMIN.email,
        reporterRole: 'STAFF_ADMIN',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'BUG',
        description: 'Duplicate resolved test.',
        userAgent: 'vitest-agent',
        status: 'RESOLVED',
      },
    });

    // Re-save RESOLVED without changing status
    await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ status: 'RESOLVED' });

    const reporterNotifs = await prisma.notification.findMany({
      where: { recipientUserId: users.STAFF_ADMIN.id, issueReportId: created.id },
    });
    expect(reporterNotifs.length).toBe(0);
  });

  it('notifies the reporter when ADMIN marks issue WONT_FIX', async () => {
    const created = await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF_ADMIN.id,
        reporterName: users.STAFF_ADMIN.username,
        reporterEmail: users.STAFF_ADMIN.email,
        reporterRole: 'STAFF_ADMIN',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'DATA_ISSUE',
        description: 'WONT_FIX notification test.',
        userAgent: 'vitest-agent',
        status: 'OPEN',
      },
    });

    await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ status: 'WONT_FIX', adminNotes: 'Out of scope.' });

    const reporterNotifs = await prisma.notification.findMany({
      where: { recipientUserId: users.STAFF_ADMIN.id, issueReportId: created.id },
    });
    expect(reporterNotifs.length).toBe(1);
    expect(reporterNotifs[0].type).toBe('ISSUE_REPORT_CLOSED');
    expect(reporterNotifs[0].message).toContain("Won't Fix");
    expect(reporterNotifs[0].message).toContain('Out of scope.');
  });

  it('returns ISSUE_REPORT_RESOLVED notification in reporter notification list and excludes others', async () => {
    const created = await prisma.issueReport.create({
      data: {
        reporterId: users.STAFF.id,
        reporterName: users.STAFF.username,
        reporterEmail: users.STAFF.email,
        reporterRole: 'STAFF',
        pageUrl: 'http://localhost:3000/aio-system/assets',
        issueType: 'UI_ISSUE',
        description: 'Notification list test.',
        userAgent: 'vitest-agent',
        status: 'OPEN',
      },
    });

    await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ status: 'RESOLVED' });

    const staffList = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`);
    expect(staffList.status).toBe(200);
    const staffData = staffList.body.data ?? [];
    expect(staffData.some((n: any) => n.type === 'ISSUE_REPORT_RESOLVED' && n.issueReportId === created.id)).toBe(true);

    const adminList = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);
    expect(adminList.status).toBe(200);
    const adminData = adminList.body.data ?? [];
    expect(adminData.some((n: any) => n.type === 'ISSUE_REPORT_RESOLVED' && n.issueReportId === created.id)).toBe(false);

    const staffAdminList = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${users.STAFF_ADMIN.accessToken}`);
    expect(staffAdminList.status).toBe(200);
    const staffAdminData = staffAdminList.body.data ?? [];
    expect(staffAdminData.some((n: any) => n.type === 'ISSUE_REPORT_RESOLVED' && n.issueReportId === created.id)).toBe(false);
  });

  // ── System health (existing tests, preserved) ───────────────────────

  it('allows admin to read safe system health details', async () => {
    const res = await request(app)
      .get('/api/system/health-details')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      overallStatus: expect.any(String),
      database: { status: 'healthy', message: expect.any(String) },
      server: {
        environment: expect.any(String),
        time: expect.any(String),
      },
    });
    expect(JSON.stringify(res.body.data)).not.toMatch(/DATABASE_URL|JWT_SECRET|password/i);
  });

  it('blocks staff and guest users from reading system health details', async () => {
    const staff = await request(app)
      .get('/api/system/health-details')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`);
    const guest = await request(app)
      .get('/api/system/health-details')
      .set('Authorization', `Bearer ${users.GUEST.accessToken}`);
    expect(staff.status).toBe(403);
    expect(guest.status).toBe(403);
  });
});
