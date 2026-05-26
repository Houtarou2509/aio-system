/**
 * Client-side filter for GUEST users — removes sensitive asset fields.
 * Mirrors the server-side guestFilter.ts for UI rendering.
 * These fields should be hidden/omitted from the AssetPage and AssetFormModal.
 */

export const GUEST_HIDDEN_FIELDS = [
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
  'depreciationRate',
  'currentValue',
  'replacementCost',
  'poNumber',
  'invoiceNumber',
  'fundingSource',
  'departmentId',
] as const;

export type GuestHiddenField = typeof GUEST_HIDDEN_FIELDS[number];

/** Returns true if the field should be hidden from GUEST users. */
export function isGuestHiddenField(field: string, userRole: string | undefined): boolean {
  if (userRole !== 'GUEST') return false;
  return (GUEST_HIDDEN_FIELDS as readonly string[]).includes(field);
}

/** Filters sensitive fields from an asset object for GUEST users. */
export function filterAssetForGuestView(asset: any, userRole: string | undefined): any {
  if (userRole !== 'GUEST' || !asset) return asset;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(asset)) {
    if (!(GUEST_HIDDEN_FIELDS as readonly string[]).includes(key)) {
      result[key] = value;
    }
  }
  return result;
}