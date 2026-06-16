import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import os from 'os';

const prisma = new PrismaClient();

// The restore script uses CommonJS; require it dynamically after build.
const restoreScriptPath = path.resolve(__dirname, '../../scripts/restore-backup.js');
const restoreModule = require(restoreScriptPath);

const { resolveUploadDestination, normalizeRow } = restoreModule;

if (!resolveUploadDestination || !normalizeRow) {
  throw new Error('restore-backup.js must export resolveUploadDestination and normalizeRow for testing');
}

describe('restore-backup safety', () => {
  const tempUploads = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-restore-test-uploads-'));

  beforeAll(async () => {
    process.env.UPLOADS_DIR_OVERRIDE = tempUploads;
  });

  afterAll(async () => {
    delete process.env.UPLOADS_DIR_OVERRIDE;
    fs.rmSync(tempUploads, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it('rejects upload paths that escape uploads directory', () => {
    const badPaths = [
      'uploads/../../server/.env',
      'uploads/../.env',
      'uploads/foo/../../../etc/passwd',
      'uploads/..',
      'uploads//../.env',
      'uploads/./../.env',
    ];

    for (const p of badPaths) {
      const result = resolveUploadDestination(p);
      expect(result.ok, `expected ${p} to be rejected`).toBe(false);
      expect(result.reason).toBeTruthy();
    }
  });

  it('accepts safe upload paths', () => {
    const goodPaths = [
      'uploads/profiles/abc.jpg',
      'uploads/logos/logo.png',
      'uploads/agreements/signed.pdf',
      'uploads/deep/nested/file.txt',
    ];

    for (const p of goodPaths) {
      const result = resolveUploadDestination(p);
      expect(result.ok, `expected ${p} to be accepted`).toBe(true);
      expect(result.destPath).toContain(path.sep + p.replace('uploads/', '').replace(/\//g, path.sep));
    }
  });

  it('does not convert ISO strings inside Json fields', () => {
    const dateTimeFields = new Set(['createdAt', 'updatedAt']);
    const row = {
      id: '1',
      createdAt: '2024-01-15T08:30:00.000Z',
      metadata: { note: 'date 2024-01-15T08:30:00.000Z' },
      contentJson: { ops: [{ date: '2024-01-15T08:30:00.000Z' }] },
    };

    const normalized = normalizeRow(row, dateTimeFields);
    expect(normalized.createdAt).toBeInstanceOf(Date);
    expect(normalized.metadata.note).toBe('date 2024-01-15T08:30:00.000Z');
    expect(normalized.contentJson.ops[0].date).toBe('2024-01-15T08:30:00.000Z');
  });

  it('converts bigint strings serialized with n suffix', () => {
    const dateTimeFields = new Set();
    const row = {
      id: '1',
      value: '9007199254740993n',
      negative: '-42n',
    };

    const normalized = normalizeRow(row, dateTimeFields);
    expect(normalized.value).toBe(9007199254740993n);
    expect(normalized.negative).toBe(-42n);
  });
});
