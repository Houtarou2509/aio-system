# AIO-System — Office Asset Inventory

A full-stack office asset management system built with React, Express, Prisma, and TypeScript.

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Database setup (dev uses SQLite)
cd server
npx prisma migrate dev --name init
npx ts-node-dev --transpile-only prisma/seed.ts
cd ..

# Start development
npm run dev
```

Server runs on `http://localhost:3001`, client on `http://localhost:5173`.

## Production Deployment

### Prerequisites
- Node.js 22+
- PostgreSQL 15+
- PM2 (`npm install -g pm2`)

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | 32+ character random string |
| `REFRESH_TOKEN_SECRET` | ✅ | Different 32+ character random string |
| `BACKUP_ENCRYPTION_KEY` | ✅ | 64 hex chars (32 bytes) for AES-256-GCM |
| `PORT` | ❌ | Server port (default: 3001) |
| `CLIENT_URL` | ❌ | Frontend origin for CORS |
| `TWO_FA_ISSUER` | ❌ | TOTP issuer name |
| `AWS_ACCESS_KEY_ID` | ❌ | S3 backup upload |
| `AWS_SECRET_ACCESS_KEY` | ❌ | S3 backup upload |
| `AWS_REGION` | ❌ | S3 region |
| `AWS_S3_BUCKET` | ❌ | S3 bucket name |
| `GOOGLE_CLIENT_ID` | ❌ | Google Drive backup |
| `GOOGLE_CLIENT_SECRET` | ❌ | Google Drive backup |
| `GOOGLE_REFRESH_TOKEN` | ❌ | Google Drive backup |
| `AI_API_URL` | ❌ | OpenAI-compatible API URL |
| `AI_API_KEY` | ❌ | API key for AI suggestions |
| `AI_MODEL` | ❌ | Model name (default: gpt-4o-mini) |

### Deploy Steps

```bash
# 1. Set production env vars
export NODE_ENV=production
export DATABASE_URL=postgresql://user:pass@host:5432/aio_system
export JWT_SECRET=$(openssl rand -hex 32)
export REFRESH_TOKEN_SECRET=$(openssl rand -hex 32)
export BACKUP_ENCRYPTION_KEY=$(openssl rand -hex 32)

# 2. Install dependencies
npm install

# 3. Run database migrations
cd server && npx prisma migrate deploy && cd ..

# 4. Build client + server
npm run build

# 5. Start with PM2
pm2 start ecosystem.config.js --env production

# 6. Save PM2 process list
pm2 save
pm2 startup
```

### Generate Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Architecture

```
AIO-system/
├── server/           Express API + Prisma
│   ├── src/
│   │   ├── routes/   API routes with Zod validation
│   │   ├── services/ Business logic
│   │   ├── middleware/ Auth, validation, audit
│   │   ├── jobs/     Cron jobs
│   │   └── utils/    Helpers
│   ├── prisma/       Schema + migrations + seed
│   └── uploads/      Asset images
├── client/           React + Vite + TailwindCSS + shadcn/ui
│   └── src/
│       ├── pages/    Route pages
│       ├── components/ UI components
│       ├── context/  Auth context
│       ├── hooks/    Custom hooks
│       └── lib/      API clients + utils
├── shared/           Shared TypeScript types
├── ecosystem.config.js  PM2 config
└── package.json      Monorepo root
```

## Features

- **Auth**: JWT + refresh tokens, TOTP 2FA, role-based access (Admin/Staff-Admin/Staff/Guest)
- **Assets**: Full CRUD, checkout/return, image upload, search/filter/sort
- **Depreciation**: Straight-line with salvage floor, daily cron job
- **Maintenance**: Log entries, frequent repair flag (>3/year)
- **Audit Trail**: Field-level change tracking, revert, CSV export, cleanup
- **Labels**: PDF generation (6 formats), barcode (Code128/QR/DataMatrix), batch ZIP
- **Guest Access**: Token-based public view, rate limited, access counting
- **Dashboard**: Charts (Chart.js), activity feed, summary stats
- **AI Suggestions**: Asset type/manufacturer from name (OpenAI or local fallback)
- **Backups**: AES-256-GCM encrypted, S3 upload, daily cron, manual trigger
- **PWA**: Offline support, installable, service worker
- **Security**: Helmet.js, CORS whitelist, rate limiting, input validation

## API Overview

| Method | Endpoint | Auth | Roles |
|--------|----------|------|-------|
| POST | /api/auth/login | ❌ | — |
| POST | /api/auth/refresh | ❌ | — |
| POST | /api/auth/logout | ✅ | Any |
| POST | /api/auth/2fa/setup | ✅ | Any |
| POST | /api/auth/2fa/verify | ✅ | Any |
| GET | /api/auth/me | ✅ | Any |
| GET | /api/assets | ✅ | Any |
| POST | /api/assets | ✅ | Admin, Staff-Admin |
| PUT | /api/assets/:id | ✅ | Admin, Staff-Admin, Staff |
| DELETE | /api/assets/:id | ✅ | Admin |
| POST | /api/assets/:id/checkout | ✅ | Admin, Staff-Admin |
| POST | /api/assets/:id/return | ✅ | Admin, Staff-Admin |
| GET | /api/assets/stats | ✅ | Any |
| GET | /api/assets/depreciation-report | ✅ | Any |
| GET | /api/dashboard/stats | ✅ | Any |
| POST | /api/ai/suggest | ✅ | Any |
| GET | /api/audit | ✅ | Any |
| POST | /api/audit/:id/revert | ✅ | Admin |
| GET | /api/audit/export | ✅ | Any |
| GET | /api/guest/a/:token | ❌ | Public |
| POST | /api/guest/tokens | ✅ | Admin, Staff-Admin |
| POST | /api/labels/generate | ✅ | Admin, Staff-Admin, Staff |
| POST | /api/labels/batch | ✅ | Admin, Staff-Admin, Staff |
| POST | /api/backups/now | ✅ | Admin |
| GET | /api/backups | ✅ | Admin |

## Testing

```bash
# Server smoke tests
cd server && npm test

# Client tests
cd client && npm test
```

## License

MIT