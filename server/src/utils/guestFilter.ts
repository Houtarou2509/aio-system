/**
 * Strip sensitive fields from asset responses for Guest users.
 * Guests should not see: purchasePrice, serialNumber
 */
export function filterAssetForGuest(asset: any): any {
  if (!asset) return asset;
  const { purchasePrice, serialNumber, ...rest } = asset;
  return rest;
}

export function filterAssetsForGuest(assets: any[]): any[] {
  return assets.map(filterAssetForGuest);
}