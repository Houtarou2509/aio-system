import PDFDocument from 'pdfkit';
import { PrismaClient } from '@prisma/client';
import { parseTemplate } from '../utils/templateParser';

const prisma = new PrismaClient();

export async function getDefaultTemplate() {
  let t = await prisma.agreementTemplate.findFirst({ where: { isDefault: true } });
  if (!t) t = await prisma.agreementTemplate.findFirst({ orderBy: { createdAt: 'desc' } });
  return t;
}
export async function listTemplates() { return prisma.agreementTemplate.findMany({ orderBy: { createdAt: 'desc' } }); }
export async function createTemplate(d: { name: string; content: string; isDefault?: boolean }) {
  if (d.isDefault) await prisma.agreementTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  return prisma.agreementTemplate.create({ data: d });
}
export async function updateTemplate(id: string, d: { name?: string; content?: string; isDefault?: boolean }) {
  if (d.isDefault) await prisma.agreementTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  return prisma.agreementTemplate.update({ where: { id }, data: d });
}
export async function deleteTemplate(id: string) { return prisma.agreementTemplate.delete({ where: { id } }); }

/** Strip signature-area lines from body text before rendering. */
function stripSignatureSection(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^_{5,}/.test(trimmed)) break;
    if (trimmed.startsWith('____')) break;
    if (trimmed === 'By signing below, the recipient acknowledges receipt and accepts the terms stated above.') break;
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
    } else if (ln.startsWith('Asset:') || ln.startsWith('Serial') || ln.startsWith('Property') || ln.startsWith('Condition')) {
      indent = 54;
    }

    segments.push({ text: raw, fontSize, bold, color, indent, align });
  }

  return segments;
}

