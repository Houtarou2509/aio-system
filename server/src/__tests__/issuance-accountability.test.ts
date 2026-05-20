import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../lib/prisma';
import { bulkIssueAssets, createIssuance, returnIssuance, signIssuance } from '../services/issuance.service';

const runId = `phase1-${Date.now()}`;
let counter = 0;

async function createActor() {
  counter += 1;
  return prisma.user.create({
    data: {
      username: `${runId}-actor-${counter}`,
      email: `${runId}-actor-${counter}@example.test`,
      passwordHash: 'test-hash',
      role: 'ADMIN',
      permissions: '[]',
    },
  });
}

async function createReadyPersonnel() {
  counter += 1;
  return prisma.personnel.create({
    data: {
      fullName: `${runId} Personnel ${counter}`,
      email: `${runId}-personnel-${counter}@example.test`,
      status: 'active',
      designation: 'Research Staff',
      project: 'Accountability Phase 1',
      isReadyForIssuance: true,
    },
  });
}

async function createAvailableAsset(name = 'Accountability Laptop') {
  counter += 1;
  return prisma.asset.create({
    data: {
      name: `${runId} ${name} ${counter}`,
      type: 'Laptop',
      serialNumber: `${runId}-SN-${counter}`,
      propertyNumber: `${runId}-PN-${counter}`,
      status: 'AVAILABLE',
    },
  });
}

describe('Phase 1 accountability lifecycle', () => {
  let actorId: string;

  beforeEach(async () => {
    const actor = await createActor();
    actorId = actor.id;
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { performedById: actorId } });
    await prisma.assignment.deleteMany({ where: { assignedTo: { startsWith: runId } } });
    await prisma.agreementDocument.deleteMany({ where: { personnelNameSnapshot: { startsWith: runId } } });
    await prisma.asset.deleteMany({ where: { name: { startsWith: runId } } });
    await prisma.personnel.deleteMany({ where: { fullName: { startsWith: runId } } });
    await prisma.user.deleteMany({ where: { id: actorId } });
  });

  it('creates new accountability records as pending signature with issue condition snapshots', async () => {
    const personnel = await createReadyPersonnel();
    const asset = await createAvailableAsset();

    const assignment = await createIssuance(
      {
        assetId: asset.id,
        personnelId: personnel.id,
        condition: 'Excellent',
        notes: 'Issued for official use',
      },
      actorId,
    );

    expect(assignment.accountabilityStatus).toBe('PENDING_SIGNATURE');
    expect(assignment.conditionAtIssue).toBe('Excellent');
    expect(assignment.conditionAtReturn).toBeNull();
    expect(assignment.accountabilityClosedAt).toBeNull();

    const updatedAsset = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(updatedAsset.status).toBe('ASSIGNED');
  });

  it('signing an accountability record activates every item in the batch', async () => {
    const personnel = await createReadyPersonnel();
    const firstAsset = await createAvailableAsset('Batch Laptop');
    const secondAsset = await createAvailableAsset('Batch Printer');

    const result = await bulkIssueAssets(
      {
        personnelId: personnel.id,
        assetIds: [firstAsset.id, secondAsset.id],
        condition: 'Good',
      },
      actorId,
    );

    expect(result.assignments).toHaveLength(2);
    expect(result.assignments.every((item) => item.accountabilityStatus === 'PENDING_SIGNATURE')).toBe(true);

    await signIssuance(result.assignments[0].id, personnel.fullName, actorId);

    const signedAssignments = await prisma.assignment.findMany({
      where: { bulkBatchId: result.assignments[0].bulkBatchId },
      orderBy: { assignedAt: 'asc' },
    });

    expect(signedAssignments).toHaveLength(2);
    expect(signedAssignments.every((item) => item.accountabilityStatus === 'ACTIVE')).toBe(true);
    expect(signedAssignments.every((item) => item.recipientSignedAt)).toBe(true);
  });

  it('returning a good asset closes accountability and makes the asset available', async () => {
    const personnel = await createReadyPersonnel();
    const asset = await createAvailableAsset();
    const assignment = await createIssuance({ assetId: asset.id, personnelId: personnel.id, condition: 'Good' }, actorId);

    const returned = await returnIssuance(assignment.id, 'Good', actorId, undefined, undefined, false, 'Complete set returned');

    expect(returned.accountabilityStatus).toBe('RETURNED');
    expect(returned.conditionAtReturn).toBe('Good');
    expect(returned.returnRemarks).toBe('Complete set returned');
    expect(returned.accountabilityClosedAt).toBeTruthy();

    const updatedAsset = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(updatedAsset.status).toBe('AVAILABLE');
  });

  it('returning a damaged or lost asset does not make it available', async () => {
    const personnel = await createReadyPersonnel();
    const damagedAsset = await createAvailableAsset('Damaged Laptop');
    const lostAsset = await createAvailableAsset('Lost Tablet');
    const damagedAssignment = await createIssuance({ assetId: damagedAsset.id, personnelId: personnel.id, condition: 'Good' }, actorId);
    const lostAssignment = await createIssuance({ assetId: lostAsset.id, personnelId: personnel.id, condition: 'Good' }, actorId);

    await returnIssuance(damagedAssignment.id, 'Damaged - cracked display', actorId);
    await returnIssuance(lostAssignment.id, 'Lost', actorId);

    const updatedDamagedAsset = await prisma.asset.findUniqueOrThrow({ where: { id: damagedAsset.id } });
    const updatedLostAsset = await prisma.asset.findUniqueOrThrow({ where: { id: lostAsset.id } });

    expect(updatedDamagedAsset.status).toBe('MAINTENANCE');
    expect(updatedLostAsset.status).toBe('LOST');
  });
});
