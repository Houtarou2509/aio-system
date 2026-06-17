import { beforeAll, describe, expect, it, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
let adminToken = '';
const createdTemplateIds: string[] = [];

beforeAll(async () => {
  const hash = await bcrypt.hash('admin123', 4);
  await prisma.user.upsert({
    where: { email: 'admin@aio-system.local' },
    update: { passwordHash: hash, role: 'ADMIN' },
    create: {
      username: 'admin',
      email: 'admin@aio-system.local',
      passwordHash: hash,
      role: 'ADMIN',
      twoFactorEnabled: false,
      backupCodes: '[]',
    },
  });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@aio-system.local', password: 'admin123' });
  adminToken = loginRes.body.data.accessToken;
}, 15_000);

afterAll(async () => {
  for (const id of createdTemplateIds) {
    try {
      await prisma.agreementTemplateVersion.deleteMany({ where: { templateId: id } });
      await prisma.agreementTemplate.delete({ where: { id } });
    } catch {}
  }
  await prisma.$disconnect();
});

describe('Agreement Template signatoryMode HTTP routes', () => {
  it('defaults existing templates to recipientPropertyOfficerAuthorizedRep', async () => {
    // Create a brand-new template without specifying signatoryMode and verify it defaults.
    const res = await request(app)
      .post('/api/agreements/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', `Default Signatory Mode ${Date.now()}`)
      .field('content', 'Hello {{fullName}}')
      .field('isDefault', 'false');

    expect(res.status).toBe(201);
    expect(res.body.data.signatoryMode).toBe('recipientPropertyOfficerAuthorizedRep');
    if (res.body.data.id) createdTemplateIds.push(res.body.data.id);

    // Existing templates from migration backfill also have the same default.
    const listRes = await request(app)
      .get('/api/agreements/templates')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    const templates = listRes.body.data ?? listRes.body;
    expect(templates.every((t: any) => ['recipientOnly', 'recipientPropertyOfficer', 'recipientPropertyOfficerAuthorizedRep'].includes(t.signatoryMode))).toBe(true);
  });

  it('POST /api/agreements/templates stores signatoryMode', async () => {
    const res = await request(app)
      .post('/api/agreements/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Signatory Mode Test')
      .field('content', 'Hello {{fullName}}')
      .field('isDefault', 'false')
      .field('signatoryMode', 'recipientOnly');

    expect(res.status).toBe(201);
    expect(res.body.data.signatoryMode).toBe('recipientOnly');
    if (res.body.data.id) createdTemplateIds.push(res.body.data.id);
  });

  it('PATCH /api/agreements/templates/:id updates signatoryMode and creates a version', async () => {
    const createRes = await request(app)
      .post('/api/agreements/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Signatory Mode Update Test')
      .field('content', 'Hello {{fullName}}')
      .field('isDefault', 'false')
      .field('signatoryMode', 'recipientOnly');

    expect(createRes.status).toBe(201);
    const id = createRes.body.data.id;
    createdTemplateIds.push(id);

    const patchRes = await request(app)
      .patch(`/api/agreements/templates/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('signatoryMode', 'recipientPropertyOfficer');

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.signatoryMode).toBe('recipientPropertyOfficer');

    const versionsRes = await request(app)
      .get(`/api/agreements/templates/${id}/versions`)
      .set('Authorization', `Bearer ${adminToken}`);

    const versions = versionsRes.body.data ?? versionsRes.body;
    expect(versions.length).toBeGreaterThanOrEqual(2);
    expect(versions[0].signatoryMode).toBe('recipientPropertyOfficer');
  });

  it('POST /api/agreements/templates/:id/duplicate preserves signatoryMode', async () => {
    const createRes = await request(app)
      .post('/api/agreements/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Signatory Mode Duplicate Test')
      .field('content', 'Hello {{fullName}}')
      .field('isDefault', 'false')
      .field('signatoryMode', 'recipientPropertyOfficerAuthorizedRep');

    expect(createRes.status).toBe(201);
    const id = createRes.body.data.id;
    createdTemplateIds.push(id);

    const dupRes = await request(app)
      .post(`/api/agreements/templates/${id}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(dupRes.status).toBe(201);
    expect(dupRes.body.data.signatoryMode).toBe('recipientPropertyOfficerAuthorizedRep');
    if (dupRes.body.data.id) createdTemplateIds.push(dupRes.body.data.id);
  });
});
