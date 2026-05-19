import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import * as agreementService from '../services/agreement.service';
import { getPlaceholderReference } from '../utils/templateParser';
import { authenticate, hasPermission } from '../middleware/auth';
import { success, error } from '../utils/response';
import { validate } from '../middleware/validate';
import { createAgreementTemplateSchema, updateAgreementTemplateSchema, agreementPdfSchema, templatePreviewSchema, templateValidationSchema, backfillAgreementDocumentsSchema } from './agreement.schema';

const router = Router();

// Logo upload storage — store OUTSIDE server/public so vite build doesn't wipe them
const logoDir = path.resolve(__dirname, '../../uploads/logos');
// Ensure the upload directory exists (multer diskStorage will fail with ENOENT if missing)
if (!fs.existsSync(logoDir)) {
  fs.mkdirSync(logoDir, { recursive: true });
}
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
      cb(null, false);  // silently reject — avoids unhandled MulterError → 500
    }
  },
});

const signedAgreementDir = path.resolve(__dirname, '../../uploads/signed-agreements');
if (!fs.existsSync(signedAgreementDir)) {
  fs.mkdirSync(signedAgreementDir, { recursive: true });
}
const signedAgreementUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, signedAgreementDir),
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
      cb(null, `signed-agreement-${uniqueSuffix}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, file.mimetype === 'application/pdf' || ext === '.pdf');
  },
});

/* ═══════════════════════════════════════════════════════
   TEMPLATES CRUD
   ═══════════════════════════════════════════════════════ */

// GET  /api/agreement/templates
router.get(
  '/templates',
  authenticate,
  hasPermission('issuances:view'),
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
  hasPermission('issuances:view'),
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
  hasPermission('settings:view'),
  logoUpload.single('headerLogo'),
  validate(createAgreementTemplateSchema),
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
  hasPermission('settings:view'),
  logoUpload.single('headerLogo'),
  validate(updateAgreementTemplateSchema),
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
  hasPermission('settings:view'),
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
  hasPermission('settings:view'),
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
   TEMPLATE PREVIEW + VALIDATION
   ═══════════════════════════════════════════════════════ */

router.post(
  '/templates/preview',
  authenticate,
  hasPermission('settings:view'),
  validate(templatePreviewSchema),
  (req: Request, res: Response) => {
    try {
      success(res, agreementService.previewTemplate(req.body.content, req.body.mode));
    } catch (e: any) {
      error(res, e.message, 400);
    }
  },
);

router.post(
  '/templates/validate',
  authenticate,
  hasPermission('settings:view'),
  validate(templateValidationSchema),
  (req: Request, res: Response) => {
    try {
      success(res, agreementService.validateTemplateContent(req.body.content));
    } catch (e: any) {
      error(res, e.message, 400);
    }
  },
);

/* ═══════════════════════════════════════════════════════
   AGREEMENT DOCUMENT HISTORY
   ═══════════════════════════════════════════════════════ */

router.get(
  '/documents',
  authenticate,
  hasPermission('issuances:view'),
  async (req: Request, res: Response) => {
    try {
      const docs = await agreementService.listAgreementDocuments({
        personnelId: req.query.personnelId as string | undefined,
        assignmentId: req.query.assignmentId as string | undefined,
        bulkBatchId: req.query.bulkBatchId as string | undefined,
      });
      success(res, docs);
    } catch (e: any) {
      error(res, e.message, 500);
    }
  },
);

router.post(
  '/documents/backfill',
  authenticate,
  hasPermission('issuances:edit'),
  validate(backfillAgreementDocumentsSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await agreementService.backfillAgreementDocuments({
        performedById: (req as any).user.id,
        dryRun: Boolean(req.body.dryRun),
      });
      success(res, result);
    } catch (e: any) {
      error(res, e.message, 400);
    }
  },
);

router.post(
  '/documents/:id/signed-copy',
  authenticate,
  hasPermission('issuances:edit'),
  signedAgreementUpload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return error(res, 'No PDF file provided, or file is not a valid PDF', 400);
      const filePath = `/uploads/signed-agreements/${req.file.filename}`;
      const document = await agreementService.attachSignedAgreementDocument(String(req.params.id), filePath, (req as any).user.id);
      success(res, document, 201);
    } catch (e: any) {
      error(res, e.message, e.message === 'Agreement document not found' ? 404 : 400);
    }
  },
);

/* ═══════════════════════════════════════════════════════
   PDF GENERATION
   ═══════════════════════════════════════════════════════ */

// POST /api/agreement/pdf
router.post(
  '/pdf',
  authenticate,
  hasPermission('issuances:view'),
  validate(agreementPdfSchema),
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
