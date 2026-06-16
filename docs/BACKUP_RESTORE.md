# AIO System Backup & Restore Guide

This document describes how AIO System backups work and how to restore from them safely.

---

## What is included in a backup

Every backup is an encrypted `.enc` file created by `server/src/services/backup.service.ts`. The archive contains:

- **`db-dump.json`** — Full dump of all Prisma model tables (via `Prisma.dmmf.datamodel`).
- **`backup-manifest.json`** — Metadata: version, createdAt, contents list, encryption details.
- **`uploads/`** — A copy of the local `server/uploads` directory (uploaded files, logos, profile photos, agreement signatures, etc.).

Backups also produce a `BackupLog` row in the database with status, destination, file path, and encrypted size.

## What is NOT included

- Source code (`server/src`, `client/src`, scripts).
- `node_modules`.
- `.env` or other secrets/config files.
- Local log files outside `uploads/`.
- Server/PM2/OS configuration.

## Where backups are stored

### Local

Backups are written to `server/backups/` by default.

Old local backups are deleted automatically after 7 days by `cleanupOldBackups()`.

### Google Drive (optional)

If these environment variables are configured, daily backups are uploaded to Google Drive:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_DAILY_FOLDER_ID`
- `GOOGLE_DRIVE_MONTHLY_FOLDER_ID` (used only on the 1st of the month)

`GOOGLE_DRIVE_RESTORE_TEST_FOLDER_ID` is used by `npm run backup:test-upload` to verify that Drive upload credentials are working.

### S3 (optional)

If configured, backups can also be uploaded to S3:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_BUCKET`
- `AWS_REGION`

## Required environment variables

### For backup creation and restore

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `BACKUP_ENCRYPTION_KEY` | 64-character hex string used for AES-256-GCM encryption/decryption |

### For Google Drive uploads

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` | OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth2 client secret |
| `GOOGLE_REFRESH_TOKEN` | Long-lived refresh token |
| `GOOGLE_DRIVE_DAILY_FOLDER_ID` | Drive folder for daily backups |
| `GOOGLE_DRIVE_MONTHLY_FOLDER_ID` | Drive folder for monthly archives |
| `GOOGLE_DRIVE_RESTORE_TEST_FOLDER_ID` | Drive folder for upload credential test |

### For S3 uploads

| Variable | Purpose |
|----------|---------|
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `AWS_S3_BUCKET` | Target bucket |
| `AWS_REGION` | Bucket region (default `us-east-1`) |

## How to run a manual backup

```bash
cd server
npm run build
node -e "require('./dist/services/backup.service.js').runBackup().then(console.log)"
```

Or via the existing API endpoint (admin required):

```bash
curl -X POST http://localhost:3000/api/backups/now \
  -H "Authorization: Bearer <accessToken>"
```

## How to restore from a local .enc file

### 1. Preview with dry-run

```bash
cd server
npm run backup:restore -- backups/backup-YYYY-MM-DDThh-mm-ss-sssZ.enc --dry-run
```

Dry-run will:
- Decrypt the backup
- Print manifest info
- Count rows per model found in `db-dump.json`
- Count upload files in the archive
- **Make no changes** to the database or filesystem

### 2. Perform actual restore

**WARNING:** This is destructive. The script clears all restore-managed tables and re-creates them from the backup.

Run it during a maintenance window with the app stopped if possible.

```bash
cd server
npm run backup:restore -- backups/backup-YYYY-MM-DDThh-mm-ss-sssZ.enc --yes
```

Before the destructive step, the script attempts to create a fresh safety backup using the existing backup service.

### Upload merge behavior

By default, existing files in `server/uploads` are **kept** and not overwritten. To overwrite existing uploads:

```bash
npm run backup:restore -- backups/backup-YYYY-MM-DDThh-mm-ss-sssZ.enc --yes --overwrite-uploads
```

## How to download a .enc file from Google Drive and restore it

1. Open Google Drive and locate the backup in the daily/monthly folder.
2. Download the `.enc` file to `server/backups/`.
3. Run dry-run:
   ```bash
   cd server
   npm run backup:restore -- backups/your-downloaded-file.enc --dry-run
   ```
4. If the preview looks correct, run the actual restore:
   ```bash
   npm run backup:restore -- backups/your-downloaded-file.enc --yes
   ```

## How to verify after restore

1. Check the restore summary printed by the script.
2. Restart the application / PM2 process:
   ```bash
   pm2 restart ecosystem.config.js --env production
   ```
3. Check health:
   ```bash
   curl -s http://localhost:3000/api/health
   ```
4. Spot-check key entities in the UI or API:
   - Users
   - Assets
   - Personnel
   - Agreement documents
   - Issue reports
5. Verify uploads are accessible (e.g., profile photos, agreement signatures).

## Recommended restore drill schedule

- **Monthly**: run `--dry-run` against the latest backup to confirm it decrypts and parses correctly.
- **Quarterly**: perform a full restore on a non-production instance or a fresh local database.
- **After any schema change**: verify the backup/restore pair still works end-to-end.

## Safety notes

- Never expose `BACKUP_ENCRYPTION_KEY` or Google tokens in logs, screenshots, or committed files.
- Store `.env` securely; the restore script refuses to run without a valid `BACKUP_ENCRYPTION_KEY`.
- The restore script only touches `server/uploads` and the PostgreSQL database. It will not delete `.env`, source code, `node_modules`, or existing files in `server/backups`.
- For disaster recovery, prefer restoring into a clean database. Restoring into a live/production database while active users are writing data can cause inconsistencies.
- Always run a dry-run before `--yes`.
- If something goes wrong, the script attempts to create a safety backup before making destructive changes.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `BACKUP_ENCRYPTION_KEY must be exactly 64 hex characters` | Key missing or wrong format | Check `server/.env` |
| `Decryption failed` | Wrong key or corrupted file | Verify the key matches the backup file |
| `db-dump.json not found` | Not a valid AIO backup archive | Re-create or re-download the backup |
| Restore fails on a model | Schema mismatch between backup and current Prisma client | Run `npx prisma generate` and `npm run build` first; ensure migrations are applied |
| Missing uploads after restore | Uploads were not included in the archive or skipped due to merge rules | Use `--overwrite-uploads` or check archive contents with `--dry-run` |
