import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { classifySeverity, generateSummary } from '../utils/auditHelpers';

const prisma = new PrismaClient();

function getClientIp(req: Request): string {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  return Array.isArray(ip) ? ip[0] : String(ip);
}

export function auditLog() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalEnd = res.end.bind(res);
    (res as any).end = function (chunk?: any, encoding?: any, cb?: any) {
      if (req.user && res.statusCode < 400) {
        const ua = req.headers['user-agent'] || null;
        const action = req.method;
        prisma.auditLog.create({
          data: {
            entityType: req.baseUrl.replace('/api/', '') || 'unknown',
            entityId: String(req.params.id) || 'bulk',
            action,
            performedById: req.user!.id,
            ipAddress: getClientIp(req),
            userAgent: ua,
            severity: classifySeverity(action),
            summary: generateSummary({ action, entityType: req.baseUrl.replace('/api/', '') || 'unknown' }),
          },
        }).catch(() => {});
      }
      return originalEnd(chunk, encoding, cb);
    };
    next();
  };
}