import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createUserSchema, updateUserSchema, updateUserStatusSchema } from './user.schema';
import { success, error } from '../utils/response';
import { ALL_PERMISSIONS, PERMISSION_KEYS, DEFAULT_PERMISSIONS } from '../middleware/permissions';
import { logAudit } from '../services/auditLog.service';
import { parsePermissions, type PermissionKey } from '../utils/permissions';

const router = Router();

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
  permissions: true,
  mustChangePassword: true,
  twoFactorEnabled: true,
  lastLogin: true,
  createdAt: true,
};

/** Validate that every entry in `perms` is a known permission key. */
function isValidPermissions(perms: string[]): boolean {
  return Array.isArray(perms) && perms.every(p => PERMISSION_KEYS.includes(p));
}

/** Ensure permissions field is parsed into an array before responding. */
function serializeUser(user: any) {
  if (!user) return user;
  try {
    return { ...user, permissions: JSON.parse(user.permissions) };
  } catch {
    return { ...user, permissions: [] };
  }
}

// GET /api/users — paginated list with search/filter
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const search = (req.query.search as string) || '';
    const role = req.query.role as string | undefined;
    const status = req.query.status as string | undefined;

    const where: any = {
      ...(search ? {
        OR: [
          { username: { contains: search, mode: 'insensitive' } },
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: SAFE_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return success(res, users.map(serializeUser), 200, {
      page, limit, total, totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// POST /api/users
router.post('/', validate(createUserSchema), async (req: Request, res: Response) => {
  try {
    const { fullName, username, email, password, role, permissions } = req.body;

    // Check unique constraints
    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existing) {
      if (existing.username === username) return error(res, 'Username already exists', 409);
      return error(res, 'Email already exists', 409);
    }

    // Resolve permissions: explicit > role defaults
    let finalPermissions: string[];
    if (permissions !== undefined) {
      if (!isValidPermissions(permissions)) {
        return error(res, 'Invalid permission keys provided', 400);
      }
      finalPermissions = permissions;
    } else {
      finalPermissions = DEFAULT_PERMISSIONS[role] ?? [];
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        fullName,
        username,
        email,
        passwordHash,
        role,
        permissions: JSON.stringify(finalPermissions),
        mustChangePassword: true,
      },
      select: SAFE_SELECT,
    });

    // Audit: user created
    logAudit({
      userId: req.user!.id,
      action: 'user.created',
      entityType: 'User',
      entityId: user.id,
      metadata: { username: user.username, role: user.role },
      ipAddress: req.ip,
    }).catch(() => {});

    return success(res, serializeUser(user), 201);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// PUT /api/users/:id
router.put('/:id', validate(updateUserSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { fullName, username, email, role, password, permissions } = req.body;

    // ── Security guard: block self-role-change ──
    if (req.user!.id === id && role && role !== req.user!.role) {
      return error(res, 'You cannot change your own role.', 403);
    }

    // ── Security guard: block self-permission-escalation ──
    if (req.user!.id === id && permissions !== undefined) {
      const currentUserPerms: string[] = Array.isArray(req.user!.permissions)
        ? req.user!.permissions
        : parsePermissions(typeof req.user!.permissions === 'string' ? req.user!.permissions : null);
      const escalated = (permissions as string[]).filter(
        (p: string) => !currentUserPerms.includes(p)
      );
      if (escalated.length > 0) {
        return error(res, 'You cannot grant yourself permissions you do not already have.', 403);
      }
    }

    // ── Security guard: role-based permission ceiling ──
    if (req.user!.role !== 'ADMIN' && permissions !== undefined) {
      const myCeiling = DEFAULT_PERMISSIONS[req.user!.role] ?? [];
      const exceeded = (permissions as string[]).filter(
        (p: string) => !myCeiling.includes(p as PermissionKey)
      );
      if (exceeded.length > 0) {
        return error(res, 'You cannot assign permissions beyond your role level.', 403);
      }
    }

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
    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
      // If admin resets someone else's password, force change on next login
      data.mustChangePassword = req.user!.id !== id;
    }

    // Handle permissions
    if (permissions !== undefined) {
      if (!isValidPermissions(permissions)) {
        return error(res, 'Invalid permission keys provided', 400);
      }
      data.permissions = JSON.stringify(permissions);
    } else if (role !== undefined && role !== existing.role) {
      // Role changed without explicit permissions — assign defaults for the new role
      data.permissions = JSON.stringify(DEFAULT_PERMISSIONS[role] ?? []);
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: SAFE_SELECT,
    });

    // Build change summary for audit
    const changes: { field: string; from?: any; to?: any; changed?: boolean }[] = [];
    if (fullName !== undefined && fullName !== existing.fullName) changes.push({ field: 'fullName', from: existing.fullName, to: fullName });
    if (username !== undefined && username !== existing.username) changes.push({ field: 'username', from: existing.username, to: username });
    if (email !== undefined && email !== existing.email) changes.push({ field: 'email', from: existing.email, to: email });
    if (role !== undefined && role !== existing.role) changes.push({ field: 'role', from: existing.role, to: role });
    if (permissions !== undefined) {
      const oldPerms = JSON.parse(existing.permissions || '[]');
      changes.push({ field: 'permissions', from: oldPerms, to: permissions });
    }
    if (password) changes.push({ field: 'password', changed: true });

    // Audit: user updated
    logAudit({
      userId: req.user!.id,
      action: 'user.updated',
      entityType: 'User',
      entityId: id,
      metadata: { changes, targetUsername: existing.username },
      ipAddress: req.ip,
    }).catch(() => {});

    return success(res, serializeUser(user), 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// PATCH /api/users/:id/status
router.patch('/:id/status', validate(updateUserStatusSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

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

    // Audit: user status changed
    logAudit({
      userId: req.user!.id,
      action: 'user.status_changed',
      entityType: 'User',
      entityId: id,
      metadata: { targetUsername: user.username, newStatus: status },
      ipAddress: req.ip,
    }).catch(() => {});

    return success(res, serializeUser(updated), 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

// DELETE /api/users/:id/2fa — Admin reset 2FA for another user
router.delete('/:id/2fa', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    // Cannot reset your own 2FA via this admin endpoint
    if (req.user!.id === id) {
      return error(res, 'Use your account settings to manage your own 2FA.', 403);
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return error(res, 'User not found', 404);

    if (!user.twoFactorEnabled) {
      return error(res, '2FA is not enabled for this user.', 400);
    }

    await prisma.user.update({
      where: { id },
      data: {
        twoFactorSecret: null,
        twoFactorEnabled: false,
        backupCodes: '[]',
      },
    });

    // Audit: 2FA reset
    logAudit({
      userId: req.user!.id,
      action: 'user.2fa_reset',
      entityType: 'User',
      entityId: id,
      metadata: { targetUsername: user.username },
      ipAddress: req.ip,
    }).catch(() => {});

    return success(res, { message: `2FA has been reset for ${user.username}.` }, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

export default router;