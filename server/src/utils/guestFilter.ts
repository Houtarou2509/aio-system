/**
 * Strip sensitive fields from asset responses for Guest users.
 *
 * Guests should NOT see:
 * - purchasePrice, acquisitionDate, acquisitionCost
 * - serialNumber
 * - warrantyDetails, warrantyExpiry
 * - supplier cost/contact details (supplierId)
 * - assignedTo personnel details
 * - conditionNotes, notes (internal maintenance notes)
 * - audit metadata (createdAt, updatedAt, createdBy)
 *
 * They CAN see:
 * - id, assetTag, name, type, category, status, location, room, building
 * - description, image (if any)
 * - condition (general condition rating only)
 */

// Fields to remove from single asset objects
const GUEST_EXCLUDED_FIELDS = [
  'purchasePrice',
  'acquisitionDate',
  'acquisitionCost',
  'serialNumber',
  'warrantyDetails',
  'warrantyExpiry',
  'supplierId',
  'supplierName',
  'assignedTo',
  'assignedToId',
  'conditionNotes',
  'notes',
  'createdAt',
  'updatedAt',
  'createdBy',
  'depreciationRate',
  'currentValue',
  'replacementCost',
  'poNumber',
  'invoiceNumber',
  'fundingSource',
  'departmentId',
];

export function filterAssetForGuest(asset: any): any {
  if (!asset) return asset;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(asset)) {
    if (!GUEST_EXCLUDED_FIELDS.includes(key)) {
      result[key] = value;
    }
  }
  return result;
}

export function filterAssetsForGuest(assets: any[]): any[] {
  return assets.map(filterAssetForGuest);
}

/**
 * Sanitize asset stats for Guest users.
 * Remove financial totals and sensitive breakdowns.
 */
export function filterStatsForGuest(stats: any): any {
  if (!stats) return stats;
  const {
    totalValue,
    totalAcquisitionCost,
    totalReplacementCost,
    totalDepreciation,
    averageValue,
    valueByCategory,
    valueByLocation,
    valueByDepartment,
    costByCategory,
    costByDepartment,
    ...rest
  } = stats;
  return rest;
}