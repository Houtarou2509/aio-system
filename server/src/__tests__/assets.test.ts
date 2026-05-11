import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';

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
