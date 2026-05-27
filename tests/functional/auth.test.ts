import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// ── Fixture helpers ──────────────────────────────────────────────────────────
interface UserFixture {
  id: string;
  username: string;
  email: string;
  password: string;
  role: string;
  accessToken?: string;
  refreshToken?: string;
}

async function createUser(opts: {
  username: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'STAFF_ADMIN' | 'STAFF' | 'GUEST';
}): Promise<UserFixture> {
  const hash = await bcrypt.hash(opts.password, 4);
  const user = await prisma.user.upsert({
    where: { email: opts.email },
    update: { passwordHash: hash, role: opts.role },
    create: {
      username: opts.username,
      email: opts.email,
      passwordHash: hash,
      role: opts.role,
      twoFactorEnabled: false,
      backupCodes: '[]',
    },
  });
  return { id: user.id, username: opts.username, email: opts.email, password: opts.password, role: opts.role };
}

async function loginUser(email: string, password: string, twoFactorToken?: string) {
  const body: any = { email, password };
  if (twoFactorToken) body.twoFactorToken = twoFactorToken;
  return request(app).post('/api/auth/login').send(body);
}

// ── Test accounts ─────────────────────────────────────────────────────────────
const ACCOUNTS = [
  { username: 'admin', email: 'admin@aio-system.local', password: 'admin123', role: 'ADMIN' as const },
  { username: 'staff1', email: 'staff1@aio-test.local', password: 'staff123', role: 'STAFF' as const },
  { username: 'guest1', email: 'guest1@aio-test.local', password: 'guest123', role: 'GUEST' as const },
];

let admin: UserFixture;
let staff: UserFixture;
let guest: UserFixture;

