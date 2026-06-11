import { logAudit } from './auditLog.service';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { parseTemplate, parseTemplateWithRuns, TextRun } from '../utils/templateParser';
import { buildAgreementDocumentView, type AgreementDocumentView } from './agreementDocumentRenderer.service';



/* ═══════════════════════════════════════════════════════
   INTERFACE
   ═══════════════════════════════════════════════════════ */

interface TemplateCreateData {
  name: string;
  title?: string;
  content: string;
  isDefault?: boolean;
  defaultPropertyOfficer?: string;
  defaultAuthorizedRep?: string;
  headerLogo?: string;
  letterheadPath?: string;
}

interface TemplateUpdateData {
  name?: string;
  title?: string;
  content?: string;
  isDefault?: boolean;
  defaultPropertyOfficer?: string;
  defaultAuthorizedRep?: string;
  headerLogo?: string;
  letterheadPath?: string;
}

export const FALLBACK_AGREEMENT_TITLE = 'ISSUANCE & ACCOUNTABILITY AGREEMENT';

export const FALLBACK_AGREEMENT_TEMPLATE = `ISSUANCE AND ACCOUNTABILITY AGREEMENT

This Accountability Agreement is executed by and between the Demographic Research and Development Foundation, Inc. (DRDF), 2nd Floor Palma Hall, UP Diliman, Quezon City, and {{personnelName}}{{designationComma}}{{institutionText}}{{projectText}}, for the issuance and custody of DRDF property described below.

{{#ifSingleAsset}}The recipient acknowledges receipt of the following asset in good working condition unless otherwise stated:

{{assetParagraph}}{{/ifSingleAsset}}{{#ifMultipleAssets}}The recipient acknowledges receipt of the following {{assetCount}} assets in good working condition unless otherwise stated:

{{assetTable}}{{/ifMultipleAssets}}

Terms and Conditions:
1. The issued asset(s) shall be used only for official DRDF work, approved project activities, or other authorized purposes.
2. The recipient shall exercise due care in handling, securing, and maintaining the asset(s) and shall keep them protected from loss, theft, damage, misuse, or unauthorized access.
3. The asset(s) shall not be sold, lent, transferred, reassigned, modified, or disposed of without prior approval and proper documentation from the authorized DRDF representative or Property Officer.
4. Any loss, theft, damage, malfunction, or security incident involving the asset(s) shall be reported immediately to the Property Officer or authorized DRDF representative.
5. The recipient shall make the asset(s) available for inspection, inventory, repair, reassignment, or recall when requested by DRDF.
6. The recipient shall return the asset(s), including accessories and related materials, upon completion of assignment, separation from DRDF, transfer of responsibility, project closeout, or upon demand by DRDF.
7. The recipient accepts accountability for the asset(s) from the date of issuance until the asset(s) are officially returned, transferred, or otherwise cleared in DRDF records.

By signing below, the recipient acknowledges receipt of the asset(s), confirms that the information stated in this agreement is correct to the best of their knowledge, and accepts the accountability obligations stated above.

________________________________________
{{personnelName}} (Recipient)

________________________________________
Property Officer

________________________________________
Authorized Representative`;

/* ═══════════════════════════════════════════════════════
   TEMPLATES CRUD
   ═══════════════════════════════════════════════════════ */

/** Get the explicit default template. Never fall back to an arbitrary recent template. */
export async function getDefaultTemplate() {
  return prisma.agreementTemplate.findFirst({ where: { isDefault: true } });
}

/** Get a single template by ID. */
export async function getTemplate(id: string) {
  return prisma.agreementTemplate.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
    },
  });
}

/** List all templates, newest first. */
export function listTemplates() {
  return prisma.agreementTemplate.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
      _count: { select: { versions: true } },
    },
  });
}

export function listTemplateVersions(templateId: string) {
  return prisma.agreementTemplateVersion.findMany({
    where: { templateId },
    orderBy: { versionNumber: 'desc' },
  });
}

/** Create a new template, optionally with a logo. */
export async function createTemplate(
  data: TemplateCreateData,
  logoPath?: string,
  letterheadFilePath?: string,
) {
  return prisma.$transaction(async (tx) => {
    // Only one default template allowed at a time
    if (data.isDefault) {
      await tx.agreementTemplate.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await tx.agreementTemplate.create({
      data: {
        name: data.name,
        title: data.title ?? "ISSUANCE & ACCOUNTABILITY AGREEMENT",
        content: data.content,
        isDefault: data.isDefault ?? false,
        defaultPropertyOfficer: data.defaultPropertyOfficer ?? null,
        defaultAuthorizedRep: data.defaultAuthorizedRep ?? null,
        currentVersion: 1,
        ...(logoPath ? { headerLogo: logoPath } : {}),
        ...(letterheadFilePath || data.letterheadPath ? { letterheadPath: letterheadFilePath || data.letterheadPath } : {}),
      },
    });

    await tx.agreementTemplateVersion.create({
      data: {
        templateId: template.id,
        versionNumber: 1,
        name: template.name,
        title: template.title,
        content: template.content,
        headerLogo: template.headerLogo,
        letterheadPath: template.letterheadPath,
        defaultPropertyOfficer: template.defaultPropertyOfficer,
        defaultAuthorizedRep: template.defaultAuthorizedRep,
        changeSummary: 'Initial version',
      },
    });

    return template;
  });
}

/** Update a template's metadata, content, or logo. */
export async function updateTemplate(
  id: string,
  data: TemplateUpdateData,
  logoPath?: string,
  letterheadFilePath?: string,
) {
  const existing = await prisma.agreementTemplate.findUnique({ where: { id } });
  if (!existing) throw new Error('Template not found');

  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.title !== undefined) updateData.title = data.title ?? "ISSUANCE & ACCOUNTABILITY AGREEMENT";
  if (data.content !== undefined) updateData.content = data.content;
  if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;
  if (data.defaultPropertyOfficer !== undefined) updateData.defaultPropertyOfficer = data.defaultPropertyOfficer || null;
  if (data.defaultAuthorizedRep !== undefined) updateData.defaultAuthorizedRep = data.defaultAuthorizedRep || null;
  if (logoPath && logoPath !== '') updateData.headerLogo = logoPath;
  else if (data.headerLogo === '') updateData.headerLogo = null;
  else if (typeof data.headerLogo === 'string' && data.headerLogo !== '') updateData.headerLogo = data.headerLogo;
  if (letterheadFilePath) updateData.letterheadPath = letterheadFilePath;
  else if (typeof data.letterheadPath === 'string') {
    updateData.letterheadPath = data.letterheadPath.trim() === '' ? null : data.letterheadPath;
  }

  const nextSnapshot = {
    name: updateData.name ?? existing.name,
    title: updateData.title ?? existing.title,
    content: updateData.content ?? existing.content,
    headerLogo: updateData.headerLogo !== undefined ? updateData.headerLogo : existing.headerLogo,
    letterheadPath: updateData.letterheadPath !== undefined ? updateData.letterheadPath : existing.letterheadPath,
    defaultPropertyOfficer: updateData.defaultPropertyOfficer ?? existing.defaultPropertyOfficer,
    defaultAuthorizedRep: updateData.defaultAuthorizedRep ?? existing.defaultAuthorizedRep,
  };

  const revisionChanged =
    nextSnapshot.name !== existing.name ||
    nextSnapshot.title !== existing.title ||
    nextSnapshot.content !== existing.content ||
    nextSnapshot.headerLogo !== existing.headerLogo ||
    nextSnapshot.letterheadPath !== existing.letterheadPath ||
    nextSnapshot.defaultPropertyOfficer !== existing.defaultPropertyOfficer ||
    nextSnapshot.defaultAuthorizedRep !== existing.defaultAuthorizedRep;

  return prisma.$transaction(async (tx) => {
    // Unset old default if this one becomes the new default
    if (data.isDefault) {
      await tx.agreementTemplate.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const versionNumber = revisionChanged ? existing.currentVersion + 1 : existing.currentVersion;
    if (revisionChanged) updateData.currentVersion = versionNumber;

    const template = await tx.agreementTemplate.update({ where: { id }, data: updateData });

    if (revisionChanged) {
      await tx.agreementTemplateVersion.create({
        data: {
          templateId: id,
          versionNumber,
          name: nextSnapshot.name,
          title: nextSnapshot.title,
          content: nextSnapshot.content,
          headerLogo: nextSnapshot.headerLogo,
          letterheadPath: nextSnapshot.letterheadPath,
          defaultPropertyOfficer: nextSnapshot.defaultPropertyOfficer,
          defaultAuthorizedRep: nextSnapshot.defaultAuthorizedRep,
          changeSummary: 'Template edited',
        },
      });
    }

    return template;
  });
}

/** Delete a template and optionally its associated logo file. */
export async function deleteTemplate(id: string) {
  const template = await prisma.agreementTemplate.findUnique({ where: { id } });
  if (!template) throw new Error('Template not found');

  // Remove uploaded files from disk
  const filesToClean = [template.headerLogo, template.letterheadPath].filter(Boolean) as string[];
  for (const filePath of filesToClean) {
    const fullPath = path.resolve(__dirname, '../..', filePath.replace(/^\/+/, ''));
    try {
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch {
      // best-effort cleanup — don't fail the delete if file is gone
    }
  }

  return prisma.agreementTemplate.delete({ where: { id } });
}

/* ═══════════════════════════════════════════════════════
   TEMPLATE PREVIEW / VALIDATION
   ═══════════════════════════════════════════════════════ */

export function previewTemplate(content: string, mode: 'single' | 'multiple' = 'single') {
  const assets = mode === 'multiple'
    ? [
        { name: 'Dell Latitude 5540', serialNumber: 'SN-DL-2026-00123', propertyNumber: 'PN-2026-000456', condition: 'Good' },
        { name: 'HP LaserJet Pro', serialNumber: 'SN-HP-2026-00077', propertyNumber: 'PN-2026-000457', condition: 'Good' },
        { name: 'Logitech Dock', serialNumber: 'SN-LG-2026-00088', propertyNumber: 'PN-2026-000458', condition: 'Good' },
      ]
    : [{ name: 'Dell Latitude 5540', serialNumber: 'SN-DL-2026-00123', propertyNumber: 'PN-2026-000456', condition: 'Good' }];

  const resolvedText = sanitizeAgreementText(parseTemplate(content, {
    personnelName: 'Juan Dela Cruz',
    designation: 'Software Engineer',
    institution: 'DOST',
    project: 'AIO System',
    assetName: assets[0].name,
    serialNumber: assets[0].serialNumber,
    propertyNumber: assets[0].propertyNumber,
    condition: 'Good',
    assets: mode === 'multiple' ? assets : undefined,
  }));
  return { resolvedText, mode };
}

export { validateTemplateContent } from '../utils/templateParser';

/* ═══════════════════════════════════════════════════════
   AGREEMENT DOCUMENTS
   ═══════════════════════════════════════════════════════ */

export function makeDocumentNumber(prefix = 'AGR') {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}

export async function listAgreementDocuments(params: { personnelId?: string; assignmentId?: string; bulkBatchId?: string }) {
  const where: any = {};
  if (params.personnelId) where.personnelId = params.personnelId;
  if (params.bulkBatchId) where.bulkBatchId = params.bulkBatchId;
  if (params.assignmentId) where.assignments = { some: { id: params.assignmentId } };

  return prisma.agreementDocument.findMany({
    where,
    orderBy: { issuedAt: 'desc' },
    include: {
      assignments: { select: { id: true, asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true } } } },
      template: { select: { id: true, name: true, title: true, currentVersion: true } },
      templateVersionRecord: { select: { id: true, versionNumber: true, createdAt: true, changeSummary: true } },
      issuedBy: { select: { id: true, username: true, fullName: true } },
    },
  });
}

