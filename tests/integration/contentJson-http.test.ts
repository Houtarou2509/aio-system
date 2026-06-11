/**
 * HTTP-level tests for contentJson handling in the Agreement Template routes.
 *
 * These tests exercise the real Express app with supertest to verify:
 * - contentJson sent as a JSON string in multipart/form-data is stored as a JSON object
 * - invalid contentJson shapes return clear 400 errors
 * - templates without contentJson still work (backward compatibility)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

let adminToken = '';
const createdTemplateIds: string[] = [];

beforeAll(async () => {
  // Seed admin user
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

  // Login
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@aio-system.local', password: 'admin123' });
  adminToken = loginRes.body.data.accessToken;
}, 15_000);

afterAll(async () => {
  // Clean up created templates
  for (const id of createdTemplateIds) {
    try {
      await prisma.agreementTemplateVersion.deleteMany({ where: { templateId: id } });
      await prisma.agreementTemplate.delete({ where: { id } });
    } catch {}
  }
  await prisma.$disconnect();
});

describe('Agreement Template contentJson HTTP routes', () => {
  const validContentJson = JSON.stringify({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello ' }, { type: 'variable', attrs: { name: 'fullName', label: 'Full Name' } }] },
    ],
  });

  it('POST /api/agreements/templates stores contentJson as JSON object (not string)', async () => {
    const res = await request(app)
      .post('/api/agreements/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'ContentJson HTTP Test')
      .field('content', 'Hello {{fullName}}')
      .field('contentJson', validContentJson)
      .field('isDefault', 'false');

    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.contentJson).toBeDefined();
    expect(typeof res.body.data.contentJson).toBe('object');
    expect(res.body.data.contentJson).not.toBeInstanceOf(Array);
    expect(res.body.data.contentJson.type).toBe('doc');
    expect(Array.isArray(res.body.data.contentJson.content)).toBe(true);

    if (res.body.data.id) createdTemplateIds.push(res.body.data.id);
  });

  it('POST /api/agreements/templates with invalid contentJson returns 400', async () => {
    const res = await request(app)
      .post('/api/agreements/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Bad ContentJson Test')
      .field('content', 'test')
      .field('contentJson', 'not valid json{{{')
      .field('isDefault', 'false');

    expect(res.status).toBe(400);
    const errorMsg = res.body.error?.message || res.body.message || res.body.error || '';
    expect(errorMsg).toContain('malformed JSON');
  });

  it('POST /api/agreements/templates with array contentJson returns 400', async () => {
    const res = await request(app)
      .post('/api/agreements/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Array ContentJson Test')
      .field('content', 'test')
      .field('contentJson', '[1,2,3]')
      .field('isDefault', 'false');

    expect(res.status).toBe(400);
    const errorMsg = res.body.error?.message || res.body.message || res.body.error || '';
    expect(errorMsg).toContain('doc');
  });

  it('POST /api/agreements/templates without contentJson still works', async () => {
    const res = await request(app)
      .post('/api/agreements/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'No ContentJson Test')
      .field('content', 'Plain text template')
      .field('isDefault', 'false');

    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
    // contentJson should be null when not provided
    expect(res.body.data.contentJson).toBeNull();

    if (res.body.data.id) createdTemplateIds.push(res.body.data.id);
  });

  it('PATCH /api/agreements/templates/:id updates contentJson and preserves JSON type', async () => {
    // Create first
    const createRes = await request(app)
      .post('/api/agreements/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Patch ContentJson Test')
      .field('content', 'Original')
      .field('isDefault', 'false');

    expect(createRes.status).toBe(201);
    const templateId = createRes.body.data.id;
    createdTemplateIds.push(templateId);

    // Patch with contentJson
    const updatedJson = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated ' }, { type: 'variable', attrs: { name: 'date', label: 'Date' } }] }],
    });

    const patchRes = await request(app)
      .patch(`/api/agreements/templates/${templateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('contentJson', updatedJson)
      .field('content', 'Updated {{date}}');

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.contentJson).toBeDefined();
    expect(typeof patchRes.body.data.contentJson).toBe('object');
    expect(patchRes.body.data.contentJson.type).toBe('doc');
  });
});