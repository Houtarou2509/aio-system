import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import { parse as parseCsv } from 'csv-parse/sync';
import * as assetService from '../services/asset.service';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import { authenticate, authorize } from '../middleware/auth';
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
} from './asset.schema';

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
router.post('/', authorize(['ADMIN', 'STAFF_ADMIN']), upload.single('image'), async (req: Request, res: Response) => {
  try {
    // If multipart: data field contains JSON, file is image
    let body = req.body;
    if (req.body.data && typeof req.body.data === 'string') {
      body = JSON.parse(req.body.data);
    }
    // Validate parsed body
    const parsed = createAssetSchema.safeParse(body);
    if (!parsed.success) return error(res, parsed.error.message, 400);
    
    let asset = await assetService.createAsset(parsed.data, req.user!.id, getClientIp(req));
    
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
    return error(res, err.message, 400);
  }
});

// POST /api/assets/import — CSV bulk import
const VALID_TYPES = ['LAPTOP', 'DESKTOP', 'MONITOR', 'PRINTER', 'TABLET', 'PHONE', 'SERVER', 'OTHER'];
const VALID_STATUSES = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED'];

router.post('/import', authorize(['ADMIN', 'STAFF_ADMIN']), importUpload.single('file'), async (req: Request, res: Response) => {
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

    const validRows: any[] = [];
    const errorRows: { row: number; reason: string }[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNumber = i + 2; // row 1 is headers
      const rowErrors: string[] = [];

      // name: required
      if (!row.name || !row.name.trim()) {
        rowErrors.push('Name is required');
      }

      // type: required, must be valid
      if (!row.type || !VALID_TYPES.includes(row.type.trim().toUpperCase())) {
        rowErrors.push(`Invalid type: ${row.type || '(empty)'}`);
      }

      // status: optional, default AVAILABLE if empty
      let status = 'AVAILABLE';
      if (row.status) {
        const upper = row.status.trim().toUpperCase();
        if (!VALID_STATUSES.includes(upper)) {
          rowErrors.push(`Invalid status: ${row.status}`);
        } else {
          status = upper;
        }
      }

      // price: optional, must be valid number
      if (row.price !== undefined && row.price !== '') {
        const num = Number(row.price);
        if (!Number.isFinite(num)) {
          rowErrors.push('Price must be a number');
        }
      }

      // purchaseDate: optional, must be valid date
      if (row.purchaseDate !== undefined && row.purchaseDate !== '') {
        if (isNaN(Date.parse(row.purchaseDate))) {
          rowErrors.push('Invalid date format for Purchase Date');
        }
      }

      // warrantyExpiry: optional, must be valid date
      if (row.warrantyExpiry !== undefined && row.warrantyExpiry !== '') {
        if (isNaN(Date.parse(row.warrantyExpiry))) {
          rowErrors.push('Invalid date format for Warranty Expiry');
        }
      }

      if (rowErrors.length > 0) {
        errorRows.push({ row: rowNumber, reason: rowErrors.join('; ') });
      } else {
        validRows.push({
          name: row.name.trim(),
          type: row.type.trim().toUpperCase(),
          status,
          manufacturer: row.manufacturer?.trim() || null,
          serialNumber: row.serialNumber?.trim() || null,
          purchasePrice: row.price ? parseFloat(row.price) : null,
          purchaseDate: row.purchaseDate ? new Date(row.purchaseDate) : null,
          assignedTo: row.assignedTo?.trim() || null,
          propertyNumber: row.propertyNumber?.trim() || null,
          location: row.location?.trim() || null,
          remarks: row.remarks?.trim() || null,
          warrantyExpiry: row.warrantyExpiry ? new Date(row.warrantyExpiry) : null,
          warrantyNotes: row.warrantyNotes?.trim() || null,
        });
      }
    }

    if (validRows.length > 0) {
      await prisma.asset.createMany({ data: validRows });

      await prisma.auditLog.create({
        data: {
          action: 'BULK_IMPORT',
          entityType: 'Asset',
          entityId: 'bulk',
          field: '*',
          oldValue: null,
          newValue: `${req.user!.username} imported ${validRows.length} assets via CSV`,
          performedById: req.user!.id,
          ipAddress: getClientIp(req),
        },
      });
    }

    return success(res, {
      imported: validRows.length,
      skipped: errorRows.length,
      errors: errorRows,
    }, 200);
  } catch (err: any) {
    console.error('Import error:', err);
    return error(res, err.message, 500);
  }
});

// PATCH /api/assets/bulk-status — change status for multiple assets
router.patch('/bulk-status', authorize(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  try {
    const parsed = bulkStatusSchema.safeParse(req.body);
    if (!parsed.success) return error(res, parsed.error.message, 400);

    const { ids, status } = parsed.data;
    const result = await prisma.asset.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { status: status as any },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        entityType: 'Asset',
        entityId: 'bulk',
        action: 'BULK_STATUS_CHANGE',
        field: 'status',
        newValue: `${status} (${result.count} assets)`,
        performedById: req.user!.id,
        ipAddress: getClientIp(req),
      },
    });

    return success(res, { updated: result.count }, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// DELETE /api/assets/bulk-delete — soft delete (retire) multiple assets
router.delete('/bulk-delete', authorize(['ADMIN']), async (req: Request, res: Response) => {
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
    await prisma.auditLog.create({
      data: {
        entityType: 'Asset',
        entityId: 'bulk',
        action: 'SOFT_DELETE',
        field: 'deletedAt',
        newValue: `Bulk soft-delete (${result.count} assets) at ${now.toISOString()}`,
        performedById: req.user!.id,
        ipAddress: getClientIp(req),
      },
    });

    return success(res, { deleted: result.count }, 200);
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
router.put('/:id', authorize(['ADMIN', 'STAFF_ADMIN', 'STAFF']), upload.single('image'), async (req: Request, res: Response) => {
  try {
    let body = req.body;
    if (req.body.data && typeof req.body.data === 'string') {
      body = JSON.parse(req.body.data);
    }
    const parsed = updateAssetSchema.safeParse(body);
    if (!parsed.success) return error(res, parsed.error.message, 400);
    
    let asset = await assetService.updateAsset(String(req.params.id), parsed.data, req.user!.id, getClientIp(req));
    
    // If image was uploaded, replace it
    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.jpg';
      const filename = `${asset.id}${ext}`;
      const dest = path.resolve(__dirname, '../../uploads', filename);
      await fs.rename(req.file.path, dest);
      asset = await prisma.asset.update({ where: { id: asset.id }, data: { imageUrl: `/uploads/${filename}` } });
    }
    
    return success(res, asset, 200);
  } catch (err: any) {
    return error(res, err.message, err.message === 'Asset not found' ? 404 : 400);
  }
});

// DELETE /api/assets/:id — soft delete (Admin only)
router.delete('/:id', authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const asset = await assetService.deleteAsset(String(req.params.id), req.user!.id, getClientIp(req));
    return success(res, asset, 200);
  } catch (err: any) {
    return error(res, err.message, err.message === 'Asset not found' ? 404 : 400);
  }
});

// POST /api/assets/:id/image
router.post('/:id/image', authorize(['ADMIN', 'STAFF_ADMIN', 'STAFF']), upload.single('image'), async (req: Request, res: Response) => {
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

    const result = await assetService.uploadAssetImage(String(req.params.id), filename, req.user!.id);
    return success(res, result, 200);
  } catch (err: any) {
    return error(res, err.message, 400);
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

export default router;