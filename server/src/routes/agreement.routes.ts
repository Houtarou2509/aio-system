import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import crypto from 'crypto';
import * as agreementService from '../services/agreement.service';
import { getPlaceholderReference } from '../utils/templateParser';
import { authenticate, hasPermission } from '../middleware/auth';
import { success, error } from '../utils/response';
import { validate } from '../middleware/validate';
import { createAgreementTemplateSchema, updateAgreementTemplateSchema, agreementPdfSchema, templatePreviewSchema, templateValidationSchema, backfillAgreementDocumentsSchema, sanitizeAgreementDocumentsSchema } from './agreement.schema';
import { AUDIT_ACTIONS, logAudit } from '../services/auditLog.service';
import { prisma } from '../lib/prisma';
import { convertPdfFirstPageToPng } from '../utils/pdfToImage';
import { parseContentJsonField } from '../utils/contentJson';

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
      cb(new Error('Logo must be a PNG or JPG file'));
    }
  },
});

const handleLogoUpload = (req: Request, res: Response, next: NextFunction) => {
  logoUpload.single('headerLogo')(req, res, (err: any) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Logo must be 5 MB or smaller'
      : err.message || 'Logo upload failed';
    return error(res, message, 400);
  });
};

// Letterhead upload storage — accepts PDF, PNG, JPG for full A4 letterhead backgrounds
// PDFs are converted to PNG at upload time so PDFKit can render them.
const letterheadDir = path.resolve(__dirname, '../../uploads/letterheads');
if (!fs.existsSync(letterheadDir)) {
  fs.mkdirSync(letterheadDir, { recursive: true });
}
const letterheadUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, letterheadDir),
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `letterhead-${uniqueSuffix}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB for full-page letterhead
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(png|jpe?g|pdf)$/i;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext)) {
      cb(null, true);
    } else {
      cb(null, false);
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

// GET  /api/agreement/templates/:id/versions
router.get(
  '/templates/:id/versions',
  authenticate,
  hasPermission('settings:view'),
  async (req: Request, res: Response) => {
    try {
      const template = await agreementService.getTemplate(String(req.params.id));
      if (!template) return error(res, 'Template not found', 404);
      const versions = await agreementService.listTemplateVersions(String(req.params.id));
      success(res, versions);
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

// POST /api/agreement/templates   (multipart: name, content, isDefault + optional headerLogo/letterhead files)
router.post(
  '/templates',
  authenticate,
  hasPermission('settings:view'),
  handleLogoUpload,
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
          contentJson: parseContentJsonField(req.body.contentJson),
          isDefault: req.body.isDefault === 'true',
          defaultPropertyOfficer: req.body.defaultPropertyOfficer || undefined,
          defaultAuthorizedRep: req.body.defaultAuthorizedRep || undefined,
          letterheadPath: req.body.letterheadPath || undefined,
        },
        logoPath,
      );
      success(res, template, 201);
    } catch (e: any) {
      error(res, e.message, 400);
    }
  },
);

// PATCH /api/agreement/templates/:id   (multipart: name?, content?, isDefault?, headerLogo?, letterhead?)
router.patch(
  '/templates/:id',
  authenticate,
  hasPermission('settings:view'),
  handleLogoUpload,
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
          contentJson: parseContentJsonField(req.body.contentJson),
          isDefault: req.body.isDefault !== undefined ? req.body.isDefault === 'true' : undefined,
          defaultPropertyOfficer: req.body.defaultPropertyOfficer || undefined,
          defaultAuthorizedRep: req.body.defaultAuthorizedRep || undefined,
          headerLogo: req.body.headerLogo,
          letterheadPath: req.body.letterheadPath,
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

// POST /api/agreement/templates/:id/duplicate
router.post(
  '/templates/:id/duplicate',
  authenticate,
  hasPermission('settings:view'),
  async (req: Request, res: Response) => {
    try {
      const duplicated = await agreementService.duplicateTemplate(String(req.params.id));
      success(res, duplicated, 201);
    } catch (e: any) {
      const status = e.status || 400;
      error(res, e.message, status);
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
   UPLOAD LETTERHEAD (full A4 letterhead background)
   ═══════════════════════════════════════════════════════ */

// POST /api/agreement/upload-letterhead
router.post(
  '/upload-letterhead',
  authenticate,
  hasPermission('settings:view'),
  letterheadUpload.single('letterhead'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return error(res, 'No letterhead file provided', 400);

      let letterheadPath = `/uploads/letterheads/${req.file.filename}`;
      const fullPath = path.resolve(__dirname, '../../uploads/letterheads', req.file.filename);
      const ext = path.extname(req.file.originalname).toLowerCase();

      // If a PDF was uploaded, convert page 1 to PNG so PDFKit can render it
      if (ext === '.pdf') {
        try {
          const pngBaseName = req.file.filename.replace(/\.pdf$/i, '');
          const pngAbsolutePath = await convertPdfFirstPageToPng(fullPath, letterheadDir, pngBaseName);
          // Update letterheadPath to point to the converted PNG
          letterheadPath = `/uploads/letterheads/${path.basename(pngAbsolutePath)}`;
          // Optionally remove the original PDF to save disk space
          try { fs.unlinkSync(fullPath); } catch { /* best-effort */ }
        } catch (conversionErr: any) {
          // Clean up the uploaded PDF since conversion failed
          try { fs.unlinkSync(fullPath); } catch { /* best-effort */ }
          return error(res, conversionErr.message || 'Failed to convert PDF letterhead to image', 400);
        }
      }

      success(res, { path: letterheadPath, filename: req.file.filename }, 201);
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
  '/documents/sanitize-text',
  authenticate,
  hasPermission('issuances:edit'),
  validate(sanitizeAgreementDocumentsSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await agreementService.sanitizeStoredAgreementTexts({
        dryRun: Boolean(req.body.dryRun),
        documentNumber: req.body.documentNumber || null,
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
      logAudit({
        userId: (req as any).user?.id ?? null,
        action: AUDIT_ACTIONS.AGREEMENT_SIGNED_COPY_UPLOADED,
        entityType: 'AgreementDocument',
        entityId: String(req.params.id),
        ipAddress: Array.isArray(req.ip) ? req.ip[0] : req.ip,
      }).catch(() => {});
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
      const pdfBuffer = await agreementService.generateAgreementPdf({
        ...req.body,
        renderMode: req.body.renderMode || 'preprinted',
      });
      logAudit({
        userId: (req as any).user?.id ?? null,
        action: AUDIT_ACTIONS.AGREEMENT_PDF_VIEWED,
        entityType: 'AgreementDocument',
        entityId: req.body.agreementDocumentId,
        ipAddress: Array.isArray(req.ip) ? req.ip[0] : req.ip,
      }).catch(() => {});
      const filename = `agreement-${(req.body.personnelName || 'unknown').replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (e: any) {
      error(res, e.message, 400);
    }
  },
);

