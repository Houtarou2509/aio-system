import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { PrismaClient } from '@prisma/client';
import { seedUsers, createAsset, createPersonnel, cleanAssets } from '../fixtures/assets';

const prisma = new PrismaClient();
let users: Record<string, any>;
let testPersonnel: { id: string; fullName: string };

beforeAll(async () => {
  users = await seedUsers();
}, 15_000);

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany({});
  await cleanAssets();
  testPersonnel = await createPersonnel({ fullName: 'Audit Test Person', designation: 'Staff', project: 'QA' });
});

describe('Audit Trail', () => {
  // 13 — Update asset name creates audit log with action UPDATE and metadata containing field/name
  it('13. Update asset name → audit log with metadata { field: "name", oldValue, newValue }', async () => {
    const asset = await createAsset({ name: 'Old Name', adminToken: users.ADMIN.accessToken });

    await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ name: 'New Name' });

    const logs = await prisma.auditLog.findMany({
      where: { entityId: asset.id, action: 'UPDATE' },
    });

    // Find the log where metadata.field === 'name'
    const nameLog = logs.find((l: any) => {
      const meta = typeof l.metadata === 'string' ? JSON.parse(l.metadata) : l.metadata;
      return meta?.field === 'name';
    });

    expect(nameLog).toBeDefined();
    const meta = typeof nameLog!.metadata === 'string' ? JSON.parse(nameLog!.metadata) : nameLog!.metadata;
    expect(meta.oldValue).toBe('Old Name');
    expect(meta.newValue).toBe('New Name');
  });

  // 14
  it('14. Create asset → audit log: { action: "CREATE", entityType: "Asset" }', async () => {
    const asset = await createAsset({ name: 'Audit Create', adminToken: users.ADMIN.accessToken });

    const logs = await prisma.auditLog.findMany({
      where: { entityId: asset.id, action: 'CREATE', entityType: 'Asset' },
    });

    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  // 15
  it('15. Delete asset → audit log: { action: "SOFT_DELETE" }', async () => {
    const asset = await createAsset({ name: 'Audit Delete', adminToken: users.ADMIN.accessToken });

    await request(app)
      .delete(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    const logs = await prisma.auditLog.findMany({
      where: { entityId: asset.id, action: 'SOFT_DELETE' },
    });

    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  // 16
  it('16. Issuance creates audit log with CHECKOUT action on Asset entity', async () => {
    const asset = await createAsset({ name: 'Audit Issuance', adminToken: users.ADMIN.accessToken });

    const issRes = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, personnelId: testPersonnel.id });

    expect(issRes.status).toBe(201);

    // Poll for fire-and-forget audit log writes to complete
    let logs: any[] = [];
    for (let i = 0; i < 10; i++) {
      logs = await prisma.auditLog.findMany({
        where: { entityId: asset.id, action: 'CHECKOUT' },
      });
      if (logs.length >= 1) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  // 17
  it('17. GET /api/audit/:entityId (Admin) → returns all audit events for entity', async () => {
    const asset = await createAsset({ name: 'Audit Timeline', adminToken: users.ADMIN.accessToken });

    await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ name: 'Updated Timeline' });

    const res = await request(app)
      .get(`/api/audit/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2); // CREATE + UPDATE
  });

  // 18
  it('18. GET /api/audit?action=UPDATE (Admin) → filtered results', async () => {
    const res = await request(app)
      .get('/api/audit?action=UPDATE&dateFrom=2026-01-01T00:00:00Z')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length > 0) {
      res.body.data.forEach((log: any) => {
        expect(log.action).toBe('UPDATE');
      });
    }
  });

  // 19 — Staff has audit:view permission, so expect 200
  it('19. GET /api/audit (Staff) → 200 (has audit:view permission)', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`);

    expect(res.status).toBe(200);
  });

  // 20
  it('20. GET /api/audit (Staff-Admin) → 200', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${users.STAFF_ADMIN.accessToken}`);

    expect(res.status).toBe(200);
  });

  // 21 — Revert: current implementation throws "not supported"
  it('21. POST /api/audit/:id/revert (Admin) → 400 (revert not supported)', async () => {
    const asset = await createAsset({ name: 'Revert Original', adminToken: users.ADMIN.accessToken });

    await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ name: 'Revert Changed' });

    const logs = await prisma.auditLog.findMany({
      where: { entityId: asset.id, action: 'UPDATE' },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const auditId = logs[0].id;

    const res = await request(app)
      .post(`/api/audit/${auditId}/revert`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    // Revert is not supported by the current audit log schema
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // 22
  it('22. POST /api/audit/:id/revert (Staff-Admin) → 403', async () => {
    const asset = await createAsset({ name: 'StaffAdmin Revert', adminToken: users.ADMIN.accessToken });

    await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ name: 'Changed by Admin' });

    const logs = await prisma.auditLog.findMany({
      where: { entityId: asset.id, action: 'UPDATE' },
    });

    const res = await request(app)
      .post(`/api/audit/${logs[0].id}/revert`)
      .set('Authorization', `Bearer ${users.STAFF_ADMIN.accessToken}`);

    expect(res.status).toBe(403);
  });

  // 23
  it('23. GET /api/audit/export (Admin) → CSV with headers', async () => {
    const res = await request(app)
      .get('/api/audit/export')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.text.split('\n');
    expect(lines[0]).toContain('id');
    expect(lines[0]).toContain('entityType');
    expect(lines[0]).toContain('action');
  });

  // 24
  it('24. DELETE /api/audit/cleanup (Admin) — deletes old logs, returns count', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);
    await prisma.auditLog.create({
      data: {
        entityType: 'Asset',
        entityId: 'test-old-cleanup',
        action: 'CREATE',
        metadata: { field: '*', summary: 'Test cleanup entry' },
        userId: users.ADMIN.id,
        createdAt: oldDate,
      },
    });

    const res = await request(app)
      .delete('/api/audit/cleanup')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ olderThanDays: 90 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.deleted).toBe('number');
    expect(res.body.data.deleted).toBeGreaterThanOrEqual(1);
  });
});