export async function attachSignedAgreementDocument(documentId: string, signedPdfPath: string, uploadedById: string) {
  const existing = await prisma.agreementDocument.findUnique({ where: { id: documentId } });
  if (!existing) throw new Error('Agreement document not found');

  return prisma.$transaction(async (tx) => {
    const document = await tx.agreementDocument.update({
      where: { id: documentId },
      data: {
        signedPdfPath,
        signedUploadedAt: new Date(),
        signedUploadedById: uploadedById,
        status: existing.recipientSignedAt ? 'signed_uploaded' : 'uploaded',
      },
    });

    await logAudit({
  userId: uploadedById ?? null,
  action: existing.signedPdfPath ? 'REPLACE_SIGNED_COPY' : 'UPLOAD_SIGNED_COPY',
  entityType: 'AgreementDocument',
  entityId: document.id ?? null,
  ipAddress: null,
  metadata: {
    "field": 'signedPdfPath',
    "oldValue": existing.signedPdfPath || null,
    "newValue": signedPdfPath,
    "severity": 'MEDIUM',
    "summary": `${existing.signedPdfPath ? 'Replaced' : 'Uploaded'} signed PDF copy for ${document.documentNumber}`,
  },
});

    return document;
  });
}

function buildHistoricalAgreementText(assignment: any, assets: any[]) {
  if (assignment.agreementText?.trim()) return assignment.agreementText.trim();

  const recipient = assignment.personnel?.fullName || assignment.assignedTo || 'Unknown recipient';
  const assetLines = assets.map((a, index) => {
    const serial = a.serialNumber ? `Serial: ${a.serialNumber}` : 'Serial: N/A';
    const property = a.propertyNumber ? `Property No.: ${a.propertyNumber}` : 'Property No.: N/A';
    const condition = a.condition ? `Condition: ${a.condition}` : 'Condition: Good';
    return `${index + 1}. ${a.name || 'Unnamed asset'} — ${serial}; ${property}; ${condition}`;
  }).join('\n');

  return [
    'ISSUANCE AND ACCOUNTABILITY AGREEMENT',
    '',
    `This historical accountability record confirms that the following asset${assets.length > 1 ? 's were' : ' was'} issued to ${recipient}.`,
    '',
    assetLines,
    '',
    'This document was generated as a backfilled immutable snapshot from existing assignment records.',
  ].join('\n');
}

function getDocumentStatus(assignments: any[]) {
  const hasSignedCopy = assignments.some(a => a.personnel?.signedAgreementPath);
  const hasRecipientSignature = assignments.some(a => a.recipientSignedAt);
  if (hasSignedCopy && hasRecipientSignature) return 'signed_uploaded';
  if (hasSignedCopy) return 'uploaded';
  if (hasRecipientSignature) return 'signed';
  return 'issued';
}

