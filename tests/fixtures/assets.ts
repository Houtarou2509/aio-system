import request from 'supertest';
import { app } from '../../server/src/index';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── Types ────────────────────────────────────────────────────────────────────
export interface UserFixture {
  id: string;
  username: string;
  email: string;
  password: string;
  role: string;
  accessToken: string;
  refreshToken: string;
}

export interface AssetFixture {
  id: string;
  name: string;
  type: string;
  status: string;
  [key: string]: any;
}

// ── User seeding ─────────────────────────────────────────────────────────────
const USER_DEFS = [
  { username: 'admin', email: 'admin@aio-system.local', password: 'admin123', role: 'ADMIN' as const },
  { username: 'staffadmin', email: 'staffadmin@aio-test.local', password: 'sa123', role: 'STAFF_ADMIN' as const },
  { username: 'staff1', email: 'staff1@aio-test.local', password: 'staff123', role: 'STAFF' as const },
  { username: 'guest1', email: 'guest1@aio-test.local', password: 'guest123', role: 'GUEST' as const },
];

export async function seedUsers(): Promise<Record<string, UserFixture>> {
  const users: Record<string, UserFixture> = {};

  for (const def of USER_DEFS) {
    const hash = await bcrypt.hash(def.password, 4);
    const user = await prisma.user.upsert({
      where: { email: def.email },
      update: { passwordHash: hash, role: def.role },
      create: {
        username: def.username,
        email: def.email,
        passwordHash: hash,
        role: def.role,
        twoFactorEnabled: false,
        backupCodes: '[]',
      },
    });

    // Login to get tokens
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: def.email, password: def.password });

    users[def.role] = {
      id: user.id,
      username: def.username,
      email: def.email,
      password: def.password,
      role: def.role,
      accessToken: res.body.data?.accessToken || '',
      refreshToken: res.body.data?.refreshToken || '',
    };
  }

  return users;
}

// ── Asset helpers ────────────────────────────────────────────────────────────
export async function createAsset(opts: {
  name?: string;
  type?: string;
  location?: string;
  serialNumber?: string;
  purchasePrice?: number;
  status?: string;
  adminToken: string;
}): Promise<AssetFixture> {
  const payload: any = {
    name: opts.name || `Test Asset ${Date.now()}`,
    type: opts.type || 'LAPTOP',
    location: opts.location || 'Office A',
    serialNumber: opts.serialNumber || `SN-${Date.now()}`,
    ...(opts.purchasePrice !== undefined && { purchasePrice: opts.purchasePrice }),
    ...(opts.status && { status: opts.status }),
  };

  const res = await request(app)
    .post('/api/assets')
    .set('Authorization', `Bearer ${opts.adminToken}`)
    .send(payload);

  if (res.status !== 201) {
    throw new Error(`createAsset failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return res.body.data;
}

export async function createCheckedOutAsset(opts: {
  name?: string;
  adminToken: string;
  userId: string;
}): Promise<{ asset: AssetFixture; assignment: any }> {
  const asset = await createAsset({
    name: opts.name || `Checked Out Asset ${Date.now()}`,
    adminToken: opts.adminToken,
  });

  const res = await request(app)
    .post(`/api/assets/${asset.id}/checkout`)
    .set('Authorization', `Bearer ${opts.adminToken}`)
    .send({ userId: opts.userId });

  if (res.status !== 201) {
    throw new Error(`checkout failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return { asset, assignment: res.body.data };
}

export async function cleanAssets() {
  await prisma.assignment.deleteMany({});
  await prisma.maintenanceLog.deleteMany({});
  await prisma.auditLog.deleteMany({ where: { entityType: 'Asset' } });
  await prisma.asset.deleteMany({});
}

export { prisma };