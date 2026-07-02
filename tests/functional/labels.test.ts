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
  it('7. POST /api/labels/generate-pdf — 201 assetIds (over old max 50) → 200', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 62; i++) {
      const a = await createAsset({ name: `Batch ${i}`, manufacturer: 'HP', adminToken: users.ADMIN.accessToken });
      ids.push(a.id);
    }

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: ids });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.length).toBeGreaterThan(0);
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

  it('marks selected assets as QR printed after successful PDF generation', async () => {
    const asset = await createAsset({ name: 'QR Printed State', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [asset.id] });

    expect(res.status).toBe(200);
    expect(res.headers['x-qr-printed-asset-ids']).toBe(asset.id);
    expect(res.headers['x-qr-printed-at']).toBeTruthy();

    const updated = await prisma.asset.findUnique({ where: { id: asset.id } });
    expect(updated?.qrPrintedAt).toBeTruthy();
    expect(updated?.qrPrintedById).toBe(users.ADMIN.id);
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

describe('Label PDF — Layout & Content', () => {
  it('Label PDF is valid PDF with correct content type and size', async () => {
    const asset = await createAsset({ name: 'Layout Test', propertyNumber: 'UPPI-001', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [asset.id] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    // PDF header
    expect(res.body.slice(0, 5).toString()).toBe('%PDF-');
    // Reasonable size (has content)
    expect(res.body.length).toBeGreaterThan(500);
  });

  it('Label PDF contains image XObject for QR code', async () => {
    const asset = await createAsset({ name: 'QR Image Test', propertyNumber: 'QR-IMG-001', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [asset.id] });

    expect(res.status).toBe(200);
    const pdfStr = res.body.toString('latin1');
    // QR code is embedded as an Image XObject
    expect(pdfStr).toContain('/Subtype /Image');
  });

  it('Label PDF does not contain serial number text', async () => {
    const asset = await createAsset({
      name: 'No SN Test',
      propertyNumber: 'UPPI-PROP-XYZ',
      serialNumber: 'SN-SHOULD-NOT-APPEAR',
      adminToken: users.ADMIN.accessToken,
    });

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [asset.id] });

    expect(res.status).toBe(200);
    // The serial number should NOT appear in the raw PDF buffer as plaintext
    // (it's only used for QR payload encoding, not displayed)
    const pdfStr = res.body.toString('utf8');
    expect(pdfStr).not.toContain('SN-SHOULD-NOT-APPEAR');
  });

  it('Multi-asset label PDF still generates correctly', async () => {
    const a1 = await createAsset({ name: 'Multi 1', propertyNumber: 'MULTI-001', adminToken: users.ADMIN.accessToken });
    const a2 = await createAsset({ name: 'Multi 2', propertyNumber: 'MULTI-002', adminToken: users.ADMIN.accessToken });
    const a3 = await createAsset({ name: 'Multi 3', propertyNumber: 'MULTI-003', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [a1.id, a2.id, a3.id] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    // Multi-asset PDF should be larger than single-asset
    expect(res.body.length).toBeGreaterThan(1000);
    // Should have multiple Image XObjects (one per QR code)
    const pdfStr = res.body.toString('latin1');
    const imageCount = (pdfStr.match(/\/Subtype \/Image/g) || []).length;
    expect(imageCount).toBeGreaterThanOrEqual(3);
  });

  it('Label PDF draws a cut-guide rectangle for each label cell', async () => {
    const a1 = await createAsset({ name: 'Cut Border 1', propertyNumber: 'CUT-001', adminToken: users.ADMIN.accessToken });
    const a2 = await createAsset({ name: 'Cut Border 2', propertyNumber: 'CUT-002', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [a1.id, a2.id] });

    expect(res.status).toBe(200);
    const pdfStr = res.body.toString('latin1');

    // With compression disabled, the border rectangle operators are directly present.
    // Each label cell has a 67x67 pt border rect (LABEL_W=72, borderInset=2.5).
    const rectCount = (pdfStr.match(/\b\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+67\s+67\s+re\b/g) || []).length;
    expect(rectCount).toBeGreaterThanOrEqual(2);
  });

  it('Single-asset label PDF generates with professional filename', async () => {
    const asset = await createAsset({ name: 'Filename Test', propertyNumber: 'FN-LABEL-001', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [asset.id] });

    expect(res.status).toBe(200);
    const disposition = res.headers['content-disposition'];
    expect(disposition).toContain('1-asset.pdf');
  });
});

describe('Label Generation — Filtered', () => {
  it('generates PDF by location filter', async () => {
    const roomAssets: string[] = [];
    for (let i = 0; i < 5; i++) {
      const a = await createAsset({ name: `Room-${i}`, location: 'Room 1', adminToken: users.ADMIN.accessToken });
      roomAssets.push(a.id);
    }
    await createAsset({ name: 'Other Room', location: 'Room 2', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ filters: { location: 'Room 1' } });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('5-assets.pdf');
  });

  it('marks every asset matched by filtered QR generation', async () => {
    const roomAssets: string[] = [];
    for (let i = 0; i < 4; i++) {
      const a = await createAsset({ name: `Filtered QR-${i}`, location: 'QR Room', adminToken: users.ADMIN.accessToken });
      roomAssets.push(a.id);
    }
    const other = await createAsset({ name: 'Filtered QR Other', location: 'Other Room', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ filters: { location: 'QR Room' } });

    expect(res.status).toBe(200);
    const printedHeaderIds = String(res.headers['x-qr-printed-asset-ids']).split(',');
    expect(printedHeaderIds.sort()).toEqual([...roomAssets].sort());
    expect(res.headers['x-qr-printed-at']).toBeTruthy();

    const printed = await prisma.asset.count({
      where: { id: { in: roomAssets }, qrPrintedAt: { not: null }, qrPrintedById: users.ADMIN.id },
    });
    const otherAsset = await prisma.asset.findUnique({ where: { id: other.id } });
    expect(printed).toBe(4);
    expect(otherAsset?.qrPrintedAt).toBeNull();

    const unprintedRes = await request(app)
      .get('/api/assets?location=QR%20Room&qrPrintStatus=not_printed')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);
    expect(unprintedRes.status).toBe(200);
    expect(unprintedRes.body.meta.total).toBe(0);
  });

  it('generates PDF by manufacturer filter', async () => {
    for (let i = 0; i < 3; i++) {
      await createAsset({ name: `View-${i}`, manufacturer: 'Viewsonic', adminToken: users.ADMIN.accessToken });
    }
    await createAsset({ name: 'Dell One', manufacturer: 'Dell', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/labels/generate-pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ filters: { manufacturer: 'Viewsonic' } });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('3-assets.pdf');
  });
});
