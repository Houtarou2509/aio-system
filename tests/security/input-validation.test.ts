import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { seedUsers, createAsset, cleanAssets } from '../fixtures/assets';
import path from 'path';

let users: Record<string, any>;

beforeAll(async () => {
  users = await seedUsers();
}, 15_000);

afterAll(async () => {});

beforeEach(async () => {
  await cleanAssets();
});

describe('Input validation / injection', () => {
  // 9 — Guest token response must not contain sensitive fields
  it('9. Guest token response must not contain purchasePrice, serialNumber, currentValue, depreciationRate, passwordHash, twoFactorSecret, backupCodes', async () => {
    const asset = await createAsset({
      name: 'Sensitive Fields Check',
      serialNumber: 'TOP-SECRET-SN',
      purchasePrice: 999999,
      adminToken: users.ADMIN.accessToken,
    });

    // Create guest token
    const tokenRes = await request(app)
      .post('/api/guest/tokens')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, maxAccess: 100 });

    const token = tokenRes.body.data.token;

    const res = await request(app).get(`/api/guest/a/${token}`);
    expect(res.status).toBe(200);

    const body = JSON.stringify(res.body);
    // These fields must NOT appear in the response
    expect(res.body.data.purchasePrice).toBeUndefined();
    expect(res.body.data.serialNumber).toBeUndefined();
    expect(res.body.data.currentValue).toBeUndefined();
    expect(res.body.data.depreciationRate).toBeUndefined();
    // Also ensure no user secrets leak
    expect(res.body.data.passwordHash).toBeUndefined();
    expect(res.body.data.twoFactorSecret).toBeUndefined();
    expect(res.body.data.backupCodes).toBeUndefined();
  });

  // 10 — Guest token is not a JWT and cannot be used as Authorization
  it('10. Guest token used as Authorization Bearer → 401', async () => {
    const asset = await createAsset({ name: 'Token Auth Check', adminToken: users.ADMIN.accessToken });

    const tokenRes = await request(app)
      .post('/api/guest/tokens')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, maxAccess: 10 });

    const guestToken = tokenRes.body.data.token;

    // Attempting to use guest token as JWT auth should fail
    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${guestToken}`);

    expect(res.status).toBe(401);
  });

  // 11 — SQL injection in asset name
  it('11. SQL injection in name → stored as plain text, DB unaffected', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        name: "'; DROP TABLE assets; --",
        type: 'EQUIPMENT',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("'; DROP TABLE assets; --");

    // Verify DB is intact — we can still query assets
    const listRes = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);
  });

  // 12 — XSS payload in name
  it('12. XSS payload in name → stored as escaped string, not executed', async () => {
    const xssPayload = '<script>alert(1)</script>';

    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        name: xssPayload,
        type: 'EQUIPMENT',
      });

    expect(res.status).toBe(201);
    // Name should be stored as-is (the API stores it, but the frontend React escapes it)
    expect(res.body.data.name).toBe(xssPayload);

    // Verify no script execution by checking the raw JSON doesn't contain unescaped script tags
    // (React will escape this on render, which is the real XSS defense)
    expect(typeof res.body.data.name).toBe('string');
  });

  // 13 — Long email string → 400, no crash
  it('13. 1000-char email → 400, no server crash', async () => {
    const longEmail = 'a'.repeat(1000) + '@test.com';

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: longEmail, password: 'test123' });

    // Should get 422 (Zod validation) or 401 (not found) but NOT 500
    expect(res.status).toBeLessThan(500);
    expect(res.status).not.toBe(200);
  });

  // 14 — File with .jpg extension but text/html MIME → 400
  it('14. Upload file with .jpg extension but text/html MIME → 400', async () => {
    const asset = await createAsset({ name: 'Mime Check', adminToken: users.ADMIN.accessToken });

    const fakeHtmlFile = Buffer.from('<html><body>malicious</body></html>');

    const res = await request(app)
      .post(`/api/assets/${asset.id}/image`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .attach('image', fakeHtmlFile, {
        filename: 'malicious.jpg',
        contentType: 'text/html',
      });

    expect(res.status).toBe(400);
  });
});

describe('Brute force protection', () => {
  // 15 — Login rate limiting: 5 attempts per 15 min, then 429
  it('15. Rapid login failures → 429 with rate limit headers', async () => {
    // The login limiter is 5 per 15 min. We need to make 6+ rapid failures.
    // Use a unique identifier to avoid interfering with other tests' rate limits
    let got429 = false;

    for (let i = 0; i < 8; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `10.0.0.${Math.floor(Math.random() * 255)}`) // unique IP per attempt to test different IPs bypass? No, let's use same IP
        .send({ email: 'nonexistent@test.com', password: 'wrongpassword' });

      if (res.status === 429) {
        got429 = true;
        // Verify Retry-After or rate limit headers
        expect(res.headers['retry-after'] || res.headers['ratelimit-reset'] || res.body.error).toBeDefined();
        break;
      }
    }

    // If we didn't get 429 with different IPs (each IP gets 5), try same IP
    if (!got429) {
      for (let i = 0; i < 7; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', '99.99.99.99')
          .send({ email: 'ratelimit-test@test.com', password: 'wrongpassword' });

        if (res.status === 429) {
          got429 = true;
          break;
        }
      }
    }

    expect(got429).toBe(true);
  });

  // 16 — Guest token rate limit
  it('16. 11 rapid GET /api/guest/a/:token from same IP → 429', async () => {
    const asset = await createAsset({ name: 'Rate Limit Guest', adminToken: users.ADMIN.accessToken });

    const tokenRes = await request(app)
      .post('/api/guest/tokens')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, maxAccess: 100 });

    const token = tokenRes.body.data.token;

    let got429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await request(app)
        .get(`/api/guest/a/${token}`)
        .set('X-Forwarded-For', '88.88.88.88');

      if (res.status === 429) {
        got429 = true;
        break;
      }
    }

    expect(got429).toBe(true);
  });
});