import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../server/src/index';
import { seedUsers, createAsset, cleanAssets } from '../fixtures/assets';

let users: Record<string, any>;

beforeAll(async () => {
  users = await seedUsers();
}, 15_000);

afterAll(async () => {
  // intentionally no cleanup — tests are read-only
});

describe('Authentication bypass', () => {
  // 1 — JWT signed with different secret
  it('1. GET /api/assets with JWT signed by wrong secret → 401', async () => {
    const fakeToken = jwt.sign(
      { id: users.ADMIN.id, role: 'ADMIN' },
      'wrong-secret-that-is-definitely-not-the-real-one',
      { expiresIn: '1h' },
    );

    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${fakeToken}`);

    expect(res.status).toBe(401);
  });

  // 2 — JWT with role changed but invalid signature
  it('2. GET /api/assets with tampered role (invalid signature) → 401', async () => {
    // Create a valid token, then manually change the payload
    const realSecret = process.env.JWT_SECRET!;
    const token = jwt.sign({ id: users.ADMIN.id, role: 'STAFF' }, realSecret, { expiresIn: '1h' });

    // Decode, strip exp, re-encode with WRONG secret to simulate tampering
    const decoded = jwt.decode(token) as any;
    const { exp, iat, ...payload } = decoded;
    const tampered = jwt.sign({ ...payload, role: 'ADMIN' }, 'attacker-secret', { expiresIn: '1h' });

    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${tampered}`);

    expect(res.status).toBe(401);
  });

  // 3 — Staff accessing audit export → 403
  it('3. GET /api/audit/export with Staff JWT → 403', async () => {
    const res = await request(app)
      .get('/api/audit/export')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`);

    expect(res.status).toBe(403);
  });

  // 4 — Staff-Admin deleting an asset → 403
  it('4. DELETE /api/assets/:id with Staff-Admin JWT → 403', async () => {
    const asset = await createAsset({ name: 'Delete Attempt', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .delete(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.STAFF_ADMIN.accessToken}`);

    expect(res.status).toBe(403);
  });
});