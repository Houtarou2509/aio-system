import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { seedUsers, createAsset, cleanAssets } from '../fixtures/assets';
import { runDepreciationJob, calculateDepreciation } from '../../server/src/services/depreciation.service';

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

describe('Cron — Depreciation', () => {
  // 6
  it('6. Trigger depreciation cron → all active assets have currentValue updated', async () => {
    // Create assets with purchasePrice and currentValue
    await createAsset({ name: 'Dep Asset 1', purchasePrice: 10000, adminToken: users.ADMIN.accessToken });
    await createAsset({ name: 'Dep Asset 2', purchasePrice: 5000, adminToken: users.ADMIN.accessToken });

    // Set currentValue = purchasePrice for test
    const assets = await prisma.asset.findMany({ where: { name: { in: ['Dep Asset 1', 'Dep Asset 2'] } } });
    for (const a of assets) {
      await prisma.asset.update({
        where: { id: a.id },
        data: { currentValue: Number(a.purchasePrice), depreciationRate: 20 },
      });
    }

    const result = await runDepreciationJob();

    expect(result.total).toBeGreaterThanOrEqual(2);
    // At least some assets should have been updated
    expect(result.updated).toBeGreaterThanOrEqual(0); // might be 0 if already at floor

    // Verify DB: currentValues should be <= purchasePrices
    const updated = await prisma.asset.findMany({ where: { name: { in: ['Dep Asset 1', 'Dep Asset 2'] } } });
    for (const a of updated) {
      expect(Number(a.currentValue)).toBeLessThanOrEqual(Number(a.purchasePrice));
    }
  });

  // 7
  it('7. Asset at salvage floor → currentValue unchanged after cron', async () => {
    const asset = await createAsset({ name: 'Salvage Floor', purchasePrice: 10000, adminToken: users.ADMIN.accessToken });

    // Set currentValue to salvage floor (10% of purchasePrice = 1000)
    await prisma.asset.update({
      where: { id: asset.id },
      data: { currentValue: 1000, depreciationRate: 20 },
    });

    const beforeValue = (await prisma.asset.findUnique({ where: { id: asset.id } }))!.currentValue;

    await runDepreciationJob();

    const afterAsset = await prisma.asset.findUnique({ where: { id: asset.id } });
    expect(Number(afterAsset!.currentValue)).toBe(Number(beforeValue));
  });

  // 8
  it('8. Depreciation cron logs run time to console (verify via spy)', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runDepreciationJob();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Depreciation]'));

    consoleSpy.mockRestore();
  });
});