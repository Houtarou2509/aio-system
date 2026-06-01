import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { success, error } from '../utils/response';

const router = Router();

router.use(authenticate);

router.get('/health-details', authorize(['ADMIN', 'STAFF_ADMIN']), async (_req: Request, res: Response) => {
  const checkedAt = new Date();
  try {
    let database: { status: 'healthy' | 'error'; message: string } = { status: 'healthy', message: 'Connected' };
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = { status: 'error', message: 'Database check failed' };
    }

    const latestBackup = await prisma.backupLog.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, encryptedSize: true, destination: true },
    });

    const uploadDir = path.resolve(__dirname, '../../uploads');
    const uploads = fs.existsSync(uploadDir)
      ? { status: 'healthy' as const, message: 'Upload storage available' }
      : { status: 'warning' as const, message: 'Upload directory not found' };

    const warnings: string[] = [];
    if (!latestBackup) {
      warnings.push('No completed backup found.');
    } else if (Date.now() - latestBackup.createdAt.getTime() > 24 * 60 * 60 * 1000) {
      warnings.push('Latest completed backup is older than 24 hours.');
    }
    if (database.status !== 'healthy') warnings.push(database.message);
    if (uploads.status !== 'healthy') warnings.push(uploads.message);

    return success(res, {
      overallStatus: database.status === 'error' ? 'error' : warnings.length ? 'warning' : 'healthy',
      checkedAt: checkedAt.toISOString(),
      server: {
        status: 'healthy',
        time: checkedAt.toISOString(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.APP_VERSION || process.env.npm_package_version || 'unknown',
      },
      database,
      backups: {
        status: latestBackup ? 'healthy' : 'warning',
        latestCompletedAt: latestBackup?.createdAt ?? null,
        latestSize: latestBackup?.encryptedSize ?? null,
        destination: latestBackup?.destination ?? null,
      },
      uploads,
      warnings,
    }, 200);
  } catch (err: any) {
    return error(res, err.message || 'Failed to load health details', 500);
  }
});

export default router;
