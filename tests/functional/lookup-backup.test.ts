import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { PrismaClient, LookupCategory } from '@prisma/client';
import { seedUsers, type UserFixture } from '../fixtures/assets';

const prisma = new PrismaClient();

let users: Record<string, UserFixture>;
let adminToken: string;
let staffAdminToken: string;
let staffToken: string;
let guestToken: string;

beforeAll(async () => {
  users = await seedUsers();
  adminToken = users.ADMIN.accessToken;
  staffAdminToken = users.STAFF_ADMIN?.accessToken || '';
  staffToken = users.STAFF?.accessToken || '';
  guestToken = users.GUEST?.accessToken || '';
}, 15_000);

afterAll(async () => {
  await prisma.$disconnect();
});

function validBackupPayload(opts: {
  assetTypes?: string[];
  manufacturers?: string[];
  locations?: string[];
  owners?: string[];
  designations?: string[];
  institutions?: string[];
  projects?: string[];
} = {}) {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    source: 'aio-system',
    modules: {
      inventory: {
        assetTypes: (opts.assetTypes ?? ['Air Purifier', 'Smart TV', 'Router']).map(v => ({ value: v, isActive: true })),
        manufacturers: (opts.manufacturers ?? ['LG']).map(v => ({ value: v, isActive: true })),
        locations: (opts.locations ?? ['Room 1313']).map(v => ({ value: v, isActive: true })),
        owners: (opts.owners ?? ['UPPI']).map(v => ({ value: v, isActive: true })),
      },
      accountability: {
        designations: (opts.designations ?? ['Research Assistant']).map(n => ({ name: n, status: 'active' })),
        institutions: (opts.institutions ?? ['UPPI']).map(n => ({ name: n, status: 'active' })),
        projects: (opts.projects ?? ['AIO']).map(n => ({ name: n, status: 'active' })),
      },
    },
  };
}