export async function backfillAgreementDocuments(params: { performedById: string; dryRun?: boolean }) {
  const missingAssignments = await prisma.assignment.findMany({
    where: { agreementDocumentId: null },
    orderBy: { assignedAt: 'asc' },
    include: {
      asset: { select: { id: true, name: true, serialNumber: true, propertyNumber: true } },
      personnel: {
        select: {
          id: true,
          fullName: true,
          designation: true,
          project: true,
          signedAgreementPath: true,
          designationLookup: { select: { name: true } },
          projectLookup: { select: { name: true } },
          institution: { select: { name: true } },
        },
      },
      agreement: { select: { id: true, name: true, title: true, headerLogo: true, letterheadPath: true, defaultPropertyOfficer: true, defaultAuthorizedRep: true, currentVersion: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { id: true, versionNumber: true } } } },
    },
  });

  const groups = new Map<string, typeof missingAssignments>();
  for (const assignment of missingAssignments) {
    const key = assignment.bulkBatchId ? `batch:${assignment.bulkBatchId}` : `assignment:${assignment.id}`;
    const current = groups.get(key) || [];
    current.push(assignment);
    groups.set(key, current);
  }

  const planned = Array.from(groups.entries()).map(([key, assignments]) => ({
    key,
    assignmentIds: assignments.map(a => a.id),
    bulkBatchId: assignments[0].bulkBatchId,
    personnelId: assignments[0].personnelId,
    personnelName: assignments[0].personnel?.fullName || assignments[0].assignedTo || 'Unknown recipient',
    assetCount: assignments.length,
    hasAgreementText: assignments.some(a => !!a.agreementText?.trim()),
  }));

  if (params.dryRun) {
    return { dryRun: true, missingAssignments: missingAssignments.length, groups: planned.length, planned };
  }

  let documentsCreated = 0;
  let assignmentsLinked = 0;
  const documents: Array<{ id: string; documentNumber: string; assignmentIds: string[]; bulkBatchId: string | null }> = [];

  for (const assignments of Array.from(groups.values())) {
    const first = assignments[0];
    const assets = assignments.map(a => ({
      id: a.asset.id,
      name: a.asset.name,
      serialNumber: a.asset.serialNumber,
      propertyNumber: a.asset.propertyNumber,
      condition: a.condition || 'Good',
    }));

    const existingBatchDocument = first.bulkBatchId
      ? await prisma.agreementDocument.findFirst({ where: { bulkBatchId: first.bulkBatchId } })
      : null;

    if (existingBatchDocument) {
      const updateResult = await prisma.assignment.updateMany({
        where: { id: { in: assignments.map(a => a.id) }, agreementDocumentId: null },
        data: { agreementDocumentId: existingBatchDocument.id },
      });
      assignmentsLinked += updateResult.count;
      documents.push({ id: existingBatchDocument.id, documentNumber: existingBatchDocument.documentNumber, assignmentIds: assignments.map(a => a.id), bulkBatchId: first.bulkBatchId });
      continue;
    }

    const signedAssignment = assignments.find(a => a.recipientSignedAt) || first;
    const signedCopyAssignment = assignments.find(a => a.personnel?.signedAgreementPath);
    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.agreementDocument.create({
        data: {
          documentNumber: makeDocumentNumber('AGR-BF'),
          templateId: first.agreementId || null,
          templateVersionId: first.agreement?.versions?.[0]?.id || null,
          templateVersion: first.agreement?.versions?.[0]?.versionNumber || first.agreement?.currentVersion || null,
          title: first.agreement?.title || 'ISSUANCE & ACCOUNTABILITY AGREEMENT',
          resolvedText: buildHistoricalAgreementText(first, assets),
          headerLogo: first.agreement?.headerLogo || null,
          letterheadPath: first.agreement?.letterheadPath || null,
          bulkBatchId: first.bulkBatchId || null,
          personnelId: first.personnelId || null,
          personnelNameSnapshot: first.personnel?.fullName || first.assignedTo || 'Unknown recipient',
          designationSnapshot: first.personnel?.designationLookup?.name || first.personnel?.designation || null,
          projectSnapshot: first.personnel?.projectLookup?.name || first.personnel?.project || null,
          institutionSnapshot: first.personnel?.institution?.name || null,
          assetSnapshot: assets,
          propertyOfficerName: first.agreement?.defaultPropertyOfficer || null,
          authorizedRepName: first.agreement?.defaultAuthorizedRep || null,
          status: getDocumentStatus(assignments),
          issuedAt: first.assignedAt,
          issuedById: first.userId || params.performedById,
          recipientSignedAt: signedAssignment.recipientSignedAt || null,
          recipientSignatureName: signedAssignment.recipientSignatureName || null,
          recipientSignatureMethod: signedAssignment.recipientSignatureMethod || null,
          recipientSignatureIp: signedAssignment.recipientSignatureIp || null,
          signedPdfPath: signedCopyAssignment?.personnel?.signedAgreementPath || null,
        },
      });

      const linked = await tx.assignment.updateMany({
        where: { id: { in: assignments.map(a => a.id) }, agreementDocumentId: null },
        data: { agreementDocumentId: created.id },
      });

      await logAudit({
  userId: params.performedById ?? null,
  action: 'BACKFILL',
  entityType: 'AgreementDocument',
  entityId: created.id ?? null,
  ipAddress: null,
  metadata: {
    "field": 'agreementDocumentId',
    "newValue": `${linked.count} historical assignment(s) linked`,
    "severity": 'MEDIUM',
    "summary": `Backfilled agreement document ${created.documentNumber} for ${linked.count} historical assignment(s)`,
  },
});

      return { created, linkedCount: linked.count };
    });

    documentsCreated += 1;
    assignmentsLinked += document.linkedCount;
    documents.push({ id: document.created.id, documentNumber: document.created.documentNumber, assignmentIds: assignments.map(a => a.id), bulkBatchId: first.bulkBatchId });
  }

  return {
    dryRun: false,
    missingAssignments: missingAssignments.length,
    groups: groups.size,
    documentsCreated,
    assignmentsLinked,
    documents,
  };
}

export async function sanitizeStoredAgreementTexts(params: { dryRun?: boolean; documentNumber?: string | null } = {}) {
  const documentWhere = params.documentNumber
    ? { documentNumber: params.documentNumber }
    : {
        OR: [
          { resolvedText: { contains: '%' } },
          { resolvedText: { contains: '─' } },
          { resolvedText: { contains: '━' } },
          { resolvedText: { contains: '═' } },
        ],
      };

  const assignmentWhere = params.documentNumber
    ? { agreementDocument: { is: { documentNumber: params.documentNumber } }, agreementText: { not: null } }
    : {
        agreementText: { not: null },
        OR: [
          { agreementText: { contains: '%' } },
          { agreementText: { contains: '─' } },
          { agreementText: { contains: '━' } },
          { agreementText: { contains: '═' } },
        ],
      };

  const [documents, assignments] = await Promise.all([
    prisma.agreementDocument.findMany({
      where: documentWhere,
      select: { id: true, documentNumber: true, resolvedText: true },
      orderBy: { issuedAt: 'desc' },
    }),
    prisma.assignment.findMany({
      where: assignmentWhere,
      select: { id: true, agreementText: true, agreementDocumentId: true, agreementDocument: { select: { documentNumber: true } } },
      orderBy: { assignedAt: 'desc' },
    }),
  ]);

  const documentChanges = documents
    .map((document) => ({
      id: document.id,
      documentNumber: document.documentNumber,
      before: document.resolvedText,
      after: sanitizeAgreementText(document.resolvedText),
    }))
    .filter((change) => change.before !== change.after);

  const assignmentChanges = assignments
    .map((assignment) => ({
      id: assignment.id,
      agreementDocumentId: assignment.agreementDocumentId,
      documentNumber: assignment.agreementDocument?.documentNumber || null,
      before: assignment.agreementText || '',
      after: sanitizeAgreementText(assignment.agreementText || ''),
    }))
    .filter((change) => change.before !== change.after);

  if (!params.dryRun) {
    await prisma.$transaction([
      ...documentChanges.map((change) => prisma.agreementDocument.update({
        where: { id: change.id },
        data: { resolvedText: change.after },
      })),
      ...assignmentChanges.map((change) => prisma.assignment.update({
        where: { id: change.id },
        data: { agreementText: change.after || null },
      })),
    ]);
  }

  return {
    dryRun: Boolean(params.dryRun),
    documentNumber: params.documentNumber || null,
    documentsScanned: documents.length,
    assignmentsScanned: assignments.length,
    documentsChanged: documentChanges.length,
    assignmentsChanged: assignmentChanges.length,
    documents: documentChanges.map(({ id, documentNumber }) => ({ id, documentNumber })),
    assignments: assignmentChanges.map(({ id, agreementDocumentId, documentNumber }) => ({ id, agreementDocumentId, documentNumber })),
  };
}

/* ═══════════════════════════════════════════════════════
   PDF GENERATION ENGINE
   ═══════════════════════════════════════════════════════ */

/** Strip signature-area lines from body text before rendering. */
function stripSignatureSection(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^_{5,}/.test(trimmed)) break;
    if (trimmed.startsWith('____')) break;
    if (trimmed.includes('By signing below')) break;
    result.push(line);
  }
  return result.join('\n');
}

interface TextSegment {
  text: string;
  fontSize: number;
  bold: boolean;
  color: string;
  indent: number;
  align: 'left' | 'justify';
  kind?: 'text' | 'divider' | 'assetHeader';
  /** Structured runs for underline rendering. When present, use these instead of flat text. */
  runs?: TextRun[];
}

