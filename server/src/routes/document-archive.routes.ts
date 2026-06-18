import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { ZodError } from 'zod';
import * as documentArchiveService from '../services/document-archive.service';
import { authenticate, hasPermission } from '../middleware/auth';
import { success, error } from '../utils/response';
import { listDocumentsSchema, uploadDocumentSchema } from './document-archive.schema';
import { logAudit, AUDIT_ACTIONS } from '../services/auditLog.service';
import { makeDocumentNumber } from '../services/agreement.service';

const router = Router();

const documentsDir = path.resolve(__dirname, '../../uploads/documents');
if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
}

function getClientIp(req: Request): string {
  const ip = req.headers['x-forwarded-for'];
  if (Array.isArray(ip)) return ip[0];
  if (typeof ip === 'string') return ip.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

const documentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, documentsDir),
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
      cb(null, `document-${uniqueSuffix}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isPdf = file.mimetype === 'application/pdf' || ext === '.pdf';
    cb(null, isPdf);
  },
});

const handleDocumentUpload = (req: Request, res: Response, next: NextFunction) => {
  documentUpload.single('file')(req, res, (err: any) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Document must be 20 MB or smaller'
      : err.message || 'Document upload failed';
    return error(res, message, 400);
  });
};

// GET /api/documents — list and filter archive documents
router.get(
  '/',
  authenticate,
  hasPermission('documents:view'),
  async (req: Request, res: Response) => {
    try {
      const parsed = listDocumentsSchema.safeParse(req.query);
      if (!parsed.success) {
        return error(res, 'Validation failed', 422, parsed.error.flatten());
      }
      const q = parsed.data;
      const filters = {
        search: q.search,
        documentType: q.documentType as any,
        status: q.status,
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        assetId: q.assetId,
        personnelId: q.personnelId,
        purchaseRequestId: q.purchaseRequestId,
        assignmentId: q.assignmentId,
        page: Number(q.page) || 1,
        limit: Number(q.limit) || 20,
      };
      const result = await documentArchiveService.listDocuments(filters);
      return success(res, result.data, 200, result.meta);
    } catch (e: any) {
      return error(res, e.message, 500);
    }
  },
);

// GET /api/documents/:id — metadata
router.get(
  '/:id',
  authenticate,
  hasPermission('documents:view'),
  async (req: Request, res: Response) => {
    try {
      const doc = await documentArchiveService.getDocumentById(String(req.params.id));
      if (!doc) return error(res, 'Document not found', 404);
      return success(res, doc);
    } catch (e: any) {
      return error(res, e.message, 500);
    }
  },
);

// GET /api/documents/:id/download — secure download/view
router.get(
  '/:id/download',
  authenticate,
  hasPermission('documents:view'),
  async (req: Request, res: Response) => {
    try {
      const doc = await documentArchiveService.getDocumentById(String(req.params.id));
      if (!doc) return error(res, 'Document not found', 404);
      if (!doc.filePath) return error(res, 'Document has no file attached', 404);

      const absolutePath = documentArchiveService.resolveDocumentPath(doc.filePath);
      if (!absolutePath) {
        return error(res, 'Invalid document file path', 400);
      }
      if (!fs.existsSync(absolutePath)) {
        return error(res, 'File not found', 404);
      }

      await documentArchiveService.logDocumentView(doc.id, req.user!.id, getClientIp(req));

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(absolutePath)}"`);
      res.sendFile(absolutePath);
    } catch (e: any) {
      return error(res, e.message, 500);
    }
  },
);

// POST /api/documents/upload — upload PDF and link to source records
router.post(
  '/upload',
  authenticate,
  hasPermission('documents:upload'),
  handleDocumentUpload,
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return error(res, 'No PDF file provided, or file is not a valid PDF', 400);
      }

      const parsed = uploadDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        return error(res, 'Validation failed', 422, parsed.error.flatten());
      }

      const body = parsed.data;
      const filePath = `/uploads/documents/${req.file.filename}`;

      const item = await documentArchiveService.createArchiveItem({
        documentType: body.documentType,
        title: body.title,
        documentNumber: body.documentNumber || makeDocumentNumber('DOC'),
        filePath,
        sourceEntityType: body.sourceEntityType || null,
        sourceEntityId: body.sourceEntityId || null,
        assetId: body.assetId || null,
        personnelId: body.personnelId || null,
        purchaseRequestId: body.purchaseRequestId || null,
        assignmentId: body.assignmentId || null,
        status: body.status || 'ACTIVE',
        uploadedById: req.user!.id,
      });

      await logAudit({
        userId: req.user!.id,
        action: AUDIT_ACTIONS.DOCUMENT_ARCHIVED,
        entityType: 'DocumentArchiveItem',
        entityId: item.id,
        ipAddress: getClientIp(req),
        metadata: {
          documentType: body.documentType,
          documentNumber: item.documentNumber,
          sourceEntityType: body.sourceEntityType || null,
          sourceEntityId: body.sourceEntityId || null,
        },
      }).catch(() => {});

      return success(res, item, 201);
    } catch (e: any) {
      if (e instanceof ZodError) {
        return error(res, 'Validation failed', 422, e.flatten());
      }
      return error(res, e.message, 400);
    }
  },
);

export default router;
