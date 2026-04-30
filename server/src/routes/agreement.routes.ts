import { Router, Request, Response } from 'express';
import * as agreementService from '../services/agreement.service';
import { getPlaceholderReference } from '../utils/templateParser';
import { authenticate, requireRole } from '../middleware/auth';
import { success, error } from '../utils/response';

const router = Router();

function getUA(req: Request): string {
  const ua = req.headers['user-agent'];
  if (Array.isArray(ua)) return ua[0];
  return ua || '';
}

/* ─── List templates ─── */
router.get('/templates', authenticate, requireRole(['ADMIN']), async (_req: Request, res: Response) => {
  try {
    const templates = await agreementService.listTemplates();
    success(res, templates);
  } catch (e: any) { error(res, e.message, 500); }
});

/* ─── Create template ─── */
router.post('/templates', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const template = await agreementService.createTemplate(req.body);
    success(res, template, 201);
  } catch (e: any) { error(res, e.message, 400); }
});

/* ─── Update template ─── */
router.patch('/templates/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const template = await agreementService.updateTemplate(String(req.params.id), req.body);
    success(res, template);
  } catch (e: any) {
    if (e.message === 'Personnel not found') error(res, e.message, 404);
    else error(res, e.message, 400);
  }
});

/* ─── Delete template ─── */
router.delete('/templates/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    await agreementService.deleteTemplate(String(req.params.id));
    success(res, { deleted: true });
  } catch (e: any) { error(res, e.message, 400); }
});

/* ─── Placeholder reference ─── */
router.get('/placeholders', authenticate, (_req: Request, res: Response) => {
  success(res, getPlaceholderReference());
});

/* ─── Generate & download PDF ─── */
router.post('/pdf', authenticate, requireRole(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  try {
    const pdfBuffer = await agreementService.generateAgreementPdf(req.body);
    const filename = `agreement-${(req.body.personnelName || 'unknown').replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (e: any) { error(res, e.message, 400); }
});

export default router;