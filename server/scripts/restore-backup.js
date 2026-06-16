#!/usr/bin/env node

/**
 * Restore tooling for the AIO System encrypted backup format.
 *
 * Backup format (created by server/src/services/backup.service.ts):
 *   iv (16 bytes) + auth tag (16 bytes) + aes-256-gcm encrypted zip payload
 *
 * The zip contains:
 *   - db-dump.json
 *   - backup-manifest.json
 *   - uploads/ (optional)
 *
 * Usage:
 *   node scripts/restore-backup.js <path-to-backup.enc> [--dry-run]
 *   node scripts/restore-backup.js <path-to-backup.enc> --yes [--overwrite-uploads]
 */

require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);

const yauzl = require('yauzl');
const { PrismaClient, Prisma } = require('@prisma/client');

const ROOT_DIR = path.resolve(__dirname, '..');
const UPLOADS_DIR = process.env.UPLOADS_DIR_OVERRIDE
  ? path.resolve(process.env.UPLOADS_DIR_OVERRIDE)
  : path.resolve(ROOT_DIR, 'uploads');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH_HEX = 64;

const DRY_RUN = process.argv.includes('--dry-run');
const CONFIRMED = process.argv.includes('--yes');
const OVERWRITE_UPLOADS = process.argv.includes('--overwrite-uploads');
const BACKUP_FILE_ARG = process.argv.find((arg, idx) => idx === 2 && !arg.startsWith('--'));

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function log(...args) {
  // eslint-disable-next-line no-console
  console.log(...args);
}

function warn(...args) {
  // eslint-disable-next-line no-console
  console.warn(...args);
}

function errorAndExit(message) {
  // eslint-disable-next-line no-console
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

function validateEncryptionKey() {
  const key = process.env.BACKUP_ENCRYPTION_KEY;
  if (!key) {
    errorAndExit(
      'BACKUP_ENCRYPTION_KEY is not set. Add it to server/.env as a 64-character hex string.'
    );
  }
  if (!/^[a-f0-9]{64}$/i.test(key)) {
    errorAndExit(
      'BACKUP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (256-bit key).'
    );
  }
  return Buffer.from(key, 'hex');
}

function decryptBackup(encPath, key) {
  const encrypted = fs.readFileSync(encPath);
  if (encrypted.length < IV_LENGTH + TAG_LENGTH) {
    errorAndExit('Backup file is too small to be a valid encrypted backup.');
  }

  const iv = encrypted.subarray(0, IV_LENGTH);
  const tag = encrypted.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = encrypted.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted;
  } catch (err) {
    errorAndExit(`Decryption failed: ${err.message}. Wrong BACKUP_ENCRYPTION_KEY or corrupted file.`);
  }
}

function openZip(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) reject(err);
      else resolve(zipfile);
    });
  });
}

function readEntry(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, readStream) => {
      if (err) return reject(err);
      const chunks = [];
      readStream.on('data', (chunk) => chunks.push(chunk));
      readStream.on('end', () => resolve(Buffer.concat(chunks)));
      readStream.on('error', reject);
    });
  });
}

async function readEntryByName(zipBuffer, name) {
  const zipfile = await openZip(zipBuffer);
  return new Promise((resolve, reject) => {
    zipfile.on('entry', (entry) => {
      if (entry.fileName === name) {
        readEntry(zipfile, entry).then((buf) => {
          zipfile.close();
          resolve(JSON.parse(buf.toString('utf8')));
        }).catch(reject);
      } else {
        zipfile.readEntry();
      }
    });
    zipfile.on('end', () => {
      zipfile.close();
      reject(new Error(`${name} not found in backup zip`));
    });
    zipfile.on('error', reject);
    zipfile.readEntry();
  });
}

async function listUploadEntries(zipBuffer) {
  const zipfile = await openZip(zipBuffer);
  const entries = [];
  return new Promise((resolve, reject) => {
    zipfile.on('entry', (entry) => {
      if (entry.fileName.startsWith('uploads/') && !entry.fileName.endsWith('/')) {
        entries.push(entry.fileName);
      }
      zipfile.readEntry();
    });
    zipfile.on('end', () => resolve(entries));
    zipfile.on('error', reject);
    zipfile.readEntry();
  });
}

// ------------------------------------------------------------------
// Upload path safety
// ------------------------------------------------------------------

