import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

/* ─── Types ─── */

export interface AccountabilityRow {
  personnelName: string | null;
  designation: string | null;
  project: string | null;
  institution: string | null;
  assetName: string | null;
  serialNumber: string | null;
  propertyNumber: string | null;
  condition: string | null;
  returnCondition: string | null;
  assignedAt: Date | null;
  returnedAt: Date | null;
  status: string;
  isOverdue: boolean;
  documentNumber: string | null;
}

export interface AccountabilityReportResult {
  data: AccountabilityRow[];
  total: number;
  page: number;
  limit: number;
}

/* ─── Build accountability report ─── */

export async function getAccountabilityReport(params: {
  personnelId?: string;
  project?: string;
  status?: 'active' | 'returned' | 'all';
  from?: string;
  to?: string;
  overdueAfterDays?: number;
  format: 'json' | 'csv';
  page?: number;
  limit?: number;
}): Promise<AccountabilityReportResult | string> {
  const {
    personnelId,
    project,
    status = 'all',
    from,
    to,
    overdueAfterDays,
    format,
    page = 1,
    limit = 50,
  } = params;

  const where: Prisma.AssignmentWhereInput = {};

  // Status filter
  if (status === 'active') {
    where.returnedAt = null;
  } else if (status === 'returned') {
    where.returnedAt = { not: null };
  }
  // 'all' → no filter on returnedAt

  // Personnel filter
  if (personnelId) {
    where.personnelId = personnelId;
  }

  // Project filter — goes through personnel relation
  if (project) {
    where.personnel = {
      project: { contains: project, mode: 'insensitive' },
    };
  }

  // Date range filters on assignedAt
  if (from || to) {
    const assignedAtFilter: Prisma.DateTimeFilter = {};
    if (from) assignedAtFilter.gte = new Date(from);
    if (to) assignedAtFilter.lte = new Date(to);
    where.assignedAt = assignedAtFilter;
  }

  // Overdue: we compute in post-processing, but for DB-level optimization
  // we can add an assignedAt upper-bound filter to narrow results
  // However, we need all assignments to check overdue status, so we
  // fetch and post-process

  // Count total matching rows
  const total = await prisma.assignment.count({ where });

  // Fetch assignments with related data
  const assignments = await prisma.assignment.findMany({
    where,
    include: {
      asset: {
        select: {
          name: true,
          serialNumber: true,
          propertyNumber: true,
        },
      },
      personnel: {
        select: {
          fullName: true,
          designation: true,
          project: true,
          institution: {
            select: { name: true },
          },
        },
      },
      agreementDocument: {
        select: {
          documentNumber: true,
        },
      },
    },
    orderBy: { assignedAt: 'desc' },
    skip: format === 'json' ? (page - 1) * limit : undefined,
    take: format === 'json' ? limit : undefined,
  });

  const now = new Date();
  const overdueThreshold = overdueAfterDays
    ? new Date(now.getTime() - overdueAfterDays * 24 * 60 * 60 * 1000)
    : null;

  const rows: AccountabilityRow[] = assignments.map((a) => {
    const isActive = a.returnedAt === null;
    const isOverdue = overdueThreshold !== null
      ? isActive && a.assignedAt < overdueThreshold
      : false;

    return {
      personnelName: a.personnel?.fullName ?? a.assignedTo ?? null,
      designation: a.personnel?.designation ?? null,
      project: a.personnel?.project ?? null,
      institution: a.personnel?.institution?.name ?? null,
      assetName: a.asset?.name ?? null,
      serialNumber: a.asset?.serialNumber ?? null,
      propertyNumber: a.asset?.propertyNumber ?? null,
      condition: a.condition ?? null,
      returnCondition: a.returnCondition ?? a.conditionAtReturn ?? null,
      assignedAt: a.assignedAt,
      returnedAt: a.returnedAt,
      status: isActive ? 'active' : 'returned',
      isOverdue,
      documentNumber: a.agreementDocument?.documentNumber ?? null,
    };
  });

  // CSV format — return raw CSV string
  if (format === 'csv') {
    return buildCsv(rows);
  }

  return { data: rows, total, page, limit };
}

/* ─── CSV builder ─── */

function buildCsv(rows: AccountabilityRow[]): string {
  const headers = [
    'Personnel Name',
    'Designation',
    'Project',
    'Institution',
    'Asset Name',
    'Serial Number',
    'Property Number',
    'Condition',
    'Return Condition',
    'Assigned At',
    'Returned At',
    'Status',
    'Is Overdue',
    'Document Number',
  ];

  const csvRows = rows.map((r) => [
    csvEscape(r.personnelName),
    csvEscape(r.designation),
    csvEscape(r.project),
    csvEscape(r.institution),
    csvEscape(r.assetName),
    csvEscape(r.serialNumber),
    csvEscape(r.propertyNumber),
    csvEscape(r.condition),
    csvEscape(r.returnCondition),
    r.assignedAt ? csvEscape(r.assignedAt.toISOString()) : '',
    r.returnedAt ? csvEscape(r.returnedAt.toISOString()) : '',
    r.status,
    r.isOverdue ? 'Yes' : 'No',
    csvEscape(r.documentNumber),
  ].join(','));

  return [headers.join(','), ...csvRows].join('\n');
}

function csvEscape(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}