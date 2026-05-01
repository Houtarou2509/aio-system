import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { parseTemplate } from '../utils/templateParser';

const prisma = new PrismaClient();

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
      '../../public',
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
    if (trimmed === 'By signing below, the recipient acknowledges receipt and accepts the terms stated above.')
      break;
    if (trimmed.includes('By signing below')) break;
    result.push(line);
  }
  return result.join('\n');
}

/** Parse body text into structured segments with styling info. */
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

  for (const raw of lines) {
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
    } else if (
      ln.startsWith('Asset:') ||
      ln.startsWith('Serial') ||
      ln.startsWith('Property') ||
      ln.startsWith('Condition')
    ) {
      indent = 54;
    }

    segments.push({ text: raw, fontSize, bold, color, indent, align });
  }

  return segments;
}

/** Try to load a logo image from disk and return its data for embedding. */
function loadLogoImage(logoPath: string | null | undefined): Buffer | null {
  if (!logoPath) return null;
  const fullPath = path.resolve(__dirname, '../../public', logoPath.replace(/^\/+/, ''));
  try {
    if (fs.existsSync(fullPath)) return fs.readFileSync(fullPath);
  } catch {
    // silently skip broken logo paths
  }
  return null;
}

export async function generateAgreementPdf(p: {
  personnelName: string;
  designation?: string;
  project?: string;
  assetName: string;
  serialNumber?: string;
  propertyNumber?: string;
  condition?: string;
  templateId?: string;
  propertyOfficerName?: string;
  authorizedRepName?: string;
}): Promise<Buffer> {
  const {
    personnelName, designation, project, assetName, serialNumber,
    propertyNumber, condition, templateId,
    propertyOfficerName, authorizedRepName,
  } = p;

  const tmpl = templateId
    ? (await prisma.agreementTemplate.findUnique({ where: { id: templateId } })) || (await getDefaultTemplate())
    : await getDefaultTemplate();

  const filled = parseTemplate(tmpl?.content ?? '', {
    personnelName,
    designation,
    project,
    assetName,
    serialNumber: serialNumber || undefined,
    propertyNumber: propertyNumber || undefined,
    condition: condition || undefined,
  });

  const cleanBody = stripSignatureSection(filled);
  const segments = parseBodySegments(cleanBody);

  // Load logo if configured on template
  const logoData = loadLogoImage(tmpl?.headerLogo ?? null);

  // A4 dimensions in pt
  const PW = 595.28;
  const PH = 841.89;
  const M = 36;                     // 0.5" horizontal margin
  const CW = PW - 72;               // content width

  // 1" = 72pt letterhead buffer
  const LETTERHEAD_TOP = 72;

  // Split-level header: logo left, title center — both at same Y
  const HEADER_Y = LETTERHEAD_TOP;                    // 72pt = 1"
  const TITLE_Y = 85;                                 // vertically centered with larger logo
  const LOGO_W = 95;                                   // logo width
  const BODY_START_Y = 160;                            // clear the header row with comfortable spacing

  // Signature block — anchored near bottom with 0.5" bottom margin
  const SIG_BLOCK_TOP = PH - 80;    // signature line area
  const SIG_LINE_Y = SIG_BLOCK_TOP;
  const SIG_LABEL_Y = SIG_LINE_Y + 16;
  const MAX_BODY_Y = SIG_BLOCK_TOP - 40;               // 40pt breathing room before signatures

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
      bufferPages: false,
    });

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    /* ── Helper ── */
    function textAbs(
      text: string,
      x: number,
      y: number,
      opts: {
        width?: number;
        align?: string;
        fontSize?: number;
        font?: string;
        color?: string;
        lineBreak?: boolean;
      } = {},
    ) {
      if (opts.font) doc.font(opts.font);
      if (opts.fontSize != null) doc.fontSize(opts.fontSize);
      if (opts.color) doc.fillColor(opts.color);
      doc.text(text, x, y, {
        width: opts.width ?? CW,
        align: (opts.align as any) ?? 'left',
        lineBreak: opts.lineBreak ?? false,
      });
      doc.y = 0;
    }

    /* ══════════════════════════════════════
       SPLIT-LEVEL HEADER (no digital bars)
       Logo left, Title center, same Y = 108
       ══════════════════════════════════════ */
    if (logoData) {
      try {
        doc.image(logoData, M, HEADER_Y, { width: LOGO_W });
        doc.y = 0;
      } catch {
        // corrupt image — skip
      }
    }

    // Title centered at same level (slightly offset to visually center with logo)
    // Auto-shrink title font to fit single line
    const titleText = tmpl?.title ?? 'ISSUANCE & ACCOUNTABILITY AGREEMENT';
    let titleFontSize = 16;
    let titleWidth = doc.font('Helvetica-Bold').fontSize(titleFontSize).widthOfString(titleText);
    while (titleWidth > CW && titleFontSize > 10) {
      titleFontSize -= 0.5;
      titleWidth = doc.font('Helvetica-Bold').fontSize(titleFontSize).widthOfString(titleText);
    }
    textAbs(titleText, M, TITLE_Y, {
      width: CW, align: 'center', fontSize: titleFontSize,
      font: 'Helvetica-Bold', color: '#222222',
    });

    /* ══════════════════════════════════════
       BODY
       ══════════════════════════════════════ */
    let y = BODY_START_Y;
    const availableBodyHeight = MAX_BODY_Y - BODY_START_Y;

    let totalMeasuredHeight = 0;
    for (const seg of segments) {
      const width = PW - M - seg.indent;
      const font = seg.bold ? 'Helvetica-Bold' : 'Helvetica';
      const h = doc.font(font).fontSize(seg.fontSize).heightOfString(seg.text, {
        width, align: seg.align as any, lineBreak: true,
      });
      totalMeasuredHeight += h + 2;
    }

    const scale =
      totalMeasuredHeight > availableBodyHeight
        ? Math.max(0.85, availableBodyHeight / totalMeasuredHeight)
        : 1;

    for (const seg of segments) {
      const effectiveFontSize = Math.round(seg.fontSize * scale * 10) / 10;
      const width = PW - M - seg.indent;
      const font = seg.bold ? 'Helvetica-Bold' : 'Helvetica';

      const h = doc.font(font).fontSize(effectiveFontSize).heightOfString(seg.text, {
        width, align: seg.align as any, lineBreak: true,
      });
      const lh = h + 2;

      if (y + lh > MAX_BODY_Y) break;

      textAbs(seg.text, seg.indent, y, {
        width, fontSize: effectiveFontSize, font,
        color: seg.color, align: seg.align, lineBreak: true,
      });

      y += lh;
    }

    /* ══════════════════════════════════════
       SIGNATURES — no intro text, dynamic names
       ══════════════════════════════════════ */
    const colW = (CW - 20) / 3;

    const sigCols = [
      {
        x: M,
        label: personnelName || '_________________',
        subtitle: 'Recipient',
      },
      {
        x: M + colW + 10,
        label: propertyOfficerName || tmpl?.defaultPropertyOfficer || '_________________',
        subtitle: 'Property Officer',
      },
      {
        x: M + (colW + 10) * 2,
        label: authorizedRepName || tmpl?.defaultAuthorizedRep || '_________________',
        subtitle: 'Authorized Representative',
      },
    ];

    for (const col of sigCols) {
      doc
        .moveTo(col.x, SIG_LINE_Y)
        .lineTo(col.x + colW, SIG_LINE_Y)
        .strokeColor('#bbbbbb').lineWidth(0.4).stroke();
      doc.y = 0;

      textAbs(col.label, col.x, SIG_LINE_Y + 4, {
        width: colW, align: 'center', fontSize: 8, color: '#333333',
      });

      textAbs(col.subtitle, col.x, SIG_LABEL_Y, {
        width: colW, align: 'center', fontSize: 7,
        color: '#888888', font: 'Helvetica-Bold',
      });
    }

    doc.end();
  });
}
