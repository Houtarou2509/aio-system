import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { parse as parseCsv } from 'csv-parse/sync';
import * as assetService from '../services/asset.service';
import { calculateDepreciation } from '../services/depreciation.service';
import { prisma } from '../lib/prisma';
import { logAudit } from '../services/auditLog.service';

import { authenticate, authorize, hasPermission } from '../middleware/auth';
import { success, error } from '../utils/response';

function getClientIp(req: Request): string {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  return Array.isArray(ip) ? ip[0] : String(ip);
}
import {
  createAssetSchema,
  updateAssetSchema,
  listAssetsQuerySchema,
  historyQuerySchema,
  bulkStatusSchema,
  bulkDeleteSchema,
  bulkAssignSchema,
  bulkReturnSchema,
  bulkUpdateSchema,
} from './asset.schema';
import { disposeAssetSchema } from './disposal.schema';

const router = Router();

// Multer config
const upload = multer({
  dest: path.resolve(__dirname, '../../uploads'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(null, false);
  },
});

// Multer config for CSV import (in-memory, CSV only, 5MB max)
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

// All routes require auth
router.use(authenticate);

import { filterAssetForGuest, filterAssetsForGuest } from '../utils/guestFilter';

// GET /api/assets — list with filters + pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = listAssetsQuerySchema.parse(req.query);
    const result = await assetService.listAssets(query);
    const items = req.user!.role === 'GUEST' ? filterAssetsForGuest(result.items) : result.items;
    return success(res, items, 200, { page: query.page, limit: query.limit, total: result.total, totalPages: result.totalPages });
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

// GET /api/assets/stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await assetService.getAssetStats();
    return success(res, stats, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});


// POST /api/assets — create (supports JSON and multipart/form-data)
router.post('/', hasPermission('assets:create'), upload.single('image'), async (req: Request, res: Response) => {
  try {
    // If multipart: data field contains JSON, file is image
    let body = req.body;
    if (req.body.data && typeof req.body.data === 'string') {
      body = JSON.parse(req.body.data);
    }
    // Validate parsed body
    const parsed = createAssetSchema.safeParse(body);
    if (!parsed.success) return error(res, parsed.error.message, 400);
    
    let asset = await assetService.createAsset(parsed.data, req.user!.id, getClientIp(req), String(req.headers['user-agent'] || ''));
    
    // If image was uploaded, attach it
    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.jpg';
      const filename = `${asset.id}${ext}`;
      const dest = path.resolve(__dirname, '../../uploads', filename);
      await fs.rename(req.file.path, dest);
      asset = await prisma.asset.update({ where: { id: asset.id }, data: { imageUrl: `/uploads/${filename}` } });
    }
    
    return success(res, asset, 201);
  } catch (err: any) {
    if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
      const field = (err.meta?.target as string[])?.includes('serialNumber') ? 'serialNumber' : 'unknown';
      return error(res, 'A unique field value already exists.', 409, { message: 'A unique field value already exists.', field, code: 'DUPLICATE_FIELD' });
    }
    return error(res, err.message, 400);
  }
});

