import { chromium, FullConfig } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:5001';

async function globalSetup(config: FullConfig) {
  const prisma = new PrismaClient();

  // Clean and seed test data
  await prisma.guestToken.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.assignment.deleteMany({});
  await prisma.maintenanceLog.deleteMany({});
  await prisma.backupLog.deleteMany({});
  await prisma.labelTemplate.deleteMany({});
  await prisma.asset.deleteMany({});
  await prisma.user.deleteMany({});

  const passwordHash = await bcrypt.hash('admin123', 10);

  // Create test users
  const admin = await prisma.user.create({
    data: { username: 'admin', email: 'admin@aio-system.local', passwordHash, role: 'ADMIN', twoFactorEnabled: false, backupCodes: '[]' },
  });
  const staffAdmin = await prisma.user.create({
    data: { username: 'staffadmin', email: 'staffadmin@aio-system.local', passwordHash, role: 'STAFF_ADMIN', twoFactorEnabled: false, backupCodes: '[]' },
  });
  const staff = await prisma.user.create({
    data: { username: 'staff1', email: 'staff1@aio-system.local', passwordHash, role: 'STAFF', twoFactorEnabled: false, backupCodes: '[]' },
  });
  const guest = await prisma.user.create({
    data: { username: 'guest1', email: 'guest1@aio-system.local', passwordHash, role: 'GUEST', twoFactorEnabled: false, backupCodes: '[]' },
  });

  // Set up 2FA for admin via API flow (setup + verify)
  const secret = speakeasy.generateSecret({ name: 'AIO-System (admin@aio-system.local)', length: 20 });
  const token = speakeasy.totp({ secret: secret.base32, encoding: 'base32' });
  await prisma.user.update({
    where: { id: admin.id },
    data: { twoFactorSecret: secret.base32, twoFactorEnabled: true, backupCodes: '[]' },
  });

  // Store the 2FA secret for tests to use
  process.env.ADMIN_2FA_SECRET = secret.base32;

  // Create test assets
  const asset1 = await prisma.asset.create({
    data: {
      name: 'Dell Latitude 5540',
      type: 'LAPTOP',
      manufacturer: 'Dell',
      serialNumber: 'SN-DELL-001',
      purchasePrice: 45000,
      currentValue: 36000,
      status: 'AVAILABLE',
      location: 'Office A',
      depreciationRate: 20,
    },
  });

  const asset2 = await prisma.asset.create({
    data: {
      name: 'Herman Miller Aeron',
      type: 'FURNITURE',
      manufacturer: 'Herman Miller',
      serialNumber: 'SN-HM-002',
      purchasePrice: 50000,
      currentValue: 40000,
      status: 'AVAILABLE',
      location: 'Office B',
      depreciationRate: 20,
    },
  });

  const asset3 = await prisma.asset.create({
    data: {
      name: 'Cisco Router 2901',
      type: 'EQUIPMENT',
      manufacturer: 'Cisco',
      serialNumber: 'SN-CISCO-003',
      purchasePrice: 25000,
      currentValue: 20000,
      status: 'ASSIGNED',
      location: 'Server Room',
      assignedToId: staff.id,
      depreciationRate: 20,
    },
  });

  // Create an assignment for asset3
  await prisma.assignment.create({
    data: {
      assetId: asset3.id,
      userId: staff.id,
      assignedAt: new Date(),
    },
  });

  // Create audit log entries for asset1 (for audit trail test)
  await prisma.auditLog.create({
    data: {
      entityType: 'Asset',
      entityId: asset1.id,
      action: 'CREATE',
      field: '*',
      oldValue: null,
      newValue: asset1.name,
      performedById: admin.id,
      performedAt: new Date(Date.now() - 86400000), // 1 day ago
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: 'Asset',
      entityId: asset1.id,
      action: 'UPDATE',
      field: 'location',
      oldValue: 'Warehouse',
      newValue: 'Office A',
      performedById: admin.id,
      performedAt: new Date(Date.now() - 43200000), // 12h ago
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: 'Asset',
      entityId: asset1.id,
      action: 'UPDATE',
      field: 'currentValue',
      oldValue: '45000',
      newValue: '36000',
      performedById: staffAdmin.id,
      performedAt: new Date(),
    },
  });

  await prisma.$disconnect();

  // Start dev servers if not already running
  const { execSync } = await import('child_process');

  // Check if servers are already running
  try {
    const response = await fetch(`${API_URL}/api/health`);
    if (response.ok) {
      console.log('[globalSetup] Servers already running');
      return;
    }
  } catch {}

  console.log('[globalSetup] Starting dev servers...');
  // Note: In CI, servers should be started separately before test run
  // For local dev, run: npx concurrently -n server,client "npm run dev:server" "cd client && npx vite --host"
}

export default globalSetup;