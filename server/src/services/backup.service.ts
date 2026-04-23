import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const prisma = new PrismaClient();
const BACKUP_DIR = path.resolve(__dirname, '../../backups');
const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

async function dumpDatabase(): Promise<Buffer> {
  const [users, assets, assignments, maintenanceLogs, auditLogs, guestTokens, labelTemplates] = await Promise.all([
    prisma.user.findMany(),
    prisma.asset.findMany(),
    prisma.assignment.findMany(),
    prisma.maintenanceLog.findMany(),
    prisma.auditLog.findMany(),
    prisma.guestToken.findMany(),
    prisma.labelTemplate.findMany(),
  ]);

  const dump = JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { users, assets, assignments, maintenanceLogs, auditLogs, guestTokens, labelTemplates },
  }, null, 2);

  return Buffer.from(dump, 'utf-8');
}

function encrypt(buffer: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

function compressAndEncrypt(data: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    const encryptStream = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), crypto.randomBytes(IV_LENGTH));

    // We'll just encrypt the whole zip
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => {
      const zipBuffer = Buffer.concat(chunks);
      resolve(encrypt(zipBuffer));
    });
    archive.on('error', reject);

    archive.append(data, { name: 'db-dump.json' });
    archive.finalize();
  });
}

export async function createBackup(): Promise<{ filePath: string; encryptedSize: number }> {
  const dbDump = await dumpDatabase();
  const encrypted = await compressAndEncrypt(dbDump);

  const date = new Date().toISOString().split('T')[0];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.enc`;
  const filePath = path.join(BACKUP_DIR, filename);

  fs.writeFileSync(filePath, encrypted);

  return { filePath, encryptedSize: encrypted.length };
}

export async function uploadToS3(filePath: string): Promise<string> {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_S3_BUCKET) {
    throw new Error('S3 not configured');
  }

  const s3 = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const date = new Date().toISOString().split('T')[0];
  const key = `backups/${date}/${path.basename(filePath)}`;
  const body = fs.readFileSync(filePath);

  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: body,
  }));

  return `s3://${process.env.AWS_S3_BUCKET}/${key}`;
}

export async function uploadToDrive(filePath: string): Promise<string | null> {
  if (!process.env.GOOGLE_REFRESH_TOKEN) return null;
  // Google Drive upload — requires OAuth2 setup
  // For now, return null if not configured
  throw new Error('Google Drive upload not yet configured');
}

export async function runBackup(performedById?: string): Promise<any> {
  const log = await prisma.backupLog.create({
    data: { status: 'IN_PROGRESS', destination: 'local' },
  });

  try {
    // Create backup
    const { filePath, encryptedSize } = await createBackup();

    // Upload to S3 if configured
    let s3Path: string | null = null;
    try {
      s3Path = await uploadToS3(filePath);
    } catch {
      // S3 not configured or failed
    }

    // Update log
    await prisma.backupLog.update({
      where: { id: log.id },
      data: {
        status: 'COMPLETED',
        destination: s3Path ? 's3' : 'local',
        filePath,
        encryptedSize,
      },
    });

    // Cleanup old backups
    await cleanupOldBackups();

    return { id: log.id, status: 'COMPLETED', filePath, encryptedSize, s3Path };
  } catch (err: any) {
    await prisma.backupLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', destination: 'local' },
    });
    throw err;
  }
}

async function cleanupOldBackups() {
  // Delete local backups older than 7 days
  const localCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (fs.existsSync(BACKUP_DIR)) {
    const files = fs.readdirSync(BACKUP_DIR);
    for (const file of files) {
      const stat = fs.statSync(path.join(BACKUP_DIR, file));
      if (stat.mtime < localCutoff) {
        fs.unlinkSync(path.join(BACKUP_DIR, file));
      }
    }
  }

  // Delete cloud backup logs older than 30 days
  const cloudCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.backupLog.deleteMany({
    where: { createdAt: { lt: cloudCutoff }, destination: { in: ['s3', 'drive'] } },
  });
}

export async function listBackups(page = 1, limit = 20) {
  const [items, total] = await Promise.all([
    prisma.backupLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.backupLog.count(),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}