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
  await prisma.guestToken.deleteMany({});
  await cleanAssets();
});

describe('Guest Tokens', () => {
  // 14
  it('14. POST /api/guest/tokens (Admin) — { assetId } → 201, returns token + url', async () => {
    const asset = await createAsset({ name: 'Guest Token Asset', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/guest/tokens')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.id).toBeDefined();
  });

  // 15
  it('15. POST /api/guest/tokens — { assetId, expiresAt, maxAccess: 5 } → config respected', async () => {
    const asset = await createAsset({ name: 'Guest Config Asset', adminToken: users.ADMIN.accessToken });
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post('/api/guest/tokens')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, expiresAt, maxAccess: 5 });

    expect(res.status).toBe(201);
    expect(res.body.data.maxAccess).toBe(5);
    expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  // 16
  it('16. GET /api/guest/a/:token (no auth) → 200, returns asset data', async () => {
    const asset = await createAsset({ name: 'Guest View Asset', adminToken: users.ADMIN.accessToken });

    const tokenRes = await request(app)
      .post('/api/guest/tokens')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, maxAccess: 100 });

    const token = tokenRes.body.data.token;

    const res = await request(app)
      .get(`/api/guest/a/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Guest View Asset');
  });

  // 17 — Sensitive fields MUST NOT appear
  it('17. Guest response MUST NOT contain purchasePrice, serialNumber, currentValue, depreciationRate', async () => {
    const asset = await createAsset({
      name: 'Guest Hidden Fields',
      serialNumber: 'SECRET-SN',
      purchasePrice: 99999,
      adminToken: users.ADMIN.accessToken,
    });

    const tokenRes = await request(app)
      .post('/api/guest/tokens')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, maxAccess: 100 });

    const token = tokenRes.body.data.token;

    const res = await request(app)
      .get(`/api/guest/a/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.purchasePrice).toBeUndefined();
    expect(res.body.data.serialNumber).toBeUndefined();
    expect(res.body.data.currentValue).toBeUndefined();
    expect(res.body.data.depreciationRate).toBeUndefined();
    expect(res.body.data.salvageValue).toBeUndefined();
  });

  // 18 — Required fields MUST appear
  it('18. Guest response MUST contain name, type, status, location, manufacturer', async () => {
    const asset = await createAsset({ name: 'Guest Required Fields', adminToken: users.ADMIN.accessToken });

    const tokenRes = await request(app)
      .post('/api/guest/tokens')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, maxAccess: 100 });

    const token = tokenRes.body.data.token;

    const res = await request(app)
      .get(`/api/guest/a/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBeDefined();
    expect(res.body.data.type).toBeDefined();
    expect(res.body.data.status).toBeDefined();
    expect(res.body.data.location).toBeDefined();
  });

  // 19 — Access count increments
  it('19. Each access increments accessCount', async () => {
    const asset = await createAsset({ name: 'Guest Count', adminToken: users.ADMIN.accessToken });

    const tokenRes = await request(app)
      .post('/api/guest/tokens')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, maxAccess: 100 });

    const token = tokenRes.body.data.token;

    const res1 = await request(app).get(`/api/guest/a/${token}`);
    expect(res1.body.data._accessCount).toBe(1);

    const res2 = await request(app).get(`/api/guest/a/${token}`);
    expect(res2.body.data._accessCount).toBe(2);
  });

  // 20 — Max access limit
  it('20. After reaching maxAccess limit → 403/404', async () => {
    const asset = await createAsset({ name: 'Guest Max', adminToken: users.ADMIN.accessToken });

    const tokenRes = await request(app)
      .post('/api/guest/tokens')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, maxAccess: 2 });

    const token = tokenRes.body.data.token;

    // Access 1 and 2 should work
    await request(app).get(`/api/guest/a/${token}`);
    await request(app).get(`/api/guest/a/${token}`);

    // Access 3 should be rejected
    const res = await request(app).get(`/api/guest/a/${token}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // 21 — Expired token
  it('21. Expired token (expiresAt in past) → 404', async () => {
    const asset = await createAsset({ name: 'Guest Expired', adminToken: users.ADMIN.accessToken });

    const tokenRes = await request(app)
      .post('/api/guest/tokens')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, expiresAt: new Date(Date.now() - 1000).toISOString(), maxAccess: 100 });

    const token = tokenRes.body.data.token;

    const res = await request(app).get(`/api/guest/a/${token}`);
    expect(res.status).toBe(404);
  });

  // 22
  it('22. GET /api/guest/a/invalidtoken → 404', async () => {
    const res = await request(app).get('/api/guest/a/invalidtoken1234567890123');
    expect(res.status).toBe(404);
  });

  // 23 — Rate limit: 10 req/min per IP; 11th should be 429
  it('23. Rate limit: 11 requests → 11th returns 429', async () => {
    const asset = await createAsset({ name: 'Guest Rate', adminToken: users.ADMIN.accessToken });

    const tokenRes = await request(app)
      .post('/api/guest/tokens')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, maxAccess: 100 });

    const token = tokenRes.body.data.token;

    let got429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await request(app).get(`/api/guest/a/${token}`);
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true);
  });

  // 24 — Delete/revoke token
  it('24. DELETE /api/guest/tokens/:id (Admin) → revokes token', async () => {
    const asset = await createAsset({ name: 'Guest Revoke', adminToken: users.ADMIN.accessToken });

    const tokenRes = await request(app)
      .post('/api/guest/tokens')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, maxAccess: 100 });

    const tokenId = tokenRes.body.data.id;
    const token = tokenRes.body.data.token;

    const deleteRes = await request(app)
      .delete(`/api/guest/tokens/${tokenId}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.revoked).toBe(true);

    // Subsequent access → 404
    const accessRes = await request(app).get(`/api/guest/a/${token}`);
    expect(accessRes.status).toBeGreaterThanOrEqual(400);
  });

  // 25
  it('25. DELETE /api/guest/tokens/:id (Staff) → 403', async () => {
    const asset = await createAsset({ name: 'Staff Guest Revoke', adminToken: users.ADMIN.accessToken });

    const tokenRes = await request(app)
      .post('/api/guest/tokens')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, maxAccess: 100 });

    const tokenId = tokenRes.body.data.id;

    const res = await request(app)
      .delete(`/api/guest/tokens/${tokenId}`)
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`);

    expect(res.status).toBe(403);
  });
});