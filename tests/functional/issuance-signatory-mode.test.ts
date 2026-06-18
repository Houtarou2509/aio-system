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

describe('Issuance PDF signatory modes', () => {
  async function createTemplateWithMode(signatoryMode: string) {
    const res = await request(app)
      .post('/api/agreements/templates')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .field('name', `Signatory Mode ${signatoryMode} ${Date.now()}`)
      .field('content', 'ISSUANCE AGREEMENT\n\nRecipient: {{personnelName}}\nAsset: {{assetName}}')
      .field('isDefault', 'false')
      .field('signatoryMode', signatoryMode)
      .field('defaultPropertyOfficer', 'Property Officer A')
      .field('defaultAuthorizedRep', 'Authorized Rep B');
    expect(res.status).toBe(201);
    return res.body.data;
  }

  it('recipientOnly template renders one signature line in PDF view', async () => {
    const template = await createTemplateWithMode('recipientOnly');
    const personnel = await createPersonnel({ fullName: 'Recipient One' });
    const asset = await createAsset({ name: 'Signatory Asset 1', adminToken: users.ADMIN.accessToken });

    const issueRes = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        assetId: asset.id,
        personnelId: personnel.id,
        agreementId: template.id,
      });
    expect(issueRes.status).toBe(201);

    const doc = await prisma.agreementDocument.findUnique({
      where: { id: issueRes.body.data.agreementDocumentId },
    });
    expect(doc?.signatoryMode).toBe('recipientOnly');

    const pdfRes = await request(app)
      .post('/api/agreements/pdf')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        personnelName: personnel.fullName,
        assetName: asset.name,
        agreementDocumentId: doc?.id,
      });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toBe('application/pdf');

    const docRes = await request(app)
      .get(`/api/agreements/document/${doc?.documentNumber}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`);
    expect(docRes.status).toBe(200);
    expect(docRes.body.data.signatoryMode).toBe('recipientOnly');
  });

  it('recipientPropertyOfficer template renders two signature roles', async () => {
    const template = await createTemplateWithMode('recipientPropertyOfficer');
    const personnel = await createPersonnel({ fullName: 'Recipient Two' });
    const asset = await createAsset({ name: 'Signatory Asset 2', adminToken: users.ADMIN.accessToken });

    const issueRes = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        assetId: asset.id,
        personnelId: personnel.id,
        agreementId: template.id,
      });
    expect(issueRes.status).toBe(201);

    const doc = await prisma.agreementDocument.findUnique({
      where: { id: issueRes.body.data.agreementDocumentId },
    });
    expect(doc?.signatoryMode).toBe('recipientPropertyOfficer');
    expect(doc?.propertyOfficerName).toBe('Property Officer A');
    expect(doc?.authorizedRepName).toBeFalsy();
  });

  it('recipientPropertyOfficerAuthorizedRep template renders three signature roles', async () => {
    const template = await createTemplateWithMode('recipientPropertyOfficerAuthorizedRep');
    const personnel = await createPersonnel({ fullName: 'Recipient Three' });
    const asset = await createAsset({ name: 'Signatory Asset 3', adminToken: users.ADMIN.accessToken });

    const issueRes = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        assetId: asset.id,
        personnelId: personnel.id,
        agreementId: template.id,
      });
    expect(issueRes.status).toBe(201);

    const doc = await prisma.agreementDocument.findUnique({
      where: { id: issueRes.body.data.agreementDocumentId },
    });
    expect(doc?.signatoryMode).toBe('recipientPropertyOfficerAuthorizedRep');
    expect(doc?.propertyOfficerName).toBe('Property Officer A');
    expect(doc?.authorizedRepName).toBe('Authorized Rep B');
  });

  it('document snapshot preserves signatoryMode even after template changes', async () => {
    const template = await createTemplateWithMode('recipientOnly');
    const personnel = await createPersonnel({ fullName: 'Recipient Snapshot' });
    const asset = await createAsset({ name: 'Snapshot Asset', adminToken: users.ADMIN.accessToken });

    const issueRes = await request(app)
      .post('/api/issuances')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({
        assetId: asset.id,
        personnelId: personnel.id,
        agreementId: template.id,
      });
    expect(issueRes.status).toBe(201);
    const docId = issueRes.body.data.agreementDocumentId;

    await request(app)
      .patch(`/api/agreements/templates/${template.id}`)
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .field('signatoryMode', 'recipientPropertyOfficerAuthorizedRep');

    const doc = await prisma.agreementDocument.findUnique({ where: { id: docId } });
    expect(doc?.signatoryMode).toBe('recipientOnly');
  });
});