function parseBodySegments(filled: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const lines = filled.split('\n');

  for (const rawLine of lines) {
    const raw = rawLine.replace(/\r/g, '');
    const ln = raw.trim();
    if (ln === '' || ln.startsWith('ISSUANCE AND ACCOUNTABILITY AGREEMENT')) continue;
    if (/^_{5,}/.test(ln) || ln.startsWith('____')) break;
    if (ln.includes('By signing below')) break;

    const percentCount = (ln.match(/%/g) || []).length;
    if (percentCount >= 5 && /^[%\s\-–—_]+$/.test(ln)) {
      segments.push({
        text: '',
        fontSize: 0,
        bold: false,
        color: '#000000',
        indent: 0,
        align: 'left',
        kind: 'divider',
      });
      continue;
    }

    let fontSize = 8.2;
    let bold = false;
    let color = '#333333';
    let indent = 38;
    let align: 'left' | 'justify' = 'left';
    let kind: TextSegment['kind'] = 'text';

    if (/^No\.\s+Asset Name\s+Serial Number\s+Property Number\s+Condition/i.test(ln)) {
      fontSize = 7.6;
      bold = true;
      color = '#111111';
      indent = 38;
      kind = 'assetHeader';
    } else if (ln.startsWith('Terms and Conditions:')) {
      fontSize = 8.8;
      bold = true;
      color = '#012061';
    } else if (/^\d+\./.test(ln)) {
      fontSize = 7.65;
      color = '#444444';
      indent = 46;
      align = 'justify';
    } else if (ln.startsWith('Asset:') || ln.startsWith('Serial') || ln.startsWith('Property') || ln.startsWith('Condition')) {
      fontSize = 7.8;
      indent = 50;
    }

    segments.push({ text: raw, fontSize, bold, color, indent, align, kind });
  }

  return segments;
}

/**
 * Split TextRun[] at newline boundaries, producing per-line run groups.
 * Newlines inside a run cause a split; the newline character itself is dropped.
 */
function splitRunsByLines(runs: TextRun[]): TextRun[][] {
  const lines: TextRun[][] = [[]];
  for (const run of runs) {
    if (!run.text) continue;
    const parts = run.text.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push([]); // newline → new line group
      if (parts[i]) lines[lines.length - 1].push({ text: parts[i], underline: run.underline });
    }
  }
  return lines;
}

/**
 * Join TextRun[] into a flat string (all underlines dropped).
 */
function runsToFlatText(runs: TextRun[]): string {
  return runs.map(r => r.text).join('');
}

/**
 * Mirrors sanitizeAgreementText() but preserves TextRun underline flags.
 * Strips percent-divider lines, inline dividers, CRLF normalisation.
 */
function sanitizeRuns(runs: TextRun[]): TextRun[] {
  // 1. Normalize CRLF → LF by splitting and rejoining runs
  const normalized = normalizeRunsNewlines(runs);

  // 2. Process line-by-line: remove divider lines, strip inline dividers
  const lineGroups = splitRunsByLines(normalized);
  const keptLines: TextRun[][] = [];

  for (const lineRuns of lineGroups) {
    const flat = lineRuns.map(r => r.text).join('').trim();
    const percentCount = (flat.match(/%/g) || []).length;

    // Remove divider rows (same logic as sanitizeAgreementText)
    if ((percentCount >= 5 && /^[%\s\-–—_]+$/.test(flat)) || /^[\s\-–—_─━═=]{5,}$/.test(flat)) {
      continue; // skip this line entirely
    }

    // Remove inline percent divider runs from each run's text
    const cleanedRuns: TextRun[] = [];
    for (const run of lineRuns) {
      const cleaned = run.text.replace(/[ \t]*%[%\s\-–—_]{4,}%[%\s\-–—_]*/g, ' ');
      if (cleaned) cleanedRuns.push({ text: cleaned, underline: run.underline });
    }
    if (cleanedRuns.length > 0) keptLines.push(cleanedRuns);
  }

  // 3. Rejoin with newlines, add newline runs between lines
  const result: TextRun[] = [];
  for (let i = 0; i < keptLines.length; i++) {
    if (i > 0) result.push({ text: '\n', underline: false });
    result.push(...keptLines[i]);
  }
  return result;
}

/** Normalize CRLF/CR to LF within TextRun[] */
function normalizeRunsNewlines(runs: TextRun[]): TextRun[] {
  const result: TextRun[] = [];
  for (const run of runs) {
    if (!run.text.includes('\r')) {
      result.push(run);
      continue;
    }
    const cleaned = run.text.replace(/\r\n?/g, '\n');
    if (cleaned) result.push({ text: cleaned, underline: run.underline });
  }
  return result;
}

/**
 * Mirrors stripLegacyAssetTableLines() but preserves TextRun underline flags.
 * Removes lines that are legacy asset table headers/rows.
 */
function stripLegacyAssetTableFromRuns(runs: TextRun[]): TextRun[] {
  const lineGroups = splitRunsByLines(runs);
  const keptLines: TextRun[][] = [];
  let skippingAssetTable = false;

  for (const lineRuns of lineGroups) {
    const flat = lineRuns.map(r => r.text).join('');
    const trimmed = flat.trim();

    const headerMatch = trimmed.match(LEGACY_ASSET_HEADER_PATTERN);
    if (headerMatch?.index !== undefined) {
      const beforeHeader = trimmed.slice(0, headerMatch.index).trim();
      if (beforeHeader) {
        // Keep any text before the header as a separate line
        keptLines.push([{ text: beforeHeader, underline: false }]);
      }
      skippingAssetTable = true;
      continue;
    }

    if (skippingAssetTable) {
      if (!trimmed) continue;
      if (/^\d+\s+/.test(trimmed) && /\s{2,}/.test(trimmed)) continue;
      skippingAssetTable = false;
    }

    keptLines.push(lineRuns);
  }

  // Rejoin
  const result: TextRun[] = [];
  for (let i = 0; i < keptLines.length; i++) {
    if (i > 0) result.push({ text: '\n', underline: false });
    result.push(...keptLines[i]);
  }
  return result;
}

/**
 * Mirrors stripSignatureAndLegacyTable() but preserves TextRun underline flags.
 * Stops at signature lines (_____ or "By signing below").
 */
function stripSignatureFromRuns(runs: TextRun[]): TextRun[] {
  const lineGroups = splitRunsByLines(runs);
  const keptLines: TextRun[][] = [];
  let skippingAssetTable = false;

  for (const lineRuns of lineGroups) {
    const flat = lineRuns.map(r => r.text).join('');
    const trimmed = flat.trim();

    if (!trimmed) {
      if (!skippingAssetTable) keptLines.push(lineRuns);
      continue;
    }

    // Stop at signature markers
    if (/^_{5,}/.test(trimmed) || trimmed.includes('By signing below')) break;

    const headerMatch = trimmed.match(LEGACY_ASSET_HEADER_PATTERN);
    if (headerMatch?.index !== undefined) {
      const beforeHeader = trimmed.slice(0, headerMatch.index).trim();
      if (beforeHeader) keptLines.push([{ text: beforeHeader, underline: false }]);
      skippingAssetTable = true;
      continue;
    }

    if (skippingAssetTable) {
      if (/^\d+\s+/.test(trimmed) && /\s{2,}/.test(trimmed)) continue;
      skippingAssetTable = false;
    }

    keptLines.push(lineRuns);
  }

  // Rejoin
  const result: TextRun[] = [];
  for (let i = 0; i < keptLines.length; i++) {
    if (i > 0) result.push({ text: '\n', underline: false });
    result.push(...keptLines[i]);
  }
  return result;
}

/**
 * Given a set of line groups and a section text, extract the runs that
 * correspond to that section. This works by matching the section text
 * against the concatenated line group text.
 */
