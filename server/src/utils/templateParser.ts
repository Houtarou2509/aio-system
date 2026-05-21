/**
 * Template Parser — replaces {{placeholders}} with actual data and supports
 * simple conditional sections for one-vs-many asset agreements.
 *
 * Conditional blocks:
 *   {{#ifSingleAsset}}...{{/ifSingleAsset}}
 *   {{#ifMultipleAssets}}...{{/ifMultipleAssets}}
 */

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
  lines.push('No.  Asset Name                 Serial Number          Property Number        Condition');
  list.forEach((a, idx) => {
    const no = String(idx + 1).padEnd(4).slice(0, 4);
    const name = a.name.padEnd(25).slice(0, 25);
    const sn = a.serialNumber.padEnd(21).slice(0, 21);
    const pn = a.propertyNumber.padEnd(21).slice(0, 21);
    const cond = a.condition.padEnd(10).slice(0, 10);
    lines.push(`${no} ${name}  ${sn}  ${pn}  ${cond}`);
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
    { key: '{{assetTable}}', description: 'Multi-asset table block', group: 'Smart Blocks' },
    { key: '{{assetSection}}', description: 'Auto paragraph for 1 asset, table for many', group: 'Smart Blocks' },
    { key: '{{#ifSingleAsset}}\n...\n{{/ifSingleAsset}}', description: 'Only render contents for 1 asset', group: 'Conditional Blocks' },
    { key: '{{#ifMultipleAssets}}\n...\n{{/ifMultipleAssets}}', description: 'Only render contents for multiple assets', group: 'Conditional Blocks' },
  ];
}
