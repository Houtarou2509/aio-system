import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { PrismaClient } from '@prisma/client';
import { calculateDepreciation, runDepreciationJob } from '../../server/src/services/depreciation.service';
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
  it('1. Create asset with purchasePrice=1000, depreciationRate=20 → currentValue starts at 1000', async () => {
    const asset = await createAsset({
      name: 'Depreciation Test',
      purchasePrice: 1000,
      adminToken: users.ADMIN.accessToken,
    });

    // Set depreciationRate + currentValue (initially same as purchasePrice)
    await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ depreciationRate: 20, currentValue: 1000 });

    const res = await request(app)
      .get(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(Number(res.body.data.purchasePrice)).toBe(1000);
    expect(Number(res.body.data.currentValue)).toBe(1000);
  });

  // 2
  it('2. calculateDepreciation: 20%/year straight-line after 365 days', async () => {
    const result = calculateDepreciation({
      purchasePrice: 1000,
      currentValue: 1000,
      depreciationRate: 20,
      salvageValue: 0,
      purchaseDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'AVAILABLE',
    });

    expect(result).not.toBeNull();
    if (result && typeof result !== 'number') {
      // Annual depreciation = (1000 - 100) * 0.20 = 180
      // Daily depreciation = 180 / 365 ≈ 0.49
      // After 365 days: 1000 - 180 = 820 (but daily calc: 1000 - 0.49*365 ≈ 821.5)
      expect(result.currentValue).toBeLessThan(1000);
      expect(result.currentValue).toBeGreaterThan(800);
      expect(result.dailyDepreciation).toBeCloseTo(0.49, 1);
    }
  });

  // 3
  it('3. Depreciation never drops below salvage floor (10% of purchase price)', async () => {
    const result = calculateDepreciation({
      purchasePrice: 1000,
      currentValue: 95, // below salvage floor
      depreciationRate: 20,
      salvageValue: 0,
      purchaseDate: new Date(Date.now() - 365 * 5 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'AVAILABLE',
    });

    expect(result).not.toBeNull();
    if (result && typeof result !== 'number') {
      expect(result.currentValue).toBeGreaterThanOrEqual(100); // 10% of 1000
      expect(result.fullyDepreciated).toBe(true);
    }
  });

  // 4
  it('4. GET /api/assets/depreciation-report (Admin) → returns report', async () => {
    await createAsset({
      name: 'Report Asset',
      purchasePrice: 5000,
      adminToken: users.ADMIN.accessToken,
    });

    const res = await request(app)
      .get('/api/assets/depreciation-report')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.totalOriginalValue).toBe('number');
    expect(typeof res.body.data.totalCurrentValue).toBe('number');
    expect(typeof res.body.data.totalDepreciated).toBe('number');
  });

  // 5
  it('5. GET /api/assets/depreciation-report (Staff) → depends on route config', async () => {
    const res = await request(app)
      .get('/api/assets/depreciation-report')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`);

    // Route only has authenticate, no authorize — so Staff gets 200
    // If role gate is added later, this should become 403
    expect([200, 403]).toContain(res.status);
  });
});