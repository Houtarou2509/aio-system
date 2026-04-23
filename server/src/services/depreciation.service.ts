/**
 * Depreciation service — deprecated.
 * Fields (depreciationRate, salvageValue, currentValue) have been removed from the Asset model.
 * This service is kept as a stub to avoid breaking imports, but the cron job and report
 * are no longer functional.
 */

export function calculateDepreciation(_asset: any): null {
  return null;
}

export async function runDepreciationJob() {
  // No-op: depreciation fields removed from schema
  console.log('[Depreciation] Skipped — fields removed from schema');
}

export async function getDepreciationReport() {
  return {
    totalAssets: 0,
    totalPurchasePrice: 0,
    totalCurrentValue: 0,
    totalDepreciation: 0,
    assets: [],
  };
}