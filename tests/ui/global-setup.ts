import { chromium, FullConfig } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_PERMISSIONS } from '../../server/src/middleware/permissions';

const BASE_URL = 'http://localhost:3000/aio-system';
const API_URL = 'http://localhost:3001';

async function globalSetup(config: FullConfig) {
  const prisma = new PrismaClient();

  // Clean and seed test data (order matters — delete dependents first)
  await prisma.guestToken.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.agreementDocument.deleteMany({});
  await prisma.assignment.deleteMany({});
  await prisma.maintenanceSchedule.deleteMany({});
  await prisma.maintenanceLog.deleteMany({});
  await prisma.assetConditionLog.deleteMany({});
  await prisma.purchaseRequest.deleteMany({});
  await prisma.labelTemplate.deleteMany({});
  await prisma.backupLog.deleteMany({});
  await prisma.asset.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.personnel.deleteMany({});
  await prisma.user.deleteMany({});

  const passwordHash = await bcrypt.hash('admin123', 10);

  // Create test users (with role-appropriate default permissions)
  const admin = await prisma.user.create({
    data: { username: 'admin', email: 'admin@aio-system.local', passwordHash, role: 'ADMIN', twoFactorEnabled: false, backupCodes: '[]', permissions: JSON.stringify(DEFAULT_PERMISSIONS.ADMIN) },
  });
  const staffAdmin = await prisma.user.create({
    data: { username: 'staffadmin', email: 'staffadmin@aio-system.local', passwordHash, role: 'STAFF_ADMIN', twoFactorEnabled: false, backupCodes: '[]', permissions: JSON.stringify(DEFAULT_PERMISSIONS.STAFF_ADMIN) },
  });
  const staff = await prisma.user.create({
    data: { username: 'staff1', email: 'staff1@aio-system.local', passwordHash, role: 'STAFF', twoFactorEnabled: false, backupCodes: '[]', permissions: JSON.stringify(DEFAULT_PERMISSIONS.STAFF) },
  });
  const guest = await prisma.user.create({
    data: { username: 'guest1', email: 'guest1@aio-system.local', passwordHash, role: 'GUEST', twoFactorEnabled: false, backupCodes: '[]', permissions: JSON.stringify(DEFAULT_PERMISSIONS.GUEST) },
  });

  // Create test assets (fields match current Prisma schema)
  const asset1 = await prisma.asset.create({
    data: {
      name: 'Dell Latitude 5540',
      type: 'LAPTOP',
      manufacturer: 'Dell',
      serialNumber: 'SN-DELL-001',
      purchasePrice: 45000,
      purchaseDate: new Date('2024-06-15'),
      status: 'AVAILABLE',
      location: 'Office A',
    },
  });

  const asset2 = await prisma.asset.create({
    data: {
      name: 'Herman Miller Aeron',
      type: 'FURNITURE',
      manufacturer: 'Herman Miller',
      serialNumber: 'SN-HM-002',
      purchasePrice: 50000,
      purchaseDate: new Date('2024-03-10'),
      status: 'AVAILABLE',
      location: 'Office B',
    },
  });

  const asset3 = await prisma.asset.create({
    data: {
      name: 'Cisco Router 2901',
      type: 'EQUIPMENT',
      manufacturer: 'Cisco',
      serialNumber: 'SN-CISCO-003',
      purchasePrice: 25000,
      purchaseDate: new Date('2023-11-20'),
      status: 'ASSIGNED',
      location: 'Server Room',
      assignedTo: staff.id,
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

  // Create audit log entries for asset1 (fields match current AuditLog schema)
  await prisma.auditLog.create({
    data: {
      action: 'CREATE',
      entityType: 'Asset',
      entityId: asset1.id,
      userId: admin.id,
      metadata: { name: asset1.name, type: asset1.type },
      ipAddress: '127.0.0.1',
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'UPDATE',
      entityType: 'Asset',
      entityId: asset1.id,
      userId: admin.id,
      metadata: { field: 'location', oldValue: 'Warehouse', newValue: 'Office A' },
      ipAddress: '127.0.0.1',
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'UPDATE',
      entityType: 'Asset',
      entityId: asset1.id,
      userId: staffAdmin.id,
      metadata: { field: 'status', oldValue: 'AVAILABLE', newValue: 'ASSIGNED' },
      ipAddress: '127.0.0.1',
    },
  });

  await prisma.$disconnect();

  // Check if servers are already running
  try {
    const response = await fetch(`${API_URL}/api/health`);
    if (response.ok) {
      console.log('[globalSetup] Servers already running');
      return;
    }
  } catch {}

  console.log('[globalSetup] Servers not running. Start them before running UI tests.');
}

export default globalSetup;