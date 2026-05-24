import { Router, Request, Response } from 'express';
import * as issuanceService from '../services/issuance.service';
import { authenticate, hasPermission } from '../middleware/auth';
import { success, error } from '../utils/response';
import { validate } from '../middleware/validate';
import { createIssuanceSchema, returnIssuanceSchema, bulkReturnSchema, resolveTemplateSchema, bulkIssuanceSchema, resolveBulkTemplateSchema, assetLockSchema, signIssuanceSchema, transferSchema } from './issuance.schema';

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
router.post('/', authenticate, hasPermission('issuances:create'), validate(createIssuanceSchema), async (req: Request, res: Response) => {
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


/* ─── Bulk return issuances ─── */
router.post('/bulk-return', authenticate, hasPermission('issuances:return'), validate(bulkReturnSchema), async (req: Request, res: Response) => {
  try {
    const result = await issuanceService.bulkReturnAssets(
      req.body.assignmentIds,
      req.body.returnCondition,
      req.body.returnNote,
      req.user!.id,
      getClientIp(req),
      getUA(req),
    );
    success(res, result);
  } catch (e: any) {
    error(res, e.message, 400);
  }
});

/* ─── Return issuance ─── */
router.post('/:id/return', authenticate, hasPermission('issuances:return'), validate(returnIssuanceSchema), async (req: Request, res: Response) => {
  try {
    const result = await issuanceService.returnIssuance(
      String(req.params.id),
      req.body.returnCondition,
      req.user!.id,
      getClientIp(req),
      getUA(req),
      req.body.viaQR || false,
      req.body.returnNote,
      req.body.remarks,
    );
    success(res, result);
  } catch (e: any) {
    if (e.message === 'Issuance not found') error(res, e.message, 404);
    else error(res, e.message, 400);
  }
});

/* ─── Recipient digital sign-off ─── */
router.post('/:id/sign', authenticate, hasPermission('issuances:edit'), validate(signIssuanceSchema), async (req: Request, res: Response) => {
  try {
    const result = await issuanceService.signIssuance(
      String(req.params.id),
      req.body.signerName,
      req.user!.id,
      getClientIp(req),
      getUA(req),
    );
    success(res, result);
  } catch (e: any) {
    const status = e.message.includes('not found') ? 404 : 400;
    error(res, e.message, status);
  }
});

/* ─── Transfer asset between personnel ─── */
router.post('/:id/transfer', authenticate, hasPermission('issuances:create'), validate(transferSchema), async (req: Request, res: Response) => {
  try {
    const result = await issuanceService.transferAsset(
      {
        fromAssignmentId: String(req.params.id),
        toPersonnelId: req.body.toPersonnelId,
        condition: req.body.condition,
        transferNote: req.body.transferNote,
        agreementTemplateId: req.body.agreementTemplateId,
      },
      req.user!.id,
      getClientIp(req),
      getUA(req),
    );
    success(res, result, 201);
  } catch (e: any) {
    if (e.message.includes('not found')) error(res, e.message, 404);
    else if (e.message.includes('not active') || e.message.includes('not ready')) error(res, e.message, 400);
    else error(res, e.message, 500);
  }
});

/* ─── Lock selected assets while issuance wizard is in progress ─── */
router.post('/assets/lock', authenticate, hasPermission('issuances:create'), validate(assetLockSchema), async (req: Request, res: Response) => {
  try {
    const result = await issuanceService.lockAssetsForIssuance(
      req.body.assetIds,
      req.user!.id,
      getClientIp(req),
      getUA(req),
    );
    success(res, result);
  } catch (e: any) {
    error(res, e.message, 400);
  }
});

/* ─── Release selected assets if issuance wizard is cancelled/backed out ─── */
router.post('/assets/release', authenticate, hasPermission('issuances:create'), validate(assetLockSchema), async (req: Request, res: Response) => {
  try {
    const result = await issuanceService.releaseAssetsFromIssuance(
      req.body.assetIds,
      req.user!.id,
      getClientIp(req),
      getUA(req),
    );
    success(res, result);
  } catch (e: any) {
    error(res, e.message, 400);
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

/* ─── Resolve template placeholders server-side ─── */
router.post('/resolve-template', authenticate, hasPermission('issuances:create'), validate(resolveTemplateSchema), async (req: Request, res: Response) => {
  try {
    const result = await issuanceService.resolveTemplate(req.body);
    success(res, result);
  } catch (e: any) {
    const status = e.message.includes('not found') ? 404 : 400;
    error(res, e.message, status);
  }
});

/* ─── Resolve template for multi-asset preview ─── */
router.post('/resolve-template/bulk', authenticate, hasPermission('issuances:create'), validate(resolveBulkTemplateSchema), async (req: Request, res: Response) => {
  try {
    const { assetIds, ...rest } = req.body;
    const result = await issuanceService.resolveTemplate({
      ...rest,
      assetIds,
      templateId: req.body.templateId,
    });
    success(res, result);
  } catch (e: any) {
    const status = e.message.includes('not found') ? 404 : 400;
    error(res, e.message, status);
  }
});

/* ─── Bulk issuance (multi-asset) ─── */
router.post('/bulk', authenticate, hasPermission('issuances:create'), validate(bulkIssuanceSchema), async (req: Request, res: Response) => {
  try {
    const result = await issuanceService.bulkIssueAssets(
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

export default router;