function resolveUploadDestination(entryName) {
  if (!entryName.startsWith('uploads/')) {
    return { ok: false, reason: 'not in uploads directory', destPath: null };
  }

  const relative = entryName.slice('uploads/'.length);

  if (!relative || relative === '.' || relative === '..' || relative.endsWith('/')) {
    return { ok: false, reason: 'empty or invalid upload path', destPath: null };
  }

  // Reject traversal segments (e.g., ../../.env) or absolute-looking names.
  const parts = relative.split('/');
  if (parts.some((p) => p === '..' || p === '')) {
    return { ok: false, reason: 'path contains traversal or empty segments', destPath: null };
  }
  if (path.isAbsolute(relative)) {
    return { ok: false, reason: 'absolute path not allowed', destPath: null };
  }

  const destPath = path.resolve(UPLOADS_DIR, relative);
  const relativeToUploads = path.relative(UPLOADS_DIR, destPath);

  if (relativeToUploads.startsWith('..') || path.isAbsolute(relativeToUploads)) {
    return { ok: false, reason: 'path escapes uploads directory', destPath: null };
  }

  return { ok: true, destPath };
}

// ------------------------------------------------------------------
// Upload restore
// ------------------------------------------------------------------

async function restoreUploads(zipBuffer, options = {}) {
  const { dryRun = false, overwrite = false, stagingDir = null } = options;

  const zipfile = await openZip(zipBuffer);

  let created = 0;
  let existing = 0;
  let skipped = 0;
  let errors = 0;

  return new Promise((resolve, reject) => {
    zipfile.on('entry', async (entry) => {
      if (entry.fileName.startsWith('uploads/') && !entry.fileName.endsWith('/')) {
        const resolved = resolveUploadDestination(entry.fileName);
        if (!resolved.ok) {
          warn(`  REJECTED unsafe upload path ${entry.fileName}: ${resolved.reason}`);
          errors += 1;
          zipfile.readEntry();
          return;
        }

        let destPath = resolved.destPath;
        if (stagingDir) {
          const relative = path.relative(UPLOADS_DIR, destPath);
          destPath = path.resolve(stagingDir, relative);
        }

        if (!dryRun) {
          const finalDestPath = stagingDir ? path.resolve(UPLOADS_DIR, path.relative(stagingDir, destPath)) : destPath;

          if (fs.existsSync(finalDestPath) && !overwrite) {
            existing += 1;
            zipfile.readEntry();
            return;
          }

          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          try {
            const readStream = await new Promise((res, rej) => {
              zipfile.openReadStream(entry, (err, rs) => (err ? rej(err) : res(rs)));
            });
            await pipeline(readStream, fs.createWriteStream(destPath));
            created += 1;
          } catch (err) {
            warn(`  Failed to extract ${entry.fileName}: ${err.message}`);
            errors += 1;
          }
        } else {
          const checkPath = stagingDir ? path.resolve(UPLOADS_DIR, path.relative(stagingDir, destPath)) : destPath;
          if (fs.existsSync(checkPath)) {
            existing += 1;
          } else {
            created += 1;
          }
        }
      }
      zipfile.readEntry();
    });

    zipfile.on('end', () => resolve({ created, existing, skipped, errors }));
    zipfile.on('error', reject);
    zipfile.readEntry();
  });
}

function mergeStagedUploads(stagingDir, options = {}) {
  const { overwrite = false } = options;

  let moved = 0;
  let existing = 0;
  let errors = 0;

  function walk(dir, baseRel = '') {
    for (const name of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, name);
      const relPath = baseRel ? `${baseRel}/${name}` : name;
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath, relPath);
      } else {
        const finalPath = path.resolve(UPLOADS_DIR, relPath);
        fs.mkdirSync(path.dirname(finalPath), { recursive: true });

        if (fs.existsSync(finalPath) && !overwrite) {
          existing += 1;
        } else {
          try {
            fs.renameSync(fullPath, finalPath);
            moved += 1;
          } catch (err) {
            warn(`  Failed to move staged upload ${relPath}: ${err.message}`);
            errors += 1;
          }
        }
      }
    }
  }

  if (fs.existsSync(stagingDir)) {
    walk(stagingDir);
  }

  return { moved, existing, errors };
}

