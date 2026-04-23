import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';
import { success, error } from '../utils/response';

const router = Router();
const prisma = new PrismaClient();

function getClientIp(req: Request): string {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  return Array.isArray(ip) ? ip[0] : String(ip);
}

// POST /api/assets/request — Staff requests an asset
router.post('/request', authenticate, authorize(['STAFF', 'STAFF_ADMIN', 'ADMIN']), async (req: Request, res: Response) => {
  try {
    const { assetId, requestNote } = req.body;
    if (!assetId) return error(res, 'assetId is required', 400);

    // Check asset exists and is available
    const asset = await prisma.asset.findUnique({ where: { id: String(assetId), deletedAt: null } });
    if (!asset) return error(res, 'Asset not found', 404);
    if (asset.status !== 'AVAILABLE') return error(res, 'Asset is not available for request', 400);

    // Check no pending request already exists for this user + asset
    const existing = await prisma.assignment.findFirst({
      where: { assetId: String(assetId), userId: req.user!.id, requestStatus: 'PENDING' },
    });
    if (existing) return error(res, 'You already have a pending request for this asset', 400);

    const assignment = await prisma.assignment.create({
      data: {
        assetId: String(assetId),
        userId: req.user!.id,
        assignedTo: req.user!.username,
        requestStatus: 'PENDING',
        requestNote: requestNote || null,
        assignedAt: new Date(),
      },
      include: {
        asset: { select: { id: true, name: true, type: true, status: true } },
        user: { select: { id: true, username: true, email: true, fullName: true } },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        entityType: 'Assignment',
        entityId: assignment.id,
        action: 'REQUEST',
        performedById: req.user!.id,
        ipAddress: getClientIp(req),
        field: 'requestStatus',
        newValue: 'PENDING',
      },
    });

    return success(res, assignment, 201);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// GET /api/assets/requests — Admin lists pending requests
router.get('/requests', authenticate, authorize(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string || 'PENDING';

    const requests = await prisma.assignment.findMany({
      where: { requestStatus: status as any },
      include: {
        asset: { select: { id: true, name: true, type: true, status: true, imageUrl: true } },
        user: { select: { id: true, username: true, email: true, fullName: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });

    return success(res, requests, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// PATCH /api/assets/request/:id/approve — Admin approves
router.patch('/request/:id/approve', authenticate, authorize(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: { user: { select: { username: true } } },
    });
    if (!assignment) return error(res, 'Request not found', 404);
    if (assignment.requestStatus !== 'PENDING') return error(res, 'Request is not pending', 400);

    const assignToName = assignment.user?.username || assignment.assignedTo || 'Unknown';

    // Update assignment + asset in a transaction
    await prisma.$transaction([
      prisma.assignment.update({
        where: { id },
        data: { requestStatus: 'APPROVED' },
      }),
      prisma.asset.update({
        where: { id: assignment.assetId },
        data: { status: 'ASSIGNED', assignedTo: assignToName },
      }),
    ]);

    // Fetch the updated assignment with includes for response
    const updated = await prisma.assignment.findUniqueOrThrow({
      where: { id },
      include: {
        asset: { select: { id: true, name: true, type: true, status: true } },
        user: { select: { id: true, username: true, email: true, fullName: true } },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        entityType: 'Assignment',
        entityId: id,
        action: 'APPROVE',
        performedById: req.user!.id,
        ipAddress: getClientIp(req),
        field: 'requestStatus',
        oldValue: 'PENDING',
        newValue: 'APPROVED',
      },
    });

    return success(res, updated, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// PATCH /api/assets/request/:id/deny — Admin denies
router.patch('/request/:id/deny', authenticate, authorize(['ADMIN', 'STAFF_ADMIN']), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { denialNote } = req.body;

    const assignment = await prisma.assignment.findUnique({ where: { id } });
    if (!assignment) return error(res, 'Request not found', 404);
    if (assignment.requestStatus !== 'PENDING') return error(res, 'Request is not pending', 400);

    const updated = await prisma.assignment.update({
      where: { id },
      data: {
        requestStatus: 'DENIED',
        notes: denialNote ? `${assignment.notes || ''}\nDenied: ${denialNote}`.trim() : assignment.notes,
      },
      include: {
        asset: { select: { id: true, name: true, type: true, status: true } },
        user: { select: { id: true, username: true, email: true, fullName: true } },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        entityType: 'Assignment',
        entityId: id,
        action: 'DENY',
        performedById: req.user!.id,
        ipAddress: getClientIp(req),
        field: 'requestStatus',
        oldValue: 'PENDING',
        newValue: 'DENIED',
      },
    });

    return success(res, updated, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

export default router;