function splitRunsForSection(lineGroups: TextRun[][], sectionText: string): TextRun[] {
  if (!sectionText.trim()) return [];
  const sectionLines = sectionText.split('\n').map(l => l.trim());
  const result: TextRun[] = [];
  let lineIdx = 0;

  for (const lineRuns of lineGroups) {
    const flat = lineRuns.map(r => r.text).join('').trim();
    if (!flat) continue;
    if (lineIdx < sectionLines.length && flat === sectionLines[lineIdx]) {
      if (lineIdx > 0) result.push({ text: '\n', underline: false });
      result.push(...lineRuns);
      lineIdx++;
    } else if (lineIdx < sectionLines.length) {
      // Fuzzy match: check if the line starts with the section line
      // (handles trimming differences)
      if (sectionLines[lineIdx].startsWith(flat) || flat.startsWith(sectionLines[lineIdx])) {
        if (lineIdx > 0) result.push({ text: '\n', underline: false });
        result.push(...lineRuns);
        lineIdx++;
      }
    }
  }
  return result;
}

/**
 * Process TextRun[] through the same pipeline as the flat text path:
 * 1. sanitize (strip dividers, normalize CRLF)
 * 2. strip signature section
 * 3. strip legacy asset table lines
 * 4. trim each line
 * 5. collapse multiple blank lines
 *
 * Returns both the flat body text and the per-line run groups with underline info.
 */
function processRunsForBody(runs: TextRun[]): {
  bodyText: string;
  lineGroups: TextRun[][];
} {
  let processed = sanitizeRuns(runs);
  processed = stripSignatureFromRuns(processed);
  processed = stripLegacyAssetTableFromRuns(processed);

  // Normalize: strip trailing whitespace per line, trim each line,
  // collapse multiple blank lines
  let lineGroups = splitRunsByLines(processed);

  // Trim each line's runs (leading/trailing whitespace)
  lineGroups = lineGroups.map(lineRuns => {
    if (lineRuns.length === 0) return lineRuns;
    // Trim leading whitespace from first run
    const first = lineRuns[0];
    const trimmedFirst = { text: first.text.replace(/^\s+/, ''), underline: first.underline };
    // Trim trailing whitespace from last run
    const last = lineRuns[lineRuns.length - 1];
    const trimmedLast = { text: last.text.replace(/\s+$/, ''), underline: last.underline };
    const result = [...lineRuns];
    result[0] = trimmedFirst;
    result[result.length - 1] = trimmedLast;
    return result.filter(r => r.text);
  });

  // Remove consecutive blank lines (collapse to single blank)
  const filtered: TextRun[][] = [];
  let prevBlank = false;
  for (const lineRuns of lineGroups) {
    const flat = lineRuns.map(r => r.text).join('').trim();
    if (!flat) {
      if (!prevBlank) filtered.push(lineRuns);
      prevBlank = true;
    } else {
      filtered.push(lineRuns);
      prevBlank = false;
    }
  }

  const bodyText = filtered.map(lg => lg.map(r => r.text).join('')).join('\n').trim();
  return { bodyText, lineGroups: filtered.filter(lg => lg.some(r => r.text.trim())) };
}

/**
 * Like parseBodySegments(), but uses pre-computed TextRun[] from template parsing
 * so underlines are based on actual {{variable}} boundaries, not value matching.
 */
function parseBodySegmentsFromRuns(lineGroups: TextRun[][]): TextSegment[] {
  const segments: TextSegment[] = [];

  for (const lineRuns of lineGroups) {
    const raw = lineRuns.map(r => r.text).join('');
    const ln = raw.trim();
    if (ln === '' || ln.startsWith('ISSUANCE AND ACCOUNTABILITY AGREEMENT')) continue;
    if (/^_{5,}/.test(ln) || ln.startsWith('____')) break;
    if (ln.includes('By signing below')) break;

    const percentCount = (ln.match(/%/g) || []).length;
    if (percentCount >= 5 && /^[%\s\-–—_]+$/.test(ln)) {
      segments.push({
        text: '', fontSize: 0, bold: false, color: '#000000',
        indent: 0, align: 'left', kind: 'divider',
      });
      continue;
    }

    let fontSize = 8.2;
    let bold = false;
    let color = '#333333';
    let indent = 38;
    let align: 'left' | 'justify' = 'left';
    let kind: TextSegment['kind'] = 'text';

    if (/^No\.\s+Asset Name\s+Serial Number\s+Property Number\s+Condition/i.test(ln)) {
      fontSize = 7.6; bold = true; color = '#111111'; indent = 38; kind = 'assetHeader';
    } else if (ln.startsWith('Terms and Conditions:')) {
      fontSize = 8.8; bold = true; color = '#012061';
    } else if (/^\d+\./.test(ln)) {
      fontSize = 7.65; color = '#444444'; indent = 46; align = 'justify';
    } else if (ln.startsWith('Asset:') || ln.startsWith('Serial') || ln.startsWith('Property') || ln.startsWith('Condition')) {
      fontSize = 7.8; indent = 50;
    }

    // Only include runs if there are underlined values
    const hasUnderline = lineRuns.some(r => r.underline);
    segments.push({
      text: raw, fontSize, bold, color, indent, align, kind,
      runs: hasUnderline ? lineRuns : undefined,
    });
  }

  return segments;
}

type PdfAsset = AgreementDocumentView['assets'][number];

function splitBodyAndTerms(text: string): { bodyText: string; termsText: string } {
  const lines = text.split('\n');
  const termsIndex = lines.findIndex((line) => line.trim().startsWith('Terms and Conditions:'));

  if (termsIndex === -1) {
    return { bodyText: text, termsText: '' };
  }

  return {
    bodyText: lines.slice(0, termsIndex).join('\n').trim(),
    termsText: lines.slice(termsIndex).join('\n').trim(),
  };
}

// Asset table is rendered directly via PDFKit. Do NOT pipe assets through sanitizeAgreementText().
// contentBottomY and newPageStartY are explicit so the table respects letterhead-safe zones.
// onNewPage callback redraws the letterhead/header on continuation pages.
function renderAssetTableToPdf(
  doc: PDFKit.PDFDocument,
  assets: PdfAsset[],
  x: number,
  startY: number,
  contentWidth: number,
  contentBottomY: number = 755,
  newPageStartY: number = 130,
  onNewPage?: () => number,
): number {
  if (!assets.length) return startY;

  const pageBottomY = contentBottomY;
  const paddingX = 3;
  const paddingY = 4;
  const headerHeight = 18;
  const fontSize = 6.8;
  const headerFontSize = 6.5;
  const minRowHeight = 20;
  const columns = [
    { key: 'no', label: 'No.', width: 24, align: 'center' as const },
    { key: 'name', label: 'Asset Name', width: Math.floor(contentWidth * 0.34), align: 'left' as const },
    { key: 'serialNumber', label: 'Serial Number', width: Math.floor(contentWidth * 0.20), align: 'left' as const },
    { key: 'propertyNumber', label: 'Property Number', width: Math.floor(contentWidth * 0.21), align: 'left' as const },
    { key: 'condition', label: 'Condition', width: 0, align: 'left' as const },
  ];
  const usedWidth = columns.slice(0, -1).reduce((sum, col) => sum + col.width, 0);
  columns[columns.length - 1].width = Math.max(52, contentWidth - usedWidth);

  const ensureSpace = (y: number, height: number) => {
    if (y + height <= pageBottomY) return y;
    // Use the callback to add a continuation page (which redraws letterhead/header)
    if (onNewPage) return onNewPage();
    // Fallback: plain new page without header (preprinted mode without content zones)
    doc.addPage();
    doc.y = 0;
    return newPageStartY;
  };

  const drawHeader = (y: number) => {
    let currentX = x;
    doc.font('Helvetica-Bold').fontSize(headerFontSize).fillColor('#111827');
    for (const column of columns) {
      doc
        .rect(currentX, y, column.width, headerHeight)
        .fillAndStroke('#e5e7eb', '#94a3b8');
      doc.fillColor('#111827').text(column.label, currentX + paddingX, y + 5, {
        width: column.width - paddingX * 2,
        align: column.align,
        lineBreak: false,
      });
      currentX += column.width;
    }
    doc.y = 0;
    return y + headerHeight;
  };

  let y = ensureSpace(startY, headerHeight + minRowHeight);
  y = drawHeader(y);

  for (const asset of assets) {
    const values: Record<string, string> = {
      no: String(asset.no),
      name: asset.name,
      serialNumber: asset.serialNumber,
      propertyNumber: asset.propertyNumber,
      condition: asset.condition,
    };

    doc.font('Helvetica').fontSize(fontSize);
    const rowTextHeight = columns.reduce((max, column) => {
      const text = values[column.key] || '—';
      const height = doc.heightOfString(text, {
        width: column.width - paddingX * 2,
        align: column.align,
        lineBreak: true,
      });
      return Math.max(max, height);
    }, 0);
    const rowHeight = Math.max(minRowHeight, rowTextHeight + paddingY * 2);

    y = ensureSpace(y, rowHeight);
    if (y === newPageStartY) y = drawHeader(y);

    let currentX = x;
    for (const column of columns) {
      const text = values[column.key] || '—';
      doc
        .rect(currentX, y, column.width, rowHeight)
        .fillAndStroke('#ffffff', '#cbd5e1');
      doc.font('Helvetica').fontSize(fontSize).fillColor('#1f2937').text(text, currentX + paddingX, y + paddingY, {
        width: column.width - paddingX * 2,
        align: column.align,
        lineBreak: true,
      });
      currentX += column.width;
    }
    doc.y = 0;
    y += rowHeight;
  }

  return y + 8;
}

