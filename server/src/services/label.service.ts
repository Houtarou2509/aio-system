import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import { prisma } from '../lib/prisma';


/* ─── 1-inch label constants ───
   Physical size: 1 inch × 1 inch = 72pt × 72pt
   A4 sheet layout with margins and grid
*/

const LABEL_W = 72;           // 1 inch in PDF points
const LABEL_H = 72;           // 1 inch in PDF points
const PAGE_W = 595;           // A4 width
const PAGE_H = 842;           // A4 height
const MARGIN_X = 18;
const MARGIN_Y = 18;
const GAP_X = 6;
const GAP_Y = 6;
const COLS = Math.floor((PAGE_W - MARGIN_X * 2 + GAP_X) / (LABEL_W + GAP_X)); // ~7
const ROWS = Math.floor((PAGE_H - MARGIN_Y * 2 + GAP_Y) / (LABEL_H + GAP_Y)); // ~9
const LABELS_PER_PAGE = COLS * ROWS;

// Label internal layout (all in points, relative to label origin)
const TOP_TEXT_PT = 4.5;      // "UPPI-DRDF" font size
const TOP_TEXT_Y = 7;         // Y offset from label top (comfortable top padding)
const QR_SIZE = 44;           // QR code size (leaves quiet zone)
const QR_Y_OFFSET = TOP_TEXT_Y + TOP_TEXT_PT + 3; // Y offset for QR top
const BOTTOM_TEXT_PT = 4;     // Property number font size
const BOTTOM_TEXT_Y_PAD = 2;  // Padding below QR before bottom text
const INNER_PAD = 4;          // Minimum top/bottom clearance inside cut border

export interface LabelFilterInput {
  type?: string;
  status?: string;
  location?: string;
  owner?: string;
  assignedTo?: string;
  manufacturer?: string;
  search?: string;
  purchaseDateFrom?: string;
  purchaseDateTo?: string;
  warrantyExpiryFrom?: string;
  warrantyExpiryTo?: string;
  qrPrintStatus?: 'printed' | 'not_printed';
}

async function generateQRCode(data: string, size: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      {
        bcid: 'qrcode',
        text: data,
        scale: Math.max(2, Math.round(size / 50)),
        barcolor: '1a1a2e',
      } as any,
      (err: string | Error | null, png: Buffer) => {
        if (err) reject(typeof err === 'string' ? new Error(err) : err);
        else resolve(png);
      }
    );
  });
}

