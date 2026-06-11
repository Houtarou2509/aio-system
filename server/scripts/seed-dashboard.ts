import { PrismaClient, AssetStatus, AssetType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const now = new Date();

function daysAgo(d: number) { const dt = new Date(now); dt.setDate(dt.getDate() - d); return dt; }
function daysFromNow(d: number) { const dt = new Date(now); dt.setDate(dt.getDate() + d); return dt; }

async function main() {
  console.log('[1/5] Ensuring admin user...');
  const passwordHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', email: 'admin@aio-system.local', passwordHash, role: 'ADMIN', twoFactorEnabled: false, backupCodes: '[]' },
  });

  // Create personnel for assignments
  console.log('[2/5] Creating personnel records...');
  const personnel = await prisma.personnel.createMany({
    data: [
      { fullName: 'Juan Dela Cruz', designation: 'Property Officer', project: 'Main Campus', email: 'juan@institution.edu', status: 'active', hiredDate: daysAgo(400), personnelType: 'employee' },
      { fullName: 'Maria Santos', designation: 'Research Coordinator', project: 'DRDF Research Lab', email: 'maria@institution.edu', status: 'active', hiredDate: daysAgo(200), personnelType: 'employee' },
    ],
    skipDuplicates: true,
  });

  const allPersonnel = await prisma.personnel.findMany({ take: 2 });

  // Safety: prevent accidental wipe of production data.
  // This script is meant for DEMO/DEV only. Confirm before wiping.
  const existingAssets = await prisma.asset.count();
  if (existingAssets > 0) {
    console.error(`\n⚠  ABORTED: ${existingAssets} assets already exist in the database.`);
    console.error('   This script would DELETE ALL existing assets, assignments, and related data.');
    console.error('   If you really want to reset, run with: FORCE_SEED=1 npm run seed:dashboard');
    console.error('');
    if (!process.env.FORCE_SEED) {
      process.exit(1);
    }
    console.log('[2/5] FORCE_SEED set — wiping existing assets...');
  }

  // Clean existing test assets (only reached if FORCE_SEED=1 or no existing data)
  console.log('[3/5] Seeding 10 assets...');
  await prisma.asset.deleteMany({});

  const assets = [
    { name: 'Dell OptiPlex 7090', type: 'DESKTOP' as AssetType, manufacturer: 'Dell', serialNumber: 'DELL-7090-001', purchasePrice: 45000, purchaseDate: daysAgo(365), status: 'AVAILABLE' as AssetStatus, location: 'Admin Office', propertyNumber: 'PN-2025-001', warrantyExpiry: daysFromNow(200), warrantyNotes: '3-year onsite warranty' },
    { name: 'HP EliteBook 840 G8', type: 'LAPTOP' as AssetType, manufacturer: 'HP', serialNumber: 'HP-840G8-001', purchasePrice: 65000, purchaseDate: daysAgo(180), status: 'ASSIGNED' as AssetStatus, location: 'Research Lab A', propertyNumber: 'PN-2025-002', warrantyExpiry: daysFromNow(100), warrantyNotes: 'Premium support' },
    { name: 'MacBook Pro 16" M3', type: 'LAPTOP' as AssetType, manufacturer: 'Apple', serialNumber: 'MBP-M3-001', purchasePrice: 120000, purchaseDate: daysAgo(90), status: 'ASSIGNED' as AssetStatus, location: 'Director Office', propertyNumber: 'PN-2025-003', warrantyExpiry: daysFromNow(500), warrantyNotes: 'AppleCare+' },
    { name: 'Ergonomic Standing Desk', type: 'FURNITURE' as AssetType, manufacturer: 'FlexiSpot', serialNumber: 'FS-E7-001', purchasePrice: 25000, purchaseDate: daysAgo(500), status: 'AVAILABLE' as AssetStatus, location: 'Admin Office', propertyNumber: 'PN-2024-015', warrantyExpiry: daysAgo(30), warrantyNotes: '5-year frame warranty' },
    { name: 'Cisco Catalyst 2960-X', type: 'EQUIPMENT' as AssetType, manufacturer: 'Cisco', serialNumber: 'CISCO-2960X-01', purchasePrice: 85000, purchaseDate: daysAgo(730), status: 'MAINTENANCE' as AssetStatus, location: 'Server Room', propertyNumber: 'PN-2024-008', warrantyExpiry: daysAgo(200), warrantyNotes: 'Lifetime hardware' },
    { name: 'Logitech Brio 4K Webcam', type: 'PERIPHERAL' as AssetType, manufacturer: 'Logitech', serialNumber: 'LOG-BRIO-001', purchasePrice: 12000, purchaseDate: daysAgo(60), status: 'AVAILABLE' as AssetStatus, location: 'Conference Room', propertyNumber: 'PN-2025-010', warrantyExpiry: daysFromNow(300), warrantyNotes: '' },
    { name: 'Lenovo ThinkCentre M90q', type: 'DESKTOP' as AssetType, manufacturer: 'Lenovo', serialNumber: 'LEN-M90Q-001', purchasePrice: 38000, purchaseDate: daysAgo(200), status: 'ASSIGNED' as AssetStatus, location: 'Finance Office', propertyNumber: 'PN-2025-004', warrantyExpiry: daysFromNow(150), warrantyNotes: 'On-site next business day' },
    { name: 'Canon imageRUNNER C3530', type: 'EQUIPMENT' as AssetType, manufacturer: 'Canon', serialNumber: 'CAN-IR-C3530', purchasePrice: 180000, purchaseDate: daysAgo(1000), status: 'AVAILABLE' as AssetStatus, location: 'Printing Room', propertyNumber: 'PN-2023-001', warrantyExpiry: daysAgo(400), warrantyNotes: 'Extended service agreement' },
    { name: 'Samsung 49" Curved Monitor', type: 'PERIPHERAL' as AssetType, manufacturer: 'Samsung', serialNumber: 'SAM-C49RG-001', purchasePrice: 55000, purchaseDate: daysAgo(45), status: 'RETIRED' as AssetStatus, location: 'Storage Room', propertyNumber: 'PN-2025-020', warrantyExpiry: daysAgo(10), warrantyNotes: 'Panel defect — retired' },
    { name: 'APC Smart-UPS 3000VA', type: 'EQUIPMENT' as AssetType, manufacturer: 'APC', serialNumber: 'APC-SMT3000-1', purchasePrice: 42000, purchaseDate: daysAgo(300), status: 'LOST' as AssetStatus, location: 'Server Room', propertyNumber: 'PN-2024-030', warrantyExpiry: daysFromNow(50), warrantyNotes: 'Reported missing during audit' },
  ];

  const createdAssets: any[] = [];
  for (const a of assets) {
    const asset = await prisma.asset.create({ data: a });
    createdAssets.push(asset);
    console.log(`  ✓ ${asset.name} [${asset.status}]`);
  }

  // Create assignments for ASSIGNED assets
  console.log('[4/5] Creating assignments...');
  const assignedAssets = createdAssets.filter(a => a.status === 'ASSIGNED');
  for (let i = 0; i < assignedAssets.length; i++) {
    await prisma.assignment.create({
      data: {
        assetId: assignedAssets[i].id,
        personnelId: allPersonnel[i % allPersonnel.length].id,
        assignedTo: allPersonnel[i % allPersonnel.length].fullName,
        assignedAt: daysAgo(30 + i * 15),
        notes: 'Regular issuance',
      },
    });
    console.log(`  ✓ ${assignedAssets[i].name} → ${allPersonnel[i % allPersonnel.length].fullName}`);
  }

  // Create maintenance records
  console.log('[5/5] Creating maintenance logs...');
  const maintenanceAsset = createdAssets.find(a => a.status === 'MAINTENANCE')!;
  const overdueMaintenanceAsset = createdAssets.find(a => a.name.includes('Standing Desk'))!;

  // Overdue maintenance
  await prisma.maintenanceSchedule.create({
    data: {
      assetId: maintenanceAsset.id,
      title: 'Firmware update & port diagnostics',
      scheduledDate: daysAgo(5),
      status: 'overdue',
      notes: 'Switch port 12 showing intermittent errors',
      createdById: admin.id,
    },
  });

  await prisma.maintenanceSchedule.create({
    data: {
      assetId: overdueMaintenanceAsset.id,
      title: 'Desk motor calibration',
      scheduledDate: daysAgo(15),
      status: 'overdue',
      notes: 'Left motor not responding to height adjustment',
      createdById: admin.id,
    },
  });

  // Upcoming maintenance
  await prisma.maintenanceSchedule.create({
    data: {
      assetId: createdAssets.find(a => a.name.includes('ThinkCentre'))!.id,
      title: 'Quarterly cleaning & thermal paste check',
      scheduledDate: daysFromNow(7),
      status: 'pending',
      notes: 'Annual maintenance cycle',
      createdById: admin.id,
    },
  });

  // Completed maintenance
  await prisma.maintenanceSchedule.create({
    data: {
      assetId: createdAssets.find(a => a.name.includes('imageRUNNER'))!.id,
      title: 'Toner replacement & drum cleaning',
      scheduledDate: daysAgo(20),
      status: 'completed',
      notes: 'All print quality restored',
      completedAt: daysAgo(18),
      createdById: admin.id,
    },
  });

  // Past maintenance logs for audit trail
  await prisma.maintenanceLog.create({
    data: {
      assetId: maintenanceAsset.id,
      technicianName: 'TechServe Solutions',
      description: 'Switch port diagnostics and cable replacement — ports 12-16 re-terminated',
      cost: 3500,
      date: daysAgo(60),
    },
  });

  await prisma.maintenanceLog.create({
    data: {
      assetId: createdAssets.find(a => a.name.includes('OptiPlex'))!.id,
      technicianName: 'IT Support Team',
      description: 'SSD upgrade from 256GB to 1TB + RAM increase to 32GB',
      cost: 8500,
      date: daysAgo(120),
    },
  });

  console.log('✓ 10 assets seeded with assignments, maintenance, and warranty data');
  console.log('  Dashboard should now show real data!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
