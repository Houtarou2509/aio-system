import { Request, Response, NextFunction } from 'express';
import { logAudit } from '../services/auditLog.service';
import { classifySeverity, generateSummary } from '../utils/auditHelpers';

function getClientIp(req: Request): string {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  return Array.isArray(ip) ? ip[0] : String(ip);
}

export function auditLog() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalEnd = res.end.bind(res);
    (res as any).end = function (chunk?: any, encoding?: any, cb?: any) {
      if (req.user && res.statusCode < 400) {
        const action = req.method;
        const entityType = req.baseUrl.replace('/api/', '') || 'unknown';

        logAudit({
          userId: req.user.id,
          entityType,
          entityId: req.params.id ? String(req.params.id) : 'bulk',
          action,
          ipAddress: getClientIp(req),
          metadata: {
            userAgent: req.headers['user-agent'] || null,
            severity: classifySeverity(action),
            summary: generateSummary({ action, entityType }),
          },
        });
      }
      return originalEnd(chunk, encoding, cb);
    };
    next();
  };
}
