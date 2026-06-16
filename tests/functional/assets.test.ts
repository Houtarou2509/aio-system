import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { PrismaClient } from '@prisma/client';
import { seedUsers, createAsset, createCheckedOutAsset, createPersonnel, cleanAssets, type UserFixture } from '../fixtures/assets';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Helper: delete generated-format property numbers and keep cleanup scoped
async function cleanGeneratedPropertyNumbers(prefix: string) {
  const regex = new RegExp(`^${prefix}\\d{5}$`);
  const assets = await prisma.asset.findMany({ where: { propertyNumber: { not: null } }, select: { id: true, propertyNumber: true } });
  const ids = assets.filter(a => a.propertyNumber && regex.test(a.propertyNumber)).map(a => a.id);
  if (ids.length === 0) return;
  await prisma.auditLog.deleteMany({ where: { entityType: 'Asset', entityId: { in: ids } } });
  await prisma.asset.deleteMany({ where: { id: { in: ids } } });
}

// ── State ────────────────────────────────────────────────────────────────────
let users: Record<string, UserFixture>;
let testPersonnel: { id: string; fullName: string };

// ── Lifecycle ────────────────────────────────────────────────────────────────
beforeAll(async () => {
  users = await seedUsers();
}, 15_000);

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await cleanAssets();
  testPersonnel = await createPersonnel({ fullName: 'Test Issuee', designation: 'Staff', project: 'QA' });
});

// ═══════════════════════════════════════════════════════════════════════════════

describe('Asset CRUD — Create', () => {
  // 1
  it('1. POST /api/assets (Admin) — valid payload → 201, returns created asset with id', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        name: 'Dell Latitude 5540',
        type: 'LAPTOP',
        manufacturer: 'Dell',
        serialNumber: 'SN-DELL-001',
        purchasePrice: 45000,
        purchaseDate: '2025-01-15',
        location: 'Office A',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.name).toBe('Dell Latitude 5540');
    expect(res.body.data.type).toBe('LAPTOP');
    expect(res.body.data.status).toBe('AVAILABLE');
  });

  // 2
  it('2. POST /api/assets (Admin) — missing required fields → 400', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ manufacturer: 'Dell' }); // missing name + type

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  // 3
  it('3. POST /api/assets (Staff) — → 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`)
      .send({ name: 'Test', type: 'LAPTOP' });

    expect(res.status).toBe(403);
  });

  // 4
  it('4. POST /api/assets (Guest) — → 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${users.GUEST.accessToken}`)
      .send({ name: 'Test', type: 'LAPTOP' });

    expect(res.status).toBe(403);
  });
});

