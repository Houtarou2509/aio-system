import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { google } from 'googleapis';


const BACKUP_DIR = path.resolve(__dirname, '../../backups');
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function serializeJson(value: unknown): string {
  return JSON.stringify(value, (_key, currentValue) => {
    if (typeof currentValue === 'bigint') return currentValue.toString();
    return currentValue;
  }, 2);
}

function prismaDelegateName(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

function backupLocalDay(): number {
  const timeZone = process.env.BACKUP_TIME_ZONE || 'Asia/Manila';
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone,
    day: 'numeric',
  }).format(new Date());
  return Number(day);
}

async function dumpDatabase(): Promise<Buffer> {
  const data: Record<string, unknown> = {};

  for (const model of Prisma.dmmf.datamodel.models) {
    const delegateName = prismaDelegateName(model.name);
    const delegate = (prisma as unknown as Record<string, { findMany?: () => Promise<unknown[]> }>)[delegateName];
    if (delegate?.findMany) {
      data[delegateName] = await delegate.findMany();
    }
  }

  const dump = serializeJson({
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  });

  return Buffer.from(dump, 'utf-8');
}

function assertEncryptionKey() {
  if (!/^[a-f0-9]{64}$/i.test(ENCRYPTION_KEY)) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be a 64-character hex string');
  }
}

function encrypt(buffer: Buffer): Buffer {
  assertEncryptionKey();
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

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => {
      const zipBuffer = Buffer.concat(chunks);
      resolve(encrypt(zipBuffer));
    });
    archive.on('error', reject);

    archive.append(data, { name: 'db-dump.json' });
    archive.append(Buffer.from(serializeJson({
      version: 1,
      createdAt: new Date().toISOString(),
      contents: {
        database: 'db-dump.json',
        uploads: fs.existsSync(UPLOADS_DIR) ? 'uploads/' : null,
      },
      encryption: {
        algorithm: ALGORITHM,
        layout: 'iv(16 bytes) + authTag(16 bytes) + encryptedZip',
      },
    })), { name: 'backup-manifest.json' });

    if (fs.existsSync(UPLOADS_DIR)) {
      archive.directory(UPLOADS_DIR, 'uploads');
    }

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
  const dailyFolderId = process.env.GOOGLE_DRIVE_DAILY_FOLDER_ID || process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN || !dailyFolderId) {
    return null;
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  const drive = google.drive({ version: 'v3', auth });
  const filename = path.basename(filePath);
  const created = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [dailyFolderId],
      mimeType: 'application/octet-stream',
    },
    media: {
      mimeType: 'application/octet-stream',
      body: fs.createReadStream(filePath),
    },
    fields: 'id,name',
    supportsAllDrives: true,
  });

  const monthlyFolderId = process.env.GOOGLE_DRIVE_MONTHLY_FOLDER_ID;
  if (monthlyFolderId && backupLocalDay() === 1) {
    await drive.files.create({
      requestBody: {
        name: filename,
        parents: [monthlyFolderId],
        mimeType: 'application/octet-stream',
      },
      media: {
        mimeType: 'application/octet-stream',
        body: fs.createReadStream(filePath),
      },
      fields: 'id',
      supportsAllDrives: true,
    });
  }

  return `gdrive://${created.data.id}/${created.data.name}`;
}

export async function runBackup(performedById?: string): Promise<any> {
  let log;

  try {
    // Create backup before writing a log row, so the dump does not capture an IN_PROGRESS BackupLog.
    const { filePath, encryptedSize } = await createBackup();

    log = await prisma.backupLog.create({
      data: { status: 'IN_PROGRESS', destination: 'local' },
    });

    // Upload to Google Drive if configured
    let drivePath: string | null = null;
    try {
      drivePath = await uploadToDrive(filePath);
    } catch (err) {
      console.error('[Backup] Google Drive upload failed:', err);
    }

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
        destination: drivePath ? 'drive' : s3Path ? 's3' : 'local',
        filePath,
        encryptedSize,
      },
    });

    // Cleanup old backups
    await cleanupOldBackups();

    return { id: log.id, status: 'COMPLETED', filePath, encryptedSize, drivePath, s3Path };
  } catch (err: any) {
    if (log?.id) {
      await prisma.backupLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', destination: 'local' },
      });
    }
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

export async function getBackupById(id: string) {
  return prisma.backupLog.findUnique({ where: { id } });
}

export async function getBackupStats() {
  const [totalBackups, lastBackup, aggregate] = await Promise.all([
    prisma.backupLog.count({ where: { status: 'COMPLETED' } }),
    prisma.backupLog.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, encryptedSize: true },
    }),
    prisma.backupLog.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { encryptedSize: true },
    }),
  ]);

  return {
    lastBackup: lastBackup?.createdAt ?? null,
    totalBackups,
    totalSize: aggregate._sum.encryptedSize ?? 0,
  };
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
