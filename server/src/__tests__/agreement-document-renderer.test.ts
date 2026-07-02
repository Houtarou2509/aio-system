import { describe, expect, it } from 'vitest';
import { buildAgreementDocumentView } from '../services/agreementDocumentRenderer.service';

describe('agreement document structured renderer', () => {
  it('separates body text, assets, recipient, and signatures from a legacy saved snapshot', () => {
    const view = buildAgreementDocumentView({
      title: 'LSAHP TITLE',
      documentNumber: 'AGR-20260520-31LN79',
      personnelName: 'Angelo DeLos Santos',
      designation: 'Field Interviewer',
      institution: 'DRDF Inc.',
      project: 'LSAHP 2026',
      condition: 'Good',
      agreementText: [
        'LSAHP LETTER BODY',
        'May 20, 2026 Angelo DeLos Santos, Field Interviewer of DRDF Inc., (LSAHP 2026) PN-2023-001 No.  Asset Name                 Serial Number          Property Number        Condition',
        '───  ─────────────────────────  ─────────────────────  ─────────────────────  ─────────',
        '1    Canon imageRUNNER C3530   CAN-IR-C3530          PN-2023-001           Good',
        '2    Lenovo ThinkCentre M90q   LEN-M90Q-001          PN-2025-004           Good',
        'By signing below, the recipient acknowledges receipt.',
        '________________________________________',
        'Angelo DeLos Santos (Recipient)',
      ].join('\n'),
      assets: [
        { name: 'Canon imageRUNNER C3530', serialNumber: 'CAN-IR-C3530', propertyNumber: 'PN-2023-001' },
        { name: 'Lenovo ThinkCentre M90q', serialNumber: 'LEN-M90Q-001', propertyNumber: 'PN-2025-004' },
      ],
      propertyOfficerName: 'Property Officer A',
      authorizedRepName: 'Authorized Rep B',
    });

    expect(view.title).toBe('LSAHP TITLE');
    expect(view.documentNumber).toBe('AGR-20260520-31LN79');
    expect(view.recipient).toEqual({
      name: 'Angelo DeLos Santos',
      designation: 'Field Interviewer',
      institution: 'DRDF Inc.',
      project: 'LSAHP 2026',
    });
    expect(view.assets).toEqual([
      { no: 1, name: 'Canon imageRUNNER C3530', serialNumber: 'CAN-IR-C3530', propertyNumber: 'PN-2023-001', condition: 'Good' },
      { no: 2, name: 'Lenovo ThinkCentre M90q', serialNumber: 'LEN-M90Q-001', propertyNumber: 'PN-2025-004', condition: 'Good' },
    ]);
    expect(view.bodyText).toContain('LSAHP LETTER BODY');
    expect(view.bodyText).not.toContain('%%%');
    expect(view.bodyText).not.toContain('───');
    expect(view.bodyText).not.toContain('No.  Asset Name');
    expect(view.bodyText).not.toContain('Canon imageRUNNER C3530   CAN-IR-C3530');
    expect(view.bodyText).not.toContain('By signing below');
    expect(view.signatures).toHaveLength(3);
    expect(view.signatures[0]).toMatchObject({ role: 'Recipient', label: 'Angelo DeLos Santos' });
    expect(view.signatures[1]).toMatchObject({ role: 'Property Officer', label: 'Property Officer A' });
    expect(view.signatures[2]).toMatchObject({ role: 'Authorized Representative', label: 'Authorized Rep B' });
  });

  it('derives assets from single-asset fields when no assets array is supplied', () => {
    const view = buildAgreementDocumentView({
      personnelName: 'Juan Dela Cruz',
      assetName: 'Dell Latitude 5540',
      serialNumber: 'SN-001',
      propertyNumber: 'PN-001',
      condition: 'Excellent',
      agreementText: 'Official accountability body text.',
    });

    expect(view.assets).toEqual([
      { no: 1, name: 'Dell Latitude 5540', serialNumber: 'SN-001', propertyNumber: 'PN-001', condition: 'Excellent' },
    ]);
    expect(view.bodyText).toBe('Official accountability body text.');
  });

  it('renders only one signature for recipientOnly mode', () => {
    const view = buildAgreementDocumentView({
      personnelName: 'Juan Dela Cruz',
      signatoryMode: 'recipientOnly',
      propertyOfficerName: 'Officer A',
      authorizedRepName: 'Rep B',
    });

    expect(view.signatures).toHaveLength(1);
    expect(view.signatures[0].role).toBe('Recipient');
  });

  it('renders two signatures for recipientPropertyOfficer mode', () => {
    const view = buildAgreementDocumentView({
      personnelName: 'Juan Dela Cruz',
      signatoryMode: 'recipientPropertyOfficer',
      propertyOfficerName: 'Officer A',
      authorizedRepName: 'Rep B',
    });

    expect(view.signatures).toHaveLength(2);
    expect(view.signatures.map(s => s.role)).toEqual(['Recipient', 'Property Officer']);
  });

  it('renders three signatures for recipientPropertyOfficerAuthorizedRep mode', () => {
    const view = buildAgreementDocumentView({
      personnelName: 'Juan Dela Cruz',
      signatoryMode: 'recipientPropertyOfficerAuthorizedRep',
      propertyOfficerName: 'Officer A',
      authorizedRepName: 'Rep B',
    });

    expect(view.signatures).toHaveLength(3);
    expect(view.signatures.map(s => s.role)).toEqual(['Recipient', 'Property Officer', 'Authorized Representative']);
  });

  // ─── secondarySignatoryTitle tests ───

  it('falls back to "Property Officer" when secondarySignatoryTitle is absent', () => {
    const view = buildAgreementDocumentView({
      personnelName: 'Juan Dela Cruz',
      signatoryMode: 'recipientPropertyOfficer',
      propertyOfficerName: 'Officer A',
    });

    expect(view.signatures).toHaveLength(2);
    expect(view.signatures[1].role).toBe('Property Officer');
    expect(view.signatures[1].subtitle).toBe('Property Officer');
  });

  it('uses secondarySignatoryTitle for role and subtitle when provided', () => {
    const view = buildAgreementDocumentView({
      personnelName: 'Juan Dela Cruz',
      signatoryMode: 'recipientPropertyOfficer',
      propertyOfficerName: 'Toyota Gazoo',
      secondarySignatoryTitle: 'Authorized Signatory',
    });

    expect(view.signatures).toHaveLength(2);
    expect(view.signatures[1].role).toBe('Authorized Signatory');
    expect(view.signatures[1].subtitle).toBe('Authorized Signatory');
    expect(view.signatures[1].label).toBe('Toyota Gazoo');
  });

  it('uses secondarySignatoryTitle in recipientPropertyOfficerAuthorizedRep mode', () => {
    const view = buildAgreementDocumentView({
      personnelName: 'Juan Dela Cruz',
      signatoryMode: 'recipientPropertyOfficerAuthorizedRep',
      propertyOfficerName: 'Toyota Gazoo',
      authorizedRepName: 'Rep B',
      secondarySignatoryTitle: 'Person In Charge',
    });

    expect(view.signatures).toHaveLength(3);
    expect(view.signatures[1].role).toBe('Person In Charge');
    expect(view.signatures[1].subtitle).toBe('Person In Charge');
    expect(view.signatures[2].role).toBe('Authorized Representative');
  });

  it('trims whitespace from secondarySignatoryTitle', () => {
    const view = buildAgreementDocumentView({
      personnelName: 'Juan Dela Cruz',
      signatoryMode: 'recipientPropertyOfficer',
      propertyOfficerName: 'Officer A',
      secondarySignatoryTitle: '  Custodian  ',
    });

    expect(view.signatures[1].role).toBe('Custodian');
  });

  it('falls back to "Property Officer" for empty-string secondarySignatoryTitle', () => {
    const view = buildAgreementDocumentView({
      personnelName: 'Juan Dela Cruz',
      signatoryMode: 'recipientPropertyOfficer',
      propertyOfficerName: 'Officer A',
      secondarySignatoryTitle: '   ',
    });

    expect(view.signatures[1].role).toBe('Property Officer');
  });

  // --- firstSignatoryTitle tests ---

  it('falls back to "Authorized Representative" when firstSignatoryTitle is absent', () => {
    const view = buildAgreementDocumentView({
      personnelName: 'Juan Dela Cruz',
      signatoryMode: 'recipientPropertyOfficerAuthorizedRep',
      propertyOfficerName: 'Officer A',
      authorizedRepName: 'Rep B',
    });

    expect(view.signatures).toHaveLength(3);
    expect(view.signatures[2].role).toBe('Authorized Representative');
    expect(view.signatures[2].subtitle).toBe('Authorized Representative');
  });

  it('uses firstSignatoryTitle for role and subtitle when provided', () => {
    const view = buildAgreementDocumentView({
      personnelName: 'Juan Dela Cruz',
      signatoryMode: 'recipientPropertyOfficerAuthorizedRep',
      propertyOfficerName: 'Toyota Gazoo',
      authorizedRepName: 'Maria Santos',
      secondarySignatoryTitle: 'Custodian',
      firstSignatoryTitle: 'Project Director',
    });

    expect(view.signatures).toHaveLength(3);
    expect(view.signatures[2].role).toBe('Project Director');
    expect(view.signatures[2].subtitle).toBe('Project Director');
    expect(view.signatures[2].label).toBe('Maria Santos');
  });

  it('trims whitespace from firstSignatoryTitle', () => {
    const view = buildAgreementDocumentView({
      personnelName: 'Juan Dela Cruz',
      signatoryMode: 'recipientPropertyOfficerAuthorizedRep',
      propertyOfficerName: 'Officer A',
      authorizedRepName: 'Rep B',
      firstSignatoryTitle: '  Director  ',
    });

    expect(view.signatures[2].role).toBe('Director');
  });

  it('falls back to "Authorized Representative" for empty-string firstSignatoryTitle', () => {
    const view = buildAgreementDocumentView({
      personnelName: 'Juan Dela Cruz',
      signatoryMode: 'recipientPropertyOfficerAuthorizedRep',
      propertyOfficerName: 'Officer A',
      authorizedRepName: 'Rep B',
      firstSignatoryTitle: '   ',
    });

    expect(view.signatures[2].role).toBe('Authorized Representative');
  });
});
