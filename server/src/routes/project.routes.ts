import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { success, error } from '../utils/response';

const router = Router();


// GET /api/projects — list all projects
router.get('/', authenticate, async (_req: Request, res: Response) => {
  const projects = await prisma.projectLookup.findMany({
    orderBy: { name: 'asc' },
  });
  return success(res, projects, 200, { total: projects.length });
});

export default router;