// POST /api/assets/import — CSV bulk import with structured validation report
const VALID_STATUSES = ['AVAILABLE', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST'];

router.post('/import', hasPermission('assets:create'), importUpload.single('file'), async (req: Request, res: Response) => {
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

    // Pre-fetch lookup values for validation
    const [assetTypes, manufacturers] = await Promise.all([
      prisma.lookupValue.findMany({ where: { category: 'ASSET_TYPE', isActive: true }, select: { value: true } }),
      prisma.lookupValue.findMany({ where: { category: 'MANUFACTURER', isActive: true }, select: { value: true } }),
    ]);
    const assetTypeSet = new Set(assetTypes.map(v => v.value.toLowerCase()));
    const manufacturerSet = new Set(manufacturers.map(v => v.value.toLowerCase()));
    // Case-map for suggestions
    const assetTypeMap = new Map(assetTypes.map(v => [v.value.toLowerCase(), v.value]));
    const manufacturerMap = new Map(manufacturers.map(v => [v.value.toLowerCase(), v.value]));

    // Pre-fetch existing serial numbers and property numbers for batch duplicate checks
    const existingSerials = new Set(
      (await prisma.asset.findMany({ where: { serialNumber: { not: null }, deletedAt: null }, select: { serialNumber: true } }))
        .map(a => a.serialNumber!.toLowerCase())
    );
    const existingPropertyNums = new Set(
      (await prisma.asset.findMany({ where: { propertyNumber: { not: null }, deletedAt: null }, select: { propertyNumber: true } }))
        .map(a => a.propertyNumber!.toLowerCase())
    );

    const results: Array<{ row: number; status: 'imported' | 'skipped' | 'warning'; assetId?: string; reason?: string; field?: string }> = [];
    let imported = 0;
    let skipped = 0;
    let warnings = 0;

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNumber = i + 2; // row 1 is headers
      const rowErrors: Array<{ field: string; reason: string }> = [];

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

      // If required fields missing, skip entirely — no further validation needed
      if (rowErrors.length > 0) {
        results.push({ row: rowNumber, status: 'skipped', reason: rowErrors.map(e => `${e.field}: ${e.reason}`).join('; ') });
        skipped++;
        continue;
      }

      // ── b. Duplicate serialNumber check ──
      const snLower = row.serialNumber.trim().toLowerCase();
      if (existingSerials.has(snLower)) {
        rowErrors.push({ field: 'serialNumber', reason: `Duplicate serial number: "${row.serialNumber.trim()}" already exists` });
      } else {
        // Add to set so later rows in the same CSV can't reuse it
        existingSerials.add(snLower);
      }

      // ── c. Duplicate propertyNumber check ──
      const pnLower = row.propertyNumber.trim().toLowerCase();
      if (existingPropertyNums.has(pnLower)) {
        rowErrors.push({ field: 'propertyNumber', reason: `Duplicate property number: "${row.propertyNumber.trim()}" already exists` });
      } else {
        existingPropertyNums.add(pnLower);
      }

      // ── d. Type validation against ASSET_TYPE lookup ──
      let typeValue = row.type?.trim() || 'Other';
      if (typeValue && typeValue !== 'Other') {
        if (!assetTypeSet.has(typeValue.toLowerCase())) {
          const suggestion = assetTypeMap.get(typeValue.toLowerCase()) || [...assetTypeMap.values()].slice(0, 5).join(', ');
          rowErrors.push({ field: 'type', reason: `Invalid type "${typeValue}". Did you mean: ${suggestion}?` });
        } else {
          typeValue = assetTypeMap.get(typeValue.toLowerCase())!;
        }
      }

      // ── e. Manufacturer validation (warning only — import with raw string) ──
      let manufacturerWarning: string | undefined;
      const manufacturerValue = row.manufacturer?.trim() || null;
      if (manufacturerValue && !manufacturerSet.has(manufacturerValue.toLowerCase())) {
        const suggestion = manufacturerMap.get(manufacturerValue.toLowerCase()) || [...manufacturerMap.values()].slice(0, 5).join(', ');
        manufacturerWarning = `Manufacturer "${manufacturerValue}" not in lookup. Imported as-is. Suggestions: ${suggestion}`;
      } else if (manufacturerValue) {
        // Normalize to the casing in the lookup
        const normalized = manufacturerMap.get(manufacturerValue.toLowerCase());
        if (normalized) row.manufacturer = normalized;
      }

      // ── f. Status validation ──
      let status = 'AVAILABLE';
      if (row.status?.trim()) {
        const upper = row.status.trim().toUpperCase();
        if (!VALID_STATUSES.includes(upper)) {
          rowErrors.push({ field: 'status', reason: `Invalid status: ${row.status}` });
        } else {
          status = upper;
        }
      }

      // ── g. Price validation ──
      let purchasePrice: number | null = null;
      if (row.price !== undefined && row.price !== '') {
        const num = Number(row.price);
        if (!Number.isFinite(num)) {
          rowErrors.push({ field: 'price', reason: 'Price must be a number' });
        } else {
          purchasePrice = num;
        }
      }

      // ── h. Date validations ──
      let purchaseDate: Date | null = null;
      if (row.purchaseDate !== undefined && row.purchaseDate !== '') {
        if (isNaN(Date.parse(row.purchaseDate))) {
          rowErrors.push({ field: 'purchaseDate', reason: 'Invalid date format for Purchase Date' });
        } else {
          purchaseDate = new Date(row.purchaseDate);
        }
      }

      let warrantyExpiry: Date | null = null;
      if (row.warrantyExpiry !== undefined && row.warrantyExpiry !== '') {
        if (isNaN(Date.parse(row.warrantyExpiry))) {
          rowErrors.push({ field: 'warrantyExpiry', reason: 'Invalid date format for Warranty Expiry' });
        } else {
          warrantyExpiry = new Date(row.warrantyExpiry);
        }
      }

      // ── Determine row outcome ──
      const hardErrors = rowErrors.filter(e => e.field !== 'manufacturer');
      if (hardErrors.length > 0) {
        results.push({ row: rowNumber, status: 'skipped', reason: hardErrors.map(e => `${e.field}: ${e.reason}`).join('; '), field: hardErrors.map(e => e.field).join(',') });
        skipped++;
        continue;
      }

      // Row is importable — create the asset
      try {
        const asset = await prisma.asset.create({
          data: {
            name: row.name.trim(),
            type: typeValue,
            status: status as any,
            manufacturer: row.manufacturer?.trim() || null,
            serialNumber: row.serialNumber.trim(),
            purchasePrice: purchasePrice ?? null,
            purchaseDate,
            assignedTo: row.assignedTo?.trim() || null,
            propertyNumber: row.propertyNumber.trim(),
            location: row.location?.trim() || null,
            remarks: row.remarks?.trim() || null,
            warrantyExpiry,
            warrantyNotes: row.warrantyNotes?.trim() || null,
          },
        });

        results.push({
          row: rowNumber,
          status: manufacturerWarning ? 'warning' : 'imported',
          assetId: asset.id,
          ...(manufacturerWarning ? { reason: manufacturerWarning, field: 'manufacturer' } : {}),
        });

        if (manufacturerWarning) {
          warnings++;
        } else {
          imported++;
        }

        // Audit log per imported asset
        await logAudit({
          userId: req.user!.id,
          action: 'BULK_IMPORT',
          entityType: 'Asset',
          entityId: asset.id,
          ipAddress: getClientIp(req),
          metadata: {
            field: '*',
            oldValue: null,
            newValue: `Imported "${asset.name}" (S/N: ${asset.serialNumber})`,
          },
        });
      } catch (dbErr: any) {
        // Handle unique constraint violations that slipped past pre-check
        if (dbErr.code === 'P2002') {
          const target = dbErr.meta?.target as string[] | undefined;
          const field = target?.[0] || 'unknown';
          results.push({ row: rowNumber, status: 'skipped', reason: `Database unique constraint violation on field: ${field}`, field });
          skipped++;
        } else {
          results.push({ row: rowNumber, status: 'skipped', reason: `Database error: ${dbErr.message}` });
          skipped++;
        }
      }
    }

    return success(res, {
      imported,
      skipped,
      warnings,
      total: records.length,
      results,
    }, 200);
  } catch (err: any) {
    console.error('Import error:', err);
    return error(res, err.message, 500);
  }
});

