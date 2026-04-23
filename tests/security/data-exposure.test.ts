import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { seedUsers, createAsset, cleanAssets } from '../fixtures/assets';

let users: Record<string, any>;

beforeAll(async () => {
  users = await seedUsers();
}, 15_000);

afterAll(async () => {});

describe('Sensitive data exposure', () => {
  // 17 — GET /api/auth/me must not expose passwordHash, twoFactorSecret, backupCodes
  it('17. GET /api/auth/me — must NOT contain passwordHash, twoFactorSecret, backupCodes', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('twoFactorSecret');
    expect(body).not.toContain('backupCodes');
  });

  // 18 — GET /api/assets (Guest JWT) must not contain purchasePrice, serialNumber, currentValue
  it('18. GET /api/assets (Guest) — must NOT contain purchasePrice, serialNumber, currentValue', async () => {
    await createAsset({ name: 'Guest Visibility', purchasePrice: 50000, serialNumber: 'SECRET-SN-001', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${users.GUEST.accessToken}`);

    expect(res.status).toBe(200);

    // Check that sensitive fields are NOT present in any asset
    for (const asset of res.body.data) {
      expect(asset.purchasePrice).toBeUndefined();
      expect(asset.serialNumber).toBeUndefined();
      expect(asset.currentValue).toBeUndefined();
      expect(asset.depreciationRate).toBeUndefined();
      expect(asset.salvageValue).toBeUndefined();
    }
  });

  // 19 — Error responses must not expose stack traces in production mode
  it('19. Error responses must not expose stack traces or internal file paths', async () => {
    // Trigger a 404 error
    const res = await request(app)
      .get('/api/assets/nonexistent-uuid-00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    // Response should be JSON with success: false
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();

    // Error message should not contain stack traces or file paths
    const errorStr = JSON.stringify(res.body);
    expect(errorStr).not.toContain('at ');
    expect(errorStr).not.toContain('.ts:');
    expect(errorStr).not.toContain('.js:');
    expect(errorStr).not.toContain('/home/');
    expect(errorStr).not.toContain('node_modules');

    // Also test a validation error
    const validationRes = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({}); // empty body → validation error

    const validationStr = JSON.stringify(validationRes.body);
    expect(validationStr).not.toContain('at ');
    expect(validationStr).not.toContain('/home/');
    expect(validationStr).not.toContain('node_modules');
  });
});