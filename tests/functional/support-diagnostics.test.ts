import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { prisma, type UserFixture } from '../fixtures/assets';
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
  });

  afterAll(async () => {
    await prisma.issueReport.deleteMany({});
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

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

  it('allows admin to list and update issue report status and notes', async () => {
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

    const list = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(list.status).toBe(200);
    expect(list.body.data.some((item: any) => item.id === created.id)).toBe(true);

    const patched = await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ status: 'IN_PROGRESS', adminNotes: 'Assigned for rollout fix.' });

    expect(patched.status).toBe(200);
    expect(patched.body.data.status).toBe('IN_PROGRESS');
    expect(patched.body.data.adminNotes).toBe('Assigned for rollout fix.');
  });

  it('allows staff admin to list and update issue reports', async () => {
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

    const list = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${users.STAFF_ADMIN.accessToken}`);
    expect(list.status).toBe(200);

    const patched = await request(app)
      .patch(`/api/issues/${created.id}`)
      .set('Authorization', `Bearer ${users.STAFF_ADMIN.accessToken}`)
      .send({ status: 'RESOLVED' });
    expect(patched.status).toBe(200);
    expect(patched.body.data.status).toBe('RESOLVED');
  });

  it('blocks guest users from listing all issue reports', async () => {
    const res = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${users.GUEST.accessToken}`);

    expect(res.status).toBe(403);
  });

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
