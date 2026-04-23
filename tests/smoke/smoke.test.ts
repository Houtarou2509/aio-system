import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Test DB — uses DATABASE_URL_TEST if set, otherwise falls back to same DB
// The PrismaClient here connects to whatever DATABASE_URL is active.
// For CI, set DATABASE_URL_TEST=postgresql://... and run prisma migrate deploy.
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

// ── Fixtures ────────────────────────────────────────────────────────────────
const TEST_USERS = [
  { username: 'admin', email: 'admin@aio-system.local', password: 'admin123', role: 'ADMIN' as const },
  { username: 'staffadmin', email: 'staffadmin@aio-test.local', password: 'sa123', role: 'STAFF_ADMIN' as const },
  { username: 'staff1', email: 'staff1@aio-test.local', password: 'staff123', role: 'STAFF' as const },
  { username: 'guest1', email: 'guest1@aio-test.local', password: 'guest123', role: 'GUEST' as const },
];

let adminToken = '';

// ── Helpers ─────────────────────────────────────────────────────────────────
async function seedUsers() {
  for (const u of TEST_USERS) {
    const hash = await bcrypt.hash(u.password, 4); // low rounds for speed
    await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash: hash, role: u.role },
      create: {
        username: u.username,
        email: u.email,
        passwordHash: hash,
        role: u.role,
        twoFactorEnabled: false,
        backupCodes: '[]',
      },
    });
  }
}

async function login(email: string, password: string) {
  return request(app)
    .post('/api/auth/login')
    .send({ email, password });
}

// ── Lifecycle ───────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Ensure admin user exists so login works
  await seedUsers();

  // Get admin token once for all tests
  const res = await login('admin@aio-system.local', 'admin123');
  adminToken = res.body.data.accessToken;
}, 10_000);

afterAll(async () => {
  await prisma.$disconnect();
});

// Clean asset data between tests (not users — they're static fixtures)
beforeEach(async () => {
  await prisma.asset.deleteMany({});
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

describe('AIO-System Smoke Tests', () => {

  // ── 1. Server health ────────────────────────────────────────────────────
  it('1. GET /api/health → 200, returns { status: "ok", timestamp }', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.timestamp).toBeDefined();
    // Valid ISO timestamp
    expect(new Date(res.body.data.timestamp).toISOString()).toBe(res.body.data.timestamp);
  });

  // ── 2. Server responds within 1000ms on all smoke endpoints ─────────────
  it('2. All smoke endpoints respond within 1000ms', async () => {
    const endpoints = [
      { method: 'get' as const, path: '/api/health' },
      { method: 'post' as const, path: '/api/auth/login' },
      { method: 'get' as const, path: '/api/assets' },
      { method: 'get' as const, path: '/api/dashboard/stats' },
    ];

    for (const ep of endpoints) {
      const start = Date.now();
      const req = request(app)[ep.method](ep.path);
      if (ep.path === '/api/auth/login') {
        req.send({ email: 'admin@aio-system.local', password: 'admin123' });
      } else if (adminToken) {
        req.set('Authorization', `Bearer ${adminToken}`);
      }
      await req;
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000);
    }
  });

  // ── 3. Login with valid admin credentials ──────────────────────────────
  it('3. POST /api/auth/login (valid admin) → 200, returns token', async () => {
    const res = await login('admin@aio-system.local', 'admin123');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.role).toBe('ADMIN');
    expect(res.body.data.requiresTwoFactor).toBe(false);
  });

  // ── 4. Login with wrong password ───────────────────────────────────────
  it('4. POST /api/auth/login (wrong password) → 401', async () => {
    const res = await login('admin@aio-system.local', 'wrongpassword');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // ── 5. GET /api/auth/me with valid JWT ─────────────────────────────────
  it('5. GET /api/auth/me (valid JWT) → 200, returns user object', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.email).toBe('admin@aio-system.local');
    expect(res.body.data.role).toBe('ADMIN');
    expect(res.body.data.passwordHash).toBeUndefined(); // never leak hash
  });

  // ── 6. GET /api/auth/me with no token ──────────────────────────────────
  it('6. GET /api/auth/me (no token) → 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // ── 7. GET /api/assets with valid Admin JWT ────────────────────────────
  it('7. GET /api/assets (valid Admin JWT) → 200, returns { success: true, data: [] }', async () => {
    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // ── 8. GET /api/assets with no token ───────────────────────────────────
  it('8. GET /api/assets (no token) → 401', async () => {
    const res = await request(app).get('/api/assets');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // ── 9. GET /api/dashboard/stats with valid Admin JWT ───────────────────
  it('9. GET /api/dashboard/stats (valid Admin JWT) → 200', async () => {
    const res = await request(app)
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    // Dashboard should return numeric stats
    expect(typeof res.body.data.totalAssets).toBe('number');
  });

  // ── 10 & 11. Static / SPA fallback ──────────────────────────────────────
  // These only work in production mode (express.static + SPA fallback).
  // In dev/test mode, there's no static folder, so we test that the
  // server gracefully returns 404 for non-API routes (no crash).
  // For full E2E SPA fallback testing, use Playwright against a production build.

  it('10. GET / (non-API root) → server does not crash', async () => {
    // In test/dev mode without static files, expect 404 or default response.
    // The key assertion: server handles it without a 500.
    const res = await request(app).get('/');
    expect(res.status).toBeLessThan(500);
  });

  it('11. GET /non-existent-route → server does not crash (SPA fallback safe)', async () => {
    const res = await request(app).get('/some-frontend-route');
    expect(res.status).toBeLessThan(500);
  });
});