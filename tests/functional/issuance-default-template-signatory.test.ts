import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { seedUsers, createPersonnel, createAsset } from '../fixtures/assets';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let users: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  users = await seedUsers();
}, 30_000);

describe('Issuance default template signatory fallback', () => {
  async function makeDefaultTemplate(signatoryMode: string, officer?: string, rep?: string) {
    // Un-default any existing default templates
    const existingDefaults = await prisma.agreementTemplate.findMany({ where: { isDefault: true } });
    for (const t of existingDefaults) {
      await prisma.agreementTemplate.update({ where: { id: t.id }, data: { isDefault: false } });
    }

    const res = await request(app)
      .post('/api/agreements/templates')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .field('name', `Default ${signatoryMode} ${Date.now()}`)
      .field('content', 'ISSUANCE AGREEMENT\n\nRecipient: {{personnelName}}\nAsset: {{assetName}}')
      .field('isDefault', 'true')
      .field('signatoryMode', signatoryMode)
      .field('defaultPropertyOfficer', officer || '')
      .field('defaultAuthorizedRep', rep || '');

    expect(res.status).toBe(201);
    return res.body.data;
  }

  it('single issuance with default recipientOnly template snapshots recipientOnly without signatory names', async () => {
    await makeDefaultTemplate('recipientOnly');
    const personnel = await createPersonnel({ fullName: 'Default Recipient Only' });
    const asset = await createAsset({ name: 'Default Sig Asset 1', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, personnelId: personnel.id });

    expect(res.status).toBe(201);
    const doc = await prisma.agreementDocument.findUnique({
      where: { id: res.body.data.agreementDocumentId },
    });
    expect(doc?.signatoryMode).toBe('recipientOnly');
    expect(doc?.propertyOfficerName).toBeFalsy();
    expect(doc?.authorizedRepName).toBeFalsy();
  });

  it('single issuance with default recipientPropertyOfficer template snapshots property officer only', async () => {
    await makeDefaultTemplate('recipientPropertyOfficer', 'Default Officer');
    const personnel = await createPersonnel({ fullName: 'Default Recipient PO' });
    const asset = await createAsset({ name: 'Default Sig Asset 2', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetId: asset.id, personnelId: personnel.id });

    expect(res.status).toBe(201);
    const doc = await prisma.agreementDocument.findUnique({
      where: { id: res.body.data.agreementDocumentId },
    });
    expect(doc?.signatoryMode).toBe('recipientPropertyOfficer');
    expect(doc?.propertyOfficerName).toBe('Default Officer');
    expect(doc?.authorizedRepName).toBeFalsy();
  });

  it('bulk issuance with default recipientOnly template snapshots recipientOnly', async () => {
    await makeDefaultTemplate('recipientOnly');
    const personnel = await createPersonnel({ fullName: 'Bulk Default Recipient' });
    const asset = await createAsset({ name: 'Bulk Default Sig Asset', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/issuances/bulk')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        assetIds: [asset.id],
        personnelId: personnel.id,
        condition: 'Good',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.assignments.length).toBe(1);
    const doc = await prisma.agreementDocument.findUnique({
      where: { id: res.body.data.agreementDocumentId },
    });
    expect(doc?.signatoryMode).toBe('recipientOnly');
    expect(doc?.propertyOfficerName).toBeFalsy();
    expect(doc?.authorizedRepName).toBeFalsy();
  });

  it('bulk issuance with default recipientPropertyOfficer template snapshots property officer only', async () => {
    await makeDefaultTemplate('recipientPropertyOfficer', 'Bulk Default Officer');
    const personnel = await createPersonnel({ fullName: 'Bulk Default PO Recipient' });
    const asset = await createAsset({ name: 'Bulk Default PO Asset', adminToken: users.ADMIN.accessToken });

    const res = await request(app)
      .post('/api/issuances/bulk')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        assetIds: [asset.id],
        personnelId: personnel.id,
        condition: 'Good',
      });

    expect(res.status).toBe(201);
    const doc = await prisma.agreementDocument.findUnique({
      where: { id: res.body.data.agreementDocumentId },
    });
    expect(doc?.signatoryMode).toBe('recipientPropertyOfficer');
    expect(doc?.propertyOfficerName).toBe('Bulk Default Officer');
    expect(doc?.authorizedRepName).toBeFalsy();
  });
});
