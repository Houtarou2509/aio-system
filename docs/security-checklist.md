# AIO-System Security Checklist

## Pre-Launch Manual Verification

### Secrets & Configuration
- [ ] JWT secret is at least 32 random bytes (check `.env` JWT_SECRET)
- [ ] BACKUP_ENCRYPTION_KEY is exactly 32 bytes hex string (check `.env`)
- [ ] All `.env` secrets are excluded from git (`.gitignore` includes `.env`)
- [ ] DATABASE_URL uses strong credentials (not default postgres/postgres)
- [ ] JWT_SECRET is not the same across dev/staging/prod environments

### HTTP Security Headers
- [ ] Helmet.js is active — verify `X-Frame-Options: DENY` in response headers
- [ ] Helmet.js is active — verify `X-Content-Type-Options: nosniff` in response headers
- [ ] Content-Security-Policy header is set in production mode
- [ ] CORS is restricted to frontend origin only (not wildcard `*`)
- [ ] No `Access-Control-Allow-Origin: *` in production responses

### Runtime Security
- [ ] PM2 does not expose the Node.js debugger port (`--inspect` not set)
- [ ] `/uploads` directory is not browsable (no directory listing enabled)
- [ ] Rate limiting is active on login endpoint (5 attempts per 15 min per IP)
- [ ] Rate limiting is active on guest token endpoint (10 per min per IP)
- [ ] File upload size limit is enforced (5MB max)
- [ ] Only image MIME types accepted for uploads (`image/*`)

### Data Encryption
- [ ] Database backups are AES-256-GCM encrypted before upload (verify in `backup.service.ts`)
- [ ] Guest token entropy is at least 20 bytes (verify `crypto.randomBytes(20)` in `guest.service.ts`)
- [ ] 2FA backup codes are stored as hashed values, not plaintext (check if `bcrypt.hash` is used)

### Authentication & Authorization
- [ ] All API routes except `/api/auth/login`, `/api/auth/refresh`, `/api/health`, `/api/guest/a/:token` require authentication
- [ ] Role-based access control is enforced on all mutation endpoints
- [ ] Guest role cannot access: asset creation, checkout, return, audit cleanup, backup management
- [ ] Staff role cannot access: asset deletion, audit cleanup/revert, backup management, label template deletion
- [ ] JWT tokens have appropriate expiration (access: 15min, refresh: 7 days)
- [ ] Refresh tokens are single-use and rotated on each refresh

### Input Validation
- [ ] All user input is validated with Zod schemas before processing
- [ ] SQL injection is prevented by Prisma ORM parameterized queries
- [ ] XSS is mitigated by React's built-in escaping + Helmet CSP headers
- [ ] File uploads validate MIME type (not just extension)
- [ ] Request body size limit is enforced (10MB JSON limit)

### Data Exposure
- [ ] `GET /api/auth/me` does not return `passwordHash`, `twoFactorSecret`, or `backupCodes`
- [ ] `GET /api/assets` (Guest role) does not return `purchasePrice`, `serialNumber`, `currentValue`, `depreciationRate`, `salvageValue`
- [ ] `GET /api/guest/a/:token` does not return sensitive financial fields
- [ ] Error responses in production do not include stack traces or file paths
- [ ] Prisma errors are sanitized before sending to client (generic "Database error" message)

### OWASP ZAP Scan
- [ ] Install ZAP: `docker pull zaproxy/zap-stable`
- [ ] Run baseline scan: `docker run -t zaproxy/zap-stable zap-baseline.py -t http://localhost:3000 -r zap-report.html`
- [ ] Review `zap-report.html` — fix all HIGH and MEDIUM findings
- [ ] Known acceptable findings to ignore: informational alerts about missing HSTS on localhost

### Infrastructure
- [ ] PostgreSQL is not exposed on public network (only localhost or VPC)
- [ ] HTTPS is enforced in production (reverse proxy or app-level)
- [ ] Logs do not contain sensitive data (passwords, tokens, PII)
- [ ] Dependency audit: `npm audit` shows no critical vulnerabilities