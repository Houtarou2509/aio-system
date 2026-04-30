import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { success, error } from '../utils/response';

const router = Router();
const prisma = new PrismaClient();

// GET /api/projects — list all projects
router.get('/', authenticate, async (_req: Request, res: Response) => {
  const projects = await prisma.projectLookup.findMany({
    orderBy: { name: 'asc' },
  });
  return success(res, projects, 200, { total: projects.length });
});

export default router;
