import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { authenticate, requireRole } from '../middleware/auth';
import { success, error } from '../utils/response';

const router = Router();
const prisma = new PrismaClient();

// All routes require authentication + Admin role
router.use(authenticate);
router.use(requireRole(['ADMIN']));

const SAFE_SELECT = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  role: true,
  status: true,
  lastLogin: true,
  createdAt: true,
};

// GET /api/users
router.get('/', async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return success(res, users, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// POST /api/users
router.post('/', async (req: Request, res: Response) => {
  try {
    const { fullName, username, email, password, role } = req.body;

    if (!username || !email || !password || !role) {
      return error(res, 'username, email, password, and role are required', 400);
    }

    // Check unique constraints
    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existing) {
      if (existing.username === username) return error(res, 'Username already exists', 409);
      return error(res, 'Email already exists', 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { fullName, username, email, passwordHash, role },
      select: SAFE_SELECT,
    });

    return success(res, user, 201);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// PUT /api/users/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { fullName, username, email, role, password } = req.body;

    // Verify user exists
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return error(res, 'User not found', 404);

    // Check unique constraints excluding current user
    if (username || email) {
      const orClauses: { username?: string; email?: string }[] = [];
      if (username) orClauses.push({ username });
      if (email) orClauses.push({ email });
      const conflict = await prisma.user.findFirst({
        where: {
          OR: orClauses,
          id: { not: id },
        },
      });
      if (conflict) {
        if (conflict.username === username) return error(res, 'Username already exists', 409);
        return error(res, 'Email already exists', 409);
      }
    }

    const data: any = {};
    if (fullName !== undefined) data.fullName = fullName;
    if (username !== undefined) data.username = username;
    if (email !== undefined) data.email = email;
    if (role !== undefined) data.role = role;
    if (password) data.passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.update({
      where: { id },
      data,
      select: SAFE_SELECT,
    });

    return success(res, user, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// PATCH /api/users/:id/status
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      return error(res, 'Status must be "active" or "inactive"', 400);
    }

    // Cannot deactivate own account
    if (status === 'inactive' && req.user!.id === id) {
      return error(res, 'Cannot deactivate your own account', 403);
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return error(res, 'User not found', 404);

    const updated = await prisma.user.update({
      where: { id },
      data: { status },
      select: SAFE_SELECT,
    });

    return success(res, updated, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

export default router;