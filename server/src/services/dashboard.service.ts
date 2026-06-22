import { prisma } from '../lib/prisma';



const notDeleted = { deletedAt: null };

export async function getDashboardStats() {
  const [totalAssets, byStatus, byType, recentAudit, byLocation] = await Promise.all([
    prisma.asset.count({ where: notDeleted }),
    prisma.asset.groupBy({ by: ['status'], where: notDeleted, _count: { status: true } }),
    prisma.asset.groupBy({ by: ['type'], where: notDeleted, _count: { type: true } }),
    prisma.auditLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { username: true } } },
    }),
    prisma.asset.groupBy({ by: ['location'], where: notDeleted, _count: { location: true } }),
  ]);

  const statusMap = Object.fromEntries(byStatus.map(s => [s.status, s._count.status]));

  const activityFeed = recentAudit.map(log => {
    const metadata = log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata)
      ? log.metadata as Record<string, unknown>
      : {};
    const user = log.user?.username || 'System';
    const timestamp = new Date(log.createdAt).toLocaleString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
    const field = typeof metadata.field === 'string' ? metadata.field : '';

    // Map known event types to human-readable action labels
    const readableAction = formatAuditAction(log.action);
    const objectLabel = formatAuditEntity(log.entityType);

    if (field === '*' || !field) {
      // Non-field-change events: use the mapped action label
      if (readableAction) {
        return `${user} ${readableAction} — ${timestamp}`;
      }
      // Unknown action — safe fallback, no raw keys
      return `${user} performed an action on ${objectLabel} — ${timestamp}`;
    }
    // Field-change events: keep the "changed X from A to B" format
    const oldVal = cleanActivityValue(metadata.oldValue == null ? '' : String(metadata.oldValue));
    const newVal = cleanActivityValue(metadata.newValue == null ? '' : String(metadata.newValue));
    return `${user} changed ${field} from "${oldVal || '—'}" to "${newVal || '—'}" on ${objectLabel} — ${timestamp}`;
  });

  return {
    totalAssets,
    totalAssigned: statusMap['ASSIGNED'] || 0,
    underMaintenance: statusMap['MAINTENANCE'] || 0,
    available: statusMap['AVAILABLE'] || 0,
    byStatus: statusMap,
    byType: Object.fromEntries(byType.map(t => [t.type, t._count.type])),
    byLocation: Object.fromEntries((byLocation as any[]).filter((l: any) => l.location).map((l: any) => [l.location, l._count.location])),
    activityFeed,
  };
}

/* ── Shared activity formatting helpers ────────────────────────── */

/**
 * Maps raw audit action keys (e.g. "document.archived") to a
 * human-readable action label (e.g. "archived a document").
 * Returns null for field-change actions that are handled separately
 * (CREATE, UPDATE, DELETE with a metadata.field).
 */
function formatAuditAction(action: string): string | null {
  const map: Record<string, string> = {
    'issuance.created':           'created an issuance',
    'issuance.bulk_created':      'created a bulk issuance',
    'issuance.returned':           'returned an asset',
    'issuance.signed':            'signed an agreement',
    'issuance.transferred':       'transferred an asset',
    'agreement.pdf_viewed':       'viewed an agreement PDF',
    'agreement.signed_copy_uploaded': 'uploaded a signed agreement',
    'personnel.created':          'created a personnel record',
    'personnel.updated':          'updated a personnel record',
    'personnel.deleted':          'deleted a personnel record',
    'asset.locked':               'locked an asset',
    'asset.released':             'released an asset',
    'issue_report.created':        'created an issue report',
    'issue_report.status_updated': 'updated an issue report status',
    'issue_report.notes_updated':  'updated issue report notes',
    'document.archived':          'archived a document',
    'document.viewed':            'viewed a document',
    'user.created':               'created a user account',
    'user.updated':               'updated a user account',
    'user.status_changed':        'changed a user status',
    'warranty.expiry_notified':   'sent a warranty expiry notification',
    'purchase_request.converted': 'converted a purchase request',
    'label.printed':              'printed a label',
    'lookup.force_deactivated':   'force-deactivated a lookup record',
    'audit.cleanup':              'cleaned up audit logs',
    // Legacy uppercase actions (stored directly, not via AUDIT_ACTIONS constants)
    'create':                     'created',
    'update':                     'updated',
    'delete':                     'deleted',
    'checkout':                   'checked out an asset',
    'return':                     'returned an asset',
    'issuance_lock':              'locked an asset for issuance',
    'issuance_unlock':            'unlocked an asset from issuance',
  };
  const lower = action.toLowerCase();
  return map[lower] || null;
}

