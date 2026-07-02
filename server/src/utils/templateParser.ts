/**
 * Template Parser — replaces {{placeholders}} with actual data and supports
 * simple conditional sections for one-vs-many asset agreements.
 *
 * Conditional blocks:
 *   {{#ifSingleAsset}}...{{/ifSingleAsset}}
 *   {{#ifMultipleAssets}}...{{/ifMultipleAssets}}
 */

/** A text run with optional variable emphasis for resolved variable values.
 *  The `underline` field is kept for backward compatibility as a semantic
 *  flag indicating this run is a resolved variable. PDF output renders
 *  these runs in **bold** rather than drawing underline strokes. */
export interface TextRun {
  text: string;
  underline: boolean;    // true = resolved variable → render bold in PDF
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface TemplateData {
  date?: string;
  personnelName?: string;
  designation?: string;
  position?: string;  // legacy alias for designation
  project?: string;
  institution?: string;
  assetName?: string;
  serialNumber?: string;
  propertyNumber?: string;
  condition?: string;
  assets?: Array<{ name: string; serialNumber?: string; propertyNumber?: string; condition?: string }>;
  secondarySignatoryTitle?: string;
  firstSignatoryTitle?: string;
}

function assetRows(data: TemplateData) {
  const fallback = data.assetName ? [{
    name: data.assetName,
    serialNumber: data.serialNumber,
    propertyNumber: data.propertyNumber,
    condition: data.condition,
  }] : [];
  return (data.assets && data.assets.length > 0 ? data.assets : fallback).map(a => ({
    name: a.name || 'N/A',
    serialNumber: a.serialNumber || 'N/A',
    propertyNumber: a.propertyNumber || 'N/A',
    condition: a.condition || data.condition || 'Good',
  }));
}

function buildAssetParagraph(data: TemplateData): string {
  const a = assetRows(data)[0];
  if (!a) return 'No asset selected.';
  return `Asset: ${a.name}\nSerial Number: ${a.serialNumber}\nProperty Number: ${a.propertyNumber}\nCondition: ${a.condition}`;
}

function buildAssetTable(data: TemplateData): string {
  const list = assetRows(data);
  if (list.length === 0) return '(No assets)';
  const lines: string[] = [];
  list.forEach((a, idx) => {
    lines.push(`${idx + 1}. ${a.name} (SN: ${a.serialNumber}, Property No.: ${a.propertyNumber}, Condition: ${a.condition})`);
  });
  return lines.join('\n');
}

/* ─── Computed placeholders ─── */
function computeDerived(data: TemplateData): Record<string, string> {
  const designation = data.designation || data.position || '';
  const rows = assetRows(data);
  const assetCount = rows.length;
  const assetParagraph = buildAssetParagraph(data);
  const assetTable = buildAssetTable(data);
  return {
    date: data.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    fullName: data.personnelName || '',
    personnelName: data.personnelName || '',
    designation,
    position: designation,
    designationComma: designation ? `, ${designation}` : '',
    positionComma: designation ? `, ${designation}` : '',
    department: '',
    departmentText: '',
    institution: data.institution || '',
    institutionText: data.institution ? ` of ${data.institution}` : '',
    project: data.project || '',
    projectText: data.project ? ` (${data.project})` : '',
    assetName: data.assetName || rows[0]?.name || '',
    serialNumber: data.serialNumber || rows[0]?.serialNumber || 'N/A',
    propertyNumber: data.propertyNumber || rows[0]?.propertyNumber || 'N/A',
    condition: data.condition || rows[0]?.condition || 'Good',
    assetCount: String(assetCount),
    assetParagraph,
    assetTable,
    assetSection: assetCount > 1 ? assetTable : assetParagraph,
    assetList: assetTable,
    secondarySignatoryTitle: data.secondarySignatoryTitle || 'Property Officer',
    firstSignatoryTitle: data.firstSignatoryTitle || 'Authorized Representative',
  };
}

function applyConditionals(template: string, data: TemplateData): string {
  const count = assetRows(data).length;
  return template
    .replace(/\{\{#ifSingleAsset\}\}([\s\S]*?)\{\{\/ifSingleAsset\}\}/g, count <= 1 ? '$1' : '')
    .replace(/\{\{#ifMultipleAssets\}\}([\s\S]*?)\{\{\/ifMultipleAssets\}\}/g, count > 1 ? '$1' : '');
}

/** Replace all {{placeholder}} tokens in template text with actual values. */
export function parseTemplate(template: string, data: TemplateData): string {
  const vars = computeDerived(data);
  return applyConditionals(template, data).replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return vars[key] !== undefined ? vars[key] : `{{${key}}}`;
  });
}

/**
 * Like parseTemplate(), but returns structured TextRun[] so the PDF renderer
 * can underline resolved variable values while leaving static text plain.
 *
 * Each TextRun is either:
 *  - static text  → underline: false
 *  - resolved var → underline: true  (only when the variable was known and resolved)
 *
 * Unknown / unresolved {{tokens}} are kept as-is without underline.
 * Empty resolved values produce no run (no blank underline line).
 */
export function parseTemplateWithRuns(template: string, data: TemplateData): TextRun[] {
  const vars = computeDerived(data);
  const processed = applyConditionals(template, data);
  const runs: TextRun[] = [];

  // Split around {{word}} tokens. With 2 capture groups, split produces:
  // [static, "{{token}}", "key", static, "{{token}}", "key", ...]
  const parts = processed.split(/(\{\{(\w+)\}\})/g);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    // Check if this part is a {{token}} (full match from group 1)
    if (part.startsWith('{{') && part.endsWith('}}')) {
      const key = parts[i + 1]; // group 2 = the key name
      if (key && vars[key] !== undefined) {
        const resolved = vars[key];
        if (resolved !== '') {
          runs.push({ text: resolved, underline: true });
        }
        i++; // skip the key name part (group 2)
      } else {
        // Unknown variable — keep as-is, no underline
        runs.push({ text: part, underline: false });
        if (key !== undefined) i++; // skip key group if present
      }
    } else {
      // Static text
      if (part) runs.push({ text: part, underline: false });
    }
  }

  return runs;
}

/** Return the list of available placeholder keys and their descriptions. */
export function validateTemplateContent(template: string): { valid: boolean; warnings: string[]; unresolved: string[] } {
  const warnings: string[] = [];
  const known = new Set(getPlaceholderReference()
    .map(p => p.key.match(/^\{\{([\w#\/]+)/)?.[1])
    .filter(Boolean)
    .map(k => String(k).replace(/^#|^\//, '')));

  const singleOpen = (template.match(/\{\{#ifSingleAsset\}\}/g) || []).length;
  const singleClose = (template.match(/\{\{\/ifSingleAsset\}\}/g) || []).length;
  const multiOpen = (template.match(/\{\{#ifMultipleAssets\}\}/g) || []).length;
  const multiClose = (template.match(/\{\{\/ifMultipleAssets\}\}/g) || []).length;

  if (singleOpen !== singleClose) warnings.push('Unbalanced {{#ifSingleAsset}} conditional block.');
  if (multiOpen !== multiClose) warnings.push('Unbalanced {{#ifMultipleAssets}} conditional block.');

  const tokens = Array.from(template.matchAll(/\{\{\s*([#/]?\w+)\s*\}\}/g)).map(m => m[1]);
  const unresolved = tokens
    .filter(token => !token.startsWith('#') && !token.startsWith('/'))
    .filter(token => !known.has(token));

  if (unresolved.length > 0) warnings.push(`Unknown placeholder(s): ${Array.from(new Set(unresolved)).map(t => `{{${t}}}`).join(', ')}`);
  return { valid: warnings.length === 0, warnings, unresolved: Array.from(new Set(unresolved)).map(t => `{{${t}}}`) };
}

export function getPlaceholderReference(): { key: string; description: string; group?: string }[] {
  return [
    { key: '{{date}}', description: 'Formatted issuance date', group: 'Document' },
    { key: '{{fullName}}', description: 'Full name of the personnel', group: 'Personnel' },
    { key: '{{personnelName}}', description: 'Full name of the personnel', group: 'Personnel' },
    { key: '{{designation}}', description: 'Job title (raw)', group: 'Personnel' },
    { key: '{{designationComma}}', description: 'Comma + designation when available', group: 'Personnel' },
    { key: '{{institution}}', description: 'Institution name (raw)', group: 'Personnel' },
    { key: '{{institutionText}}', description: '" of Institution" suffix', group: 'Personnel' },
    { key: '{{project}}', description: 'Project name (raw)', group: 'Personnel' },
    { key: '{{projectText}}', description: '" (Project)" suffix', group: 'Personnel' },
    { key: '{{assetName}}', description: 'First/single asset name', group: 'Assets' },
    { key: '{{serialNumber}}', description: 'First/single asset serial number', group: 'Assets' },
    { key: '{{propertyNumber}}', description: 'First/single asset property number', group: 'Assets' },
    { key: '{{condition}}', description: 'Condition at issuance', group: 'Assets' },
    { key: '{{assetCount}}', description: 'Number of issued assets', group: 'Assets' },
    { key: '{{assetParagraph}}', description: 'Single-asset paragraph block', group: 'Smart Blocks' },
    { key: '{{assetTable}}', description: 'Multi-asset numbered list (one line per asset)', group: 'Smart Blocks' },
    { key: '{{assetSection}}', description: 'Auto paragraph for 1 asset, table for many', group: 'Smart Blocks' },
    { key: '{{assetList}}', description: 'Multi-asset table (alias for {{assetTable}})', group: 'Smart Blocks' },
    { key: '{{#ifSingleAsset}}\n...\n{{/ifSingleAsset}}', description: 'Only render contents for 1 asset', group: 'Conditional Blocks' },
    { key: '{{#ifMultipleAssets}}\n...\n{{/ifMultipleAssets}}', description: 'Only render contents for multiple assets', group: 'Conditional Blocks' },
  ];
}
