import { describe, expect, it } from 'vitest';
import { generateAgreementText } from '../services/issuance.service';

describe('generateAgreementText secondarySignatoryTitle', () => {
  const baseParams = {
    personnelName: 'Juan Dela Cruz',
    designation: 'Software Engineer',
    project: 'AIO System',
    assetName: 'Dell Latitude 5540',
    serialNumber: 'SN-001',
    propertyNumber: 'PN-001',
    date: '2026-07-01',
  };

  it('falls back to "Property Officer" when secondarySignatoryTitle is absent', () => {
    const text = generateAgreementText(baseParams);
    expect(text).toContain('Property Officer');
    expect(text).not.toContain('Authorized Signatory');
  });

  it('uses the configured secondarySignatoryTitle in the signature block', () => {
    const text = generateAgreementText({ ...baseParams, secondarySignatoryTitle: 'Authorized Signatory' });
    expect(text).toContain('Authorized Signatory');
    expect(text).not.toContain('\nProperty Officer\n');
  });

  it('uses the configured secondarySignatoryTitle in the terms and conditions', () => {
    const text = generateAgreementText({ ...baseParams, secondarySignatoryTitle: 'Custodian' });
    expect(text).toContain('reported immediately to the Custodian');
  });

  it('falls back to "Property Officer" for empty-string secondarySignatoryTitle', () => {
    const text = generateAgreementText({ ...baseParams, secondarySignatoryTitle: '   ' });
    expect(text).toContain('reported immediately to the Property Officer');
    expect(text).toContain('\nProperty Officer\n');
  });

  it('uses "Person In Charge" in both terms and signature block', () => {
    const text = generateAgreementText({ ...baseParams, secondarySignatoryTitle: 'Person In Charge' });
    expect(text).toContain('reported immediately to the Person In Charge');
    expect(text).toContain('\nPerson In Charge\n');
  });
});