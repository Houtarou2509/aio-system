import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { success, error } from '../utils/response';

const router = Router();


// GET /api/institutions — list all institutions
router.get('/', authenticate, async (_req: Request, res: Response) => {
  const institutions = await prisma.institutionLookup.findMany({
    orderBy: { name: 'asc' },
  });
  return success(res, institutions, 200, { total: institutions.length });
});

export default router;
