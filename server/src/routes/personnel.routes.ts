import { Router, Request, Response } from 'express';
import * as personnelService from '../services/personnel.service';
import { authenticate, hasPermission, requireRole } from '../middleware/auth';
import { success, error } from '../utils/response';
import { validate } from '../middleware/validate';
import { createPersonnelSchema, updatePersonnelSchema, updatePersonnelReadinessSchema } from './personnel.schema';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { prisma } from '../lib/prisma';
import { logAudit } from '../services/auditLog.service';

// Signed agreement upload storage — outside server/public so Vite doesn't wipe
const signedAgreementDir = path.resolve(__dirname, '../../uploads/signed-agreements');
if (!fs.existsSync(signedAgreementDir)) {
  fs.mkdirSync(signedAgreementDir, { recursive: true });
}

const signedAgreementUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, signedAgreementDir),
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname);
      cb(null, `signed-${uniqueSuffix}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf') {
      cb(null, true);
    } else {
      cb(null, false); // silently reject non-PDFs — route handler checks req.file
    }
  },
});

function getUA(req: Request): string {
  const ua = req.headers['user-agent'];
  if (Array.isArray(ua)) return ua[0];
  return ua || '';
}

const router = Router();

function getClientIp(req: Request): string {
  const ip = req.headers['x-forwarded-for'] as string | string[] | undefined;
  if (Array.isArray(ip)) return ip[0];
  if (typeof ip === 'string') return ip.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/* ─── List ─── */
router.get('/', authenticate, hasPermission('issuances:view'), async (req: Request, res: Response) => {
  try {
    const result = await personnelService.listPersonnel({
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
      search: req.query.search as string | undefined,
      status: req.query.status as string | undefined,
      project: req.query.project as string | undefined,
    });
    success(res, result.data, 200, result.meta);
  } catch (e: any) {
    error(res, e.message, 500);
  }
});

/* ─── Toggle readiness for issuance ─── */
router.patch('/:id/readiness', authenticate, hasPermission('issuances:edit'), validate(updatePersonnelReadinessSchema), async (req: Request, res: Response) => {
  try {
    const result = await personnelService.togglePersonnelReadiness(
      String(req.params.id),
      Boolean(req.body.isReady),
      req.user!.id,
      getClientIp(req),
      getUA(req),
    );
    success(res, result);
  } catch (e: any) {
    if (e.message === 'Personnel not found') error(res, e.message, 404);
    else error(res, e.message, 400);
  }
});

/* ─── Accountability summary ─── */
router.get('/:id/accountability', authenticate, hasPermission('issuances:view'), async (req: Request, res: Response) => {
  try {
    const result = await personnelService.getPersonnelAccountability(String(req.params.id));
    success(res, result);
  } catch (e: any) {
    if (e.message === 'Personnel not found') error(res, e.message, 404);
    else error(res, e.message, 500);
  }
});

/* ─── Get one ─── */
router.get('/:id', authenticate, hasPermission('issuances:view'), async (req: Request, res: Response) => {
  try {
    const result = await personnelService.getPersonnel(String(req.params.id));
    success(res, result);
  } catch (e: any) {
    if (e.message === 'Personnel not found') error(res, e.message, 404);
    else error(res, e.message, 500);
  }
});

/* ─── Create ─── */
router.post('/', authenticate, requireRole(['ADMIN']), validate(createPersonnelSchema), async (req: Request, res: Response) => {
  try {
    const body = { ...req.body };
    // Convert date strings to ISO format for Prisma
    if (body.hiredDate && typeof body.hiredDate === 'string' && !body.hiredDate.includes('T')) {
      body.hiredDate = new Date(body.hiredDate).toISOString();
    }
    if (body.contractStartDate && typeof body.contractStartDate === 'string' && !body.contractStartDate.includes('T')) {
      body.contractStartDate = new Date(body.contractStartDate).toISOString();
    }
    if (body.contractEndDate && typeof body.contractEndDate === 'string' && !body.contractEndDate.includes('T')) {
      body.contractEndDate = new Date(body.contractEndDate).toISOString();
    }
    const result = await personnelService.createPersonnel(
      body,
      req.user!.id,
      getClientIp(req),
      getUA(req),
    );
    success(res, result, 201);
  } catch (e: any) {
    const msg = e.message || 'Unknown error';
    if (msg.includes('Unique constraint')) {
      error(res, 'A personnel record with this information already exists', 409);
    } else if (msg.includes('Invalid') && msg.includes('prisma')) {
      error(res, 'Invalid data format. Please check your input fields.', 400);
    } else {
      error(res, msg, 400);
    }
  }
});

/* ─── Update ─── */
router.patch('/:id', authenticate, requireRole(['ADMIN']), validate(updatePersonnelSchema), async (req: Request, res: Response) => {
  try {
    const body = { ...req.body };
    // Convert date strings to ISO format for Prisma
    if (body.hiredDate && typeof body.hiredDate === 'string' && !body.hiredDate.includes('T')) {
      body.hiredDate = new Date(body.hiredDate).toISOString();
    }
    if (body.contractStartDate && typeof body.contractStartDate === 'string' && !body.contractStartDate.includes('T')) {
      body.contractStartDate = new Date(body.contractStartDate).toISOString();
    }
    if (body.contractEndDate && typeof body.contractEndDate === 'string' && !body.contractEndDate.includes('T')) {
      body.contractEndDate = new Date(body.contractEndDate).toISOString();
    }
    const result = await personnelService.updatePersonnel(
      String(req.params.id),
      body,
      req.user!.id,
      getClientIp(req),
      getUA(req),
    );
    success(res, result);
  } catch (e: any) {
    const msg = e.message || 'Unknown error';
    if (msg === 'Personnel not found') {
      error(res, msg, 404);
    } else if (msg.includes('Unique constraint')) {
      error(res, 'A personnel record with this information already exists', 409);
    } else if (msg.includes('Invalid') && msg.includes('prisma')) {
      error(res, 'Invalid data format. Please check your input fields.', 400);
    } else {
      error(res, msg, 400);
    }
  }
});

/* ─── Delete (soft) ─── */
router.delete('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await personnelService.deletePersonnel(
      String(req.params.id),
      req.user!.id,
      getClientIp(req),
      getUA(req),
    );
    success(res, result);
  } catch (e: any) {
    if (e.message === 'Personnel not found') error(res, e.message, 404);
    else if (e.message.includes('still holds')) error(res, e.message, 409);
    else error(res, e.message, 500);
  }
});

/* ─── Upload signed agreement PDF ─── */
router.post('/:id/signed-agreement', authenticate, hasPermission('issuances:edit'),
  signedAgreementUpload.single('file'),
  async (req: Request, res: Response) => {
    try {
      // Check personnel exists
      const existing = await personnelService.getPersonnel(String(req.params.id))
        .catch(() => null);
      if (!existing) return error(res, 'Personnel not found', 404);

      // Check file was accepted
      if (!req.file) return error(res, 'No PDF file provided, or file is not a valid PDF', 400);

      const filePath = `/uploads/signed-agreements/${req.file.filename}`;

      // Update personnel record with the path
      await prisma.personnel.update({
        where: { id: String(req.params.id) },
        data: { signedAgreementPath: filePath },
      });

      success(res, { path: filePath, originalName: req.file.originalname }, 201);
    } catch (e: any) {
      error(res, e.message, 400);
    }
  },
);

/* ─── Download signed agreement PDF ─── */
router.get('/:id/signed-agreement', authenticate, async (req: Request, res: Response) => {
  try {
    const personnel = await prisma.personnel.findUnique({
      where: { id: String(req.params.id) },
      select: { signedAgreementPath: true },
    });

    if (!personnel) return error(res, 'Personnel not found', 404);
    if (!personnel.signedAgreementPath) return error(res, 'No signed agreement uploaded', 404);

    const absolutePath = path.resolve(__dirname, '../..', personnel.signedAgreementPath.replace(/^\//, ''));

    if (!fs.existsSync(absolutePath)) {
      return error(res, 'Signed agreement file not found on disk', 404);
    }

    res.sendFile(absolutePath);
  } catch (e: any) {
    error(res, e.message, 500);
  }
});

/* ─── Profile photo upload storage ─── */
const profilePhotoDir = path.resolve(__dirname, '../../uploads/profiles');
if (!fs.existsSync(profilePhotoDir)) {
  fs.mkdirSync(profilePhotoDir, { recursive: true });
}

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE = 2 * 1024 * 1024; // 2MB

const profilePhotoUpload = multer({
  dest: profilePhotoDir,
  limits: { fileSize: MAX_PHOTO_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_PHOTO_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and WebP images are allowed'));
  },
});

/* ─── POST /api/personnel/:id/photo — upload/replace profile photo ─── */
router.post('/:id/photo', authenticate, requireRole(['ADMIN']), profilePhotoUpload.single('photo'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return error(res, 'No photo uploaded or file type not allowed (JPG, PNG, WebP only, max 2MB)', 400);

    const personnel = await prisma.personnel.findUnique({ where: { id: String(req.params.id) } });
    if (!personnel) return error(res, 'Personnel not found', 404);

    // Resize to 256x256 square crop for avatar
    const ext = path.extname(req.file.originalname) || '.jpg';
    const filename = `${req.params.id}-${Date.now()}${ext}`;
    const outputPath = path.resolve(profilePhotoDir, filename);

    await sharp(req.file.path)
      .resize(256, 256, { fit: 'cover', position: 'center' })
      .toFile(outputPath);

    // Remove multer temp file
    const { unlink } = await import('fs/promises');
    await unlink(req.file.path).catch(() => {});

    // Remove old photo file if exists
    if (personnel.photoUrl) {
      const oldPath = path.resolve(__dirname, '../..', personnel.photoUrl.replace(/^\//, ''));
      await unlink(oldPath).catch(() => {});
    }

    const photoUrl = `/uploads/profiles/${filename}`;
    await prisma.personnel.update({
      where: { id: String(req.params.id) },
      data: { photoUrl },
    });

    // Audit log
    await logAudit({
      userId: req.user!.id,
      action: personnel.photoUrl ? 'UPDATE' : 'CREATE',
      entityType: 'Personnel',
      entityId: String(req.params.id),
      ipAddress: getClientIp(req),
      metadata: {
        userAgent: getUA(req),
        field: 'photoUrl',
        oldValue: personnel.photoUrl || null,
        newValue: photoUrl,
      },
    });

    return success(res, { photoUrl }, 200);
  } catch (err: any) {
    if (err.message?.includes('Only JPG')) return error(res, err.message, 400);
    return error(res, err.message || 'Upload failed', 400);
  }
});

/* ─── DELETE /api/personnel/:id/photo — remove profile photo ─── */
router.delete('/:id/photo', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const personnel = await prisma.personnel.findUnique({ where: { id: String(req.params.id) } });
    if (!personnel) return error(res, 'Personnel not found', 404);
    if (!personnel.photoUrl) return error(res, 'No photo to remove', 404);

    // Remove file from disk
    const filePath = path.resolve(__dirname, '../..', personnel.photoUrl.replace(/^\//, ''));
    const { unlink } = await import('fs/promises');
    await unlink(filePath).catch(() => {});

    // Clear photoUrl in DB
    await prisma.personnel.update({
      where: { id: String(req.params.id) },
      data: { photoUrl: null },
    });

    // Audit log
    await logAudit({
      userId: req.user!.id,
      action: 'DELETE',
      entityType: 'Personnel',
      entityId: String(req.params.id),
      ipAddress: getClientIp(req),
      metadata: {
        userAgent: getUA(req),
        field: 'photoUrl',
        oldValue: personnel.photoUrl,
        newValue: null,
      },
    });

    return success(res, { photoUrl: null }, 200);
  } catch (err: any) {
    return error(res, err.message || 'Delete failed', 400);
  }
});

export default router;