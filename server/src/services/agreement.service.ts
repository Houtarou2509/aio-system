import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { parseTemplate } from '../utils/templateParser';



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
}

interface TemplateUpdateData {
  name?: string;
  title?: string;
  content?: string;
  isDefault?: boolean;
  defaultPropertyOfficer?: string;
  defaultAuthorizedRep?: string;
}

/* ═══════════════════════════════════════════════════════
   TEMPLATES CRUD
   ═══════════════════════════════════════════════════════ */

/** Get the default template, falling back to the most recent. */
export async function getDefaultTemplate() {
  let t = await prisma.agreementTemplate.findFirst({ where: { isDefault: true } });
  if (!t) t = await prisma.agreementTemplate.findFirst({ orderBy: { createdAt: 'desc' } });
  return t;
}

/** Get a single template by ID. */
export async function getTemplate(id: string) {
  return prisma.agreementTemplate.findUnique({ where: { id } });
}

/** List all templates, newest first. */
export function listTemplates() {
  return prisma.agreementTemplate.findMany({ orderBy: { createdAt: 'desc' } });
}

/** Create a new template, optionally with a logo. */
export async function createTemplate(
  data: TemplateCreateData,
  logoPath?: string,
) {
  // Only one default template allowed at a time
  if (data.isDefault) {
    await prisma.agreementTemplate.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }

  return prisma.agreementTemplate.create({
    data: {
      name: data.name,
      title: data.title ?? "ISSUANCE & ACCOUNTABILITY AGREEMENT",
      content: data.content,
      isDefault: data.isDefault ?? false,
      defaultPropertyOfficer: data.defaultPropertyOfficer ?? null,
      defaultAuthorizedRep: data.defaultAuthorizedRep ?? null,
      ...(logoPath ? { headerLogo: logoPath } : {}),
    },
  });
}

