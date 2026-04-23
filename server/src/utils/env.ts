const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'REFRESH_TOKEN_SECRET'];

export function validateEnv(): void {
  const missing = REQUIRED_ENV.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn('[WARN] JWT_SECRET should be at least 32 characters for production');
  }

  if (process.env.BACKUP_ENCRYPTION_KEY && process.env.BACKUP_ENCRYPTION_KEY.length < 64) {
    console.warn('[WARN] BACKUP_ENCRYPTION_KEY should be 64 hex chars (32 bytes) for AES-256');
  }
}