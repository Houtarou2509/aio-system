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
import lookupRoutes from './routes/lookup.routes';
import maintenanceSchedulesRouter from './routes/maintenanceSchedules';
import maintenanceUpcomingRouter from './routes/maintenanceUpcoming';
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
}));

// CORS — whitelist frontend only
app.use(cors({
  origin: true,
  credentials: true,
}));

// Request logging
app.use(morgan(isProduction ? 'combined' : 'dev'));

app.use(express.json({ limit: '10mb' }));

// Serve uploaded images
app.use('/aio-system/uploads', express.static(path.resolve(__dirname, '../uploads')));

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
app.use('/api/audit', auditRoutes);
app.use('/api/labels', labelRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/assets', maintenanceSchedulesRouter);
app.use('/api/maintenance', maintenanceUpcomingRouter);
app.use('/api/notifications', notificationRoutes);
app.use('/api/lookups', lookupRoutes);
app.use('/api/users', userRoutes);

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