const LEGACY_ASSET_HEADER_PATTERN = /\bNo\.\s+Asset Name\s+Serial Number\s+Property Number\s+Condition\b/i;

function stripLegacyAssetTableLines(text: string): string {
  const kept: string[] = [];
  let skippingAssetTable = false;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    const headerMatch = line.match(LEGACY_ASSET_HEADER_PATTERN);

    if (headerMatch?.index !== undefined) {
      const beforeHeader = line.slice(0, headerMatch.index).trim();
      if (beforeHeader) kept.push(beforeHeader);
      skippingAssetTable = true;
      continue;
    }

    if (skippingAssetTable) {
      if (!line) continue;
      if (/^\d+\s+/.test(line) && /\s{2,}/.test(line)) continue;
      skippingAssetTable = false;
    }

    kept.push(rawLine);
  }

  return kept.join('\n');
}

export function sanitizeAgreementText(text: string | null | undefined): string {
  if (!text) return '';

  const withoutDividers = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      const percentCount = (trimmed.match(/%/g) || []).length;

      // Remove old PDF/table placeholder divider rows. These were layout
      // artifacts, not agreement content, and must not appear in stored
      // snapshots, previews, or PDFs. Also remove non-percent divider rows.
      if (
        (percentCount >= 5 && /^[%\s\-–—_]+$/.test(trimmed)) ||
        /^[\s\-–—_─━═=]{5,}$/.test(trimmed)
      ) {
        return '';
      }

      // Remove inline/decorated percent divider runs embedded in older snapshots.
      return line.replace(/[ \t]*%[%\s\-–—_]{4,}%[%\s\-–—_]*/g, ' ');
    })
    .join('\n');

  return stripLegacyAssetTableLines(withoutDividers)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function loadLogoImage(logoPath: string | null | undefined): Buffer | null {
  if (!logoPath) return null;
  const fullPath = path.resolve(__dirname, '../..', logoPath.replace(/^\/+/, ''));
  try {
    if (fs.existsSync(fullPath)) return fs.readFileSync(fullPath);
  } catch {}
  return null;
}

export interface AgreementPdfParams {
  personnelName: string;
  designation?: string | null;
  position?: string | null;
  project?: string | null;
  institution?: string | null;
  assetName: string;
  serialNumber?: string | null;
  propertyNumber?: string | null;
  condition?: string | null;
  templateId?: string | null;
  agreementText?: string | null;
  title?: string | null;
  propertyOfficerName?: string | null;
  authorizedRepName?: string | null;
  assets?: Array<{ name: string; serialNumber?: string | null; propertyNumber?: string | null; condition?: string | null }>;
  recipientSignedAt?: string | Date | null;
  recipientSignatureName?: string | null;
  documentNumber?: string | null;
  agreementDocumentId?: string | null;
  renderMode?: 'preprinted' | 'fullDigital';
  /** Snapshot letterhead path from AgreementDocument — takes priority over current template */
  letterheadPath?: string | null;
  /**
   * Internal: template/version content used only to recover {{variable}}
   * boundaries for underlining saved agreement text.
   */
  templateContentForRuns?: string | null;
}

function assetSnapshotArray(snapshot: unknown): Array<{ name: string; serialNumber?: string | null; propertyNumber?: string | null; condition?: string | null }> {
  if (!Array.isArray(snapshot)) return [];
  return snapshot
    .map((item: any) => ({
      name: String(item?.name || '').trim(),
      serialNumber: item?.serialNumber ?? null,
      propertyNumber: item?.propertyNumber ?? null,
      condition: item?.condition ?? null,
    }))
    .filter((item) => item.name);
}

function pdfAssetArray(assets: AgreementPdfParams['assets']): Array<{ name: string; serialNumber?: string | null; propertyNumber?: string | null; condition?: string | null }> {
  if (!Array.isArray(assets)) return [];
  return assets
    .map((item: any) => ({
      name: String(item?.name || '').trim(),
      serialNumber: item?.serialNumber ?? null,
      propertyNumber: item?.propertyNumber ?? null,
      condition: item?.condition ?? null,
    }))
    .filter((item) => item.name);
}

export async function resolveAgreementPdfParams(p: AgreementPdfParams): Promise<AgreementPdfParams> {
  if (!p.agreementDocumentId) return p;

  const document = await prisma.agreementDocument.findUnique({
    where: { id: p.agreementDocumentId },
    include: {
      assignments: {
        orderBy: { assignedAt: 'asc' },
        include: {
          asset: { select: { name: true, serialNumber: true, propertyNumber: true } },
        },
      },
      personnel: {
        select: {
          fullName: true,
          designation: true,
          project: true,
          designationLookup: { select: { name: true } },
          projectLookup: { select: { name: true } },
          institution: { select: { name: true } },
        },
      },
      templateVersionRecord: {
        select: { content: true },
      },
    },
  });

  if (!document) throw new Error('Agreement document not found');

  const assignmentAssets = document.assignments
    .map((assignment) => ({
      name: String(assignment.asset?.name || '').trim(),
      serialNumber: assignment.asset?.serialNumber || null,
      propertyNumber: assignment.asset?.propertyNumber || null,
      condition: assignment.conditionAtIssue || assignment.condition || p.condition || 'Good',
    }))
    .filter((asset) => asset.name);
  const snapshotAssets = assetSnapshotArray(document.assetSnapshot);
  const frontendAssets = pdfAssetArray(p.assets);
  const legacySingleAsset = p.assetName?.trim()
    ? [{
        name: p.assetName.trim(),
        serialNumber: p.serialNumber || null,
        propertyNumber: p.propertyNumber || null,
        condition: p.condition || 'Good',
      }]
    : [];

  // Asset source priority for document-level PDF rendering:
  // 1. Linked AgreementDocument assignments with live Asset records.
  // 2. AgreementDocument.assetSnapshot captured at issuance time.
  // 3. Frontend payload assets, used only as a final fallback.
  // 4. Legacy single asset fields, used only as the last-resort compatibility path.
  const resolvedAssets = assignmentAssets.length
    ? assignmentAssets
    : snapshotAssets.length
      ? snapshotAssets
      : frontendAssets.length
        ? frontendAssets
        : legacySingleAsset;
  const primaryAsset = resolvedAssets[0];

  return {
    ...p,
    personnelName: document.personnelNameSnapshot || document.personnel?.fullName || p.personnelName,
    designation: document.designationSnapshot || document.personnel?.designationLookup?.name || document.personnel?.designation || p.designation || p.position || null,
    position: document.designationSnapshot || document.personnel?.designationLookup?.name || document.personnel?.designation || p.position || null,
    project: document.projectSnapshot || document.personnel?.projectLookup?.name || document.personnel?.project || p.project || null,
    institution: document.institutionSnapshot || document.personnel?.institution?.name || p.institution || null,
    assetName: primaryAsset?.name || p.assetName,
    serialNumber: primaryAsset?.serialNumber || p.serialNumber || null,
    propertyNumber: primaryAsset?.propertyNumber || p.propertyNumber || null,
    condition: primaryAsset?.condition || p.condition || 'Good',
    templateId: document.templateId || p.templateId || null,
    agreementText: document.resolvedText || p.agreementText || null,
    title: document.title || p.title || null,
    propertyOfficerName: document.propertyOfficerName || p.propertyOfficerName || null,
    authorizedRepName: document.authorizedRepName || p.authorizedRepName || null,
    assets: resolvedAssets.length ? resolvedAssets : p.assets,
    recipientSignedAt: document.recipientSignedAt || p.recipientSignedAt || null,
    recipientSignatureName: document.recipientSignatureName || p.recipientSignatureName || null,
    documentNumber: document.documentNumber || p.documentNumber || null,
    letterheadPath: document.letterheadPath ?? p.letterheadPath ?? null,
    templateContentForRuns: document.templateVersionRecord?.content || p.templateContentForRuns || null,
  };
}