function cleanupStagingDir(stagingDir) {
  if (stagingDir && fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------
// Database restore
// ------------------------------------------------------------------

function getModelOrder() {
  // Order respects foreign keys: parents before children.
  return [
    'user',
    'supplier',
    'lookupValue',
    'institutionLookup',
    'projectLookup',
    'designationLookup',
    'asset',
    'personnel',
    'profileHistory',
    'agreementTemplate',
    'agreementTemplateVersion',
    'agreementDocument',
    'assignment',
    'maintenanceLog',
    'maintenanceSchedule',
    'assetConditionLog',
    'guestToken',
    'auditLog',
    'labelTemplate',
    'backupLog',
    'purchaseRequest',
    'issueReport',
    'notification',
  ];
}

function getDateTimeFieldsByModel() {
  const map = new Map();
  for (const model of Prisma.dmmf.datamodel.models) {
    const fields = new Set();
    for (const field of model.fields) {
      if (field.type === 'DateTime') {
        fields.add(field.name);
      }
    }
    map.set(model.name, fields);
  }
  return map;
}

function modelHasIdentityColumns(delegateName) {
  // Models with auto-increment integer IDs need IDENTITY columns reset on PostgreSQL.
  return ['lookupValue', 'institutionLookup', 'projectLookup', 'designationLookup', 'profileHistory'].includes(delegateName);
}

async function clearTables(prisma, modelOrder) {
  // Delete in reverse order so children go before parents.
  const reversed = [...modelOrder].reverse();
  for (const delegateName of reversed) {
    const delegate = prisma[delegateName];
    if (!delegate || typeof delegate.deleteMany !== 'function') continue;
    await delegate.deleteMany({});
  }
}

async function resetIdentityColumns(prisma, modelOrder) {
  // Reset PostgreSQL sequences for auto-increment IDs.
  const mapping = {
    lookupValue: 'lookup_values',
    institutionLookup: 'institution_lookup',
    projectLookup: 'project_lookup',
    designationLookup: 'designation_lookup',
    profileHistory: 'profile_history',
  };

  for (const delegateName of modelOrder) {
    const tableName = mapping[delegateName];
    if (!tableName) continue;
    try {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${tableName}"', 'id'), 1, false);`
      );
    } catch (err) {
      // Sequence may not exist for tables without serial PK; safe to ignore.
      if (!err.message?.includes('is not a sequence')) {
        warn(`  Could not reset identity for ${tableName}: ${err.message}`);
      }
    }
  }
}

async function restoreDatabase(prisma, dbDump, options = {}) {
  const { dryRun = false } = options;
  const counts = {};

  const modelOrder = getModelOrder();
  const dateTimeFieldsByModel = getDateTimeFieldsByModel();

  // Report counts found in dump
  for (const delegateName of modelOrder) {
    const rows = dbDump.data?.[delegateName] || [];
    counts[delegateName] = { found: rows.length, restored: 0, skipped: 0 };
  }

  if (dryRun) {
    return counts;
  }

  await prisma.$transaction(async (tx) => {
    await clearTables(tx, modelOrder);
    await resetIdentityColumns(tx, modelOrder);

    for (const delegateName of modelOrder) {
      const rows = dbDump.data?.[delegateName] || [];
      if (rows.length === 0) continue;

      const delegate = tx[delegateName];
      if (!delegate || typeof delegate.createMany !== 'function') {
        counts[delegateName].skipped = rows.length;
        continue;
      }

      const modelName = delegateName.charAt(0).toUpperCase() + delegateName.slice(1);
      const dateTimeFields = dateTimeFieldsByModel.get(modelName) || new Set();
      const prepared = rows.map((row) => normalizeRow(row, dateTimeFields));

      try {
        const result = await delegate.createMany({ data: prepared });
        counts[delegateName].restored = result.count;
      } catch (err) {
        warn(`\n  Failed to restore ${delegateName}: ${err.message}`);
        throw err;
      }
    }
  });

  return counts;
}

function normalizeRow(row, dateTimeFields) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      out[key] = value;
    } else if (dateTimeFields.has(key) && typeof value === 'string') {
      out[key] = new Date(value);
    } else if (typeof value === 'string' && /^-?\d+n$/.test(value)) {
      // Serialized bigint from backup.service.ts
      out[key] = BigInt(value.slice(0, -1));
    } else {
      out[key] = value;
    }
  }
  return out;
}

// ------------------------------------------------------------------
// Safety backup
// ------------------------------------------------------------------

async function createSafetyBackup(prisma) {
  // Lazy-load backup.service.ts so dotenv is already loaded and prisma is connected.
  const backupServicePath = path.join(ROOT_DIR, 'dist', 'services', 'backup.service.js');
  if (!fs.existsSync(backupServicePath)) {
    log('  Warning: compiled backup service not found; skipping safety backup.');
    return null;
  }

  const { runBackup } = require(backupServicePath);
  try {
    const result = await runBackup();
    return result.filePath;
  } catch (err) {
    warn(`  Safety backup failed: ${err.message}`);
    return null;
  }
}

