import { parseGuestToken } from '../components/assets/QRScannerModal';

describe('parseGuestToken', () => {
  // ── Internal QR payloads must NEVER be treated as guest links ──
  it('returns null for PROP: propertyNumber', () => {
    expect(parseGuestToken('PROP:1234567')).toBeNull();
  });

  it('returns null for PROP: with hyphens', () => {
    expect(parseGuestToken('PROP:PROP-SECRET')).toBeNull();
  });

  it('returns null for ASSET: with UUID', () => {
    expect(parseGuestToken('ASSET:0ef19a3d-1c1d-403b-aab4-f7d12cc9bdef')).toBeNull();
  });

  // ── "Guest" as text content must not match ──
  it('returns null for plain text containing "Guest"', () => {
    expect(parseGuestToken('Guest No Owner')).toBeNull();
  });

  it('returns null for "guest" as a word', () => {
    expect(parseGuestToken('this is a guest link')).toBeNull();
  });

  it('returns null for loose substring "guest/x"', () => {
    expect(parseGuestToken('something guest/abc end')).toBeNull();
  });

  // ── Valid guest link paths ──
  it('extracts token from /guest/token123', () => {
    expect(parseGuestToken('/guest/token123')).toBe('token123');
  });

  it('extracts token from /aio-system/guest/token123', () => {
    expect(parseGuestToken('/aio-system/guest/token123')).toBe('token123');
  });

  it('extracts token from full URL with aio-system base', () => {
    expect(parseGuestToken('https://example.com/aio-system/guest/abc123')).toBe('abc123');
  });

  it('extracts token from full URL without base path', () => {
    expect(parseGuestToken('https://example.com/guest/abc123')).toBe('abc123');
  });

  // ── Edge cases ──
  it('trims whitespace before parsing', () => {
    expect(parseGuestToken('  /guest/token123  ')).toBe('token123');
  });

  it('returns null for empty string', () => {
    expect(parseGuestToken('')).toBeNull();
  });

  it('returns null for /guest/ without token', () => {
    expect(parseGuestToken('/guest/')).toBeNull();
  });

  it('returns null for /guest/ with trailing slash (extra path segment)', () => {
    expect(parseGuestToken('/guest/abc/')).toBeNull();
  });
});