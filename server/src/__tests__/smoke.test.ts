import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';

const TEST_USER = { email: 'admin@aio-system.local', password: 'admin123' };

let accessToken = '';
let assetId = '';
let userId = '';

describe('AIO System Smoke Tests', () => {
  it('POST /api/auth/login — should login and return tokens', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    accessToken = res.body.data.accessToken;
  });

  it('POST /api/assets — should create an asset', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({
        name: 'Test Monitor',
        type: 'EQUIPMENT',
        manufacturer: 'Dell',
        serialNumber: 'SMOKE-TEST-001',
        location: 'Test Room',
      }));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Test Monitor');
    assetId = res.body.data.id;
  });

  it('POST /api/assets/:id/checkout — should assign asset', async () => {
    const usersRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${accessToken}`);
    userId = usersRes.body.data[0].id;

    const res = await request(app)
      .post(`/api/assets/${assetId}/checkout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ userId }));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const assetRes = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(assetRes.body.data.status).toBe('ASSIGNED');
  });

  it('POST /api/assets/:id/return — should return asset', async () => {
    const res = await request(app)
      .post(`/api/assets/${assetId}/return`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ condition: 'Good', notes: 'Returned' }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.returned).toBe(true);
  });

  it('GET /api/audit — should contain audit logs', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const actions = res.body.data.map((l: any) => l.action);
    expect(actions).toContain('CREATE');
    expect(actions).toContain('CHECKOUT');
    expect(actions).toContain('RETURN');
  });
});