/**
 * Straight-line depreciation utilities for AIO-System.
 * Useful life defaults by asset type (in years).
 */

export const USEFUL_LIFE_YEARS: Record<string, number> = {
  LAPTOP: 3,
  DESKTOP: 4,
  MONITOR: 5,
  FURNITURE: 7,
  EQUIPMENT: 5,
  PERIPHERAL: 3,
  OTHER: 5,
};

export interface DepreciationPoint {
  year: number;        // 0 = purchase, 1 = after 1 year, etc.
  label: string;       // "Year 0", "Year 1", etc.
  value: number;       // book value at that year
  depreciation: number; // cumulative depreciation
}

export interface DepreciationResult {
  purchasePrice: number;
  salvageValue: number;
  usefulLife: number;
  annualDepreciation: number;
  currentBookValue: number;
  ageYears: number;
  isFullyDepreciated: boolean;
  schedule: DepreciationPoint[];
}

/**
 * Calculate straight-line depreciation schedule.
 * Salvage value is assumed to be 10% of purchase price (or ₱1 minimum).
 */
export function calculateDepreciation(
  purchasePrice: number,
  purchaseDate: string | Date | null | undefined,
  assetType: string,
  asOfDate: Date = new Date(),
): DepreciationResult | null {
  if (!purchasePrice || purchasePrice <= 0 || !purchaseDate) return null;

  const usefulLife = USEFUL_LIFE_YEARS[assetType] || 5;
  const salvageValue = Math.max(purchasePrice * 0.1, 1);
  const depreciableAmount = purchasePrice - salvageValue;
  const annualDepreciation = depreciableAmount / usefulLife;

  const purchase = new Date(purchaseDate);
  const ageMs = asOfDate.getTime() - purchase.getTime();
  const ageYears = Math.max(0, ageMs / (365.25 * 24 * 60 * 60 * 1000));

  const currentBookValue = Math.max(salvageValue, purchasePrice - annualDepreciation * ageYears);
  const isFullyDepreciated = currentBookValue <= salvageValue;

  // Build schedule from purchase year to end of useful life + 1
  const schedule: DepreciationPoint[] = [];
  for (let year = 0; year <= usefulLife; year++) {
    const value = Math.max(salvageValue, purchasePrice - annualDepreciation * year);
    const depreciation = Math.min(depreciableAmount, annualDepreciation * year);
    schedule.push({
      year,
      label: year === 0 ? 'Purchase' : `Year ${year}`,
      value: Math.round(value * 100) / 100,
      depreciation: Math.round(depreciation * 100) / 100,
    });
  }

  return {
    purchasePrice,
    salvageValue: Math.round(salvageValue * 100) / 100,
    usefulLife,
    annualDepreciation: Math.round(annualDepreciation * 100) / 100,
    currentBookValue: Math.round(currentBookValue * 100) / 100,
    ageYears: Math.round(ageYears * 10) / 10,
    isFullyDepreciated,
    schedule,
  };
}