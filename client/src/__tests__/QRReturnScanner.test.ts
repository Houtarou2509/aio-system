import { describe, expect, it } from 'vitest';
import { parseQRReturnPayload } from '../components/issuances/QRReturnScanner';

describe('parseQRReturnPayload', () => {
  it('routes PROP labels through asset lookup', () => {
    expect(parseQRReturnPayload('PROP:UPPI-001')).toEqual({
      kind: 'assetLookup',
      value: 'PROP:UPPI-001',
    });
  });

  it('routes ASSET labels through asset lookup', () => {
    expect(parseQRReturnPayload('ASSET:0ef19a3d-1c1d-403b-aab4-f7d12cc9bdef')).toEqual({
      kind: 'assetLookup',
      value: 'ASSET:0ef19a3d-1c1d-403b-aab4-f7d12cc9bdef',
    });
  });

  it('extracts asset IDs from asset URLs', () => {
    expect(parseQRReturnPayload('https://example.com/aio-system/assets/abc-123')).toEqual({
      kind: 'assetId',
      value: 'abc-123',
    });
  });

  it('extracts raw UUID asset IDs', () => {
    expect(parseQRReturnPayload('0ef19a3d-1c1d-403b-aab4-f7d12cc9bdef')).toEqual({
      kind: 'assetId',
      value: '0ef19a3d-1c1d-403b-aab4-f7d12cc9bdef',
    });
  });

  it('rejects guest links for the return workflow', () => {
    expect(parseQRReturnPayload('/guest/token123')).toBeNull();
    expect(parseQRReturnPayload('https://example.com/aio-system/guest/token123')).toBeNull();
  });

  it('rejects loose text', () => {
    expect(parseQRReturnPayload('Guest No Owner')).toBeNull();
    expect(parseQRReturnPayload('')).toBeNull();
  });
});
