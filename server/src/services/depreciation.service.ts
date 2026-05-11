/**
 * Depreciation service — backend calculation engine.
 * Supports straight-line and declining-balance methods.
 */
import { prisma } from '../lib/prisma';
import { Asset } from '@prisma/client';

export interface DepreciationResult {
  purchasePrice: number;
  salvageValue: number;
  usefulLifeYears: number;
  method: string;
  annualDepreciation: number;
  currentBookValue: number;
  accumulatedDepreciation: number;
  depreciationPercent: number;
  ageYears: number;
  isFullyDepreciated: boolean;
}

/**
 * Calculate depreciation for a single asset.
 * Returns null if missing purchasePrice, purchaseDate, or usefulLifeYears.
 */
export function calculateDepreciation(asset: {
  purchasePrice?: any;
  purchaseDate?: any;
  depreciationMethod?: string | null;
  usefulLifeYears?: number | null;
  salvageValue?: any;
}): DepreciationResult | null {
  const price = Number(asset.purchasePrice);
  const date = asset.purchaseDate;
  const life = asset.usefulLifeYears ?? undefined;

  if (!price || price <= 0 || !date || !life || life <= 0) return null;

  const purchase = new Date(date);
  const now = new Date();
  const salvage = Number(asset.salvageValue ?? 0);
  const method = asset.depreciationMethod || 'straight_line';

  const ageMs = now.getTime() - purchase.getTime();
  const ageYears = Math.max(0, ageMs / (365.25 * 24 * 60 * 60 * 1000));

  let annualDepreciation: number;
  let currentBookValue: number;
  let accumulatedDepreciation: number;

  if (method === 'declining_balance') {
    // Declining balance: annual rate = 2 / usefulLifeYears
    // bookValue = price * (1 - rate)^ageYears, floor at salvageValue
    const rate = 2 / life;
    const rawBookValue = price * Math.pow(1 - rate, ageYears);
    currentBookValue = Math.max(salvage, rawBookValue);
    accumulatedDepreciation = price - currentBookValue;
    annualDepreciation = price * rate;
  } else {
    // Straight-line (default)
    const depreciableAmount = price - salvage;
    annualDepreciation = depreciableAmount / life;
    accumulatedDepreciation = Math.min(depreciableAmount, annualDepreciation * ageYears);
    currentBookValue = Math.max(salvage, price - accumulatedDepreciation);
  }

  const depreciationPercent = price > 0 ? (accumulatedDepreciation / (price - salvage)) * 100 : 0;
  const isFullyDepreciated = currentBookValue <= salvage && ageYears >= life;

  return {
    purchasePrice: price,
    salvageValue: salvage,
    usefulLifeYears: life,
    method,
    annualDepreciation: Math.round(annualDepreciation * 100) / 100,
    currentBookValue: Math.round(currentBookValue * 100) / 100,
    accumulatedDepreciation: Math.round(accumulatedDepreciation * 100) / 100,
    depreciationPercent: Math.min(100, Math.round(depreciationPercent * 10) / 10),
    ageYears: Math.round(ageYears * 10) / 10,
    isFullyDepreciated,
  };
}

/**
 * Run depreciation job (cron) — no-op for now but kept for future automation.
 */
export async function runDepreciationJob() {
  console.log('[Depreciation] Job tick — no automated write-back scheduled');
}

/**
 * Generate the depreciation summary report for all assets with purchase data.
 */
export async function getDepreciationReport() {
  const assets = await prisma.asset.findMany({
    where: {
      deletedAt: null,
      purchasePrice: { not: null },
      purchaseDate: { not: null },
    },
    select: {
      id: true,
      name: true,
      type: true,
      purchasePrice: true,
      purchaseDate: true,
      depreciationMethod: true,
      usefulLifeYears: true,
      salvageValue: true,
      status: true,
      location: true,
    },
    orderBy: { name: 'asc' },
  });

  const results = assets
    .map((asset) => {
      const calc = calculateDepreciation(asset);
      if (!calc) return null;
      return {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        status: asset.status,
        location: asset.location,
        purchasePrice: calc.purchasePrice,
        purchaseDate: asset.purchaseDate,
        method: calc.method,
        usefulLifeYears: calc.usefulLifeYears,
        salvageValue: calc.salvageValue,
        currentBookValue: calc.currentBookValue,
        annualDepreciation: calc.annualDepreciation,
        accumulatedDepreciation: calc.accumulatedDepreciation,
        depreciationPercent: calc.depreciationPercent,
        ageYears: calc.ageYears,
        isFullyDepreciated: calc.isFullyDepreciated,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.depreciationPercent - a!.depreciationPercent); // most depreciated first

  const totalPurchasePrice = results.reduce((sum, r) => sum + (r?.purchasePrice ?? 0), 0);
  const totalCurrentValue = results.reduce((sum, r) => sum + (r?.currentBookValue ?? 0), 0);
  const totalDepreciation = totalPurchasePrice - totalCurrentValue;

  return {
    totalAssets: results.length,
    totalPurchasePrice: Math.round(totalPurchasePrice * 100) / 100,
    totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
    totalDepreciation: Math.round(totalDepreciation * 100) / 100,
    totalDepreciationPercent: totalPurchasePrice > 0
      ? Math.round((totalDepreciation / totalPurchasePrice) * 1000) / 10
      : 0,
    assets: results,
  };
}
