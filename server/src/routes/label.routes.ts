import { Router, Request, Response } from 'express';
import * as labelService from '../services/label.service';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { success, error } from '../utils/response';
import { generatePdfSchema, createTemplateSchema, updateTemplateSchema } from './label.schema';

const router = Router();

function getClientIp(req: Request): string {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  return Array.isArray(ip) ? ip[0] : String(ip);
}

// POST /api/labels/generate-pdf — unified endpoint for 1 or many assets
router.post('/generate-pdf', authenticate, authorize(['ADMIN', 'STAFF_ADMIN', 'STAFF']), validate(generatePdfSchema), async (req: Request, res: Response) => {
  try {
    const { assetIds } = req.body;
    const pdf = await labelService.generateLabelsPdf(assetIds, req.user!.id, getClientIp(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="labels.pdf"');
    return res.send(pdf);
  } catch (err: any) {
    console.error('PDF generation error:', err);
    return res.status(err.message === 'No assets found' ? 404 : 500).json({ error: err.message });
  }
});

// --- Templates ---
// GET /api/labels/templates
router.get('/templates', authenticate, authorize(['ADMIN', 'STAFF_ADMIN']), async (_req: Request, res: Response) => {
  try {
    const templates = await labelService.listTemplates();
    return success(res, templates, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// POST /api/labels/templates
router.post('/templates', authenticate, authorize(['ADMIN', 'STAFF_ADMIN']), validate(createTemplateSchema), async (req: Request, res: Response) => {
  try {
    const template = await labelService.createTemplate({ ...req.body, createdById: req.user!.id });
    return success(res, template, 201);
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

// PUT /api/labels/templates/:id
router.put('/templates/:id', authenticate, authorize(['ADMIN', 'STAFF_ADMIN']), validate(updateTemplateSchema), async (req: Request, res: Response) => {
  try {
    const template = await labelService.updateTemplate(String(req.params.id), req.body);
    return success(res, template, 200);
  } catch (err: any) {
    return error(res, err.message, err.message === 'Template not found' ? 404 : 400);
  }
});

// DELETE /api/labels/templates/:id
router.delete('/templates/:id', authenticate, authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    await labelService.deleteTemplate(String(req.params.id));
    return success(res, { deleted: true }, 200);
  } catch (err: any) {
    return error(res, err.message, err.message === 'Template not found' ? 404 : 400);
  }
});

export default router;