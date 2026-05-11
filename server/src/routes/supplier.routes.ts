import { Router, Request, Response } from 'express';
import * as supplierService from '../services/supplier.service';
import { authenticate, authorize } from '../middleware/auth';
import { success, error } from '../utils/response';
import { createSupplierSchema, updateSupplierSchema } from './supplier.schema';

function getClientIp(req: Request): string {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  return Array.isArray(ip) ? ip[0] : String(ip);
}

const router = Router();

// All routes require auth
router.use(authenticate);

// GET /api/suppliers — list all
router.get('/', async (_req: Request, res: Response) => {
  try {
    const suppliers = await supplierService.listSuppliers();
    return success(res, suppliers, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// POST /api/suppliers — create
router.post('/', authorize(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  try {
    const parsed = createSupplierSchema.safeParse(req.body);
    if (!parsed.success) return error(res, parsed.error.message, 400);

    const supplier = await supplierService.createSupplier(
      parsed.data as Parameters<typeof supplierService.createSupplier>[0],
      req.user!.id,
      getClientIp(req),
      String(req.headers['user-agent'] || ''),
    );
    return success(res, supplier, 201);
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

// GET /api/suppliers/:id — get single
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const supplier = await supplierService.getSupplier(String(req.params.id));
    return success(res, supplier, 200);
  } catch (err: any) {
    return error(res, err.message, err.message === 'Supplier not found' ? 404 : 500);
  }
});

// PUT /api/suppliers/:id — update
router.put('/:id', authorize(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  try {
    const parsed = updateSupplierSchema.safeParse(req.body);
    if (!parsed.success) return error(res, parsed.error.message, 400);

    const supplier = await supplierService.updateSupplier(
      String(req.params.id),
      parsed.data as Parameters<typeof supplierService.updateSupplier>[1],
      req.user!.id,
      getClientIp(req),
      String(req.headers['user-agent'] || ''),
    );
    return success(res, supplier, 200);
  } catch (err: any) {
    return error(res, err.message, err.message === 'Supplier not found' ? 404 : 400);
  }
});

// DELETE /api/suppliers/:id — delete (Admin only)
router.delete('/:id', authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const supplier = await supplierService.deleteSupplier(
      String(req.params.id),
      req.user!.id,
      getClientIp(req),
      String(req.headers['user-agent'] || ''),
    );
    return success(res, supplier, 200);
  } catch (err: any) {
    return error(res, err.message, err.message === 'Supplier not found' ? 404 : 400);
  }
});

export default router;
