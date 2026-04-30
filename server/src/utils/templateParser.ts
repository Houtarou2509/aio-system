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
  assetName?: string;
  serialNumber?: string;
  propertyNumber?: string;
  condition?: string;
}

/* ─── Computed placeholders ─── */
function computeDerived(data: TemplateData): Record<string, string> {
  const designation = data.designation || data.position || '';
  return {
    date: data.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    personnelName: data.personnelName || '',
    designation,
    position: designation,  // legacy alias
    designationComma: designation ? `, ${designation}` : '',
    positionComma: designation ? `, ${designation}` : '',  // legacy alias
    department: '',  // removed from schema
    departmentText: '',  // removed from schema
    project: data.project || '',
    projectText: data.project ? ` (${data.project})` : '',
    assetName: data.assetName || '',
    serialNumber: data.serialNumber || 'N/A',
    propertyNumber: data.propertyNumber || 'N/A',
    condition: data.condition || 'Good',
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
    { key: '{{personnelName}}', description: 'Full name of the personnel' },
    { key: '{{designation}}', description: 'Job title (raw, no prefix)' },
    { key: '{{designationComma}}', description: 'Comma + designation (e.g. ", Software Engineer")' },
    { key: '{{project}}', description: 'Project name (raw)' },
    { key: '{{projectText}}', description: '" (Project)" suffix (e.g. " (AIO System)")' },
    { key: '{{assetName}}', description: 'Asset name' },
    { key: '{{serialNumber}}', description: 'Serial number' },
    { key: '{{propertyNumber}}', description: 'Property number' },
    { key: '{{condition}}', description: 'Condition at issuance' },
  ];
}