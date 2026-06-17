import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app } from '../index';
import { prisma } from '../lib/prisma';

const TEST_USER = { email: 'admin@aio-system.local', password: 'admin123' };
const runId = `agr-sgn-${Date.now()}`;

function makePdfBuffer(): Buffer {
  return Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0x80, 0x80, 0x80, 0x80, 0x0a]);
}

describe('Signed agreement archive', () => {
  let accessToken: string;
  let documentId: string;
  let assignmentId: string;
  let assetId: string;
  let personnelId: string;

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/login').send(TEST_USER);
    accessToken = res.body.data.accessToken;

    const personnel = await prisma.personnel.create({
      data: {
        fullName: `${runId} Signer`,
        email: `${runId}@example.test`,
        status: 'active',
        isReadyForIssuance: true,
      },
    });
    personnelId = personnel.id;

    const asset = await prisma.asset.create({
      data: {
        name: `${runId} Asset`,
        type: 'Laptop',
        serialNumber: `${runId}-SN`,
        propertyNumber: `${runId}-PN`,
        status: 'AVAILABLE',
      },
    });
    assetId = asset.id;

    // Create agreement document directly, linked to asset/personnel
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER.email } });
    const document = await prisma.agreementDocument.create({
      data: {
        documentNumber: `${runId}-AGR-001`,
        title: `${runId} Agreement`,
        resolvedText: 'Test agreement text',
        status: 'issued',
        personnelId,
        personnelNameSnapshot: personnel.fullName,
        assetSnapshot: [{ id: asset.id, name: asset.name, serialNumber: asset.serialNumber, propertyNumber: asset.propertyNumber, condition: 'Good' }],
        issuedById: adminUser.id,
      },
    });
    documentId = document.id;

    const assignment = await prisma.assignment.create({
      data: {
        assetId,
        personnelId,
        assignedTo: personnel.fullName,
        condition: 'Good',
        accountabilityStatus: 'PENDING_SIGNATURE',
        agreementDocumentId: document.id,
      },
    });
    assignmentId = assignment.id;
  });

  afterAll(async () => {
    await prisma.documentArchiveItem.deleteMany({ where: { documentNumber: { startsWith: runId } } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.agreementDocument.deleteMany({ where: { id: documentId } });
    await prisma.asset.deleteMany({ where: { id: assetId } });
    await prisma.personnel.deleteMany({ where: { id: personnelId } });
    const docsDir = path.resolve(__dirname, '../../uploads/documents');
    const signedDir = path.resolve(__dirname, '../../uploads/signed-agreements');
    for (const uploadsDir of [docsDir, signedDir]) {
      if (fs.existsSync(uploadsDir)) {
        for (const f of fs.readdirSync(uploadsDir)) {
          if (f.includes(runId)) fs.unlinkSync(path.join(uploadsDir, f));
        }
      }
    }
  });

  it('creates a SIGNED_AGREEMENT archive item when uploading a signed PDF', async () => {
    const res = await request(app)
      .post(`/api/agreements/documents/${documentId}/signed-copy`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', makePdfBuffer(), { filename: `${runId}.pdf`, contentType: 'application/pdf' });

    expect(res.status).toBe(201);

    const archive = await prisma.documentArchiveItem.findFirst({
      where: { sourceEntityType: 'AgreementDocument', sourceEntityId: documentId, documentType: 'SIGNED_AGREEMENT' },
    });
    expect(archive).toBeTruthy();
    expect(archive?.status).toBe('ACTIVE');
    expect(archive?.assignmentId).toBe(assignmentId);
    expect(archive?.assetId).toBe(assetId);
  });
});