// PATCH /api/assets/bulk-status — change status for multiple assets
router.patch('/bulk-status', hasPermission('assets:edit'), async (req: Request, res: Response) => {
  try {
    const parsed = bulkStatusSchema.safeParse(req.body);
    if (!parsed.success) return error(res, parsed.error.message, 400);

    const { ids, status } = parsed.data;
    const result = await prisma.asset.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { status: status as any },
    });

    // Audit log
    await logAudit({
      userId: req.user!.id,
      entityType: 'Asset',
      entityId: 'bulk',
      action: 'BULK_STATUS_CHANGE',
      ipAddress: getClientIp(req),
      metadata: {
        field: 'status',
        newValue: `${status} (${result.count} assets)`,
      },
    });

    return success(res, { updated: result.count }, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// DELETE /api/assets/bulk-delete — soft delete (retire) multiple assets
router.delete('/bulk-delete', hasPermission('assets:delete'), async (req: Request, res: Response) => {
  try {
    const parsed = bulkDeleteSchema.safeParse(req.body);
    if (!parsed.success) return error(res, parsed.error.message, 400);

    const { ids } = parsed.data;
    const now = new Date();
    const result = await prisma.asset.updateMany({
      where: { id: { in: ids } },
      data: { status: 'RETIRED', deletedAt: now },
    });

    // Audit log
    await logAudit({
      userId: req.user!.id,
      entityType: 'Asset',
      entityId: 'bulk',
      action: 'SOFT_DELETE',
      ipAddress: getClientIp(req),
      metadata: {
        field: 'deletedAt',
        newValue: `Bulk soft-delete (${result.count} assets) at ${now.toISOString()}`,
      },
    });

    return success(res, { deleted: result.count }, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// POST /api/assets/bulk-assign — assign multiple assets to one person
router.post('/bulk-assign', hasPermission('assets:edit'), async (req: Request, res: Response) => {
  try {
    const parsed = bulkAssignSchema.safeParse(req.body);
    if (!parsed.success) return error(res, parsed.error.message, 400);

    const { assetIds, personnelId, notes } = parsed.data;
    const results = [];
    const errors = [];

    // Verify personnel
    const personnel = await prisma.personnel.findUnique({ where: { id: personnelId } });
    if (!personnel) return error(res, 'Personnel not found', 404);
    if (personnel.status !== 'active') return error(res, 'Personnel is not active', 400);

    for (const assetId of assetIds) {
      try {
        const asset = await prisma.asset.findUnique({ where: { id: assetId } });
        if (!asset) { errors.push({ assetId, reason: 'Asset not found' }); continue; }
        if (asset.status !== 'AVAILABLE') { errors.push({ assetId, reason: 'Asset not available' }); continue; }

        await prisma.$transaction(async (tx) => {
          await tx.assignment.create({
            data: {
              assetId,
              personnelId,
              assignedTo: personnel.fullName,
              condition: 'Good',
              notes: notes || null,
            },
          });
          await tx.asset.update({ where: { id: assetId }, data: { status: 'ASSIGNED' } });
        });
        results.push({ assetId, status: 'ASSIGNED' });
      } catch (e: any) {
        errors.push({ assetId, reason: e.message || 'Unknown error' });
      }
    }

    await logAudit({
      userId: req.user!.id,
      entityType: 'Asset',
      entityId: 'bulk',
      action: 'BULK_ASSIGN',
      ipAddress: getClientIp(req),
      metadata: {
        field: '*',
        newValue: `Bulk assigned ${results.length} assets to ${personnel.fullName}`,
      },
    });

    return success(res, { assigned: results.length, errors }, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// POST /api/assets/bulk-return — return multiple assets at once
router.post('/bulk-return', hasPermission('assets:edit'), async (req: Request, res: Response) => {
  try {
    const parsed = bulkReturnSchema.safeParse(req.body);
    if (!parsed.success) return error(res, parsed.error.message, 400);

    const { issuanceIds, condition } = parsed.data;
    const results = [];
    const errors = [];

    for (const issuanceId of issuanceIds) {
      try {
        const assignment = await prisma.assignment.findUnique({ where: { id: issuanceId } });
        if (!assignment) { errors.push({ issuanceId, reason: 'Issuance not found' }); continue; }
        if (assignment.returnedAt) { errors.push({ issuanceId, reason: 'Already returned' }); continue; }

        await prisma.$transaction(async (tx) => {
          await tx.assignment.update({
            where: { id: issuanceId },
            data: { returnedAt: new Date(), condition: condition || assignment.condition },
          });
          await tx.asset.update({ where: { id: assignment.assetId }, data: { status: 'AVAILABLE' } });
        });
        results.push({ issuanceId, status: 'RETURNED' });
      } catch (e: any) {
        errors.push({ issuanceId, reason: e.message || 'Unknown error' });
      }
    }

    await logAudit({
      userId: req.user!.id,
      entityType: 'Asset',
      entityId: 'bulk',
      action: 'BULK_RETURN',
      ipAddress: getClientIp(req),
      metadata: {
        field: '*',
        newValue: `Bulk returned ${results.length} assets`,
      },
    });

    return success(res, { returned: results.length, errors }, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// POST /api/assets/bulk-update — update location/status for multiple assets
router.post('/bulk-update', hasPermission('assets:edit'), async (req: Request, res: Response) => {
  try {
    const parsed = bulkUpdateSchema.safeParse(req.body);
    if (!parsed.success) return error(res, parsed.error.message, 400);

    const { assetIds, location, status } = parsed.data;
    const updateData: any = {};
    if (location) updateData.location = location;
    if (status) updateData.status = status;

    const result = await prisma.asset.updateMany({
      where: { id: { in: assetIds }, deletedAt: null },
      data: updateData,
    });

    const changed = [];
    if (location) changed.push(`location → ${location}`);
    if (status) changed.push(`status → ${status}`);

    await logAudit({
      userId: req.user!.id,
      entityType: 'Asset',
      entityId: 'bulk',
      action: 'BULK_UPDATE',
      ipAddress: getClientIp(req),
      metadata: {
        field: '*',
        newValue: `Bulk updated ${result.count} assets: ${changed.join(', ')}`,
      },
    });

    return success(res, { updated: result.count }, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// GET /api/assets/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const asset = await assetService.getAsset(String(req.params.id));
    const data = req.user!.role === 'GUEST' ? filterAssetForGuest(asset) : asset;
    return success(res, data, 200);
  } catch (err: any) {
    return error(res, err.message, 404);
  }
});

// PUT /api/assets/:id — update (supports JSON and multipart/form-data)
router.put('/:id', hasPermission('assets:edit'), upload.single('image'), async (req: Request, res: Response) => {
  try {
    let body = req.body;
    if (req.body.data && typeof req.body.data === 'string') {
      body = JSON.parse(req.body.data);
    }
    const parsed = updateAssetSchema.safeParse(body);
    if (!parsed.success) return error(res, parsed.error.message, 400);
    
    let asset = await assetService.updateAsset(String(req.params.id), parsed.data, req.user!.id, getClientIp(req), String(req.headers['user-agent'] || ''));
    
    // If image was uploaded, replace it
    if (req.file) {
      // Clean up old image file if it exists
      const oldImageUrl = asset.imageUrl;
      if (oldImageUrl) {
        const oldFileName = path.basename(oldImageUrl);
        const oldFilePath = path.resolve(__dirname, '../../uploads', oldFileName);
        await fs.unlink(oldFilePath).catch(() => {});
      }
      const ext = path.extname(req.file.originalname) || '.jpg';
      const filename = `${asset.id}${ext}`;
      const dest = path.resolve(__dirname, '../../uploads', filename);
      await fs.rename(req.file.path, dest);
      asset = await prisma.asset.update({ where: { id: asset.id }, data: { imageUrl: `/uploads/${filename}` } });
    }
    
    return success(res, asset, 200);
  } catch (err: any) {
    if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
      const field = (err.meta?.target as string[])?.includes('serialNumber') ? 'serialNumber' : 'unknown';
      return error(res, 'A unique field value already exists.', 409, { message: 'A unique field value already exists.', field, code: 'DUPLICATE_FIELD' });
    }
    return error(res, err.message, err.message === 'Asset not found' ? 404 : 400);
  }
});

// DELETE /api/assets/:id — soft delete (Admin only)
router.delete('/:id', hasPermission('assets:delete'), async (req: Request, res: Response) => {
  try {
    const asset = await assetService.deleteAsset(String(req.params.id), req.user!.id, getClientIp(req), String(req.headers['user-agent'] || ''));
    return success(res, asset, 200);
  } catch (err: any) {
    return error(res, err.message, err.message === 'Asset not found' ? 404 : 400);
  }
});

// POST /api/assets/:id/image
router.post('/:id/image', hasPermission('assets:edit'), upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return error(res, 'No image uploaded', 400);

    // Resize to max 800px
    const ext = path.extname(req.file.originalname) || '.jpg';
    const filename = `${String(req.params.id)}-${Date.now()}${ext}`;
    const outputPath = path.resolve(__dirname, '../../uploads', filename);

    await sharp(req.file.path)
      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
      .toFile(outputPath);

    // Remove original multer temp file
    const { unlink } = await import('fs/promises');
    await unlink(req.file.path).catch(() => {});

    const result = await assetService.uploadAssetImage(String(req.params.id), filename, req.user!.id, String(req.headers['user-agent'] || ''));
    return success(res, result, 200);
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

// POST /api/assets/:id/dispose — formal disposal with reason/method/date (Admin only)
router.post('/:id/dispose', hasPermission('assets:delete'), async (req: Request, res: Response) => {
  try {
    const parsed = disposeAssetSchema.safeParse(req.body);
    if (!parsed.success) return error(res, parsed.error.message, 400);

    const asset = await assetService.disposeAsset(
      String(req.params.id),
      parsed.data,
      req.user!.id,
      getClientIp(req),
      String(req.headers['user-agent'] || ''),
    );

    return success(res, asset, 200);
  } catch (err: any) {
    const statusCode = err.statusCode
      || (err.message === 'Asset not found' ? 404
      : err.message === 'Asset is already retired' ? 409
      : 400);
    const details: any = {};
    if (err.code) details.code = err.code;
    if (err.assignedTo) details.assignedTo = err.assignedTo;
    if (err.documentNumber) details.documentNumber = err.documentNumber;
    if (err.scheduleCount) details.scheduleCount = err.scheduleCount;
    if (err.canForce) details.canForce = err.canForce;
    return error(res, err.message, statusCode, Object.keys(details).length > 0 ? details : undefined);
  }
});

// GET /api/assets/:id/history
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const query = historyQuerySchema.parse(req.query);
    const result = await assetService.getAssetHistory(String(req.params.id), query.page, query.limit);
    return success(res, result.items, 200, { page: query.page, limit: query.limit, total: result.total, totalPages: result.totalPages });
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

// GET /api/assets/:id/condition-history
router.get('/:id/condition-history', hasPermission('assets:view'), async (req: Request, res: Response) => {
  try {
    const assetId = String(req.params.id);
    const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } });
    if (!asset) return error(res, 'Asset not found', 404);

    const logs = await prisma.assetConditionLog.findMany({
      where: { assetId },
      orderBy: { recordedAt: 'desc' },
      include: { recordedBy: { select: { id: true, fullName: true } } },
    });

    const data = logs.map(log => ({
      id: log.id,
      assetId: log.assetId,
      assignmentId: log.assignmentId,
      event: log.event,
      condition: log.condition,
      note: log.note,
      recordedById: log.recordedById,
      recordedByName: log.recordedBy?.fullName ?? null,
      recordedAt: log.recordedAt.toISOString(),
    }));

    return success(res, data, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

export default router;
