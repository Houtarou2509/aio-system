import { describe, expect, it } from 'vitest';
import { parseTemplate, validateTemplateContent } from '../utils/templateParser';
import { previewTemplate } from '../services/agreement.service';

describe('agreement template parser', () => {
  const template = [
    'Dear {{personnelName}}{{designationComma}},',
    '{{#ifSingleAsset}}Single asset copy:',
    '{{assetParagraph}}{{/ifSingleAsset}}',
    '{{#ifMultipleAssets}}Multiple asset copy for {{assetCount}} assets:',
    '{{assetTable}}{{/ifMultipleAssets}}',
  ].join('\n');

  it('renders the single-asset branch and hides multi-asset content', () => {
    const result = parseTemplate(template, {
      personnelName: 'Juan Dela Cruz',
      designation: 'Software Engineer',
      assetName: 'Dell Latitude 5540',
      serialNumber: 'SN-DL-2026-00123',
      propertyNumber: 'PN-2026-000456',
      condition: 'Good',
    });

    expect(result).toContain('Dear Juan Dela Cruz, Software Engineer');
    expect(result).toContain('Single asset copy:');
    expect(result).toContain('Asset: Dell Latitude 5540');
    expect(result).not.toContain('Multiple asset copy');
  });

  it('renders the multi-asset branch and smart table placeholders', () => {
    const result = parseTemplate(template, {
      personnelName: 'Juan Dela Cruz',
      assets: [
        { name: 'Dell Latitude 5540', serialNumber: 'SN-DL-2026-00123', propertyNumber: 'PN-2026-000456', condition: 'Good' },
        { name: 'HP LaserJet Pro', serialNumber: 'SN-HP-2026-00077', propertyNumber: 'PN-2026-000457', condition: 'Good' },
      ],
    });

    expect(result).toContain('Multiple asset copy for 2 assets:');
    expect(result).toContain('Dell Latitude 5540');
    expect(result).toContain('HP LaserJet Pro');
    expect(result).toContain('Property No.');
    expect(result).not.toContain('Single asset copy');
  });

  it('reports unknown placeholders and unbalanced conditionals', () => {
    const validation = validateTemplateContent('{{personnelName}} {{unknownToken}} {{#ifSingleAsset}}missing close');

    expect(validation.valid).toBe(false);
    expect(validation.unresolved).toContain('{{unknownToken}}');
    expect(validation.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Unknown placeholder'),
      expect.stringContaining('Unbalanced {{#ifSingleAsset}}'),
    ]));
  });

  it('uses the backend preview parser for single and multiple sample modes', () => {
    const single = previewTemplate(template, 'single').resolvedText;
    const multiple = previewTemplate(template, 'multiple').resolvedText;

    expect(single).toContain('Single asset copy:');
    expect(single).not.toContain('Multiple asset copy');
    expect(multiple).toContain('Multiple asset copy for 3 assets:');
    expect(multiple).not.toContain('Single asset copy');
  });

  it('resolves {{secondarySignatoryTitle}} to the provided value', () => {
    const result = parseTemplate('Signatory: {{secondarySignatoryTitle}}', {
      personnelName: 'Test',
      secondarySignatoryTitle: 'Authorized Signatory',
    });
    expect(result).toContain('Signatory: Authorized Signatory');
    expect(result).not.toContain('{{secondarySignatoryTitle}}');
  });

  it('defaults {{secondarySignatoryTitle}} to "Property Officer" when not provided', () => {
    const result = parseTemplate('Signatory: {{secondarySignatoryTitle}}', {
      personnelName: 'Test',
    });
    expect(result).toContain('Signatory: Property Officer');
    expect(result).not.toContain('{{secondarySignatoryTitle}}');
  });

  it('resolves {{firstSignatoryTitle}} to the provided value', () => {
    const result = parseTemplate('Title: {{firstSignatoryTitle}}', {
      personnelName: 'Test',
      firstSignatoryTitle: 'Project Director',
    });
    expect(result).toContain('Title: Project Director');
    expect(result).not.toContain('{{firstSignatoryTitle}}');
  });

  it('defaults {{firstSignatoryTitle}} to "Authorized Representative" when not provided', () => {
    const result = parseTemplate('Title: {{firstSignatoryTitle}}', {
      personnelName: 'Test',
    });
    expect(result).toContain('Title: Authorized Representative');
    expect(result).not.toContain('{{firstSignatoryTitle}}');
  });
});