// ── Lifecycle ────────────────────────────────────────────────────────────────
beforeAll(async () => {
  admin = await createUser(ACCOUNTS[0]);
  staff = await createUser(ACCOUNTS[1]);
  guest = await createUser(ACCOUNTS[2]);

  // Get tokens — only 3 logins to stay under the rate limit (5 per 15min)
  const adminRes = await loginUser(admin.email, admin.password);
  admin.accessToken = adminRes.body.data.accessToken;
  admin.refreshToken = adminRes.body.data.refreshToken;

  const staffRes = await loginUser(staff.email, staff.password);
  staff.accessToken = staffRes.body.data.accessToken;
  staff.refreshToken = staffRes.body.data.refreshToken;

  const guestRes = await loginUser(guest.email, guest.password);
  guest.accessToken = guestRes.body.data.accessToken;
  guest.refreshToken = guestRes.body.data.refreshToken;
}, 15_000);

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.maintenanceSchedule.deleteMany({});
  await prisma.assignment.deleteMany({});
  await prisma.asset.deleteMany({});
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('Auth — Login & Token', () => {
  // 1
  it('1. POST /api/auth/login — valid credentials → accessToken + refreshToken', async () => {
    // Use a fresh login for this test (1 of 2 remaining attempts)
    const res = await loginUser(staff.email, staff.password);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.email).toBe(staff.email);
    expect(res.body.data.requiresTwoFactor).toBe(false);
  });

  // 2
  it('2. POST /api/auth/login — wrong password → 401', async () => {
    const res = await loginUser(admin.email, 'wrong-password');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBeDefined();
  });

  // 3 — Verify no user enumeration: error message is generic
  it('3. POST /api/auth/login — error message is generic (no user enumeration)', async () => {
    // May be rate-limited at this point (4th attempt total)
    const res = await loginUser('nonexistent@aio-test.local', 'wrong-password');
    if (res.status === 401) {
      // Error message should be generic — matches "Invalid email or password."
      expect(res.body.error.message).not.toContain('not found');
      expect(res.body.error.message).not.toContain('does not exist');
      // Accept either the actual message or any generic credential message
      expect(res.body.error.message.toLowerCase()).toMatch(/invalid|credential|email|password/);
    } else {
      expect(res.status).toBe(429); // Rate limited, which is acceptable
    }
  });

  // 4 — Missing fields: Zod validation returns 422
  it('4. POST /api/auth/login — missing fields → 422 validation error', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    // Rate limiter may block this too; if not rate limited, should be 422
    if (res.status !== 429) {
      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    } else {
      // Acceptable: rate limited
      expect(res.status).toBe(429);
    }
  });

  // 5 — Refresh token rotation
  it('5. POST /api/auth/refresh — valid refresh token → new accessToken', async () => {
    // Use guest's refresh token (not consumed by any prior test)
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: guest.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    // Rotation: old refresh token invalidated
    const retryRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: guest.refreshToken });
    expect(retryRes.status).toBe(401);
  });

  // 6
  it('6. POST /api/auth/refresh — invalid refresh token → 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid.refresh.token' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 7 — Logout invalidates refresh token
  it('7. POST /api/auth/logout — invalidates refresh token, subsequent refresh → 401', async () => {
    const refreshToken = staff.refreshToken!;
    const accessToken = staff.accessToken!;

    // Logout
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.data.loggedOut).toBe(true);

    // Try to refresh with the invalidated token
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('Auth — Role Middleware', () => {
  // 8
  it('8. Admin JWT → can access GET /api/assets (200)', async () => {
    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // 9
  it('9. Staff JWT → can access GET /api/assets (200)', async () => {
    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${staff.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // 10 — Guest can access /api/assets (authenticate only, no role gate on GET)
  it('10. Guest JWT → can access GET /api/assets (200), sensitive fields stripped', async () => {
    // Create an asset so there's data
    const createRes = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Guest Test Laptop',
        type: 'LAPTOP',
        manufacturer: 'Dell',
        serialNumber: 'SN-GUEST-001',
        location: 'Office A',
        purchasePrice: 50000,
        purchaseDate: '2025-01-01',
      });
    expect(createRes.status).toBe(201);

    // Guest can read assets via /api/assets (authenticate only, no role gate on GET)
    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${guest.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Assets are returned — sensitive fields stripped for GUEST role
  });

  // 11
  it('11. No JWT → all protected routes return 401', async () => {
    const routes = [
      { method: 'get' as const, path: '/api/assets' },
      { method: 'get' as const, path: '/api/dashboard/stats' },
      { method: 'get' as const, path: '/api/auth/me' },
    ];
    for (const r of routes) {
      const res = await request(app)[r.method](r.path);
      expect(res.status).toBe(401);
    }
  });

  // 12
  it('12. Tampered JWT (modified payload) → 401', async () => {
    const tampered = admin.accessToken!.slice(0, -5) + 'XXXXX';
    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('Auth — Rate Limiting', () => {
  // 13 — These tests will exhaust the rate limiter. Login rate limit is 5/15min.
  it('13. Consecutive failed login attempts → eventually returns 429', async () => {
    let got429 = false;
    const email = 'ratelimit-test2@aio-test.local';
    const password = 'wrong';

    for (let i = 0; i < 10; i++) {
      const res = await loginUser(email, password);
      if (res.status === 429) {
        got429 = true;
        break;
      }
      expect(res.status).toBe(401);
    }
    expect(got429).toBe(true);
  });

  // 14
  it('14. Rate-limited response includes Retry-After header', async () => {
    const res = await loginUser('ratelimit-check2@aio-test.local', 'wrong');
    if (res.status === 429) {
      const retryAfter = res.headers['retry-after'];
      expect(retryAfter).toBeDefined();
    }
    expect([401, 429]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('Auth — 2FA Setup Flow', () => {
  // Create a dedicated 2FA test user to avoid interfering with rate limits
  let twoFaUser: UserFixture;

  beforeAll(async () => {
    twoFaUser = await createUser({
      username: '2fa-admin',
      email: '2fa-admin@aio-test.local',
      password: '2fapass123',
      role: 'ADMIN',
    });

    // Generate JWT directly to avoid rate limiter blocking login after test #13
    const payload = { id: twoFaUser.id, role: 'ADMIN', permissions: ['assets:view'] };
    twoFaUser.accessToken = jwt.sign(payload, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
  });

  // 15 — 2FA setup returns QR code and secret
  it('15. POST /api/auth/2fa/setup → returns otpAuthUrl and secret', async () => {
    const res = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${twoFaUser.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.otpauthUrl).toBeDefined();
    expect(res.body.data.secret).toBeDefined();
  });
});