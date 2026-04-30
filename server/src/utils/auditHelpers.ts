import { AuditSeverity } from '@prisma/client';

/* ─── Field display names ──────────────────────────────── */

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  assignedTo: 'Assigned To',
  serialNumber: 'Serial Number',
  propertyNumber: 'Property Number',
  name: 'Name',
  location: 'Location',
  type: 'Type',
  manufacturer: 'Manufacturer',
  purchasePrice: 'Purchase Price',
  purchaseDate: 'Purchase Date',
  warrantyExpiry: 'Warranty Expiry',
  imageUrl: 'Image',
  remarks: 'Remarks',
  role: 'Role',
  email: 'Email',
  username: 'Username',
  deletedAt: 'Deletion',
  warrantyNotes: 'Warranty Notes',
  requestStatus: 'Request Status',
  condition: 'Condition',
  notes: 'Notes',
  description: 'Description',
  cost: 'Cost',
  date: 'Date',
  technicianName: 'Technician',
  title: 'Title',
  scheduledDate: 'Scheduled Date',
  completedDate: 'Completed Date',
  fullName: 'Full Name',
  designation: 'Designation',
  project: 'Project',
  phone: 'Phone',
  hiredDate: 'Hired Date',
  projectYear: 'Project Year',
};

/* ─── High-severity fields & actions ────────────────────── */

const HIGH_ACTIONS: string[] = ['DELETE', 'SOFT_DELETE', 'CHECKOUT', 'RETURN'];
const HIGH_FIELDS: string[] = ['status', 'assignedTo', 'serialNumber', 'role', 'deletedAt'];
const MEDIUM_ACTIONS: string[] = ['UPDATE', 'REVERT', 'APPROVE', 'DENY', 'REQUEST'];
const MEDIUM_FIELDS: string[] = ['purchasePrice', 'location', 'propertyNumber'];

/* ─── Severity classifier ──────────────────────────────── */

export function classifySeverity(action: string, field?: string | null): AuditSeverity {
  if (HIGH_ACTIONS.includes(action)) return 'HIGH';
  if (field && HIGH_FIELDS.includes(field)) return 'HIGH';
  if (MEDIUM_ACTIONS.includes(action)) return 'MEDIUM';
  if (field && MEDIUM_FIELDS.includes(field)) return 'MEDIUM';
  return 'LOW';
}

/* ─── Human-readable summary generator ──────────────────── */

export interface SummaryParams {
  action: string;
  entityType: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  assetName?: string | null;
  serialNumber?: string | null;
  performedByName?: string | null;
  viaQR?: boolean;
}

export function generateSummary(params: SummaryParams): string {
  const { action, entityType, field, oldValue, newValue, assetName, serialNumber, performedByName, viaQR } = params;
  const entity = entityType.toLowerCase();
  const target = assetName ? `"${assetName}"` : entity;
  const label = field ? (FIELD_LABELS[field] || field) : '';

  switch (action) {
    case 'CREATE':
      return `Created new ${entity} ${target}`;

    case 'DELETE':
    case 'SOFT_DELETE':
      return `Deleted ${entity} ${target}`;

    case 'REVERT':
      if (field) {
        return `Reverted ${label} on ${target} back to "${oldValue || '—'}"`;
      }
      return `Reverted changes on ${target}`;

    case 'CHECKOUT': {
      const sn = serialNumber ? ` (SN: ${serialNumber})` : '';
      const recipient = newValue ? ` to ${newValue}` : '';
      return `Asset ${target}${sn} was issued${recipient}.`;
    }

    case 'RETURN': {
      const sn = serialNumber ? ` (SN: ${serialNumber})` : '';
      const returner = newValue ? ` by ${newValue}` : '';
      const method = viaQR ? ' via QR Scan' : '';
      return `Asset ${target}${sn} was returned${returner}${method}.`;
    }

    case 'APPROVE':
      return `Approved request for ${entity} ${target}`;

    case 'DENY':
      return `Denied request for ${entity} ${target}`;

    case 'REQUEST':
      return `Requested ${entity} ${target}`;

    // Maintenance-specific summaries
    case 'SCHEDULE':
      return `Scheduled maintenance for ${target}`;

    case 'COMPLETE':
      return `Completed maintenance on ${target}`;

    case 'CANCEL':
      return `Cancelled maintenance on ${target}`;

    case 'UPDATE':
      if (field && field !== '*') {
        // Contextual summaries for specific high-value fields
        if (field === 'status') return `Changed status of ${target} from "${oldValue || '—'}" to "${newValue || '—'}"`;
        if (field === 'assignedTo') {
          if (newValue && newValue !== 'null') return `Assigned ${target} to "${newValue}"`;
          if (oldValue && oldValue !== 'null') return `Unassigned "${oldValue}" from ${target}`;
          return `Changed assignment on ${target}`;
        }
        if (field === 'role') return `Security: ${performedByName || 'User'} changed role of ${target} from "${oldValue || '—'}" to "${newValue || '—'}"`;
        if (field === 'serialNumber') return `Updated serial number of ${target} from "${oldValue || '—'}" to "${newValue || '—'}"`;
        if (field === 'purchasePrice') return `Updated purchase price of ${target} from "${oldValue || '—'}" to "${newValue || '—'}"`;

        return `Changed ${label} from "${oldValue || '—'}" to "${newValue || '—'}" on ${target}`;
      }
      return `Updated ${entity} ${target}`;

    default:
      return `${action} on ${entity} ${target}`;
  }
}

/* ─── User-Agent parser ─────────────────────────────────── */

export interface ParsedUA {
  browser: string;
  os: string;
  device: string;
}

export function parseUserAgent(ua: string | null | undefined): ParsedUA {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };

  let browser = 'Unknown';
  let os = 'Unknown';
  let device = 'Desktop';

  // Browser detection
  if (ua.includes('Edg/')) {
    const m = ua.match(/Edg\/([\d.]+)/);
    browser = m ? `Edge ${m[1]}` : 'Edge';
  } else if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    const m = ua.match(/Chrome\/([\d.]+)/);
    browser = m ? `Chrome ${m[1]}` : 'Chrome';
  } else if (ua.includes('Firefox/')) {
    const m = ua.match(/Firefox\/([\d.]+)/);
    browser = m ? `Firefox ${m[1]}` : 'Firefox';
  } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    const m = ua.match(/Version\/([\d.]+)/);
    browser = m ? `Safari ${m[1]}` : 'Safari';
  }

  // OS detection
  if (ua.includes('Windows NT')) {
    os = 'Windows';
  } else if (ua.includes('Mac OS X')) {
    os = 'macOS';
  } else if (ua.includes('Android')) {
    os = 'Android';
    device = 'Mobile';
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    os = ua.includes('iPad') ? 'iPadOS' : 'iOS';
    device = ua.includes('iPad') ? 'Tablet' : 'Mobile';
  } else if (ua.includes('Linux')) {
    os = 'Linux';
  }

  return { browser, os, device };
}