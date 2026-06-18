import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { prisma } from '../lib/prisma';

let accessToken: string;

describe('Asset endpoints (authenticated)', () => {
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@aio-system.local', password: 'admin123' });
    accessToken = res.body.data.accessToken;
  });

  describe('GET /api/assets', () => {
    it('returns array with meta for authenticated admin', async () => {
      const res = await request(app)
        .get('/api/assets')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('meta');
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta).toHaveProperty('page');
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/assets');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/assets/:nonexistent', () => {
    it('returns 404 for nonexistent asset id', async () => {
      const res = await request(app)
        .get('/api/assets/nonexistent-id-12345')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('success', false);
    });
  });
});

const runId = `asset-dsp-${Date.now()}`;

describe('Asset disposal archive', () => {
  let token: string;

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@aio-system.local', password: 'admin123' });
    token = res.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.documentArchiveItem.deleteMany({ where: { documentNumber: { startsWith: runId } } });
    await prisma.asset.deleteMany({ where: { name: { startsWith: runId } } });
  });

  it('creates a DISPOSAL_DOCUMENT archive item when disposing an asset', async () => {
    const asset = await prisma.asset.create({
      data: {
        name: `${runId} Disposal Asset`,
        type: 'Laptop',
        serialNumber: `${runId}-SN`,
        propertyNumber: `${runId}-PN`,
        status: 'AVAILABLE',
      },
    });

    const res = await request(app)
      .post(`/api/assets/${asset.id}/dispose`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'End of life', method: 'SCRAPPED', date: new Date().toISOString().split('T')[0] });

    expect(res.status).toBe(200);

    const archive = await prisma.documentArchiveItem.findFirst({
      where: { assetId: asset.id, documentType: 'DISPOSAL_DOCUMENT' },
    });
    expect(archive).toBeTruthy();
    expect(archive?.status).toBe('ACTIVE');
  });
});
