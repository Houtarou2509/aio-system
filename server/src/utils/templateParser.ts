/**
 * Template Parser — replaces {{placeholders}} with actual data.
 * 
 * Available placeholders:
 *   {{date}}            — Formatted issuance date
 *   {{personnelName}}   — Full name of the personnel
 *   {{designation}}    — Job title (raw)
 *   {{designationComma}} — ", Title" (empty if no designation)
 *   {{projectText}}     — " (Project)" (empty if no project)
 *   {{assetName}}       — Asset name
 *   {{serialNumber}}    — Serial number
 *   {{propertyNumber}}  — Property number
 *   {{condition}}        — Condition at issuance
 *   {{designation}}    — Job title (raw, no prefix)
 *   {{designationComma}} — Comma + designation (e.g. ", Software Engineer")
 *   {{project}}         — Raw project (no prefix)
 *
 * Legacy aliases (still work):
 *   {{position}} → same as {{designation}}
 *   {{positionComma}} → same as {{designationComma}}
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

/* ─── Computed placeholders ─── */
function computeDerived(data: TemplateData): Record<string, string> {
  const designation = data.designation || data.position || '';
  return {
    date: data.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    fullName: data.personnelName || '',
    personnelName: data.personnelName || '',
    designation,
    position: designation,  // legacy alias
    designationComma: designation ? `, ${designation}` : '',
    positionComma: designation ? `, ${designation}` : '',  // legacy alias
    department: '',  // removed from schema
    departmentText: '',  // removed from schema
    institution: data.institution || '',
    institutionText: data.institution ? ` of ${data.institution}` : '',
    project: data.project || '',
    projectText: data.project ? ` (${data.project})` : '',
    assetName: data.assetName || '',
    serialNumber: data.serialNumber || 'N/A',
    propertyNumber: data.propertyNumber || 'N/A',
    condition: data.condition || 'Good',
    assetList: (() => {
      const list = data.assets ?? [];
      if (list.length === 0) return '(No assets)';
      const lines: string[] = [];
      lines.push('Asset Name           Serial Number        Property Number      Condition');
      lines.push('─'.repeat(75));
      for (const a of list) {
        const name = (a.name || '').padEnd(20).slice(0, 20);
        const sn = (a.serialNumber || 'N/A').padEnd(20).slice(0, 20);
        const pn = (a.propertyNumber || 'N/A').padEnd(20).slice(0, 20);
        const cond = (a.condition || 'Good').padEnd(15).slice(0, 15);
        lines.push(`${name} ${sn} ${pn} ${cond}`);
      }
      return lines.join('\n');
    })(),
  };
}

/**
 * Replace all {{placeholder}} tokens in template text with actual values.
 * Unknown placeholders are left as-is.
 */
export function parseTemplate(template: string, data: TemplateData): string {
  const vars = computeDerived(data);
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return vars[key] !== undefined ? vars[key] : `{{${key}}}`;
  });
}

/**
 * Return the list of available placeholder keys and their descriptions.
 */
export function getPlaceholderReference(): { key: string; description: string }[] {
  return [
    { key: '{{date}}', description: 'Formatted issuance date' },
    { key: '{{fullName}}', description: 'Full name of the personnel (alias for {{personnelName}})' },
    { key: '{{personnelName}}', description: 'Full name of the personnel' },
    { key: '{{designation}}', description: 'Job title (raw, no prefix)' },
    { key: '{{designationComma}}', description: 'Comma + designation (e.g. ", Software Engineer")' },
    { key: '{{institution}}', description: 'Institution name (raw)' },
    { key: '{{institutionText}}', description: '" of Institution" suffix (e.g. " of DOST")' },
    { key: '{{project}}', description: 'Project name (raw)' },
    { key: '{{projectText}}', description: '" (Project)" suffix (e.g. " (AIO System)")' },
    { key: '{{assetName}}', description: 'Asset name' },
    { key: '{{serialNumber}}', description: 'Serial number' },
    { key: '{{propertyNumber}}', description: 'Property number' },
    { key: '{{condition}}', description: 'Condition at issuance' },
    { key: '{{assetList}}', description: 'Table of all issued assets (name, serial, property#, condition)' },
  ];
}