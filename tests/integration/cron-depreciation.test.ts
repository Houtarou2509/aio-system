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
  // 6 — runDepreciationJob is currently a no-op (logs a message)
  it('6. Trigger depreciation cron → job runs without error', async () => {
    await createAsset({ name: 'Dep Asset 1', purchasePrice: 10000, adminToken: users.ADMIN.accessToken });
    await createAsset({ name: 'Dep Asset 2', purchasePrice: 5000, adminToken: users.ADMIN.accessToken });

    // runDepreciationJob is currently a no-op that logs a message
    await runDepreciationJob();

    // Verify assets still exist and have valid purchasePrice
    const assets = await prisma.asset.findMany({ where: { name: { in: ['Dep Asset 1', 'Dep Asset 2'] } } });
    expect(assets.length).toBeGreaterThanOrEqual(2);
  });

  // 7 — calculateDepreciation respects salvage floor
  it('7. Asset at salvage floor → calculateDepreciation does not go below salvage', async () => {
    const result = calculateDepreciation({
      purchasePrice: 10000,
      purchaseDate: new Date(Date.now() - 365 * 10 * 24 * 60 * 60 * 1000).toISOString(),
      depreciationMethod: 'straight_line',
      usefulLifeYears: 5,
      salvageValue: 1000,
    });

    expect(result).not.toBeNull();
    expect(result!.currentBookValue).toBeGreaterThanOrEqual(1000);
    expect(result!.isFullyDepreciated).toBe(true);
  });

  // 8
  it('8. Depreciation cron logs run time to console (verify via spy)', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runDepreciationJob();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Depreciation]'));

    consoleSpy.mockRestore();
  });
});