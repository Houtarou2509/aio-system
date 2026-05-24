import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface SearchResult {
  id: string;
  // Assets
  name?: string;
  type?: string;
  status?: string;
  serialNumber?: string | null;
  propertyNumber?: string | null;
  // Personnel
  fullName?: string;
  designation?: string | null;
  // Issuances
  assetName?: string;
  assignedTo?: string | null;
  assignedAt?: string | Date;
  // Audit
  summary?: string | null;
  action?: string;
  performedAt?: string | Date;
  // Suppliers
  contactPerson?: string | null;
}

export interface GlobalSearchResults {
  assets: SearchResult[];
  personnel: SearchResult[];
  issuances: SearchResult[];
  audit: SearchResult[];
  suppliers: SearchResult[];
}

function getAuditMetadataValue(metadata: Prisma.JsonValue | null, key: string): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  if (value === null || value === undefined) return null;
  return String(value);
}

export async function globalSearch(query: string): Promise<GlobalSearchResults> {
  const emptyResult = { assets: [], personnel: [], issuances: [], audit: [], suppliers: [] };

  if (!query || query.length < 2) {
    return emptyResult;
  }

  // a) Assets: search by name, serialNumber, propertyNumber
  const assets = await prisma.asset.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { serialNumber: { contains: query, mode: 'insensitive' } },
        { propertyNumber: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, type: true, status: true, serialNumber: true, propertyNumber: true },
    take: 5,
  });

  // b) Personnel: search by fullName, email
  const personnel = await prisma.personnel.findMany({
    where: {
      OR: [
        { fullName: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: { id: true, fullName: true, designation: true },
    take: 5,
  });

  // c) Issuances (assignments): via asset.name, personnel.fullName
  const issuances = await prisma.assignment.findMany({
    where: {
      returnedAt: null,
      OR: [
        { asset: { name: { contains: query, mode: 'insensitive' } } },
        { personnel: { fullName: { contains: query, mode: 'insensitive' } } },
        { assignedTo: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      assignedAt: true,
      assignedTo: true,
      asset: { select: { name: true } },
      personnel: { select: { fullName: true } },
    },
    take: 5,
  });

  // d) Audit: search by Phase 2-A audit columns. Legacy summaries are stored in metadata.
  const audit = await prisma.auditLog.findMany({
    where: {
      OR: [
        { action: { contains: query, mode: 'insensitive' } },
        { entityType: { contains: query, mode: 'insensitive' } },
        { entityId: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: { id: true, metadata: true, action: true, createdAt: true, entityType: true, entityId: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  // e) Suppliers: no model in schema — return empty
  const suppliers: SearchResult[] = [];

  return {
    assets: assets.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      status: a.status,
    })),
    personnel: personnel.map(p => ({
      id: p.id,
      fullName: p.fullName,
      designation: p.designation,
    })),
    issuances: issuances.map(i => ({
      id: i.id,
      assetName: i.asset.name,
      assignedTo: i.assignedTo ?? i.personnel?.fullName ?? null,
      assignedAt: i.assignedAt,
    })),
    audit: audit.map(a => ({
      id: a.id,
      summary: getAuditMetadataValue(a.metadata, 'summary') || `${a.action} on ${a.entityType}${a.entityId ? ` ${a.entityId}` : ''}`,
      action: a.action,
      performedAt: a.createdAt,
    })),
    suppliers,
  };
}
