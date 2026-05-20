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
    expect(result).toContain('Property Number');
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
});