export async function generateAgreementPdf(p: {
  personnelName: string; designation?: string; project?: string;
  assetName: string; serialNumber?: string; propertyNumber?: string; condition?: string; templateId?: string;
}): Promise<Buffer> {
  const { personnelName, designation, project, assetName, serialNumber, propertyNumber, condition, templateId } = p;

  const tmpl = templateId
    ? (await prisma.agreementTemplate.findUnique({ where: { id: templateId } })) || await getDefaultTemplate()
    : await getDefaultTemplate();

  const filled = parseTemplate(tmpl?.content ?? '', {
    personnelName, designation, project, assetName,
    serialNumber: serialNumber || undefined, propertyNumber: propertyNumber || undefined, condition: condition || undefined,
  });

  const cleanBody = stripSignatureSection(filled);
  const segments = parseBodySegments(cleanBody);

  // A4 dimensions in pt — 0.5 inch = 36pt uniform margins
  const PW = 595.28;
  const PH = 841.89;
  const M = 36;
  const CW = PW - 72; // content area width = page − left margin − right margin

  // Footer bar is decorative (full-width at page bottom)
  const FOOTER_H = 18;
  // Signature section: bottom of role text should sit 36pt from page bottom
  // lineY + 14 + ~8pt(text) = lineY + 22 = PH − 36  ⇒  lineY = PH − 58
  // intro text at SIG_SECTION_TOP, signature lines at +18, so SIG_SECTION_TOP + 18 = PH − 58
  const SIG_SECTION_TOP = PH - 76;
  const MAX_BODY_Y = PH - 86; // stop body above signature intro
  const BODY_START_Y = 42; // slightly lowered to center content with new margins

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    // bottom margin 0 to prevent auto-page-break when rendering footer
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 36, bottom: 0, left: 36, right: 36 },
      bufferPages: false,
    });

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Helper: render text with absolute positioning, then reset doc.y ──
    function textAbs(
      text: string,
      x: number,
      y: number,
      opts: {
        width?: number; align?: string; fontSize?: number;
        font?: string; color?: string; lineBreak?: boolean;
      } = {}
    ) {
      if (opts.font) doc.font(opts.font);
      if (opts.fontSize != null) doc.fontSize(opts.fontSize);
      if (opts.color) doc.fillColor(opts.color);

      doc.text(text, x, y, {
        width: opts.width ?? CW,
        align: (opts.align as any) ?? 'left',
        lineBreak: opts.lineBreak ?? false,
      });

      doc.y = 0; // prevent auto-page-break
    }

    // ══════════════════════════════════════
    // HEADER
    // ══════════════════════════════════════
    // Header bar & accent line — spans content area width (within margins)
    doc.rect(M, 0, CW, 24).fill('#012061');
    textAbs('ISSUANCE & ACCOUNTABILITY AGREEMENT', M, 6, {
      width: CW, align: 'center', fontSize: 10, font: 'Helvetica-Bold', color: '#ffffff',
    });
    doc.rect(M, 24, CW, 1.5).fill('#f8931f');

    // ══════════════════════════════════════
    // BODY: absolute-positioned text with measured line heights
    // ══════════════════════════════════════
    let y = BODY_START_Y;
    const availableBodyHeight = MAX_BODY_Y - BODY_START_Y;

    // Measure total body height to decide if font scaling is needed
    let totalMeasuredHeight = 0;
    for (const seg of segments) {
      const width = PW - M - seg.indent;
      const font = seg.bold ? 'Helvetica-Bold' : 'Helvetica';
      const h = doc.font(font).fontSize(seg.fontSize).heightOfString(seg.text, {
        width,
        align: seg.align as any,
        lineBreak: true,
      });
      totalMeasuredHeight += h + 2; // 2pt inter-segment padding
    }

    // Safety scale: if content exceeds available space, shrink all body fonts proportionally
    const scale = totalMeasuredHeight > availableBodyHeight
      ? Math.max(0.85, availableBodyHeight / totalMeasuredHeight)
      : 1;

    for (const seg of segments) {
      const effectiveFontSize = Math.round(seg.fontSize * scale * 10) / 10;
      const width = PW - M - seg.indent;
      const font = seg.bold ? 'Helvetica-Bold' : 'Helvetica';

      const h = doc.font(font).fontSize(effectiveFontSize).heightOfString(seg.text, {
        width,
        align: seg.align as any,
        lineBreak: true,
      });
      const lh = h + 2; // line height including padding

      if (y + lh > MAX_BODY_Y) break; // stop before signature area

      textAbs(seg.text, seg.indent, y, {
        width,
        fontSize: effectiveFontSize,
        font,
        color: seg.color,
        align: seg.align,
        lineBreak: true,
      });

      y += lh;
    }

    // ══════════════════════════════════════
    // SIGNATURES
    // ══════════════════════════════════════
    textAbs(
      'By signing below, the recipient acknowledges receipt and accepts the terms stated above.',
      M, SIG_SECTION_TOP, {
        width: CW, align: 'center', fontSize: 8, color: '#666666',
      }
    );

    const colW = (CW - 10) / 3;
    const lineY = SIG_SECTION_TOP + 18;

    const sigCols = [
      { x: M, label: personnelName || '_________________', subtitle: 'Recipient' },
      { x: M + colW + 5, label: '_________________', subtitle: 'Property Officer' },
      { x: M + (colW + 5) * 2, label: '_________________', subtitle: 'Authorized Rep.' },
    ];

    for (const col of sigCols) {
      // signature line
      doc.moveTo(col.x, lineY).lineTo(col.x + colW, lineY)
        .strokeColor('#bbbbbb').lineWidth(0.4).stroke();
      doc.y = 0;

      // name
      textAbs(col.label, col.x, lineY + 3, {
        width: colW, align: 'center', fontSize: 8, color: '#555555',
      });

      // role
      textAbs(col.subtitle, col.x, lineY + 14, {
        width: colW, align: 'center', fontSize: 6.5, color: '#aaaaaa', font: 'Helvetica-Bold',
      });
    }

    // ══════════════════════════════════════
    // FOOTER
    // ══════════════════════════════════════
    doc.rect(0, PH - FOOTER_H, PW, FOOTER_H).fill('#012061');
    doc.y = 0;
    textAbs('Generated by AIO System', M, PH - FOOTER_H + 4, {
      width: CW, align: 'center', fontSize: 6.5, color: '#ffffff',
    });

    doc.end();
  });
}