export async function generateAgreementPdf(input: AgreementPdfParams): Promise<Buffer> {
  const p = await resolveAgreementPdfParams(input);
  const {
    personnelName, designation, position, project, institution, assetName, serialNumber,
    propertyNumber, condition, templateId, agreementText,
    propertyOfficerName, authorizedRepName, assets, recipientSignedAt, recipientSignatureName, documentNumber,
  } = p;

  const renderMode: 'preprinted' | 'fullDigital' = input.renderMode ?? 'preprinted';

  const tmpl = templateId
    ? (await prisma.agreementTemplate.findUnique({ where: { id: templateId } })) || (await getDefaultTemplate())
    : await getDefaultTemplate();
  const templateContent = tmpl?.content?.trim() ? tmpl.content : FALLBACK_AGREEMENT_TEMPLATE;

  const titleText = p.title || tmpl?.title || FALLBACK_AGREEMENT_TITLE;
  const templateData = {
    personnelName,
    designation: designation || position || undefined,
    project: project || undefined,
    institution: institution || undefined,
    assetName,
    serialNumber: serialNumber || undefined,
    propertyNumber: propertyNumber || undefined,
    condition: condition || undefined,
    assets: assets?.map(a => ({
      name: a.name,
      serialNumber: a.serialNumber || undefined,
      propertyNumber: a.propertyNumber || undefined,
      condition: a.condition || condition || undefined,
    })) || undefined,
  };

  // Compute structured TextRun[] from real {{variable}} boundaries whenever
  // template/version content is available. Saved agreementText remains the
  // source of flat text, while templateContentForRuns recovers underline
  // boundaries for historical document previews.
  const hasSavedAgreementText = Boolean(agreementText && agreementText.trim().length > 0);
  const underlineTemplateContent = p.templateContentForRuns?.trim()
    ? p.templateContentForRuns
    : templateContent;
  const filledRuns: TextRun[] | null = (!hasSavedAgreementText || p.templateContentForRuns || templateId)
    ? parseTemplateWithRuns(underlineTemplateContent, templateData)
    : null;

  const filled = agreementText && agreementText.trim().length > 0
    ? sanitizeAgreementText(agreementText)
    : filledRuns
      ? runsToFlatText(sanitizeRuns(filledRuns))
      : sanitizeAgreementText(parseTemplate(templateContent, templateData));

  const documentView = buildAgreementDocumentView({
    title: titleText,
    documentNumber,
    personnelName,
    designation,
    position,
    project,
    institution,
    assetName,
    serialNumber,
    propertyNumber,
    condition,
    agreementText: filled,
    assets: assets?.map(a => ({
      name: a.name,
      serialNumber: a.serialNumber,
      propertyNumber: a.propertyNumber,
      condition: a.condition || condition,
    })),
    propertyOfficerName: propertyOfficerName || tmpl?.defaultPropertyOfficer,
    authorizedRepName: authorizedRepName || tmpl?.defaultAuthorizedRep,
    recipientSignedAt,
    recipientSignatureName,
  });

  const cleanBodyText = stripLegacyAssetTableLines(sanitizeAgreementText(documentView.bodyText))
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
  const { bodyText, termsText } = splitBodyAndTerms(cleanBodyText);

  // Build segments: when we have structured runs from template parsing,
  // process them through the same pipeline and use parseBodySegmentsFromRuns
  // for accurate variable-boundary underlines. Otherwise, fall back to
  // flat-text parsing with no underlines.
  let bodySegments: TextSegment[];
  let termsSegments: TextSegment[];
  if (filledRuns) {
    const processed = processRunsForBody(filledRuns);
    const { bodyText: runsBody, termsText: runsTerms } = splitBodyAndTerms(processed.bodyText);
    const bodyLineGroups = splitRunsByLines(
      // Re-derive line groups matching the body/terms split
      splitRunsForSection(processed.lineGroups, runsBody)
    );
    const termsLineGroups = runsTerms
      ? splitRunsByLines(splitRunsForSection(processed.lineGroups, runsTerms))
      : [];
    bodySegments = parseBodySegmentsFromRuns(bodyLineGroups);
    termsSegments = termsLineGroups.length > 0
      ? parseBodySegmentsFromRuns(termsLineGroups)
      : parseBodySegments(termsText);
  } else {
    bodySegments = parseBodySegments(bodyText);
    termsSegments = parseBodySegments(termsText);
  }

  // Resolve letterhead: prefer document snapshot, then template
  // PDF letterheads are converted to PNG at upload time, so letterheadPath always
  // points to a renderable image (PNG/JPG). If a stale .pdf path slips through,
  // we skip it rather than silently producing a blank header.
  const resolvedLetterheadPath = p.letterheadPath || tmpl?.letterheadPath || null;
  let letterheadBuffer: Buffer | null = null;
  if (renderMode === 'fullDigital' && resolvedLetterheadPath) {
    const fullPath = path.resolve(__dirname, '../..', resolvedLetterheadPath.replace(/^\/+/, ''));
    try {
      if (fs.existsSync(fullPath)) {
        const ext = path.extname(fullPath).toLowerCase();
        if (ext === '.pdf') {
          // PDF letterheads should have been converted to PNG at upload time.
          // If a raw .pdf path reaches here, skip it — PDFKit cannot render PDFs.
        } else {
          letterheadBuffer = fs.readFileSync(fullPath);
        }
      }
    } catch { /* best-effort, don't crash PDF generation */ }
  }
  const logoData = loadLogoImage(tmpl?.headerLogo ?? null);

  // A4 dimensions in PDF points
  const PW = 595.28;
  const PH = 841.89;
  const M = 32; // base margin
  const CW = PW - (M * 2);

  // Safe content zones based on letterhead analysis
  const HEADER_ZONE_BOTTOM = 115;       // letterhead header area ends here
  const TITLE_Y = 148;                  // document title center line
  const CONTENT_TOP_Y = 185;           // body/table starts below title
  const CONTENT_BOTTOM_Y = 755;        // content must not overlap footer
  const CONTENT_LEFT = M + 6;
  const CONTENT_WIDTH = CW - 12;
  const SIG_BLOCK_HEIGHT = 58;
  const FOOTER_TEXT_Y = PH - 70;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
      bufferPages: true,
    });

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    function textAbs(text: string, x: number, y: number, opts: { width?: number; align?: string; fontSize?: number; font?: string; color?: string; lineBreak?: boolean } = {}) {
      if (opts.font) doc.font(opts.font);
      if (opts.fontSize != null) doc.fontSize(opts.fontSize);
      if (opts.color) doc.fillColor(opts.color);
      doc.text(text, x, y, { width: opts.width ?? CW, align: (opts.align as any) ?? 'left', lineBreak: opts.lineBreak ?? false });
      doc.y = 0;
    }

    /** Draw the letterhead background image on the current page (fullDigital only) */
    function drawLetterheadBackground() {
      if (!letterheadBuffer) return;
      try {
        doc.image(letterheadBuffer, 0, 0, { width: PW, height: PH });
      } catch { /* best-effort, don't crash PDF generation */ }
    }

    /** Draw header area: letterhead background or fallback logo.
     *  Does NOT draw the document title — that is separate. */
    function renderHeader() {
      if (renderMode === 'preprinted') {
        // Preprinted: no letterhead background, no logo — the physical paper has them.
        return;
      }
      // fullDigital mode
      if (letterheadBuffer) {
        drawLetterheadBackground();
        return;
      }
      // No full letterhead: fall back to logo only (title is drawn separately)
      if (logoData) {
        try { doc.image(logoData, M, 42, { width: 78 }); doc.y = 0; } catch {}
      }
    }

    /** Draw the document title centered below the header area.
     *  Only drawn on the first page. */
    function renderTitle() {
      if (!titleText || !titleText.trim()) return; // skip empty titles
      let titleFontSize = 16;
      let titleWidth = doc.font('Helvetica-Bold').fontSize(titleFontSize).widthOfString(titleText);
      while (titleWidth > CW && titleFontSize > 10) {
        titleFontSize -= 0.5;
        titleWidth = doc.font('Helvetica-Bold').fontSize(titleFontSize).widthOfString(titleText);
      }
      const titleColor = renderMode === 'preprinted' ? '#222222' : (letterheadBuffer ? '#222222' : '#1a1a1a');
      textAbs(titleText, M, TITLE_Y, { width: CW, align: 'center', fontSize: titleFontSize, font: 'Helvetica-Bold', color: titleColor });
    }

    /** Footer: page number and document number. In preprinted mode, skip the
     *  decorative footer to avoid colliding with the pre-printed letterhead footer. */
    function addFooter(page: number, total: number) {
      if (renderMode === 'preprinted') {
        // In preprinted mode, only place a small page number inside the safe
        // content area (above CONTENT_BOTTOM_Y) to avoid the printed footer.
        doc.font('Helvetica').fontSize(6).fillColor('#b0b0b0');
        doc.text(`${page}`, M, CONTENT_BOTTOM_Y + 2, { width: CW, align: 'right', lineBreak: false });
        doc.y = 0;
        return;
      }
      // Full digital mode: standard footer in the letterhead footer area
      doc.font('Helvetica').fontSize(7).fillColor('#94a3b8');
      doc.text(`Page ${page} of ${total}`, M, FOOTER_TEXT_Y, { width: CW, height: 8, align: 'center', lineBreak: false });
      if (documentView.documentNumber) doc.text(documentView.documentNumber, M, FOOTER_TEXT_Y, { width: CW, height: 8, align: 'right', lineBreak: false });
      doc.y = 0;
    }

    /** Add a continuation page. Redraws letterhead/background on every page
     *  but only draws the title on the first page. */
    function addContinuationPage(isFirstPage: boolean): number {
      doc.addPage();
      renderHeader();
      if (isFirstPage) {
        renderTitle();
        return CONTENT_TOP_Y;
      }
      // Continuation pages: body starts right below header zone, no title
      return HEADER_ZONE_BOTTOM + 15; // y ≈ 130
    }

    // --- Begin rendering ---
    renderHeader();
    renderTitle();
    let y = CONTENT_TOP_Y;

    function renderSegments(segmentsToRender: TextSegment[]) {
      for (const seg of segmentsToRender) {
        if (seg.kind === 'divider') continue;

        const width = PW - M - seg.indent;
        const font = seg.bold ? 'Helvetica-Bold' : 'Helvetica';
        const h = doc.font(font).fontSize(seg.fontSize).heightOfString(seg.text, { width, align: seg.align as any, lineBreak: true });
        const lh = h + 1;
        if (y + lh > CONTENT_BOTTOM_Y) y = addContinuationPage(false);

        // Render the segment text first (always via textAbs for consistent positioning)
        textAbs(seg.text, seg.indent, y, { width, fontSize: seg.fontSize, font, color: seg.color, align: seg.align, lineBreak: true });

        // If the segment has underlined runs, draw manual underline lines
        // beneath each underlined variable value. We compute x-positions by
        // measuring each run's width with the same font/size.
        if (seg.runs && seg.runs.length > 0) {
          const textX = seg.indent;

          // Measure font metrics for underline positioning
          const fontAscent = doc.font(font).fontSize(seg.fontSize).currentLineHeight(true);
          const ulOffset = fontAscent * 0.15; // underline sits just below baseline

          // Track x position across runs, wrapping at the right margin.
          // PDFKit word-wraps the text; we mirror that for underline positions.
          let curX = textX;
          const maxX = seg.indent + width;
          let curLineY = y;
          const lineH = doc.font(font).fontSize(seg.fontSize).heightOfString('Ay', { width: Infinity });

          for (const run of seg.runs) {
            if (!run.text) continue;
            const runW = doc.font(font).fontSize(seg.fontSize).widthOfString(run.text);
            // Wrap to next line if this run overflows
            if (curX + runW > maxX && curX > textX) {
              curX = textX;
              curLineY += lineH;
            }
            // Draw underline strokes for underlined runs
            if (run.underline && run.text.trim()) {
              // For long values that wrap across lines, draw per-word underlines
              const words = run.text.split(/(\s+)/);
              let wordX = curX;
              for (const word of words) {
                if (!word) continue;
                const wordW = doc.font(font).fontSize(seg.fontSize).widthOfString(word);
                if (wordX + wordW > maxX && wordX > textX) {
                  wordX = textX;
                  curLineY += lineH;
                }
                if (word.trim()) {
                  const ulY = curLineY + fontAscent + ulOffset;
                  doc.moveTo(wordX, ulY).lineTo(wordX + wordW, ulY)
                    .strokeColor(seg.color || '#333333').lineWidth(0.4).stroke();
                  doc.y = 0;
                }
                wordX += wordW;
              }
            }
            curX += runW;
          }
        }

        y += lh;

        if (seg.kind === 'assetHeader') {
          const lineY = y + 2;
          const lineW = CW * 0.82;
          doc.moveTo(seg.indent, lineY).lineTo(seg.indent + lineW, lineY).strokeColor('#000000').lineWidth(0.8).stroke();
          doc.y = 0;
          y += 7;
        }
      }
    }

    renderSegments(bodySegments);
    if (documentView.assets.length) {
      y = renderAssetTableToPdf(doc, documentView.assets, CONTENT_LEFT, y + 8, CONTENT_WIDTH, CONTENT_BOTTOM_Y, CONTENT_TOP_Y, () => addContinuationPage(false));
    }
    renderSegments(termsSegments);

    // Signature block: ensure it fits entirely on one page
    if (y + SIG_BLOCK_HEIGHT > CONTENT_BOTTOM_Y) y = addContinuationPage(false);
    const sigLineY = Math.max(y + 14, CONTENT_BOTTOM_Y - SIG_BLOCK_HEIGHT);
    const sigLabelY = sigLineY + 14;
    const colW = (CW - 20) / 3;
    const sigCols = documentView.signatures.map((signature, index) => ({
      x: M + (colW + 10) * index,
      label: signature.label,
      subtitle: signature.subtitle || signature.role,
    }));

    for (const col of sigCols) {
      doc.moveTo(col.x, sigLineY).lineTo(col.x + colW, sigLineY).strokeColor('#bbbbbb').lineWidth(0.4).stroke();
      doc.y = 0;
      textAbs(col.label, col.x, sigLineY + 4, { width: colW, align: 'center', fontSize: 8, color: '#333333' });
      textAbs(col.subtitle, col.x, sigLabelY, { width: colW, align: 'center', fontSize: 7, color: '#888888', font: 'Helvetica-Bold' });
    }

    // Verification URL footnote for signed documents
    if (recipientSignedAt && documentNumber) {
      const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
      const verifyUrl = `${baseUrl}/aio-system/agreements/verify/${documentNumber}`;
      const verifyY = sigLabelY + 14;
      if (verifyY + 10 < CONTENT_BOTTOM_Y) {
        doc.font('Helvetica').fontSize(7).fillColor('#94a3b8');
        doc.text(`Document authenticity can be verified at: ${verifyUrl}`, M, verifyY, { width: CW, align: 'center', lineBreak: false });
        doc.y = 0;
      }
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      addFooter(i + 1, range.count);
    }

    doc.end();
  });
}
