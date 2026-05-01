import { Router, Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import * as agreementService from '../services/agreement.service';
import { getPlaceholderReference } from '../utils/templateParser';
import { authenticate, requireRole } from '../middleware/auth';
import { success, error } from '../utils/response';

const router = Router();

// Logo upload storage — store in server/public/uploads/logos
const logoDir = path.resolve(__dirname, '../../public/uploads/logos');
const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, logoDir),
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname);
      cb(null, `logo-${uniqueSuffix}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(png|jpe?g)$/i;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG and JPG files are allowed'));
    }
  },
});

/* ═══════════════════════════════════════════════════════
   TEMPLATES CRUD
   ═══════════════════════════════════════════════════════ */

// GET  /api/agreement/templates
router.get(
  '/templates',
  authenticate,
  requireRole(['ADMIN', 'STAFF_ADMIN']),
  async (_req: Request, res: Response) => {
    try {
      const templates = await agreementService.listTemplates();
      success(res, templates);
    } catch (e: any) {
      error(res, e.message, 500);
    }
  },
);

// GET  /api/agreement/templates/:id
router.get(
  '/templates/:id',
  authenticate,
  requireRole(['ADMIN', 'STAFF_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const template = await agreementService.getTemplate(String(req.params.id));
      if (!template) return error(res, 'Template not found', 404);
      success(res, template);
    } catch (e: any) {
      error(res, e.message, 500);
    }
  },
);

// POST /api/agreement/templates   (multipart: name, content, isDefault + optional headerLogo file)
router.post(
  '/templates',
  authenticate,
  requireRole(['ADMIN']),
  logoUpload.single('headerLogo'),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      const logoPath = file ? `/uploads/logos/${file.filename}` : undefined;
      const template = await agreementService.createTemplate(
        {
          name: req.body.name,
          title: req.body.title || undefined,
          content: req.body.content,
          isDefault: req.body.isDefault === 'true',
          defaultPropertyOfficer: req.body.defaultPropertyOfficer || undefined,
          defaultAuthorizedRep: req.body.defaultAuthorizedRep || undefined,
        },
        logoPath,
      );
      success(res, template, 201);
    } catch (e: any) {
      error(res, e.message, 400);
    }
  },
);

// PATCH /api/agreement/templates/:id   (multipart: name?, content?, isDefault?, headerLogo?)
router.patch(
  '/templates/:id',
  authenticate,
  requireRole(['ADMIN']),
  logoUpload.single('headerLogo'),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      const logoPath = file ? `/uploads/logos/${file.filename}` : undefined;
      const template = await agreementService.updateTemplate(
        String(req.params.id),
        {
          name: req.body.name,
          title: req.body.title,
          content: req.body.content,
          isDefault: req.body.isDefault !== undefined ? req.body.isDefault === 'true' : undefined,
          defaultPropertyOfficer: req.body.defaultPropertyOfficer || undefined,
          defaultAuthorizedRep: req.body.defaultAuthorizedRep || undefined,
        },
        logoPath,
      );
      success(res, template);
    } catch (e: any) {
      if (e.message === 'Template not found') error(res, e.message, 404);
      else error(res, e.message, 400);
    }
  },
);

// DELETE /api/agreement/templates/:id
router.delete(
  '/templates/:id',
  authenticate,
  requireRole(['ADMIN']),
  async (req: Request, res: Response) => {
    try {
      await agreementService.deleteTemplate(String(req.params.id));
      success(res, { deleted: true });
    } catch (e: any) {
      error(res, e.message, 400);
    }
  },
);

/* ═══════════════════════════════════════════════════════
   UPLOAD LOGO (standalone, for re-use across templates)
   ═══════════════════════════════════════════════════════ */

// POST /api/agreement/upload-logo
router.post(
  '/upload-logo',
  authenticate,
  requireRole(['ADMIN']),
  logoUpload.single('logo'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return error(res, 'No logo file provided', 400);
      const logoPath = `/uploads/logos/${req.file.filename}`;
      success(res, { path: logoPath, filename: req.file.filename }, 201);
    } catch (e: any) {
      error(res, e.message, 400);
    }
  },
);

/* ═══════════════════════════════════════════════════════
   PLACEHOLDER REFERENCE
   ═══════════════════════════════════════════════════════ */

// GET  /api/agreement/placeholders
router.get(
  '/placeholders',
  authenticate,
  (_req: Request, res: Response) => {
    success(res, getPlaceholderReference());
  },
);

/* ═══════════════════════════════════════════════════════
   PDF GENERATION
   ═══════════════════════════════════════════════════════ */

// POST /api/agreement/pdf
router.post(
  '/pdf',
  authenticate,
  requireRole(['ADMIN', 'STAFF_ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const pdfBuffer = await agreementService.generateAgreementPdf(req.body);
      const filename = `agreement-${(req.body.personnelName || 'unknown').replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (e: any) {
      error(res, e.message, 400);
    }
  },
);

export default router;