module.exports = {
  resolveUploadDestination,
  normalizeRow,
};

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main() {
  log('\n============================================================');
  log(' AIO System Backup Restore Tool');
  log('============================================================\n');

  if (!BACKUP_FILE_ARG) {
    errorAndExit(
      'Usage: node scripts/restore-backup.js <path-to-backup.enc> [--dry-run] [--yes] [--overwrite-uploads]'
    );
  }

  const backupPath = path.resolve(BACKUP_FILE_ARG);
  if (!fs.existsSync(backupPath)) {
    errorAndExit(`Backup file not found: ${backupPath}`);
  }

  if (!DRY_RUN && !CONFIRMED) {
    log('WARNING: This will DESTRUCTIVELY replace database tables and may overwrite uploads.');
    log('Run with --dry-run to preview, or --yes to proceed.\n');
    process.exit(1);
  }

  const key = validateEncryptionKey();
  const prisma = new PrismaClient();

  let stagingDir = null;

  try {
    log(`Backup file: ${backupPath}`);
    log(`Mode:        ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE RESTORE'}`);
    log(`Uploads:     ${OVERWRITE_UPLOADS ? 'overwrite existing' : 'merge (skip existing)'}`);

    log('\n[1/6] Decrypting backup...');
    const zipBuffer = decryptBackup(backupPath, key);
    log(`      Decrypted zip size: ${zipBuffer.length} bytes`);

    log('\n[2/6] Reading manifest and database dump...');
    const manifest = await readEntryByName(zipBuffer, 'backup-manifest.json');
    const dbDump = await readEntryByName(zipBuffer, 'db-dump.json');
    log(`      Manifest version: ${manifest.version || 'unknown'}`);
    log(`      Dump exported at: ${dbDump.exportedAt || 'unknown'}`);

    log('\n[3/6] Database contents summary:');
    const modelOrder = getModelOrder();
    let totalRows = 0;
    for (const delegateName of modelOrder) {
      const count = dbDump.data?.[delegateName]?.length || 0;
      totalRows += count;
      log(`      ${delegateName.padEnd(24)} ${count.toString().padStart(6)} rows`);
    }
    log(`      ${'-'.repeat(32)}`);
    log(`      ${'total'.padEnd(24)} ${totalRows.toString().padStart(6)} rows`);

    log('\n[4/6] Upload contents summary:');
    const uploadEntries = await listUploadEntries(zipBuffer);
    log(`      Upload files in backup: ${uploadEntries.length}`);

    if (!DRY_RUN) {
      log('\n[5/6a] Creating safety backup before destructive restore...');
      const safetyPath = await createSafetyBackup(prisma);
      if (safetyPath) {
        log(`      Safety backup created: ${safetyPath}`);
      }

      log('\n[5/6b] Restoring database (uploads staged but not moved yet)...');
      stagingDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'aio-restore-uploads-'));
      const stagedCounts = await restoreUploads(zipBuffer, {
        dryRun: false,
        overwrite: OVERWRITE_UPLOADS,
        stagingDir,
      });
      log(`      Staged uploads: ${stagedCounts.created}`);
      log(`      Existing uploads: ${stagedCounts.existing}`);
      log(`      Upload errors:    ${stagedCounts.errors}`);

      const dbCounts = await restoreDatabase(prisma, dbDump, { dryRun: false });
      log('\n[5/6c] Database restore counts:');
      for (const delegateName of modelOrder) {
        const info = dbCounts[delegateName] || { found: 0, restored: 0, skipped: 0 };
        log(`      ${delegateName.padEnd(24)} restored   ${info.restored.toString().padStart(6)}`);
      }

      log('\n[6/6] Moving staged uploads into place...');
      const mergeCounts = mergeStagedUploads(stagingDir, { overwrite: OVERWRITE_UPLOADS });
      log(`      Moved new uploads:   ${mergeCounts.moved}`);
      log(`      Existing uploads:    ${mergeCounts.existing}`);
      log(`      Upload merge errors: ${mergeCounts.errors}`);

      if (mergeCounts.errors > 0) {
        warn('\n⚠️  Upload merge completed with errors. Database was already restored.');
        warn('   Staging directory was NOT removed automatically so you can inspect it:');
        warn(`   ${stagingDir}`);
        stagingDir = null; // prevent cleanup
        process.exitCode = 1;
      } else {
        log('\n✅ Restore complete.');
        log('   Restart the application (or PM2 process) to ensure caches/connections refresh.');
      }
    } else {
      const uploadCounts = await restoreUploads(zipBuffer, {
        dryRun: true,
        overwrite: OVERWRITE_UPLOADS,
      });
      log(`      New uploads:      ${uploadCounts.created}`);
      log(`      Existing uploads: ${uploadCounts.existing}`);
      log(`      Unsafe / errors:  ${uploadCounts.errors}`);

      const dbCounts = await restoreDatabase(prisma, dbDump, { dryRun: true });
      log('\n[5/6] Database restore counts (dry-run):');
      for (const delegateName of modelOrder) {
        const info = dbCounts[delegateName] || { found: 0, restored: 0, skipped: 0 };
        log(`      ${delegateName.padEnd(24)} found      ${info.found.toString().padStart(6)}`);
      }

      log('\n✅ Dry run complete. No changes were made.');
    }
  } finally {
    await prisma.$disconnect();
    cleanupStagingDir(stagingDir);
  }
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('\nUnexpected error:', err);
    process.exit(1);
  });
}
