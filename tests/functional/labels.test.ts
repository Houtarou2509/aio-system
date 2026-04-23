import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { PrismaClient } from '@prisma/client';
import { seedUsers, createAsset, cleanAssets } from '../fixtures/assets';

const prisma = new PrismaClient();
let users: Record<string, any>;

beforeAll(async () => {
  users = await seedUsers();
}, 15_000);

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await cleanAssets();
});

describe('Label Generation', () => {
  // 1
  it('1. POST /api/labels/generate (Admin) — QR label → 200, PDF', async () => {
    const asset = await createAsset({ name: 'Label Test', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, format: 'DYMO_99017', barcodeType: 'QR' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.length).toBeGreaterThan(0);
  });

  // 2
  it('2. POST /api/labels/generate (Staff) — 200 (Staff can print)', async () => {
    const asset = await createAsset({ name: 'Staff Label', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`)
      .send({ assetId: asset.id, format: 'DYMO_99012', barcodeType: 'QR' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  // 3
  it('3. POST /api/labels/generate (Guest) — 403', async () => {
    const asset = await createAsset({ name: 'Guest Label', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate')
      .set('Authorization', `Bearer ${users.GUEST.accessToken}`)
      .send({ assetId: asset.id, format: 'DYMO_99012', barcodeType: 'QR' });

    expect(res.status).toBe(403);
  });

  // 4
  it('4. POST /api/labels/generate — invalid format → 422', async () => {
    const asset = await createAsset({ name: 'Invalid Format', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, format: 'INVALID_FORMAT', barcodeType: 'QR' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  // 5
  it('5. POST /api/labels/batch (Admin) — 3 assets → 200, ZIP', async () => {
    const a1 = await createAsset({ name: 'Batch 1', adminToken: users.ADMIN.accessToken });
    const a2 = await createAsset({ name: 'Batch 2', adminToken: users.ADMIN.accessToken });
    const a3 = await createAsset({ name: 'Batch 3', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/batch')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [a1.id, a2.id, a3.id], format: 'DYMO_99012', barcodeType: 'QR' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
  });

  // 6
  it('6. POST /api/labels/batch — empty array → 422', async () => {
    const res = await request(app)
      .post('/api/labels/batch')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [], format: 'DYMO_99012', barcodeType: 'QR' });

    expect(res.status).toBe(422);
  });

  // 7
  it('7. POST /api/labels/batch — 51 assetIds (over max 50) → 422', async () => {
    const fakeIds = Array.from({ length: 51 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);

    const res = await request(app)
      .post('/api/labels/batch')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: fakeIds, format: 'DYMO_99012', barcodeType: 'QR' });

    expect(res.status).toBe(422);
  });

  // 8
  it('8. Label print event recorded in audit log', async () => {
    const asset = await createAsset({ name: 'Audit Label', adminToken: users.ADMIN.accessToken });

    await request(app)
      .post('/api/labels/generate')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, format: 'DYMO_99017', barcodeType: 'QR' });

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'Label', action: 'PRINT' },
    });

    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Label Templates', () => {
  // 9
  it('9. POST /api/labels/templates (Admin) — valid → 201', async () => {
    const res = await request(app)
      .post('/api/labels/templates')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        name: 'Test Template',
        format: 'DYMO_99012',
        barcodeType: 'QR',
        fields: ['name', 'type', 'serialNumber'],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.name).toBe('Test Template');
  });

  // 10
  it('10. GET /api/labels/templates (Admin) → returns list', async () => {
    // Create a template first
    await request(app)
      .post('/api/labels/templates')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        name: 'List Template',
        format: 'DYMO_99012',
        barcodeType: 'QR',
        fields: ['name'],
      });

    const res = await request(app)
      .get('/api/labels/templates')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  // 11
  it('11. PUT /api/labels/templates/:id (Admin) — update name → 200', async () => {
    const createRes = await request(app)
      .post('/api/labels/templates')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        name: 'Original Template',
        format: 'DYMO_99012',
        barcodeType: 'QR',
        fields: ['name'],
      });

    const templateId = createRes.body.data.id;

    const res = await request(app)
      .put(`/api/labels/templates/${templateId}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ name: 'Updated Template' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Template');
  });

  // 12
  it('12. DELETE /api/labels/templates/:id (Admin) → 200', async () => {
    const createRes = await request(app)
      .post('/api/labels/templates')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        name: 'Delete Template',
        format: 'DYMO_99012',
        barcodeType: 'QR',
        fields: ['name'],
      });

    const templateId = createRes.body.data.id;

    const res = await request(app)
      .delete(`/api/labels/templates/${templateId}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
  });

  // 13
  it('13. DELETE /api/labels/templates/:id (Staff) → 403', async () => {
    const createRes = await request(app)
      .post('/api/labels/templates')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        name: 'Staff Delete Template',
        format: 'DYMO_99012',
        barcodeType: 'QR',
        fields: ['name'],
      });

    const templateId = createRes.body.data.id;

    const res = await request(app)
      .delete(`/api/labels/templates/${templateId}`)
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`);

    expect(res.status).toBe(403);
  });
});