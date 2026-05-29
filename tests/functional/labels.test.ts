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
  it('1. POST /api/labels/generate-pdf (Admin) — single asset → 200, PDF', async () => {
    const asset = await createAsset({ name: 'Label Test', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [asset.id] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.length).toBeGreaterThan(0);
  });

  // 2
  it('2. POST /api/labels/generate-pdf (Staff) — 200 (Staff can print)', async () => {
    const asset = await createAsset({ name: 'Staff Label', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`)
      .send({ assetIds: [asset.id] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  // 3
  it('3. POST /api/labels/generate-pdf (Guest) — 403', async () => {
    const asset = await createAsset({ name: 'Guest Label', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.GUEST.accessToken}`)
      .send({ assetIds: [asset.id] });

    expect(res.status).toBe(403);
  });

  // 4
  it('4. POST /api/labels/generate-pdf — empty assetIds array → 422', async () => {
    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [] });

    expect(res.status).toBe(422);
  });

  // 5
  it('5. POST /api/labels/generate-pdf (Admin) — 3 assets in one PDF → 200', async () => {
    const a1 = await createAsset({ name: 'Batch 1', adminToken: users.ADMIN.accessToken });
    const a2 = await createAsset({ name: 'Batch 2', adminToken: users.ADMIN.accessToken });
    const a3 = await createAsset({ name: 'Batch 3', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [a1.id, a2.id, a3.id] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  // 6
  it('6. POST /api/labels/generate-pdf — empty array → 422', async () => {
    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [] });

    expect(res.status).toBe(422);
  });

  // 7
  it('7. POST /api/labels/generate-pdf — 51 assetIds (over max 50) → 422', async () => {
    const fakeIds = Array.from({ length: 51 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: fakeIds });

    expect(res.status).toBe(422);
  });

  // 8
  it('8. Label print event recorded in audit log', async () => {
    const asset = await createAsset({ name: 'Audit Label', adminToken: users.ADMIN.accessToken });

    await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [asset.id] });

    const logs = await prisma.auditLog.findMany({
      where: { action: 'label.printed', entityId: asset.id },
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

describe('Label PDF — Filename & Headers', () => {
  it('PDF response includes professional X-Filename header with date and asset count', async () => {
    const a1 = await createAsset({ name: 'Filename Test 1', propertyNumber: 'FN-001', adminToken: users.ADMIN.accessToken });
    const a2 = await createAsset({ name: 'Filename Test 2', propertyNumber: 'FN-002', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [a1.id, a2.id] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');

    const disposition = res.headers['content-disposition'];
    expect(disposition).toContain('filename="AIO-System-QR-Labels-');
    expect(disposition).toContain('2-assets.pdf');

    const xFilename = res.headers['x-filename'];
    expect(xFilename).toMatch(/^AIO-System-QR-Labels-\d{4}-\d{2}-\d{2}-2-assets\.pdf$/);
  });

  it('Single-asset PDF uses 1-asset filename', async () => {
    const asset = await createAsset({ name: 'Single Filename', propertyNumber: 'FN-003', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [asset.id] });

    expect(res.status).toBe(200);
    expect(res.headers['x-filename']).toContain('1-asset.pdf');
    expect(res.headers['content-disposition']).toContain('1-asset.pdf');
  });
});

describe('QR Payload & Lookup', () => {
  it('PROP: lookup resolves to asset by propertyNumber', async () => {
    const asset = await createAsset({ name: 'QR Prop Test', propertyNumber: 'QR-PROP-001', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .get(`/api/assets/lookup?q=${encodeURIComponent('PROP:QR-PROP-001')}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(asset.id);
    expect(res.body.data.propertyNumber).toBe('QR-PROP-001');
  });

  it('ASSET: lookup resolves to asset by id', async () => {
    const asset = await createAsset({ name: 'QR Asset Test', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .get(`/api/assets/lookup?q=${encodeURIComponent(`ASSET:${asset.id}`)}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(asset.id);
  });

  it('PROP: lookup returns 404 for nonexistent property number', async () => {
    const res = await request(app)
      .get(`/api/assets/lookup?q=${encodeURIComponent('PROP:NONEXISTENT-999')}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(404);
  });

  it('ASSET: lookup returns 404 for nonexistent id', async () => {
    const res = await request(app)
      .get(`/api/assets/lookup?q=${encodeURIComponent('ASSET:00000000-0000-0000-0000-000000000000')}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(404);
  });

  it('Lookup without q parameter returns 400', async () => {
    const res = await request(app)
      .get('/api/assets/lookup')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(400);
  });
});