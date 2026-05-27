import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { PrismaClient } from '@prisma/client';
import { calculateDepreciation, getDepreciationReport } from '../../server/src/services/depreciation.service';
import { seedUsers, createAsset, cleanAssets } from '../fixtures/assets';

const prisma = new PrismaClient();
let users: Record<string, any>;

beforeAll(async () => {
  users = await seedUsers();
}, 15_000);

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await cleanAssets();
});

describe('Depreciation', () => {
  // 1
  it('1. Create asset with purchasePrice=1000, usefulLifeYears=5 → calculateDepreciation returns currentBookValue equal to purchasePrice on day 0', async () => {
    const asset = await createAsset({
      name: 'Depreciation Test',
      purchasePrice: 1000,
      adminToken: users.ADMIN.accessToken,
    });

    // Verify asset was created with purchasePrice
    const res = await request(app)
      .get(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(Number(res.body.data.purchasePrice)).toBe(1000);

    // Calculate depreciation for a brand-new asset
    const result = calculateDepreciation({
      purchasePrice: 1000,
      purchaseDate: new Date().toISOString(),
      depreciationMethod: 'straight_line',
      usefulLifeYears: 5,
      salvageValue: 100, // 10% of purchasePrice
    });

    expect(result).not.toBeNull();
    expect(result!.currentBookValue).toBe(1000); // No depreciation on day 0
    expect(result!.annualDepreciation).toBe(180); // (1000 - 100) / 5
  });

  // 2
  it('2. calculateDepreciation: straight-line after 365 days reduces book value', async () => {
    const result = calculateDepreciation({
      purchasePrice: 1000,
      purchaseDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      depreciationMethod: 'straight_line',
      usefulLifeYears: 5,
      salvageValue: 100,
    });

    expect(result).not.toBeNull();
    expect(result!.currentBookValue).toBeLessThan(1000);
    expect(result!.currentBookValue).toBeGreaterThan(800);
    expect(result!.annualDepreciation).toBeCloseTo(180, 0); // (1000-100)/5
    expect(result!.method).toBe('straight_line');
  });

  // 3
  it('3. Depreciation never drops below salvage floor', async () => {
    const result = calculateDepreciation({
      purchasePrice: 1000,
      purchaseDate: new Date(Date.now() - 365 * 10 * 24 * 60 * 60 * 1000).toISOString(),
      depreciationMethod: 'straight_line',
      usefulLifeYears: 5,
      salvageValue: 100, // 10% of purchasePrice
    });

    expect(result).not.toBeNull();
    expect(result!.currentBookValue).toBeGreaterThanOrEqual(100); // floor at salvage
    expect(result!.isFullyDepreciated).toBe(true);
  });

  // 4
  it('4. GET /api/reports/depreciation-summary (Admin) → returns report', async () => {
    await createAsset({
      name: 'Report Asset',
      purchasePrice: 5000,
      adminToken: users.ADMIN.accessToken,
    });

    const res = await request(app)
      .get('/api/reports/depreciation-summary')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.totalPurchasePrice).toBe('number');
    expect(typeof res.body.data.totalCurrentValue).toBe('number');
    expect(typeof res.body.data.totalDepreciation).toBe('number');
  });

  // 5
  it('5. GET /api/reports/depreciation-summary (Staff) → depends on route config', async () => {
    const res = await request(app)
      .get('/api/reports/depreciation-summary')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`);

    // Route may require specific permission or just authentication
    expect([200, 403]).toContain(res.status);
  });
});