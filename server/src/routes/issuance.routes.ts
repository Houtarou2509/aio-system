import { Router, Request, Response } from 'express';
import * as issuanceService from '../services/issuance.service';
import { authenticate, requireRole } from '../middleware/auth';
import { success, error } from '../utils/response';

const router = Router();

function getClientIp(req: Request): string {
  const ip = req.headers['x-forwarded-for'];
  if (Array.isArray(ip)) return ip[0];
  if (typeof ip === 'string') return ip.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function getUA(req: Request): string {
  const ua = req.headers['user-agent'];
  if (Array.isArray(ua)) return ua[0];
  return ua || '';
}

/* ─── Get active issuance for asset (QR return) ─── */
router.get('/active/asset/:assetId', authenticate, async (req: Request, res: Response) => {
  try {
    const assignment = await issuanceService.getActiveIssuanceForAsset(String(req.params.assetId));
    if (!assignment) {
      return success(res, null, 200);
    }
    success(res, assignment);
  } catch (e: any) {
    error(res, e.message, 500);
  }
});

/* ─── List issuances ─── */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await issuanceService.listIssuances({
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
      search: req.query.search as string | undefined,
      status: (req.query.status as 'active' | 'returned' | 'all') || 'all',
      personnelId: req.query.personnelId as string | undefined,
    });
    success(res, result.data, 200, result.meta);
  } catch (e: any) {
    error(res, e.message, 500);
  }
});

/* ─── Create issuance ─── */
router.post('/', authenticate, requireRole(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await issuanceService.createIssuance(
      req.body,
      req.user!.id,
      getClientIp(req),
      getUA(req),
    );
    success(res, result, 201);
  } catch (e: any) {
    error(res, e.message, 400);
  }
});

/* ─── Return issuance ─── */
router.post('/:id/return', authenticate, requireRole(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await issuanceService.returnIssuance(
      String(req.params.id),
      req.body.condition,
      req.user!.id,
      getClientIp(req),
      getUA(req),
      req.body.viaQR || false,
    );
    success(res, result);
  } catch (e: any) {
    if (e.message === 'Issuance not found') error(res, e.message, 404);
    else error(res, e.message, 400);
  }
});

/* ─── Available assets (for wizard) ─── */
router.get('/assets/available', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await issuanceService.getAvailableAssets(req.query.search as string | undefined);
    success(res, result);
  } catch (e: any) {
    error(res, e.message, 500);
  }
});

/* ─── Active personnel (for wizard) ─── */
router.get('/personnel/active', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await issuanceService.getActivePersonnel(req.query.search as string | undefined);
    success(res, result);
  } catch (e: any) {
    error(res, e.message, 500);
  }
});

/* ─── Generate agreement text ─── */
router.post('/agreement', authenticate, (req: Request, res: Response) => {
  try {
    const text = issuanceService.generateAgreementText(req.body);
    success(res, { text });
  } catch (e: any) {
    error(res, e.message, 400);
  }
});

export default router;