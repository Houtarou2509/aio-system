import { Request, Response, NextFunction } from 'express';
import { error } from '../utils/response';
import { JwtPayload, verify } from 'jsonwebtoken';
import { parsePermissions, type PermissionKey } from '../utils/permissions';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { id: string; role: string; permissions: PermissionKey[] };
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return error(res, 'Authentication required', 401);

  try {
    const payload = verify(token, process.env.JWT_SECRET!) as typeof req.user;
    // Parse permissions from the JWT payload (they may come as string from older tokens)
    if (payload && typeof payload.permissions === 'string') {
      payload.permissions = parsePermissions(payload.permissions as unknown as string);
    }
    if (payload && !Array.isArray(payload.permissions)) {
      payload.permissions = [];
    }
    req.user = payload;
    next();
  } catch {
    return error(res, 'Invalid or expired token', 401);
  }
}

type RoleCheck = string | ((role: string) => boolean);

export function authorize(roles: RoleCheck[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return error(res, 'Authentication required', 401);

    const allowed = roles.some(r =>
      typeof r === 'function' ? r(req.user!.role) : r === req.user!.role
    );

    if (!allowed) return error(res, 'Insufficient permissions', 403);
    next();
  };
}

// New: permission-based access check
export function hasPermission(permission: PermissionKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return error(res, 'Authentication required', 401);
    if (req.user.role === 'ADMIN') return next();
    if (!req.user.permissions?.includes(permission)) {
      return error(res, 'Insufficient permissions', 403);
    }
    next();
  };
}

// Alias for clarity
export const requireRole = authorize;
