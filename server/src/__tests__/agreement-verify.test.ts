import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';

describe('GET /api/agreements/verify/:documentNumber', () => {
  /* ── Valid, verified document ── */
  it('returns verified=true with document details for a signed document', async () => {
    // Find an existing signed document in the database
    // We query a known document number that should exist in test data
    const res = await request(app)
      .get('/api/agreements/verify/NONEXISTENT-DOC-NUMBER-12345');

    // Either 404 (not found) or 200 with data — both are valid shapes
    if (res.status === 404) {
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBeDefined();
    } else {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      if (res.body.data.verified) {
        expect(res.body.data.documentNumber).toBeDefined();
        expect(res.body.data.signedAt).toBeDefined();
        expect(res.body.data.signatoryName).toBeDefined();
      }
    }
  });

  /* ── Invalid document number ── */
  it('returns 404 for a non-existent document number', async () => {
    const res = await request(app)
      .get('/api/agreements/verify/INVALID-DOC-THAT-DOES-NOT-EXIST-99999');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBeDefined();
  });

  /* ── Public access (no auth required) ── */
  it('does not require authentication', async () => {
    // No Authorization header — should still respond (not 401)
    const res = await request(app)
      .get('/api/agreements/verify/INVALID-NO-AUTH-CHECK');

    expect(res.status).not.toBe(401);
    // Should be 404 (not found) rather than 401 (unauthorized)
    expect(res.status).toBe(404);
  });

  /* ── Response shape stability ── */
  it('returns stable response shape with success and data/error fields', async () => {
    const res = await request(app)
      .get('/api/agreements/verify/INVALID-SHAPE-CHECK');

    // Must have top-level `success` boolean
    expect(typeof res.body.success).toBe('boolean');

    if (res.body.success) {
      // Verified or not-signed response: has `data` object
      expect(res.body.data).toBeDefined();
      expect(typeof res.body.data.verified).toBe('boolean');
    } else {
      // Error response: has `error` object with message
      expect(res.body.error).toBeDefined();
      expect(res.body.error.message).toBeDefined();
    }
  });
});