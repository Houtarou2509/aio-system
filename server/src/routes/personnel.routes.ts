import { Router, Request, Response } from 'express';
import * as personnelService from '../services/personnel.service';
import { authenticate, requireRole } from '../middleware/auth';
import { success, error } from '../utils/response';
import { validate } from '../middleware/validate';
import { createPersonnelSchema, updatePersonnelSchema } from './personnel.schema';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma';

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
  const ip = req.headers['x-forwarded-for'];
  if (Array.isArray(ip)) return ip[0];
  if (typeof ip === 'string') return ip.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

/* ─── List ─── */
router.get('/', authenticate, async (req: Request, res: Response) => {
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

/* ─── Get one ─── */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
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
router.post('/:id/signed-agreement', authenticate, requireRole(['ADMIN', 'STAFF_ADMIN']),
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

export default router;