describe('Lookup backup export/import', () => {
  beforeEach(async () => {
    await prisma.lookupValue.deleteMany({
      where: { value: { in: ['Air Purifier', 'Smart TV', 'Router', 'LG', 'Room 1313', 'UPPI', 'Local Only Type'] } },
    });
    await prisma.designationLookup.deleteMany({
      where: { name: { in: ['Research Assistant', 'Backup RA', 'Local Only'] } },
    });
    await prisma.institutionLookup.deleteMany({
      where: { name: { in: ['UPPI', 'Backup Institution', 'Local Institution'] } },
    });
    await prisma.projectLookup.deleteMany({
      where: { name: { in: ['AIO', 'Backup Project', 'Local Project'] } },
    });
  });

  it('ADMIN can export lookup backup without database IDs', async () => {
    const res = await request(app)
      .get('/api/lookup-backup/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.schemaVersion).toBe(1);
    expect(res.body.data.modules.inventory).toBeDefined();
    expect(res.body.data.modules.accountability).toBeDefined();
    expect(res.body.data.modules.inventory.assetTypes).toBeInstanceOf(Array);
    expect(res.body.data.modules.accountability.designations).toBeInstanceOf(Array);
    expect(JSON.stringify(res.body.data)).not.toMatch(/"id":\s*\d+/);
    expect(JSON.stringify(res.body.data)).not.toMatch(/createdAt/);
    expect(JSON.stringify(res.body.data)).not.toMatch(/updatedAt/);
  });

  it('STAFF_ADMIN can export lookup backup', async () => {
    const res = await request(app)
      .get('/api/lookup-backup/export')
      .set('Authorization', `Bearer ${staffAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('STAFF and GUEST cannot export or import lookup backup', async () => {
    const exportStaff = await request(app)
      .get('/api/lookup-backup/export')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(exportStaff.status).toBe(403);

    const exportGuest = await request(app)
      .get('/api/lookup-backup/export')
      .set('Authorization', `Bearer ${guestToken}`);
    expect(exportGuest.status).toBe(403);

    const importStaff = await request(app)
      .post('/api/lookup-backup/import')
      .set('Authorization', `Bearer ${staffToken}`)
      .send(validBackupPayload());
    expect(importStaff.status).toBe(403);

    const importGuest = await request(app)
      .post('/api/lookup-backup/import')
      .set('Authorization', `Bearer ${guestToken}`)
      .send(validBackupPayload());
    expect(importGuest.status).toBe(403);
  });

  it('import creates missing inventory lookup values', async () => {
    const payload = validBackupPayload();
    const res = await request(app)
      .post('/api/lookup-backup/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const inv = res.body.data.groups['inventory.assetTypes'];
    expect(inv.created).toBeGreaterThanOrEqual(3);
    expect(inv.updated).toBe(0);

    const created = await prisma.lookupValue.findMany({
      where: { category: LookupCategory.ASSET_TYPE, value: { in: ['Air Purifier', 'Smart TV', 'Router'] } },
    });
    expect(created.length).toBe(3);
    expect(created.every(c => c.isActive)).toBe(true);
  });

  it('import updates existing inventory isActive', async () => {
    await prisma.lookupValue.create({
      data: { category: LookupCategory.ASSET_TYPE, value: 'Air Purifier', isActive: false },
    });

    const res = await request(app)
      .post('/api/lookup-backup/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBackupPayload());

    expect(res.status).toBe(200);
    const inv = res.body.data.groups['inventory.assetTypes'];
    expect(inv.updated).toBeGreaterThanOrEqual(1);

    const updated = await prisma.lookupValue.findFirst({
      where: { category: LookupCategory.ASSET_TYPE, value: 'Air Purifier' },
    });
    expect(updated?.isActive).toBe(true);
  });

  it('import creates missing accountability values', async () => {
    const res = await request(app)
      .post('/api/lookup-backup/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBackupPayload());

    expect(res.status).toBe(200);
    const des = res.body.data.groups['accountability.designations'];
    expect(des.created).toBeGreaterThanOrEqual(1);

    const created = await prisma.designationLookup.findFirst({ where: { name: 'Research Assistant' } });
    expect(created).toBeTruthy();
    expect(created?.status).toBe('active');
  });

  it('import updates accountability statuses', async () => {
    await prisma.designationLookup.create({ data: { name: 'Research Assistant', status: 'inactive' } });

    const res = await request(app)
      .post('/api/lookup-backup/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBackupPayload({ designations: ['Research Assistant'] }));

    expect(res.status).toBe(200);
    expect(res.body.data.groups['accountability.designations'].updated).toBe(1);

    const updated = await prisma.designationLookup.findFirst({ where: { name: 'Research Assistant' } });
    expect(updated?.status).toBe('active');
  });

  it('import rejects invalid schemaVersion', async () => {
    const res = await request(app)
      .post('/api/lookup-backup/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validBackupPayload(), schemaVersion: 2 });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('import rejects invalid designation status', async () => {
    const payload = validBackupPayload({ designations: ['Bad Designation'] });
    payload.modules.accountability.designations[0].status = 'completed';

    const res = await request(app)
      .post('/api/lookup-backup/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.message).toMatch(/status/i);
  });

  it('import rejects invalid institution status', async () => {
    const payload = validBackupPayload({ institutions: ['Bad Institution'] });
    payload.modules.accountability.institutions[0].status = 'archived';

    const res = await request(app)
      .post('/api/lookup-backup/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.message).toMatch(/status/i);
  });

  it('import rejects invalid project status', async () => {
    const payload = validBackupPayload({ projects: ['Bad Project'] });
    payload.modules.accountability.projects[0].status = 'deleted';

    const res = await request(app)
      .post('/api/lookup-backup/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.message).toMatch(/status/i);
  });

  it('import does not delete local-only values absent from backup', async () => {
    await prisma.lookupValue.upsert({
      where: { category_value: { category: LookupCategory.ASSET_TYPE, value: 'Local Only Type' } },
      update: { isActive: true },
      create: { category: LookupCategory.ASSET_TYPE, value: 'Local Only Type', isActive: true },
    });
    await prisma.designationLookup.upsert({
      where: { name: 'Local Only' },
      update: { status: 'active' },
      create: { name: 'Local Only', status: 'active' },
    });

    const res = await request(app)
      .post('/api/lookup-backup/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBackupPayload());

    expect(res.status).toBe(200);

    const localType = await prisma.lookupValue.findFirst({ where: { value: 'Local Only Type' } });
    expect(localType).toBeTruthy();
    const localDes = await prisma.designationLookup.findFirst({ where: { name: 'Local Only' } });
    expect(localDes).toBeTruthy();
  });

  it('import deduplicates repeated values case-insensitively inside same JSON group', async () => {
    const payload = validBackupPayload({ assetTypes: ['Router', 'router', 'ROUTER'] });
    const res = await request(app)
      .post('/api/lookup-backup/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(200);
    const inv = res.body.data.groups['inventory.assetTypes'];
    expect(inv.created).toBe(1);
    expect(inv.skipped).toBe(2);
  });
});
