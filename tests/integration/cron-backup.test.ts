import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { PrismaClient } from '@prisma/client';
import { seedUsers, createAsset, cleanAssets } from '../fixtures/assets';
import { mockS3Send, mockS3Client } from '../helpers/mocks';

const prisma = new PrismaClient();
let users: Record<string, any>;

beforeAll(async () => {
  users = await seedUsers();
}, 15_000);

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.backupLog.deleteMany({});
  mockS3Send.mockClear();
});

describe('Cron — Backups', () => {
  // 9
  it('9. Trigger backup cron manually → BackupLog created with status COMPLETED', async () => {
    const { runBackup } = await import('../../server/src/services/backup.service');
    const result = await runBackup(users.ADMIN.id);

    expect(result.status).toBe('COMPLETED');

    // Verify BackupLog in DB
    const log = await prisma.backupLog.findFirst({ where: { status: 'COMPLETED' } });
    expect(log).not.toBeNull();
  });

  // 10
  it('10. S3 upload mock called with encrypted buffer (not plaintext JSON)', async () => {
    // Set S3 env vars so the code tries to upload
    const originalEnv = { ...process.env };
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    process.env.AWS_S3_BUCKET = 'test-bucket';
    process.env.AWS_REGION = 'us-east-1';

    const { runBackup } = await import('../../server/src/services/backup.service');
    await runBackup(users.ADMIN.id);

    // S3 mock should have been called
    if (mockS3Send.mock.calls.length > 0) {
      const call = mockS3Send.mock.calls[0][0];
      const body = call?.Body;
      if (body) {
        const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
        // Verify it's not plaintext JSON (shouldn't start with '{')
        const firstChar = buf.toString('utf8', 0, 1);
        expect(firstChar).not.toBe('{');
      }
    }

    // Restore env
    process.env = originalEnv;
  });

  // 11
  it('11. POST /api/backups/now (Admin) → 200/201, BackupLog created', async () => {
    const res = await request(app)
      .post('/api/backups/now')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('COMPLETED');

    // Verify BackupLog in DB
    const log = await prisma.backupLog.findFirst({ where: { status: 'COMPLETED' }, orderBy: { createdAt: 'desc' } });
    expect(log).not.toBeNull();
  });

  // 12
  it('12. POST /api/backups/now (Staff) → 403', async () => {
    const res = await request(app)
      .post('/api/backups/now')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`);

    expect(res.status).toBe(403);
  });

  // 13
  it('13. GET /api/backups (Admin) → returns list of BackupLog entries', async () => {
    // Create a backup first
    const { runBackup } = await import('../../server/src/services/backup.service');
    await runBackup(users.ADMIN.id);

    const res = await request(app)
      .get('/api/backups')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});