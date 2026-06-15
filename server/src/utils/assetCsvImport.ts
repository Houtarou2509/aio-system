/**
 * Asset CSV import utilities
 *
 * Normalizes parsed CSV records so both the import-template headers
 * (camelCase) and the asset-export-display headers (human-readable) work
 * interchangeably. Blank values are coerced to null where appropriate.
 */

import { parse } from 'csv-parse/sync';

export const CSV_FIELD_ALIASES: Record<string, string[]> = {
  name: ['name', 'asset name'],
  type: ['type', 'asset type'],
  status: ['status'],
  manufacturer: ['manufacturer'],
  serialNumber: ['serialnumber', 'serial number', 's/n', 'sn', 'serial no', 'serial no.'],
  propertyNumber: ['propertynumber', 'property #', 'property number', 'property no.', 'property no', 'property no:', 'property no.:'],
  price: ['price', 'purchase price'],
  purchaseDate: ['purchasedate', 'purchase date'],
  assignedTo: ['assignedto', 'assigned to', 'assignee'],
  location: ['location'],
  owner: ['owner'],
  remarks: ['remarks', 'notes'],
  warrantyExpiry: ['warrantyexpiry', 'warranty expiry', 'warranty expiry date'],
  warrantyNotes: ['warrantynotes', 'warranty notes'],
};

const IGNORED_HEADERS = new Set([
  'added date',
  'createdat',
  'created at',
]);

/**
 * Normalize a raw CSV header into one of the canonical internal field names.
 * Returns null if the header should be ignored.
 *
 * Matching is exact after canonicalization: trimming, lower-casing, and
 * collapsing spaces/underscores/dashes/periods/slashes/# to a single space.
 * No partial or fuzzy matching is performed, so short vague headers like
 * "Date" or "No" will not accidentally map to purchaseDate or propertyNumber.
 */
export function normalizeCsvHeader(rawHeader: string): string | null {
  if (rawHeader === undefined || rawHeader === null || rawHeader.trim() === '') return null;

  const key = canonicalizeHeader(rawHeader);
  if (key === '' || IGNORED_HEADERS.has(key)) return null;

  for (const [canonical, aliases] of Object.entries(CSV_FIELD_ALIASES)) {
    const canonicalKey = canonicalizeHeader(canonical);
    if (key === canonicalKey) return canonical;

    for (const alias of aliases) {
      if (canonicalizeHeader(alias) === key) {
        return canonical;
      }
    }
  }

  // Unknown headers are ignored. We do not fall back to partial matching.
  return null;
}

/**
 * Strip BOM, trim, lower-case, and collapse separators to a single space.
 */
function canonicalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[_\-./#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Trim a cell value. Returns null if the value is empty/blank.
 */
function normalizeCell(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Normalize a single raw parsed CSV record by mapping raw headers to canonical
 * field names and trimming/coercing blank values to null.
 */
function normalizeAssetCsvRecord(
  rawRecord: Record<string, string | undefined>,
  rawHeaders: string[]
): Record<string, string | null> {
  const normalized: Record<string, string | null> = {};

  for (const rawHeader of rawHeaders) {
    const canonical = normalizeCsvHeader(rawHeader);
    if (!canonical) continue;

    const rawValue = rawRecord[rawHeader];
    const existing = normalized[canonical];
    const nextValue = normalizeCell(rawValue);

    // If the same canonical field is produced by multiple raw headers, prefer
    // the first non-blank value. Only assign when we do not already have a
    // non-null value; if we currently have null, take the first non-null.
    if (existing === null || existing === undefined) {
      normalized[canonical] = nextValue;
    }
  }

  return normalized;
}

/**
 * Parse CSV text and return normalized records using the first row as headers.
 *
 * Uses csv-parse/sync with BOM support so quoted fields (including commas and
 * newlines) are handled correctly.
 */
export function parseAndNormalizeAssetCsv(csvText: string): Record<string, string | null>[] {
  if (!csvText || csvText.trim() === '') return [];

  const rawRecords = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: false,
  }) as Record<string, string | undefined>[];

  if (!rawRecords.length) return [];

  const rawHeaders = Object.keys(rawRecords[0]);

  return rawRecords.map(rawRecord => normalizeAssetCsvRecord(rawRecord, rawHeaders));
}

/**
 * Build a normalized row data payload for preview responses.
 */
export function buildNormalizedRowData(row: Record<string, string | null>): Record<string, string | null> {
  return {
    name: row.name ?? null,
    type: row.type ?? null,
    serialNumber: row.serialNumber ?? null,
    propertyNumber: row.propertyNumber ?? null,
    status: row.status ?? null,
    manufacturer: row.manufacturer ?? null,
    price: row.price ?? null,
    purchaseDate: row.purchaseDate ?? null,
    assignedTo: row.assignedTo ?? null,
    location: row.location ?? null,
    owner: row.owner ?? null,
    remarks: row.remarks ?? null,
    warrantyExpiry: row.warrantyExpiry ?? null,
    warrantyNotes: row.warrantyNotes ?? null,
  };
}
