import { vi } from 'vitest';

// ── AWS S3 mock ──────────────────────────────────────────────────────────────
export const mockS3Send = vi.fn().mockResolvedValue({});
export const mockS3Client = vi.fn().mockImplementation(() => ({
  send: mockS3Send,
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: mockS3Client,
  PutObjectCommand: vi.fn().mockImplementation((input: any) => input),
}));

// ── Google Drive mock ────────────────────────────────────────────────────────
export const mockDriveUpload = vi.fn().mockResolvedValue('https://drive.google.com/file/123');

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn().mockImplementation(() => ({
        getClient: vi.fn().mockResolvedValue({}),
      })),
    },
    drive: vi.fn().mockReturnValue({
      files: {
        create: mockDriveUpload,
      },
    }),
  },
}));

// ── OpenAI-compatible API mock ───────────────────────────────────────────────
export const mockAIFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({
    choices: [{
      message: {
        content: JSON.stringify([
          { type: 'Laptop', manufacturer: 'Apple', confidence: 0.95 },
        ]),
      },
    }],
  }),
});

// Mock the global fetch for AI service
const originalFetch = globalThis.fetch;
export function mockGlobalFetch() {
  globalThis.fetch = mockAIFetch as any;
}
export function restoreGlobalFetch() {
  globalThis.fetch = originalFetch;
}