/**
 * Maps raw entityType strings (e.g. "DocumentArchiveItem") to a
 * human-readable object label (e.g. "document").
 */
function formatAuditEntity(entityType: string): string {
  const map: Record<string, string> = {
    'Asset':               'asset',
    'Assignment':          'assignment',
    'AgreementDocument':   'agreement',
    'DocumentArchiveItem': 'document',
    'Personnel':           'personnel',
    'MaintenanceLog':      'maintenance log',
    'Supplier':            'supplier',
    'PurchaseRequest':     'purchase request',
    'User':                'user',
    'AuditLog':            'audit log',
  };
  return map[entityType] || entityType.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
}

// Clean up raw date strings in audit log values for display
function cleanActivityValue(value: string | null): string {
  if (!value) return '';
  // Replace ISO date strings
  let result = value.replace(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^"]*/g,
    (match) => {
      const date = new Date(match);
      if (isNaN(date.getTime())) return match;
      return date.toLocaleDateString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }
  );
  // Replace long JS Date.toString() outputs
  result = result.replace(
    /[A-Z][a-z]+ [A-Z][a-z]+ \d+ \d{4} \d{2}:\d{2}:\d{2}[^"]*/g,
    (match) => {
      const date = new Date(match);
      if (isNaN(date.getTime())) return match;
      return date.toLocaleDateString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }
  );
  return result;
}

// GET /api/dashboard/location-stats
export async function getLocationStats() {
  const locationGroups = await prisma.asset.groupBy({
    by: ['location'],
    where: notDeleted,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  return locationGroups.map(g => ({
    location: g.location ?? 'Unknown',
    count: g._count.id,
  }));
}

export async function getAgeStats() {
  const assets = await prisma.asset.findMany({
    where: { purchaseDate: { not: null }, ...notDeleted },
    select: { id: true, purchaseDate: true },
  });

  const today = new Date();
  const buckets: Record<string, number> = {
    'Less than 1 year': 0,
    '1–2 years': 0,
    '2–3 years': 0,
    '3–5 years': 0,
    'Over 5 years': 0,
  };

  let unknownCount = 0;
  const allAssets = await prisma.asset.count({ where: notDeleted });

  assets.forEach(asset => {
    if (!asset.purchaseDate) { unknownCount++; return; }
    const years = (today.getTime() - new Date(asset.purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (years < 1) buckets['Less than 1 year']++;
    else if (years < 2) buckets['1–2 years']++;
    else if (years < 3) buckets['2–3 years']++;
    else if (years < 5) buckets['3–5 years']++;
    else buckets['Over 5 years']++;
  });

  // Add Unknown only if there are assets without purchaseDate
  unknownCount = allAssets - assets.length;
  if (unknownCount > 0) buckets['Unknown'] = unknownCount;

  const result = Object.entries(buckets)
    .filter(([_, count]) => count > 0)
    .map(([label, count]) => ({ label, count }));

  return result;
}

export async function getWarrantiesExpiring() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in90Days = new Date();
  in90Days.setDate(today.getDate() + 90);
  in90Days.setHours(23, 59, 59, 999);

  const assets = await prisma.asset.findMany({
    where: {
      warrantyExpiry: {
        lte: in90Days,
        not: null,
      },
      ...notDeleted,
    },
    select: {
      id: true,
      name: true,
      warrantyExpiry: true,
      status: true,
      location: true,
    },
    orderBy: { warrantyExpiry: 'asc' },
    take: 10,
  });

  const result = assets.map(asset => {
    const expiry = new Date(asset.warrantyExpiry!);
    const daysUntil = Math.ceil(
      (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      ...asset,
      daysUntilExpiry: daysUntil,
      warrantyStatus: daysUntil < 0 ? 'expired' : daysUntil <= 90 ? 'expiring' : 'active',
    };
  });

  return result;
}