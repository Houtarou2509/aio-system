import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { PrismaClient } from '@prisma/client';
import { seedUsers, createAsset, cleanAssets, createCheckedOutAsset, createPersonnel } from '../fixtures/assets';

const prisma = new PrismaClient();
let users: Record<string, any>;
let testPersonnel: { id: string; fullName: string };

beforeAll(async () => {
  users = await seedUsers();
}, 15_000);

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await cleanAssets();
  testPersonnel = await createPersonnel({ fullName: 'Integration Person', designation: 'Staff', project: 'QA' });
});

describe('API + Database Integration', () => {
  // 1
  it('1. POST /api/assets then GET /api/assets/:id — persists with correct fields', async () => {
    const createRes = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        name: 'Integration Laptop',
        type: 'LAPTOP',
        manufacturer: 'Dell',
        serialNumber: 'SN-INT-001',
        purchasePrice: 50000,
        purchaseDate: '2025-01-01',
        location: 'Server Room',
      });

    expect(createRes.status).toBe(201);
    const assetId = createRes.body.data.id;

    const getRes = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.name).toBe('Integration Laptop');
    expect(getRes.body.data.type).toBe('LAPTOP');
    expect(getRes.body.data.manufacturer).toBe('Dell');
    expect(getRes.body.data.serialNumber).toBe('SN-INT-001');
    expect(Number(getRes.body.data.purchasePrice)).toBe(50000);
    expect(getRes.body.data.location).toBe('Server Room');

    // Verify directly in DB
    const dbAsset = await prisma.asset.findUnique({ where: { id: assetId } });
    expect(dbAsset).not.toBeNull();
    expect(dbAsset!.name).toBe('Integration Laptop');
    expect(dbAsset!.serialNumber).toBe('SN-INT-001');
  });

  // 2 — Issuance creates assignment, asset status → ASSIGNED
  it('2. Issuance → status=ASSIGNED, assignment exists', async () => {
    const result = await createCheckedOutAsset({
      name: 'Checkout Integration',
      adminToken: users.ADMIN.accessToken,
      personnelId: testPersonnel.id,
    });

    const res = await request(app)
      .get(`/api/assets/${result.asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.body.data.status).toBe('ASSIGNED');

    // Verify DB: assignment exists
    const assignment = await prisma.assignment.findFirst({
      where: { assetId: result.asset.id },
    });
    expect(assignment).not.toBeNull();
    expect(assignment!.personnelId).not.toBeNull();
  });

  // 3 — Return closes assignment, status → AVAILABLE
  it('3. Return → status=AVAILABLE, assignment has returnedAt', async () => {
    const result = await createCheckedOutAsset({
      name: 'Return Integration',
      adminToken: users.ADMIN.accessToken,
      personnelId: testPersonnel.id,
    });

    // Return via issuance return endpoint
    const assignment = await prisma.assignment.findFirst({
      where: { assetId: result.asset.id },
    });

    const returnRes = await request(app)
      .post(`/api/issuances/${assignment!.id}/return`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ condition: 'Good', notes: 'Returned OK' });

    expect([200, 201]).toContain(returnRes.status);

    const res = await request(app)
      .get(`/api/assets/${result.asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.body.data.status).toBe('AVAILABLE');

    // Verify assignment has returnedAt in DB
    const returnedAssignment = await prisma.assignment.findFirst({
      where: { assetId: result.asset.id },
      orderBy: { assignedAt: 'desc' },
    });
    expect(returnedAssignment).not.toBeNull();
    expect(returnedAssignment!.returnedAt).not.toBeNull();
  });

  // 4 — Update purchasePrice → depreciation report reflects updated values
  it('4. PUT changing purchasePrice → depreciation report reflects updated values', async () => {
    const asset = await createAsset({ name: 'Dep Report', purchasePrice: 10000, adminToken: users.ADMIN.accessToken });

    await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ purchasePrice: 20000 });

    const res = await request(app)
      .get('/api/reports/depreciation-summary')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    // The report key is totalPurchasePrice (matching depreciation service output)
    expect(res.body.data.totalPurchasePrice).toBeGreaterThanOrEqual(20000);
  });

  // 5 — Soft delete
  it('5. DELETE → soft-deleted asset excluded from default list but exists in DB', async () => {
    const asset = await createAsset({ name: 'Soft Delete Integration', adminToken: users.ADMIN.accessToken });

    await request(app)
      .delete(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    // Not in default list
    const listRes = await request(app)
      .get('/api/assets?status=AVAILABLE')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    const names = listRes.body.data.map((a: any) => a.name);
    expect(names).not.toContain('Soft Delete Integration');

    // Still in DB
    const dbAsset = await prisma.asset.findUnique({ where: { id: asset.id } });
    expect(dbAsset).not.toBeNull();
    expect(dbAsset!.status).toBe('RETIRED');
  });
});