function truncateText(doc: typeof PDFDocument['prototype'], text: string, maxWidth: number): string {
  if (doc.widthOfString(text) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && doc.widthOfString(truncated + '…') > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
}

export async function countAssetsForLabels(
  filters?: LabelFilterInput
): Promise<number> {
  if (!filters) return 0;
  const { buildAssetWhere } = await import('./asset.service');
  const where = buildAssetWhere(filters);
  return prisma.asset.count({ where });
}

export async function resolveAssetsForLabels(
  assetIds?: string[],
  filters?: LabelFilterInput
): Promise<any[]> {
  if (assetIds?.length) {
    return prisma.asset.findMany({
      where: { id: { in: assetIds }, deletedAt: null },
    });
  }
  if (filters) {
    const { buildAssetWhere } = await import('./asset.service');
    const where = buildAssetWhere(filters);
    return prisma.asset.findMany({ where, orderBy: { propertyNumber: 'asc' } });
  }
  throw new Error('No assets found');
}

async function renderLabelsPdf(assets: any[]): Promise<Buffer> {
  if (assets.length === 0) throw new Error('No assets found');

  // Pre-generate all QR codes
  const qrPngs: Map<string, Buffer> = new Map();
  for (const asset of assets) {
    const qrValue = (asset as any).propertyNumber
      ? `PROP:${(asset as any).propertyNumber}`
      : `ASSET:${asset.id}`;
    qrPngs.set(asset.id, await generateQRCode(qrValue, QR_SIZE));
  }

  const count = assets.length;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false, compress: false });
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    for (let i = 0; i < assets.length; i++) {
      const posInPage = i % LABELS_PER_PAGE;

      // Add new page if needed
      if (posInPage === 0) {
        doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0, compress: false });
      }

      const asset = assets[i];
      const col = posInPage % COLS;
      const row = Math.floor(posInPage / COLS);
      const x = MARGIN_X + col * (LABEL_W + GAP_X);
      const y = MARGIN_Y + row * (LABEL_H + GAP_Y);

      const propNum = (asset as any).propertyNumber ?? 'N/A';

      // ── Cut guide border (subtle, inset from label edge) ──
      const borderInset = 2.5;
      doc.lineWidth(0.5)
        .strokeColor('#cccccc')
        .rect(x + borderInset, y + borderInset, LABEL_W - borderInset * 2, LABEL_H - borderInset * 2)
        .stroke();

      // ── Top text: "UPPI-DRDF" ──
      doc.fontSize(TOP_TEXT_PT)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text('UPPI-DRDF', x, y + TOP_TEXT_Y, {
          width: LABEL_W,
          align: 'center',
          lineBreak: false,
        });

      // ── QR code: centered horizontally ──
      const qrX = x + (LABEL_W - QR_SIZE) / 2;
      const qrY = y + QR_Y_OFFSET;
      const qrPng = qrPngs.get(asset.id)!;
      doc.image(qrPng, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });

      // ── Bottom text: property number ──
      const bottomY = qrY + QR_SIZE + BOTTOM_TEXT_Y_PAD;
      doc.fontSize(BOTTOM_TEXT_PT)
        .font('Helvetica')
        .fillColor('#000000');
      const displayPN = truncateText(doc, propNum, LABEL_W - 4);
      doc.text(displayPN, x, bottomY, {
        width: LABEL_W,
        align: 'center',
        lineBreak: false,
      });
    }

    doc.end();
  });
}

export async function generateLabelsPdfWithAssets(
  assetIds?: string[],
  filters?: LabelFilterInput,
  performedById?: string,
  ipAddress?: string
): Promise<{ pdf: Buffer; assetIds: string[]; count: number }> {
  const assets = await resolveAssetsForLabels(assetIds, filters);
  const pdf = await renderLabelsPdf(assets);
  return { pdf, assetIds: assets.map((asset) => asset.id), count: assets.length };
}

export async function generateLabelsPdf(
  assetIds?: string[],
  filters?: LabelFilterInput,
  performedById?: string,
  ipAddress?: string
): Promise<Buffer> {
  const result = await generateLabelsPdfWithAssets(assetIds, filters, performedById, ipAddress);
  return result.pdf;
}

// --- Template CRUD ---
export async function listTemplates() {
  return prisma.labelTemplate.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function getTemplate(id: string) {
  const t = await prisma.labelTemplate.findUnique({ where: { id } });
  if (!t) throw new Error('Template not found');
  return t;
}

export async function createTemplate(data: { name: string; format: string; barcodeType: string; fields: string[]; config?: any; createdById: string }) {
  return prisma.labelTemplate.create({
    data: {
      name: data.name,
      format: data.format,
      config: JSON.stringify({ barcodeType: data.barcodeType, fields: data.fields, ...(data.config || {}) }),
      createdById: data.createdById,
    },
  });
}

export async function updateTemplate(id: string, data: { name?: string; format?: string; barcodeType?: string; fields?: string[]; config?: any }) {
  const existing = await prisma.labelTemplate.findUnique({ where: { id } });
  if (!existing) throw new Error('Template not found');
  const config = data.config || {};
  if (data.barcodeType) config.barcodeType = data.barcodeType;
  if (data.fields) config.fields = data.fields;
  return prisma.labelTemplate.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.format && { format: data.format }),
      config: JSON.stringify(config),
    },
  });
}

export async function deleteTemplate(id: string) {
  const existing = await prisma.labelTemplate.findUnique({ where: { id } });
  if (!existing) throw new Error('Template not found');
  await prisma.labelTemplate.delete({ where: { id } });
  return { deleted: true };
}