/** Update a template's metadata, content, or logo. */
export async function updateTemplate(
  id: string,
  data: TemplateUpdateData,
  logoPath?: string,
) {
  const existing = await prisma.agreementTemplate.findUnique({ where: { id } });
  if (!existing) throw new Error('Template not found');

  // Unset old default if this one becomes the new default
  if (data.isDefault) {
    await prisma.agreementTemplate.updateMany({
      where: { isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.title !== undefined) updateData.title = data.title ?? "ISSUANCE & ACCOUNTABILITY AGREEMENT";
  if (data.content !== undefined) updateData.content = data.content;
  if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;
  if (data.defaultPropertyOfficer !== undefined) updateData.defaultPropertyOfficer = data.defaultPropertyOfficer || null;
  if (data.defaultAuthorizedRep !== undefined) updateData.defaultAuthorizedRep = data.defaultAuthorizedRep || null;
  if (logoPath && logoPath !== '') updateData.headerLogo = logoPath;

  return prisma.agreementTemplate.update({ where: { id }, data: updateData });
}

/** Delete a template and optionally its associated logo file. */
export async function deleteTemplate(id: string) {
  const template = await prisma.agreementTemplate.findUnique({ where: { id } });
  if (!template) throw new Error('Template not found');

  // Remove logo file from disk if it exists
  if (template.headerLogo) {
    const logoFullPath = path.resolve(
      __dirname,
      '../..',
      template.headerLogo.replace(/^\/+/, ''), // strip leading slash
    );
    try {
      if (fs.existsSync(logoFullPath)) fs.unlinkSync(logoFullPath);
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

  const resolvedText = parseTemplate(content, {
    personnelName: 'Juan Dela Cruz',
    designation: 'Software Engineer',
    institution: 'DOST',
    project: 'AIO System',
    assetName: assets[0].name,
    serialNumber: assets[0].serialNumber,
    propertyNumber: assets[0].propertyNumber,
    condition: 'Good',
    assets: mode === 'multiple' ? assets : undefined,
  });
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
      template: { select: { id: true, name: true, title: true } },
      issuedBy: { select: { id: true, username: true, fullName: true } },
    },
  });
}

export async function attachSignedAgreementDocument(documentId: string, signedPdfPath: string, uploadedById: string) {
  const existing = await prisma.agreementDocument.findUnique({ where: { id: documentId } });
  if (!existing) throw new Error('Agreement document not found');

  return prisma.agreementDocument.update({
    where: { id: documentId },
    data: {
      signedPdfPath,
      signedUploadedAt: new Date(),
      signedUploadedById: uploadedById,
      status: existing.recipientSignedAt ? 'signed_uploaded' : 'uploaded',
    },
  });
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

    let fontSize = 9;
    let bold = false;
    let color = '#333333';
    let indent = 40;
    let align: 'left' | 'justify' = 'left';

    if (ln.startsWith('Terms and Conditions:')) {
      fontSize = 10;
      bold = true;
      color = '#012061';
    } else if (/^\d+\./.test(ln)) {
      fontSize = 8.5;
      color = '#444444';
      indent = 50;
      align = 'justify';
    } else if (ln.startsWith('Asset:') || ln.startsWith('Serial') || ln.startsWith('Property') || ln.startsWith('Condition')) {
      indent = 54;
    }

    segments.push({ text: raw, fontSize, bold, color, indent, align });
  }

  return segments;
}

function loadLogoImage(logoPath: string | null | undefined): Buffer | null {
  if (!logoPath) return null;
  const fullPath = path.resolve(__dirname, '../..', logoPath.replace(/^\/+/, ''));
  try {
    if (fs.existsSync(fullPath)) return fs.readFileSync(fullPath);
  } catch {}
  return null;
}

export async function generateAgreementPdf(p: {
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
  assets?: Array<{ name: string; serialNumber?: string | null; propertyNumber?: string | null }>;
  recipientSignedAt?: string | Date | null;
  recipientSignatureName?: string | null;
  documentNumber?: string | null;
}): Promise<Buffer> {
  const {
    personnelName, designation, position, project, institution, assetName, serialNumber,
    propertyNumber, condition, templateId, agreementText,
    propertyOfficerName, authorizedRepName, assets, recipientSignedAt, recipientSignatureName, documentNumber,
  } = p;

  const tmpl = templateId
    ? (await prisma.agreementTemplate.findUnique({ where: { id: templateId } })) || (await getDefaultTemplate())
    : await getDefaultTemplate();

  const titleText = p.title || tmpl?.title || 'ISSUANCE & ACCOUNTABILITY AGREEMENT';
  const filled = agreementText && agreementText.trim().length > 0
    ? agreementText
    : parseTemplate(tmpl?.content ?? '', {
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
          condition: condition || undefined,
        })) || undefined,
      });

  const cleanBody = stripSignatureSection(filled).replace(/\r\n?/g, '\n');
  const segments = parseBodySegments(cleanBody);
  const logoData = loadLogoImage(tmpl?.headerLogo ?? null);

  const PW = 595.28;
  const PH = 841.89;
  const M = 36;
  const CW = PW - 72;
  const LETTERHEAD_TOP = 72;
  const HEADER_Y = LETTERHEAD_TOP;
  const TITLE_Y = 105;
  const LOGO_W = 95;
  const BODY_START_Y = 180;
  const FOOTER_Y = PH - 34;
  const PAGE_BODY_MAX_Y = PH - 78;
  const SIG_BLOCK_HEIGHT = 72;

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

    function renderHeader() {
      if (logoData) {
        try { doc.image(logoData, M, HEADER_Y, { width: LOGO_W }); doc.y = 0; } catch {}
      }
      let titleFontSize = 16;
      let titleWidth = doc.font('Helvetica-Bold').fontSize(titleFontSize).widthOfString(titleText);
      while (titleWidth > CW && titleFontSize > 10) {
        titleFontSize -= 0.5;
        titleWidth = doc.font('Helvetica-Bold').fontSize(titleFontSize).widthOfString(titleText);
      }
      textAbs(titleText, M, TITLE_Y, { width: CW, align: 'center', fontSize: titleFontSize, font: 'Helvetica-Bold', color: '#222222' });
      doc.roundedRect(M, 134, CW, 24, 3).fillAndStroke('#f8fafc', '#dbe3ef');
      doc.y = 0;
      const issuedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      textAbs(`Issued: ${issuedDate}`, M + 8, 141, { width: 100, fontSize: 7.5, color: '#475569', font: 'Helvetica-Bold' });
      textAbs(`Doc: ${documentNumber || '—'}`, M + 112, 141, { width: 92, fontSize: 7.5, color: '#475569' });
      textAbs(`Recipient: ${personnelName || '—'}`, M + 208, 141, { width: 160, fontSize: 7.5, color: '#475569' });
      textAbs(`Assets: ${assets?.length || 1}`, M + 374, 141, { width: 56, fontSize: 7.5, color: '#475569' });
      textAbs(recipientSignedAt ? 'Digitally signed' : 'Pending sign-off', M + 430, 141, { width: 86, fontSize: 7.5, color: recipientSignedAt ? '#047857' : '#b45309', font: 'Helvetica-Bold' });
    }

    function addFooter(page: number, total: number) {
      doc.font('Helvetica').fontSize(7).fillColor('#94a3b8');
      doc.text(`Page ${page} of ${total}`, M, FOOTER_Y, { width: CW, align: 'center', lineBreak: false });
      if (documentNumber) doc.text(documentNumber, M, FOOTER_Y, { width: CW, align: 'right', lineBreak: false });
      doc.y = 0;
    }

    function addContinuationPage() {
      doc.addPage();
      renderHeader();
      return BODY_START_Y;
    }

    renderHeader();
    let y = BODY_START_Y;

    for (const seg of segments) {
      const width = PW - M - seg.indent;
      const font = seg.bold ? 'Helvetica-Bold' : 'Helvetica';
      const h = doc.font(font).fontSize(seg.fontSize).heightOfString(seg.text, { width, align: seg.align as any, lineBreak: true });
      const lh = h + 3;
      if (y + lh > PAGE_BODY_MAX_Y) y = addContinuationPage();
      textAbs(seg.text, seg.indent, y, { width, fontSize: seg.fontSize, font, color: seg.color, align: seg.align, lineBreak: true });
      y += lh;
    }

    if (y + SIG_BLOCK_HEIGHT > PAGE_BODY_MAX_Y) y = addContinuationPage();
    const sigLineY = Math.max(y + 24, PH - 118);
    const sigLabelY = sigLineY + 16;
    const colW = (CW - 20) / 3;
    const sigCols = [
      { x: M, label: recipientSignatureName || personnelName || '_________________', subtitle: recipientSignedAt ? `Digitally signed ${new Date(recipientSignedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Recipient' },
      { x: M + colW + 10, label: propertyOfficerName || tmpl?.defaultPropertyOfficer || '_________________', subtitle: 'Property Officer' },
      { x: M + (colW + 10) * 2, label: authorizedRepName || tmpl?.defaultAuthorizedRep || '_________________', subtitle: 'Authorized Representative' },
    ];

    for (const col of sigCols) {
      doc.moveTo(col.x, sigLineY).lineTo(col.x + colW, sigLineY).strokeColor('#bbbbbb').lineWidth(0.4).stroke();
      doc.y = 0;
      textAbs(col.label, col.x, sigLineY + 4, { width: colW, align: 'center', fontSize: 8, color: '#333333' });
      textAbs(col.subtitle, col.x, sigLabelY, { width: colW, align: 'center', fontSize: 7, color: '#888888', font: 'Helvetica-Bold' });
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      addFooter(i + 1, range.count);
    }

    doc.end();
  });
}
