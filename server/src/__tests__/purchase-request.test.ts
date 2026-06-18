import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { prisma } from '../lib/prisma';

const TEST_USER = { email: 'admin@aio-system.local', password: 'admin123' };
const runId = `pr-${Date.now()}`;

describe('Purchase request conversion archive', () => {
  let accessToken: string;

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/login').send(TEST_USER);
    accessToken = res.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.documentArchiveItem.deleteMany({ where: { documentNumber: { startsWith: runId } } });
    await prisma.asset.deleteMany({ where: { name: { startsWith: runId } } });
    await prisma.purchaseRequest.deleteMany({ where: { assetName: { startsWith: runId } } });
  });

  it('creates a PURCHASE_DOCUMENT archive item when converting to asset', async () => {
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER.email } });
    const pr = await prisma.purchaseRequest.create({
      data: {
        assetName: `${runId} Server`,
        type: 'new',
        reason: 'Capacity expansion',
        status: 'APPROVED',
        requestedById: adminUser.id,
        approvedById: adminUser.id,
      },
    });

    const res = await request(app)
      .post(`/api/purchase-requests/${pr.id}/convert-to-asset`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        propertyNumber: `${runId}-PN`,
        serialNumber: `${runId}-SN`,
      });

    expect(res.status).toBe(201);

    const archive = await prisma.documentArchiveItem.findFirst({
      where: { purchaseRequestId: pr.id, documentType: 'PURCHASE_DOCUMENT' },
    });
    expect(archive).toBeTruthy();
    expect(archive?.assetId).toBe(res.body.data.asset.id);
  });
});
