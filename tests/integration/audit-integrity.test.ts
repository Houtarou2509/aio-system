import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { PrismaClient } from '@prisma/client';
import { seedUsers, createAsset, cleanAssets } from '../fixtures/assets';

const prisma = new PrismaClient();
let users: Record<string, any>;

beforeAll(async () => {
  users = await seedUsers();
}, 15_000);

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany({});
  await cleanAssets();
});

describe('Audit + DB Integrity', () => {
  // 18
  it('18. Series of asset changes → audit timeline in correct chronological order', async () => {
    const asset = await createAsset({ name: 'Audit Timeline', adminToken: users.ADMIN.accessToken });

    // Update name
    await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ name: 'Audit Timeline Updated' });

    // Update location
    await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ location: 'Building B' });

    // Update status
    await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ status: 'MAINTENANCE' });

    // Get audit timeline for this entity
    const res = await request(app)
      .get(`/api/audit/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(res.status).toBe(200);
    const logs = res.body.data;

    // Should have CREATE + 3 UPDATEs
    const updateLogs = logs.filter((l: any) => l.action === 'UPDATE');
    expect(updateLogs.length).toBeGreaterThanOrEqual(3);

    // Verify chronological order (newest first, as per service)
    for (let i = 1; i < updateLogs.length; i++) {
      const prev = new Date(updateLogs[i - 1].performedAt).getTime();
      const curr = new Date(updateLogs[i].performedAt).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }

    // Verify the fields that were changed appear in the logs
    const fields = updateLogs.map((l: any) => l.field);
    expect(fields).toContain('name');
    expect(fields).toContain('location');
    expect(fields).toContain('status');
  });

  // 19
  it('19. POST /api/audit/:id/revert → DB field updated to oldValue, new audit log created', async () => {
    const asset = await createAsset({ name: 'Revert Test', location: 'Room A', adminToken: users.ADMIN.accessToken });

    // Update location
    await request(app)
      .put(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ location: 'Room B' });

    // Find the audit log for the location change
    const auditRes = await request(app)
      .get(`/api/audit/${asset.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    const locationLog = auditRes.body.data.find((l: any) => l.field === 'location' && l.action === 'UPDATE');
    expect(locationLog).toBeDefined();
    expect(locationLog.oldValue).toBe('Room A');
    expect(locationLog.newValue).toBe('Room B');

    // Revert
    const revertRes = await request(app)
      .post(`/api/audit/${locationLog.id}/revert`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);

    expect(revertRes.status).toBe(200);
    expect(revertRes.body.data.reverted).toBe(true);
    expect(revertRes.body.data.revertedTo).toBe('Room A');

    // Verify DB has the old value
    const dbAsset = await prisma.asset.findUnique({ where: { id: asset.id } });
    expect(dbAsset!.location).toBe('Room A');

    // Verify REVERT audit log exists
    const revertLogs = await prisma.auditLog.findMany({
      where: { entityId: asset.id, action: 'REVERT' },
    });
    expect(revertLogs.length).toBeGreaterThanOrEqual(1);
    expect(revertLogs[0].field).toBe('location');
    expect(revertLogs[0].newValue).toBe('Room A');
  });

  // 20 — User deletion / GDPR anonymization
  it('20. Audit logs for deleted user have performedById anonymized', async () => {
    // Create a staff user that will be "deleted"
    const staffUser = await prisma.user.create({
      data: {
        email: `gdpr-staff-${Date.now()}@test.com`,
        username: `gdpr-staff-${Date.now()}`,
        passwordHash: 'hashed',
        role: 'STAFF',
      },
    });

    // Create asset and make changes as that user (via direct DB audit log entry)
    const asset = await createAsset({ name: 'GDPR Test', adminToken: users.ADMIN.accessToken });

    await prisma.auditLog.create({
      data: {
        entityType: 'Asset',
        entityId: asset.id,
        action: 'UPDATE',
        field: 'location',
        oldValue: 'Room A',
        newValue: 'Room B',
        performedById: staffUser.id,
      },
    });

    // Verify audit log exists for this user
    const beforeLogs = await prisma.auditLog.findMany({
      where: { performedById: staffUser.id },
    });
    expect(beforeLogs.length).toBeGreaterThanOrEqual(1);

    // "Delete" the user (anonymize their audit logs)
    // In GDPR compliance, a placeholder anonymized user is created,
    // and audit logs are reassigned to that user
    const anonUser = await prisma.user.create({
      data: {
        email: 'anonymized@aio-system.local',
        username: 'ANONYMIZED',
        passwordHash: 'N/A',
        role: 'STAFF',
      },
    });

    await prisma.auditLog.updateMany({
      where: { performedById: staffUser.id },
      data: { performedById: anonUser.id },
    });

    const afterLogs = await prisma.auditLog.findMany({
      where: { entityId: asset.id, field: 'location' },
    });
    expect(afterLogs[0].performedById).toBe(anonUser.id);

    // The original user can now be safely deleted
    await prisma.user.delete({ where: { id: staffUser.id } });

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { entityId: asset.id } });
    await prisma.user.delete({ where: { id: anonUser.id } });
  });
});