import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import dotenv from 'dotenv';

// Load env first
dotenv.config();

import { validateEnv } from './utils/env';
import { globalErrorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import assetRoutes from './routes/asset.routes';
import userRoutes from './routes/user.routes';
import maintenanceRoutes from './routes/maintenance.routes';
import auditRoutes from './routes/audit.routes';
import labelRoutes from './routes/label.routes';
import guestRoutes from './routes/guest.routes';
import dashboardRoutes from './routes/dashboard.routes';
import aiRoutes from './routes/ai.routes';
import backupRoutes from './routes/backup.routes';
import notificationRoutes from './routes/notification.routes';
import personnelRoutes from './routes/personnel.routes';
import issuanceRoutes from './routes/issuance.routes';
import agreementRoutes from './routes/agreement.routes';
import lookupRoutes from './routes/lookup.routes';
import institutionRoutes from './routes/institution.routes';
import projectRoutes from './routes/project.routes';
import accountabilityLookupRoutes from './routes/accountabilityLookup.routes';
import reportsRoutes from './routes/reports.routes';
import purchaseRequestRoutes from './routes/purchase-request.routes';
import searchRoutes from './routes/search.routes';
import supplierRoutes from './routes/supplier.routes';
import settingsRoutes from './routes/settings.routes';
import { startCronJobs } from './jobs/cron';

// Start server only when not in test
const shouldStart = !process.env.VITEST;

if (shouldStart) {
  try {
    validateEnv();
  } catch (err: any) {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  strictTransportSecurity: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
}));

// CORS — reflect the request origin in production (internal network), restrict in prod with CLIENT_URL
app.use(cors({
  origin: isProduction ? true : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));

// Request logging
app.use(morgan(isProduction ? 'combined' : 'dev'));

app.use(express.json({ limit: '10mb' }));

// Serve uploaded images (logos stored in server/uploads/ to survive vite builds)
app.use('/aio-system/uploads', express.static(path.resolve(__dirname, '../uploads')));
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Serve built frontend in production
if (isProduction) {
  app.use('/aio-system', express.static(path.resolve(__dirname, '../public')));
}

// Public guest route
app.use('/api/guest', guestRoutes);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/assets', maintenanceRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/labels', labelRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/lookups', lookupRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/lookup/accountability', accountabilityLookupRoutes);
app.use('/api/users', userRoutes);
app.use('/api/personnel', personnelRoutes);
app.use('/api/issuances', issuanceRoutes);
app.use('/api/agreements', agreementRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/purchase-requests', purchaseRequestRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/settings', settingsRoutes);

// Redirect root to /aio-system/
app.get('/', (_req, res) => {
  res.redirect('/aio-system/');
});

// Serve index.html for exact /aio-system and /aio-system/
app.get(['/aio-system', '/aio-system/'], (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../public/index.html'));
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// SPA fallback — serve index.html for non-API routes in production
if (isProduction) {
  app.get('/aio-system/*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, '../public/index.html'));
  });
}

// Global error handler (must be last)
app.use(globalErrorHandler);

// Start server only when not in test
if (shouldStart) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT} (${isProduction ? 'production' : 'development'})`);
    startCronJobs();
  });
}

export { app };
