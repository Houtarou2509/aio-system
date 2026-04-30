import { Router, Request, Response } from 'express';
import * as personnelService from '../services/personnel.service';
import { authenticate, requireRole } from '../middleware/auth';
import { success, error } from '../utils/response';

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
router.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const body = { ...req.body };
    if (body.hiredDate && typeof body.hiredDate === 'string' && !body.hiredDate.includes('T')) {
      body.hiredDate = new Date(body.hiredDate).toISOString();
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
router.patch('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const body = { ...req.body };
    if (body.hiredDate && typeof body.hiredDate === 'string' && !body.hiredDate.includes('T')) {
      body.hiredDate = new Date(body.hiredDate).toISOString();
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

export default router;