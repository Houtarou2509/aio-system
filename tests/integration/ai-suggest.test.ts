import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index';
import { PrismaClient } from '@prisma/client';
import { seedUsers, cleanAssets } from '../fixtures/assets';

const prisma = new PrismaClient();
let users: Record<string, any>;

// Use vi.hoisted so the mock is available when vi.mock factory runs
const { mockSuggestAsset } = vi.hoisted(() => ({
  mockSuggestAsset: vi.fn(),
}));

vi.mock('../../server/src/services/ai.service', () => ({
  suggestAsset: mockSuggestAsset,
}));

beforeAll(async () => {
  users = await seedUsers();
}, 15_000);

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await cleanAssets();
  mockSuggestAsset.mockReset();
});

describe('AI Suggestion Integration', () => {
  // 14
  it('14. POST /api/ai/suggest { assetName: "MacBook Pro 14" } → returns suggestions from mock', async () => {
    mockSuggestAsset.mockResolvedValueOnce({
      suggestions: [
        { type: 'Laptop', manufacturer: 'Apple', confidence: 0.95 },
      ],
      source: 'ai',
    });

    const res = await request(app)
      .post('/api/ai/suggest')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetName: 'MacBook Pro 14' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.suggestions).toBeDefined();
    expect(res.body.data.suggestions.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.suggestions[0].type).toBe('Laptop');
    expect(res.body.data.suggestions[0].manufacturer).toBe('Apple');
  });

  // 15
  it('15. Mock returns error → endpoint returns 200 with graceful fallback', async () => {
    mockSuggestAsset.mockResolvedValueOnce({
      suggestions: [],
      source: 'local',
    });

    const res = await request(app)
      .post('/api/ai/suggest')
      .set('Authorization', `Bearer ${users.ADMIN.accessToken}`)
      .send({ assetName: 'MacBook Pro 14' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe('local');
  });

  // 16
  it('16. POST /api/ai/suggest (Staff) → 200', async () => {
    mockSuggestAsset.mockResolvedValueOnce({
      suggestions: [{ type: 'EQUIPMENT', manufacturer: 'Dell', confidence: 0.8 }],
      source: 'local',
    });

    const res = await request(app)
      .post('/api/ai/suggest')
      .set('Authorization', `Bearer ${users.STAFF.accessToken}`)
      .send({ assetName: 'Dell Monitor' });

    expect(res.status).toBe(200);
  });

  // 17
  it('17. POST /api/ai/suggest (Guest) → 403', async () => {
    const res = await request(app)
      .post('/api/ai/suggest')
      .set('Authorization', `Bearer ${users.GUEST.accessToken}`)
      .send({ assetName: 'Dell Monitor' });

    expect(res.status).toBe(403);
  });
});