/* ═══════════════════════════════════════════════════════
   DOCUMENT DETAILS BY DOCUMENT NUMBER
   ═══════════════════════════════════════════════════════ */

// GET /api/agreements/document/:documentNumber  (auth required)
router.get(
  '/document/:documentNumber',
  authenticate,
  hasPermission('issuances:view'),
  async (req: Request, res: Response) => {
    try {
      const documentNumber = req.params.documentNumber as string;

      const doc = await prisma.agreementDocument.findUnique({
        where: { documentNumber },
        select: {
          id: true,
          documentNumber: true,
          title: true,
          status: true,
          issuedAt: true,
          personnelNameSnapshot: true,
          designationSnapshot: true,
          projectSnapshot: true,
          institutionSnapshot: true,
          assetSnapshot: true,
          propertyOfficerName: true,
          authorizedRepName: true,
          recipientSignedAt: true,
          recipientSignatureName: true,
          signedPdfPath: true,
          signedUploadedAt: true,
          templateVersion: true,
          personnelId: true,
          assignments: {
            select: {
              id: true,
              assignedAt: true,
              returnedAt: true,
              condition: true,
              asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true } },
            },
            orderBy: { assignedAt: 'desc' },
          },
        },
      });

      if (!doc) {
        return error(res, 'No agreement found for this number.', 404);
      }

      return success(res, doc);
    } catch (err: any) {
      console.error('[Agreement Document Details Error]', err);
      return error(res, err.message || 'Failed to fetch document details', 500);
    }
  },
);

/* ═══════════════════════════════════════════════════════
   PUBLIC SIGNATURE VERIFICATION
   ═══════════════════════════════════════════════════════ */

// GET /api/agreements/verify/:documentNumber  (PUBLIC — no auth required)
router.get(
  '/verify/:documentNumber',
  async (req: Request, res: Response) => {
    try {
      const documentNumber = req.params.documentNumber as string;

      const doc = await prisma.agreementDocument.findUnique({
        where: { documentNumber },
        select: {
          id: true,
          documentNumber: true,
          recipientSignedAt: true,
          recipientSignatureName: true,
          signatureHash: true,
        },
      });

      if (!doc) {
        return error(res, 'Document not found', 404);
      }

      if (!doc.signatureHash) {
        return success(res, { verified: false, reason: 'not_signed' });
      }

      // Recompute hash from stored fields
      const expectedHash = crypto
        .createHash('sha256')
        .update([doc.documentNumber, doc.recipientSignatureName || '', doc.recipientSignedAt!.toISOString()].join('|'))
        .digest('hex');

      if (expectedHash !== doc.signatureHash) {
        return success(res, { verified: false, reason: 'hash_mismatch' });
      }

      return success(res, {
        verified: true,
        documentNumber: doc.documentNumber,
        signedAt: doc.recipientSignedAt,
        signatoryName: doc.recipientSignatureName,
      });
    } catch (err: any) {
      console.error('[Agreement Verify Error]', err);
      return error(res, err.message || 'Verification failed', 500);
    }
  },
);

export default router;