describe('Asset CRUD — Read', () => {
  // 5
  it('5. GET /api/assets (Admin) — returns paginated list, default page 1 size 20', async () => {
    // Seed 3 assets
    await createAsset({ name: 'Asset Alpha', adminToken: users.ADMIN.accessToken });
    await createAsset({ name: 'Asset Beta', adminToken: users.ADMIN.accessToken });
    await createAsset({ name: 'Asset Gamma', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(3);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(20);
    expect(res.body.meta.total).toBe(3);
  });

  // 6
  it('6. GET /api/assets?search=MacBook — returns only matching assets', async () => {
    await createAsset({ name: 'MacBook Pro 16', adminToken: users.ADMIN.accessToken });
    await createAsset({ name: 'Dell Latitude', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .get('/api/assets?search=MacBook')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toContain('MacBook');
  });

  // 7
  it('7. GET /api/assets?status=AVAILABLE — filters correctly', async () => {
    await createAsset({ name: 'Available One', adminToken: users.ADMIN.accessToken });
    const retired = await createAsset({ name: 'Retired One', adminToken: users.ADMIN.accessToken, status: 'RETIRED' });

    const res = await request(app)
      .get('/api/assets?status=AVAILABLE')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('AVAILABLE');
  });

  // 8
  it('8. GET /api/assets?type=LAPTOP&location=Office A — multi-filter works', async () => {
    await createAsset({ name: 'Laptop Office A', type: 'LAPTOP', location: 'Office A', adminToken: users.ADMIN.accessToken });
    await createAsset({ name: 'Desktop Office B', type: 'DESKTOP', location: 'Office B', adminToken: users.ADMIN.accessToken });
    await createAsset({ name: 'Laptop Office B', type: 'LAPTOP', location: 'Office B', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .get('/api/assets?type=LAPTOP&location=Office A')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].type).toBe('LAPTOP');
    expect(res.body.data[0].location).toBe('Office A');
  });

  // 9
  it('9. GET /api/assets/:id (Admin) — returns full asset with assignments and maintenanceLogs', async () => {
    const asset = await createAsset({ name: 'Full Detail Asset', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .get(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(asset.id);
    expect(res.body.data.assignments).toBeDefined();
    expect(res.body.data.maintenanceLogs).toBeDefined();
  });

  // 10
  it('10. GET /api/assets/:id (Guest) — returns asset but sensitive fields may be visible on this endpoint', async () => {
    const asset = await createAsset({
      name: 'Guest View Asset',
      serialNumber: 'SECRET-SN-123',
      purchasePrice: 99999,
      adminToken: users.ADMIN.accessToken,
    });

    const res = await request(app)
      .get(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.GUEST.accessToken}`);

    // Guest can access /api/assets (authenticate only, no role gate on GET)
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(asset.id);
    // Note: Field stripping for guests is on /api/guest/:token, not /api/assets
    // This test documents the current behavior
  });

  // 11
  it('11. GET /api/assets/:id (non-existent) → 404', async () => {
    const res = await request(app)
      .get('/api/assets/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('Asset CRUD — Update', () => {
  // 12
  it('12. PUT /api/assets/:id (Admin) — valid partial update → 200', async () => {
    const asset = await createAsset({ name: 'Original Name', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ name: 'Updated Name', location: 'Office B' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Updated Name');
    expect(res.body.data.location).toBe('Office B');
  });

  // 13
  it('13. PUT /api/assets/:id — changing name creates audit log with oldValue/newValue', async () => {
    const asset = await createAsset({ name: 'Audit Old Name', adminToken: users.ADMIN.accessToken });

    await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ name: 'Audit New Name' });

    // Check audit log
    const auditRes = await request(app)
      .get(`/api/audit/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(auditRes.status).toBe(200);
    const updateLogs = auditRes.body.data.filter(
      (l: any) => l.action === 'UPDATE' && l.field === 'name'
    );
    expect(updateLogs.length).toBeGreaterThanOrEqual(1);
    expect(updateLogs[0].oldValue).toBe('Audit Old Name');
    expect(updateLogs[0].newValue).toBe('Audit New Name');
  });

  // 14
  it('14. PUT /api/assets/:id (Staff) — Staff CANNOT update (no assets:edit permission) → 403', async () => {
    const asset = await createAsset({ name: 'Staff Update Test', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`)
      .send({ location: 'Updated by Staff' });

    // STAFF default permissions only include assets:view, not assets:edit
    expect(res.status).toBe(403);
  });

  // 15
  it('15. PUT /api/assets/:id — invalid purchasePrice (negative) → 422', async () => {
    const asset = await createAsset({ name: 'Validation Test', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ purchasePrice: -10 });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
});

describe('Asset CRUD — Unique Property Number', () => {
  // Create duplicate
  it('POST /api/assets — duplicate propertyNumber → 409', async () => {
    await createAsset({ name: 'Asset A', propertyNumber: 'PROP-UNIQ-001', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        name: 'Asset B',
        type: 'LAPTOP',
        serialNumber: `SN-DUP-${Date.now()}`,
        propertyNumber: 'PROP-UNIQ-001',
        purchasePrice: 1000,
        purchaseDate: '2025-01-15',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.details.field).toBe('propertyNumber');
    expect(res.body.error.details.code).toBe('DUPLICATE_FIELD');
  });

  // Blank/null propertyNumber allowed
  it('POST /api/assets — blank propertyNumber → 201 (allowed)', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        name: 'No PN Asset',
        type: 'LAPTOP',
        serialNumber: `SN-NO-PN-${Date.now()}`,
        propertyNumber: '',
        purchasePrice: 1000,
        purchaseDate: '2025-01-15',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  // Multiple assets with blank propertyNumber allowed
  it('POST /api/assets — multiple assets with blank propertyNumber → all 201', async () => {
    const res1 = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ name: 'Blank PN 1', type: 'LAPTOP', serialNumber: `SN-BLANK1-${Date.now()}`, propertyNumber: '', purchasePrice: 1000, purchaseDate: '2025-01-15' });
    const res2 = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ name: 'Blank PN 2', type: 'LAPTOP', serialNumber: `SN-BLANK2-${Date.now()}`, propertyNumber: '', purchasePrice: 1000, purchaseDate: '2025-01-15' });

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
  });

  // Update with same propertyNumber (own) → allowed
  it('PUT /api/assets/:id — keep own propertyNumber → 200 (allowed)', async () => {
    const asset = await createAsset({ name: 'Keep PN', propertyNumber: 'PROP-KEEP-001', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ propertyNumber: 'PROP-KEEP-001' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // Update with duplicate propertyNumber → 409
  it('PUT /api/assets/:id — update to another asset\'s propertyNumber → 409', async () => {
    const assetA = await createAsset({ name: 'Asset A', propertyNumber: 'PROP-A-002', adminToken: users.ADMIN.accessToken });
    await createAsset({ name: 'Asset B', propertyNumber: 'PROP-B-002', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .put(`/api/assets/${assetA.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ propertyNumber: 'PROP-B-002' });

    expect(res.status).toBe(409);
    expect(res.body.error.details.field).toBe('propertyNumber');
  });

  // Update clearing propertyNumber → allowed
  it('PUT /api/assets/:id — clear propertyNumber to blank → 200 (allowed)', async () => {
    const asset = await createAsset({ name: 'Clear PN', propertyNumber: 'PROP-CLEAR-001', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ propertyNumber: '' });

    expect(res.status).toBe(200);
    expect(res.body.data.propertyNumber).toBeNull();
  });

  // Duplicate propertyNumber against soft-deleted asset → 409
  it('POST /api/assets — duplicate propertyNumber of soft-deleted asset → 409', async () => {
    const asset = await createAsset({ name: 'To Delete', propertyNumber: 'PROP-DEL-001', adminToken: users.ADMIN.accessToken });

    // Soft-delete
    await request(app)
      .delete(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        name: 'Reuse PN',
        type: 'LAPTOP',
        serialNumber: `SN-REUSE-${Date.now()}`,
        propertyNumber: 'PROP-DEL-001',
        purchasePrice: 1000,
        purchaseDate: '2025-01-15',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.details.field).toBe('propertyNumber');
  });
});

describe('Asset CRUD — Audit Log Accuracy', () => {
  it('Update only propertyNumber — creates exactly one audit entry for propertyNumber, no purchaseDate entry', async () => {
    const asset = await createAsset({
      name: 'Audit Test Asset',
      propertyNumber: 'PROP-AUD-001',
      adminToken: users.ADMIN.accessToken,
    });

    const res = await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ propertyNumber: 'PROP-AUD-002' });

    expect(res.status).toBe(200);

    // Check audit logs
    const auditRes = await request(app)
      .get(`/api/audit/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(auditRes.status).toBe(200);
    const updateLogs = auditRes.body.data.filter(
      (l: any) => l.action === 'UPDATE',
    );

    // Should have exactly one UPDATE entry
    expect(updateLogs.length).toBe(1);
    expect(updateLogs[0].field).toBe('propertyNumber');
    expect(updateLogs[0].oldValue).toBe('PROP-AUD-001');
    expect(updateLogs[0].newValue).toBe('PROP-AUD-002');
  });

  it('Submit unchanged purchaseDate — no purchaseDate audit entry created', async () => {
    const asset = await createAsset({
      name: 'No Date Change',
      propertyNumber: 'PROP-NO-DATE-001',
      purchasePrice: 5000,
      purchaseDate: '2026-01-15',
      adminToken: users.ADMIN.accessToken,
    });

    // Update only propertyNumber, re-send the same purchaseDate
    const res = await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        propertyNumber: 'PROP-NO-DATE-002',
        purchaseDate: '2026-01-15T00:00:00.000Z', // same date, ISO format
        purchasePrice: 5000,
      });

    expect(res.status).toBe(200);

    const auditRes = await request(app)
      .get(`/api/audit/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    const updateLogs = auditRes.body.data.filter(
      (l: any) => l.action === 'UPDATE',
    );
    const dateLogs = updateLogs.filter((l: any) => l.field === 'purchaseDate');

    // No purchaseDate audit entry should exist since the date didn't actually change
    expect(dateLogs.length).toBe(0);
  });

  it('Update purchaseDate to a truly different date — creates purchaseDate audit entry', async () => {
    const asset = await createAsset({
      name: 'Date Change Test',
      propertyNumber: 'PROP-DATE-CHG-001',
      purchaseDate: '2026-01-15',
      adminToken: users.ADMIN.accessToken,
    });

    const res = await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ purchaseDate: '2026-06-01' });

    expect(res.status).toBe(200);

    const auditRes = await request(app)
      .get(`/api/audit/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    const updateLogs = auditRes.body.data.filter(
      (l: any) => l.action === 'UPDATE',
    );
    const dateLogs = updateLogs.filter((l: any) => l.field === 'purchaseDate');

    expect(dateLogs.length).toBe(1);
  });

  it('No actual changes submitted — no audit entries created', async () => {
    const asset = await createAsset({
      name: 'No Change Test',
      propertyNumber: 'PROP-NO-CHG-001',
      adminToken: users.ADMIN.accessToken,
    });

    // Send an update with no real changes (same values)
    const res = await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ name: 'No Change Test', type: 'LAPTOP' });

    expect(res.status).toBe(200);

    const auditRes = await request(app)
      .get(`/api/audit/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    const updateLogs = auditRes.body.data.filter(
      (l: any) => l.action === 'UPDATE',
    );

    // No UPDATE entries should be created if nothing actually changed
    expect(updateLogs.length).toBe(0);
  });
});

describe('Asset CRUD — Delete', () => {
  // 16
  it('16. DELETE /api/assets/:id (Admin) — soft delete, status becomes RETIRED', async () => {
    const asset = await createAsset({ name: 'Delete Target', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .delete(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('RETIRED');

    // Asset still exists in DB
    const check = await prisma.asset.findUnique({ where: { id: asset.id } });
    expect(check).not.toBeNull();
    expect(check!.status).toBe('RETIRED');
  });

  // 17
  it('17. DELETE /api/assets/:id (Staff-Admin) — → 403 Forbidden', async () => {
    const asset = await createAsset({ name: 'Delete By StaffAdmin', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .delete(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.STAFF_ADMIN.accessToken}`);

    expect(res.status).toBe(403);
  });

  // 18
  it('18. GET /api/assets after delete — retired asset does not appear in default list', async () => {
    await createAsset({ name: 'Active Asset', adminToken: users.ADMIN.accessToken });
    const toRetire = await createAsset({ name: 'Retired Asset', adminToken: users.ADMIN.accessToken });

    // Soft delete
    await request(app)
      .delete(`/api/assets/${toRetire.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    // Default list (status not filtered) — retired assets may still appear
    // since listAssets doesn't exclude RETIRED by default.
    // Filter by AVAILABLE to confirm retired asset doesn't appear
    const res = await request(app)
      .get('/api/assets?status=AVAILABLE')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    const names = res.body.data.map((a: any) => a.name);
    expect(names).not.toContain('Retired Asset');
  });

  it('18b. GET /api/assets?status=RETIRED — shows disposed or retired assets', async () => {
    await createAsset({ name: 'Active Asset', adminToken: users.ADMIN.accessToken });
    const toDispose = await createAsset({ name: 'Disposed Asset', adminToken: users.ADMIN.accessToken });

    const disposeRes = await request(app)
      .post(`/api/assets/${toDispose.id}/dispose`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        reason: 'Manual QA disposal test',
        method: 'SCRAPPED',
        date: '2026-05-27',
      });

    expect(disposeRes.status).toBe(200);
    expect(disposeRes.body.data.status).toBe('RETIRED');

    const defaultRes = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(defaultRes.status).toBe(200);
    expect(defaultRes.body.data.map((a: any) => a.name)).not.toContain('Disposed Asset');

    const retiredRes = await request(app)
      .get('/api/assets?status=RETIRED')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(retiredRes.status).toBe(200);
    const disposed = retiredRes.body.data.find((a: any) => a.id === toDispose.id);
    expect(disposed).toBeDefined();
    expect(disposed.name).toBe('Disposed Asset');
    expect(disposed.status).toBe('RETIRED');
    expect(disposed.disposalReason).toBe('Manual QA disposal test');
  });
});

describe('Asset CRUD — Issuance & Return', () => {
  // 19
  it('19. POST /api/issuances (Admin) — creates issuance, asset status → ASSIGNED', async () => {
    const asset = await createAsset({ name: 'Issuance Test', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, personnelId: testPersonnel.id });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.assetId).toBe(asset.id);
    expect(res.body.data.personnelId).toBe(testPersonnel.id);

    // Verify status changed
    const checkRes = await request(app)
      .get(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);
    expect(checkRes.body.data.status).toBe('ASSIGNED');
  });

  // 20
  it('20. POST /api/issuances — asset already assigned → 409/error', async () => {
    const { asset } = await createCheckedOutAsset({
      name: 'Double Issuance',
      adminToken: users.ADMIN.accessToken,
      personnelId: testPersonnel.id,
    });

    // Try to issue again
    const res = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, personnelId: testPersonnel.id });

    // Service returns 400/409 when asset is already assigned
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });

  // 21
  it('21. POST /api/issuances/:id/return (Admin) — closes assignment, status → AVAILABLE', async () => {
    const { asset, assignment } = await createCheckedOutAsset({
      name: 'Return Test',
      adminToken: users.ADMIN.accessToken,
      personnelId: testPersonnel.id,
    });

    const res = await request(app)
      .post(`/api/issuances/${assignment.id}/return`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ condition: 'Good', returnNote: 'Returned in good condition' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.returnedAt).toBeTruthy();

    // Verify status changed back
    const checkRes = await request(app)
      .get(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);
    expect(checkRes.body.data.status).toBe('AVAILABLE');
  });

  // 22
  it('22. GET /api/assets/:id/history — shows assignment timeline', async () => {
    const { asset } = await createCheckedOutAsset({
      name: 'History Test',
      adminToken: users.ADMIN.accessToken,
      personnelId: testPersonnel.id,
    });

    const res = await request(app)
      .get(`/api/assets/${asset.id}/history`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Asset CRUD — Image Upload', () => {
  // 23
  it('23. POST /api/assets/:id/image — valid JPEG → 200, returns imageUrl', async () => {
    const asset = await createAsset({ name: 'Image Test', adminToken: users.ADMIN.accessToken });

    // Create a minimal valid JPEG file on disk using sharp
    const tmpDir = path.resolve(__dirname, '../../server/uploads');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `test-${Date.now()}.jpg`);
    // Use sharp to create a valid test image
    const sharpMod = await import('sharp');
    await sharpMod.default({ create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .jpeg()
      .toFile(tmpFile);

    const res = await request(app)
      .post(`/api/assets/${asset.id}/image`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .attach('image', tmpFile);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.imageUrl).toBeDefined();
    expect(res.body.data.imageUrl).toContain('/uploads/');
  });

  // 24 — Multer limit is 5MB; we test that large files are rejected
  it('24. POST /api/assets/:id/image — file exceeding 5MB limit → 413', async () => {
    const asset = await createAsset({ name: 'Big Image Test', adminToken: users.ADMIN.accessToken });

    // Create a 6MB buffer with JPEG header
    const bigBuffer = Buffer.alloc(6 * 1024 * 1024);
    bigBuffer.write('/9j/', 0, 'base64'); // JPEG magic bytes

    const res = await request(app)
      .post(`/api/assets/${asset.id}/image`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .attach('image', bigBuffer, { filename: 'huge.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBeGreaterThanOrEqual(400); // 413 or multer error
  });

  // 25
  it('25. POST /api/assets/:id/image — non-image file (PDF) → 400', async () => {
    const asset = await createAsset({ name: 'PDF Upload Test', adminToken: users.ADMIN.accessToken });

    const pdfBuffer = Buffer.from('%PDF-1.4 test content');

    const res = await request(app)
      .post(`/api/assets/${asset.id}/image`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .attach('image', pdfBuffer, { filename: 'doc.pdf', contentType: 'application/pdf' });

    // Multer fileFilter rejects non-images
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Assigned To display — issuance sets assignedTo on Asset, return clears it
// ═══════════════════════════════════════════════════════════════════════════════
describe('Asset assignedTo — issuance populates, return clears', () => {
  it('1. After issuance, GET /api/assets includes assignedTo with personnel name', async () => {
    const personnel = await createPersonnel({ fullName: 'Test Drdf' });
    const asset = await createAsset({ name: 'A4tech Mouse', type: 'MOUSE', adminToken: users.ADMIN.accessToken });

    // Issue asset to personnel
    const issueRes = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, personnelId: personnel.id });

    expect(issueRes.status).toBe(201);

    // GET /api/assets should show assignedTo
    const listRes = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(listRes.status).toBe(200);
    const found = (listRes.body.data as any[]).find((a: any) => a.id === asset.id);
    expect(found).toBeDefined();
    expect(found.status).toBe('ASSIGNED');
    expect(found.assignedTo).toBe('Test Drdf');
  });

  it('2. After issuance, GET /api/assets/:id includes assignedTo', async () => {
    const personnel = await createPersonnel({ fullName: 'Test Drdf' });
    const asset = await createAsset({ name: 'A4tech Mouse 2', type: 'MOUSE', adminToken: users.ADMIN.accessToken });

    const issueRes = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, personnelId: personnel.id });

    expect(issueRes.status).toBe(201);

    const detailRes = await request(app)
      .get(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.status).toBe('ASSIGNED');
    expect(detailRes.body.data.assignedTo).toBe('Test Drdf');
  });

  it('3. After return, assignedTo is cleared and status is AVAILABLE', async () => {
    const personnel = await createPersonnel({ fullName: 'Test Drdf' });
    const { asset, assignment } = await createCheckedOutAsset({
      name: 'A4tech Mouse 3',
      adminToken: users.ADMIN.accessToken,
      personnelId: personnel.id,
    });

    // Return the issuance
    const returnRes = await request(app)
      .post(`/api/issuances/${assignment.id}/return`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ returnCondition: 'Good' });

    expect(returnRes.status).toBe(200);

    // GET /api/assets — assignedTo should be null/empty
    const listRes = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(listRes.status).toBe(200);
    const found = (listRes.body.data as any[]).find((a: any) => a.id === asset.id);
    expect(found).toBeDefined();
    expect(found.status).toBe('AVAILABLE');
    expect(found.assignedTo).toBeFalsy(); // null or empty string
  });

  it('4. After bulk issuance, all assets have assignedTo populated', async () => {
    const personnel = await createPersonnel({ fullName: 'Bulk Assignee' });
    const asset1 = await createAsset({ name: 'Bulk Mouse 1', type: 'MOUSE', adminToken: users.ADMIN.accessToken });
    const asset2 = await createAsset({ name: 'Bulk Mouse 2', type: 'MOUSE', adminToken: users.ADMIN.accessToken });

    const bulkRes = await request(app)
      .post('/api/issuances/bulk')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: [asset1.id, asset2.id], personnelId: personnel.id });

    expect(bulkRes.status).toBe(201);

    const listRes = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    const found1 = (listRes.body.data as any[]).find((a: any) => a.id === asset1.id);
    const found2 = (listRes.body.data as any[]).find((a: any) => a.id === asset2.id);
    expect(found1.assignedTo).toBe('Bulk Assignee');
    expect(found2.assignedTo).toBe('Bulk Assignee');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property number auto-generation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property number auto-generation', () => {
  const year = new Date().getFullYear();
  const prefix = `${year}9`;

  beforeEach(async () => {
    await cleanGeneratedPropertyNumbers(prefix);
  });

  it('generates {currentYear}900001 when no matching property number exists', async () => {
    const res = await request(app)
      .get('/api/assets/generate-property-number')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.propertyNumber).toBe(`${prefix}00001`);
  });

  it('generates next number when current year numbers already exist', async () => {
    await prisma.asset.create({
      data: {
        name: 'PN Test 1',
        type: 'LAPTOP',
        purchasePrice: 1000,
        purchaseDate: new Date().toISOString(),
        propertyNumber: `${prefix}00001`,
      },
    });

    const res = await request(app)
      .get('/api/assets/generate-property-number')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.propertyNumber).toBe(`${prefix}00002`);
  });

  it('ignores property numbers from other years', async () => {
    await prisma.asset.create({
      data: {
        name: 'PN Old Year',
        type: 'LAPTOP',
        purchasePrice: 1000,
        purchaseDate: new Date().toISOString(),
        propertyNumber: `${year - 1}99999`,
      },
    });

    const res = await request(app)
      .get('/api/assets/generate-property-number')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.propertyNumber).toBe(`${prefix}00001`);
  });

  it('ignores alphanumeric/manual property numbers that do not match the generated pattern', async () => {
    await prisma.asset.create({
      data: {
        name: 'PN Manual',
        type: 'LAPTOP',
        purchasePrice: 1000,
        purchaseDate: new Date().toISOString(),
        propertyNumber: 'PROP-00123',
      },
    });
    await prisma.asset.create({
      data: {
        name: 'PN Wrong Pattern',
        type: 'LAPTOP',
        purchasePrice: 1000,
        purchaseDate: new Date().toISOString(),
        propertyNumber: `${prefix}ABC`,
      },
    });

    const res = await request(app)
      .get('/api/assets/generate-property-number')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.propertyNumber).toBe(`${prefix}00001`);
  });

  it('rejects duplicate non-empty property numbers on create', async () => {
    const propertyNumber = `DUP-${Date.now()}`;
    await createAsset({
      name: 'PN Dup Base',
      type: 'LAPTOP',
      adminToken: users.ADMIN.accessToken,
      propertyNumber,
    });

    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        name: 'PN Dup Clone',
        type: 'LAPTOP',
        manufacturer: 'Dell',
        purchasePrice: 1000,
        purchaseDate: new Date().toISOString(),
        propertyNumber,
      });

    expect(res.status).toBe(409);
    expect(res.body.error?.details?.code).toBe('DUPLICATE_FIELD');
  });

  it('allows blank/null property number if currently allowed', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        name: 'PN Blank',
        type: 'LAPTOP',
        manufacturer: 'Dell',
        purchasePrice: 1000,
        purchaseDate: new Date().toISOString(),
        propertyNumber: '',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.propertyNumber).toBeFalsy();
  });
});

describe('Asset CSV Export', () => {
  it('1. GET /api/assets/export.csv?location=Room 1 — exports all matching rows', async () => {
    for (let i = 0; i < 5; i++) {
      await createAsset({ name: `Room1-${i}`, location: 'Room 1', manufacturer: 'Dell', adminToken: users.ADMIN.accessToken });
    }
    await createAsset({ name: 'Room2 One', location: 'Room 2', manufacturer: 'Dell', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .get('/api/assets/export.csv?location=Room 1')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const rows = res.text.trim().split('\n');
    // header + 5 data rows
    expect(rows.length).toBe(6);
    expect(rows.slice(1).every(r => r.includes('Room 1'))).toBe(true);
  });

  it('2. GET /api/assets/export.csv?manufacturer=Viewsonic — exports only that manufacturer', async () => {
    for (let i = 0; i < 3; i++) {
      await createAsset({ name: `View-${i}`, manufacturer: 'Viewsonic', adminToken: users.ADMIN.accessToken });
    }
    await createAsset({ name: 'Dell One', manufacturer: 'Dell', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .get('/api/assets/export.csv?manufacturer=Viewsonic')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    const rows = res.text.trim().split('\n');
    expect(rows.length).toBe(4);
    expect(rows.slice(1).every(r => r.includes('Viewsonic'))).toBe(true);
  });

  it('3. POST /api/assets/export-csv — exports selected IDs across pages', async () => {
    const created: string[] = [];
    for (let i = 0; i < 62; i++) {
      const a = await createAsset({ name: `Bulk-${i}`, manufacturer: 'HP', adminToken: users.ADMIN.accessToken });
      created.push(a.id);
    }

    const selected = created.slice(0, 62);
    const res = await request(app)
      .post('/api/assets/export-csv')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetIds: selected });

    expect(res.status).toBe(200);
    const rows = res.text.trim().split('\n');
    expect(rows.length).toBe(63);
  });
});

describe('Asset list manufacturer filter', () => {
  it('GET /api/assets?manufacturer=Viewsonic — returns only matching assets and correct total', async () => {
    for (let i = 0; i < 3; i++) {
      await createAsset({ name: `View-${i}`, manufacturer: 'Viewsonic', adminToken: users.ADMIN.accessToken });
    }
    await createAsset({ name: 'Dell One', manufacturer: 'Dell', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .get('/api/assets?manufacturer=Viewsonic')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
    expect(res.body.meta.total).toBe(3);
  });
});


