import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parse as parseCsv } from 'csv-parse/sync';
import { prisma } from '../lib/prisma';
import { authenticate, hasPermission } from '../middleware/auth';
import { success, error } from '../utils/response';

const importUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.endsWith('.csv')) {
      return cb(new Error('Only CSV files accepted'));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

const VALID_STATUSES = ['AVAILABLE', 'PENDING_ASSIGNMENT', 'MAINTENANCE', 'RETIRED', 'LOST'];

const router = Router();

// All routes require auth
router.use(authenticate);

// POST /preview — validate CSV without importing
router.post('/preview', hasPermission('assets:create'), importUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return error(res, 'No file uploaded', 400);
    }

    const records: Record<string, string>[] = parseCsv(req.file.buffer.toString(), {
      columns: true,
      skip_empty_lines: true,
    });

    if (records.length === 0) {
      return error(res, 'No data rows found in file', 400);
    }

    // Pre-fetch lookup values for validation (same as actual import)
    const [assetTypes, manufacturers] = await Promise.all([
      prisma.lookupValue.findMany({ where: { category: 'ASSET_TYPE', isActive: true }, select: { value: true } }),
      prisma.lookupValue.findMany({ where: { category: 'MANUFACTURER', isActive: true }, select: { value: true } }),
    ]);
    const assetTypeSet = new Set(assetTypes.map(v => v.value.toLowerCase()));
    const manufacturerSet = new Set(manufacturers.map(v => v.value.toLowerCase()));
    const assetTypeMap = new Map(assetTypes.map(v => [v.value.toLowerCase(), v.value]));
    const manufacturerMap = new Map(manufacturers.map(v => [v.value.toLowerCase(), v.value]));

    // Pre-fetch existing serial numbers and property numbers for duplicate checks
    const existingSerials = new Set(
      (await prisma.asset.findMany({ where: { serialNumber: { not: null }, deletedAt: null }, select: { serialNumber: true } }))
        .map(a => a.serialNumber!.toLowerCase())
    );
    const existingPropertyNums = new Set(
      (await prisma.asset.findMany({ where: { propertyNumber: { not: null } }, select: { propertyNumber: true } }))
        .map(a => a.propertyNumber!.toLowerCase())
    );

    // Track duplicates within the CSV itself
    const csvSerialNumbers = new Map<string, number[]>(); // lowercase serial -> row numbers
    const csvPropertyNumbers = new Map<string, number[]>(); // lowercase propertyNumber -> row numbers

    const results: Array<{
      row: number;
      status: 'valid' | 'invalid' | 'warning';
      data: Record<string, string | null>;
      reason: string | null;
      field: string | null;
    }> = [];

    let validRows = 0;
    let invalidRows = 0;
    let warningRows = 0;

    // First pass: collect CSV-internal duplicates
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const sn = row.serialNumber?.trim().toLowerCase();
      if (sn) {
        if (!csvSerialNumbers.has(sn)) csvSerialNumbers.set(sn, []);
        csvSerialNumbers.get(sn)!.push(i);
      }
      const pn = row.propertyNumber?.trim().toLowerCase();
      if (pn) {
        if (!csvPropertyNumbers.has(pn)) csvPropertyNumbers.set(pn, []);
        csvPropertyNumbers.get(pn)!.push(i);
      }
    }

    const duplicatePropertyNumbers: string[] = [];
    const duplicateSerialNumbers: string[] = [];

    for (const [key, indices] of csvPropertyNumbers) {
      if (indices.length > 1) {
        duplicatePropertyNumbers.push(records[indices[0]].propertyNumber?.trim() || key);
      }
    }
    for (const [key, indices] of csvSerialNumbers) {
      if (indices.length > 1) {
        duplicateSerialNumbers.push(records[indices[0]].serialNumber?.trim() || key);
      }
    }

    // Track serials and property numbers we've seen in this CSV for intra-CSV duplicate detection
    const seenCsvSerials = new Set<string>();
    const seenCsvPropertyNums = new Set<string>();

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNumber = i + 2; // row 1 is headers
      const rowErrors: Array<{ field: string; reason: string }> = [];
      let hasWarning = false;
      let warningReason: string | null = null;
      let warningField: string | null = null;

      // ── a. Required field checks ──
      if (!row.name?.trim()) {
        rowErrors.push({ field: 'name', reason: 'Name is required' });
      }
      if (!row.serialNumber?.trim()) {
        rowErrors.push({ field: 'serialNumber', reason: 'Serial number is required' });
      }
      if (!row.propertyNumber?.trim()) {
        rowErrors.push({ field: 'propertyNumber', reason: 'Property number is required' });
      }

      // If required fields missing, mark invalid — no further validation
      if (rowErrors.length > 0) {
        results.push({
          row: rowNumber,
          status: 'invalid',
          data: buildRowData(row),
          reason: rowErrors.map(e => `${e.field}: ${e.reason}`).join('; '),
          field: rowErrors.map(e => e.field).join(','),
        });
        invalidRows++;
        continue;
      }

      // ── b. Duplicate serialNumber check (DB + CSV) ──
      const snLower = row.serialNumber.trim().toLowerCase();
      if (existingSerials.has(snLower)) {
        rowErrors.push({ field: 'serialNumber', reason: `Duplicate serial number: "${row.serialNumber.trim()}" already exists in the database` });
      } else if (seenCsvSerials.has(snLower)) {
        rowErrors.push({ field: 'serialNumber', reason: `Duplicate serial number: "${row.serialNumber.trim()}" appears multiple times in the CSV` });
      } else {
        seenCsvSerials.add(snLower);
      }

      // ── c. Duplicate propertyNumber check (DB + CSV) ──
      const pnLower = row.propertyNumber.trim().toLowerCase();
      if (existingPropertyNums.has(pnLower)) {
        rowErrors.push({ field: 'propertyNumber', reason: `Duplicate property number: "${row.propertyNumber.trim()}" already exists in the database` });
      } else if (seenCsvPropertyNums.has(pnLower)) {
        rowErrors.push({ field: 'propertyNumber', reason: `Duplicate property number: "${row.propertyNumber.trim()}" appears multiple times in the CSV` });
      } else {
        seenCsvPropertyNums.add(pnLower);
      }

      // ── d. Type validation against ASSET_TYPE lookup ──
      let typeValue = row.type?.trim() || 'Other';
      if (typeValue && typeValue !== 'Other') {
        if (!assetTypeSet.has(typeValue.toLowerCase())) {
          const suggestion = assetTypeMap.get(typeValue.toLowerCase()) || [...assetTypeMap.values()].slice(0, 5).join(', ');
          rowErrors.push({ field: 'type', reason: `Invalid type "${typeValue}". Did you mean: ${suggestion}?` });
        }
      }

      // ── e. Manufacturer validation (warning only) ──
      const manufacturerValue = row.manufacturer?.trim() || null;
      if (manufacturerValue && !manufacturerSet.has(manufacturerValue.toLowerCase())) {
        const suggestion = manufacturerMap.get(manufacturerValue.toLowerCase()) || [...manufacturerMap.values()].slice(0, 5).join(', ');
        hasWarning = true;
        warningReason = `Manufacturer "${manufacturerValue}" not in lookup. Will be imported as-is. Suggestions: ${suggestion}`;
        warningField = 'manufacturer';
      }

      // ── f. Status validation ──
      if (row.status?.trim()) {
        const upper = row.status.trim().toUpperCase();
        if (!VALID_STATUSES.includes(upper)) {
          rowErrors.push({ field: 'status', reason: `Invalid status: ${row.status}` });
        }
      }

      // ── g. Price validation ──
      if (row.price !== undefined && row.price !== '') {
        const num = Number(row.price);
        if (!Number.isFinite(num)) {
          rowErrors.push({ field: 'price', reason: 'Price must be a number' });
        }
      }

      // ── h. Date validations ──
      if (row.purchaseDate !== undefined && row.purchaseDate !== '') {
        if (isNaN(Date.parse(row.purchaseDate))) {
          rowErrors.push({ field: 'purchaseDate', reason: 'Invalid date format for Purchase Date' });
        }
      }

      if (row.warrantyExpiry !== undefined && row.warrantyExpiry !== '') {
        if (isNaN(Date.parse(row.warrantyExpiry))) {
          rowErrors.push({ field: 'warrantyExpiry', reason: 'Invalid date format for Warranty Expiry' });
        }
      }

      // ── Determine row outcome ──
      const hardErrors = rowErrors.filter(e => e.field !== 'manufacturer');
      if (hardErrors.length > 0) {
        results.push({
          row: rowNumber,
          status: 'invalid',
          data: buildRowData(row),
          reason: hardErrors.map(e => `${e.field}: ${e.reason}`).join('; '),
          field: hardErrors.map(e => e.field).join(','),
        });
        invalidRows++;
      } else if (hasWarning) {
        results.push({
          row: rowNumber,
          status: 'warning',
          data: buildRowData(row),
          reason: warningReason,
          field: warningField,
        });
        warningRows++;
      } else {
        results.push({
          row: rowNumber,
          status: 'valid',
          data: buildRowData(row),
          reason: null,
          field: null,
        });
        validRows++;
      }
    }

    return success(res, {
      totalRows: records.length,
      validRows,
      invalidRows,
      warningRows,
      duplicatePropertyNumbers,
      duplicateSerialNumbers,
      results,
    }, 200);
  } catch (err: any) {
    console.error('Import preview error:', err);
    return error(res, err.message, 500);
  }
});

function buildRowData(row: Record<string, string>): Record<string, string | null> {
  return {
    name: row.name?.trim() || null,
    type: row.type?.trim() || null,
    serialNumber: row.serialNumber?.trim() || null,
    propertyNumber: row.propertyNumber?.trim() || null,
    status: row.status?.trim() || null,
    manufacturer: row.manufacturer?.trim() || null,
    price: row.price?.trim() || null,
    purchaseDate: row.purchaseDate?.trim() || null,
    assignedTo: row.assignedTo?.trim() || null,
    location: row.location?.trim() || null,
    owner: row.owner?.trim() || null,
    remarks: row.remarks?.trim() || null,
    warrantyExpiry: row.warrantyExpiry?.trim() || null,
    warrantyNotes: row.warrantyNotes?.trim() || null,
  };
}

export default router;