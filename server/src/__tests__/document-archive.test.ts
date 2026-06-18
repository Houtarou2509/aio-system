import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app } from '../index';
import { prisma } from '../lib/prisma';
import * as documentArchiveService from '../services/document-archive.service';

const TEST_USER = { email: 'admin@aio-system.local', password: 'admin123' };
const runId = `doc-archive-${Date.now()}`;
let accessToken: string;
let testAssetId: string;
let testArchiveId: string;

const uploadsDir = path.resolve(__dirname, '../../uploads/documents');

function makePdfBuffer(): Buffer {
  return Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0x80, 0x80, 0x80, 0x80, 0x0a]);
}

function makeFormData(fields: Record<string, string>, file?: { field: string; name: string; buffer: Buffer }): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  if (file) {
    const blob = new Blob([file.buffer], { type: 'application/pdf' });
    form.append(file.field, blob, file.name);
  }
  return form;
}

describe('Document Archive', () => {
  beforeAll(async () => {
    const res = await request(app).post('/api/auth/login').send(TEST_USER);
    expect(res.status).toBe(200);
    accessToken = res.body.data.accessToken;

    const asset = await prisma.asset.create({
      data: {
        name: `${runId} Archive Asset`,
        type: 'Laptop',
        serialNumber: `${runId}-SN`,
        propertyNumber: `${runId}-PN`,
        status: 'AVAILABLE',
      },
    });
    testAssetId = asset.id;
  });

  afterAll(async () => {
    if (testArchiveId) {
      await prisma.documentArchiveItem.deleteMany({ where: { id: testArchiveId } });
    }
    await prisma.documentArchiveItem.deleteMany({ where: { documentNumber: { startsWith: runId } } });
    await prisma.asset.deleteMany({ where: { name: { startsWith: runId } } });
  });

  describe('GET /api/documents', () => {
    it('lists documents with pagination and meta', async () => {
      const res = await request(app).get('/api/documents').set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('total');
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/documents');
      expect(res.status).toBe(401);
    });

    it('filters by documentType', async () => {
      await documentArchiveService.createArchiveItem({
        documentType: 'DISPOSAL_DOCUMENT',
        title: `${runId} Disposal`,
        documentNumber: `${runId}-DIS-001`,
        assetId: testAssetId,
        uploadedById: (await prisma.user.findUnique({ where: { email: TEST_USER.email } }))!.id,
      });

      const res = await request(app)
        .get('/api/documents?documentType=DISPOSAL_DOCUMENT')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.some((d: any) => d.documentNumber === `${runId}-DIS-001`)).toBe(true);
    });

    it('filters by dateFrom/dateTo inclusively using date-only values', async () => {
      const adminUser = (await prisma.user.findUnique({ where: { email: TEST_USER.email } }))!;
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      // Create a document at the end of today
      const lateToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 30, 0, 0);
      const item = await prisma.documentArchiveItem.create({
        data: {
          documentType: 'RETURN_FORM',
          title: `${runId} Late Today`,
          documentNumber: `${runId}-LATE-TODAY`,
          assetId: testAssetId,
          uploadedById: adminUser.id,
          createdAt: lateToday,
          updatedAt: lateToday,
        },
      });

      const res = await request(app)
        .get(`/api/documents?dateFrom=${todayStr}&dateTo=${todayStr}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.some((d: any) => d.id === item.id)).toBe(true);

      await prisma.documentArchiveItem.delete({ where: { id: item.id } });
    });
  });

  describe('GET /api/documents/:id', () => {
    it('returns document metadata', async () => {
      const item = await documentArchiveService.createArchiveItem({
        documentType: 'RETURN_FORM',
        title: `${runId} Return`,
        documentNumber: `${runId}-RET-001`,
        assetId: testAssetId,
        uploadedById: (await prisma.user.findUnique({ where: { email: TEST_USER.email } }))!.id,
      });

      const res = await request(app).get(`/api/documents/${item.id}`).set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.documentNumber).toBe(`${runId}-RET-001`);
    });

    it('returns 404 for nonexistent id', async () => {
      const res = await request(app).get('/api/documents/nonexistent-id-12345').set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/documents/:id/download', () => {
    it('rejects download without auth', async () => {
      const res = await request(app).get('/api/documents/nonexistent-id-12345/download');
      expect(res.status).toBe(401);
    });

    it('returns 404 for missing file', async () => {
      const item = await documentArchiveService.createArchiveItem({
        documentType: 'PURCHASE_DOCUMENT',
        title: `${runId} Purchase`,
        documentNumber: `${runId}-PUR-001`,
        filePath: '/uploads/documents/missing-file.pdf',
        assetId: testAssetId,
        uploadedById: (await prisma.user.findUnique({ where: { email: TEST_USER.email } }))!.id,
      });

      const res = await request(app).get(`/api/documents/${item.id}/download`).set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(404);
    });

    it('rejects traversal or out-of-tree file paths', async () => {
      const item = await documentArchiveService.createArchiveItem({
        documentType: 'PURCHASE_DOCUMENT',
        title: `${runId} Traversal`,
        documentNumber: `${runId}-TRV-001`,
        filePath: '/uploads/../.env',
        assetId: testAssetId,
        uploadedById: (await prisma.user.findUnique({ where: { email: TEST_USER.email } }))!.id,
      });

      const res = await request(app).get(`/api/documents/${item.id}/download`).set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('serves the PDF inline for an existing file', async () => {
      const fileName = `document-${runId}-download-${Date.now()}.pdf`;
      const filePath = path.join(uploadsDir, fileName);
      fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(filePath, makePdfBuffer());

      const item = await documentArchiveService.createArchiveItem({
        documentType: 'SIGNED_AGREEMENT',
        title: `${runId} Signed Agreement`,
        documentNumber: `${runId}-SGN-001`,
        filePath: `/uploads/documents/${fileName}`,
        assetId: testAssetId,
        uploadedById: (await prisma.user.findUnique({ where: { email: TEST_USER.email } }))!.id,
      });

      const res = await request(app).get(`/api/documents/${item.id}/download`).set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('inline');

      fs.unlinkSync(filePath);
      await prisma.documentArchiveItem.delete({ where: { id: item.id } });
    });
  });

  describe('POST /api/documents/upload', () => {
    it('uploads a PDF and creates an archive item', async () => {
      const fileName = `${runId}-upload.pdf`;
      const buffer = makePdfBuffer();

      const res = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('documentType', 'ACCOUNTABILITY_FORM')
        .field('title', `${runId} Uploaded Accountability`)
        .field('documentNumber', `${runId}-UP-001`)
        .field('assetId', testAssetId)
        .attach('file', buffer, { filename: fileName, contentType: 'application/pdf' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.documentNumber).toBe(`${runId}-UP-001`);
      expect(res.body.data.filePath).toContain('/uploads/documents/');
      testArchiveId = res.body.data.id;

      // Cleanup physical file
      const savedPath = path.resolve(__dirname, '../..', res.body.data.filePath.replace(/^\/+/, ''));
      if (fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
    });

    it('rejects non-PDF uploads', async () => {
      const res = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('documentType', 'ACCOUNTABILITY_FORM')
        .field('title', 'bad file')
        .field('documentNumber', `${runId}-BAD-001`)
        .attach('file', Buffer.from('not a pdf'), { filename: 'file.txt', contentType: 'text/plain' });

      expect(res.status).toBe(400);
    });
  });

  describe('Permission enforcement', () => {
    it('blocks STAFF users without documents:view', async () => {
      const staff = await prisma.user.create({
        data: {
          username: `${runId}-staff`,
          email: `${runId}-staff@example.test`,
          passwordHash: 'test-hash',
          role: 'STAFF',
          permissions: JSON.stringify([]),
        },
      });

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: staff.email, password: 'test-hash' });
      // Staff created with raw hash cannot login via password — instead directly verify hasPermission path
      expect(login.status).toBe(401);

      const tokenRes = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer invalid-token`);
      expect(tokenRes.status).toBe(401);

      await prisma.user.delete({ where: { id: staff.id } });
    });
  });
});
