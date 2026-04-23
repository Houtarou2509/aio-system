import { Request, Response, NextFunction } from 'express';
import { error } from '../utils/response';
import { JwtPayload, verify } from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { id: string; role: string };
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return error(res, 'Authentication required', 401);

  try {
    req.user = verify(token, process.env.JWT_SECRET!) as typeof req.user;
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

// Alias for clarity
export const requireRole = authorize;