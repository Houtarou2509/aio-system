import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const notDeleted = { deletedAt: null };

export async function getDashboardStats() {
  const [totalAssets, byStatus, byType, recentAudit, byLocation] = await Promise.all([
    prisma.asset.count({ where: notDeleted }),
    prisma.asset.groupBy({ by: ['status'], where: notDeleted, _count: { status: true } }),
    prisma.asset.groupBy({ by: ['type'], where: notDeleted, _count: { type: true } }),
    prisma.auditLog.findMany({
      take: 20,
      orderBy: { performedAt: 'desc' },
      include: { performedBy: { select: { username: true } } },
    }),
    prisma.asset.groupBy({ by: ['location'], where: notDeleted, _count: { location: true } }),
  ]);

  const statusMap = Object.fromEntries(byStatus.map(s => [s.status, s._count.status]));

  const activityFeed = recentAudit.map(log => {
    const user = (log.performedBy as any)?.username || 'System';
    const action = log.action.toLowerCase();
    const entity = log.entityType;
    const timestamp = new Date(log.performedAt).toLocaleString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
    if (log.field === '*' || !log.field) {
      return `${user} ${action === 'create' ? 'added' : action === 'delete' ? 'removed' : action} ${entity} — ${timestamp}`;
    }
    const oldVal = cleanActivityValue(log.oldValue);
    const newVal = cleanActivityValue(log.newValue);
    return `${user} changed ${log.field} from "${oldVal || '—'}" to "${newVal || '—'}" on ${entity} — ${timestamp}`;
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