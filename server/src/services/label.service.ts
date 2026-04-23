import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 15;
const MARGIN_Y = 30;
const COLS = 5;
const GAP_X = 8;
const GAP_Y = 10;
const CARD_WIDTH = (PAGE_WIDTH - (MARGIN_X * 2) - (GAP_X * (COLS - 1))) / COLS; // ~101
const CARD_HEIGHT = CARD_WIDTH + 22; // extra 22pts for text below QR
const ROWS = Math.floor((PAGE_HEIGHT - MARGIN_Y - 15) / (CARD_HEIGHT + GAP_Y));
const CARDS_PER_PAGE = COLS * ROWS;

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
  while (truncated.length > 0 && doc.widthOfString(truncated + '...') > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}

export async function generateLabelsPdf(
  assetIds: string[],
  performedById?: string,
  ipAddress?: string
): Promise<Buffer> {
  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds }, deletedAt: null },
  });

  if (assets.length === 0) throw new Error('No assets found');

  // Pre-generate all QR codes
  const qrPadding = 5;
  const qrSize = CARD_WIDTH - (qrPadding * 2); // ~91
  const qrPngs: Map<string, Buffer> = new Map();
  for (const asset of assets) {
    const qrValue = (asset as any).propertyNumber
      ? `PROP:${(asset as any).propertyNumber}`
      : `ASSET:${asset.id}`;
    qrPngs.set(asset.id, await generateQRCode(qrValue, qrSize));
  }

  // Format date for page header
  const now = new Date();
  const dateStr = `${now.getMonth() + 1}/${now.getDate()}/${String(now.getFullYear()).slice(-2)}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0, autoFirstPage: false });
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    for (let i = 0; i < assets.length; i++) {
      const posInPage = i % CARDS_PER_PAGE;

      // Add new page if needed
      if (posInPage === 0) {
        doc.addPage({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });

        // Page header
        doc.fontSize(7).font('Helvetica').fillColor('#9ca3af')
          .text(dateStr, MARGIN_X, 12, { width: 200 });
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#9ca3af')
          .text('Asset Labels', 0, 12, { width: PAGE_WIDTH, align: 'center' });
      }

      const asset = assets[i];
      const col = posInPage % COLS;
      const row = Math.floor(posInPage / COLS);
      const x = MARGIN_X + col * (CARD_WIDTH + GAP_X);
      const y = MARGIN_Y + row * (CARD_HEIGHT + GAP_Y);

      const serialNum = asset.serialNumber ?? 'No S/N';
      const propNum = (asset as any).propertyNumber ?? 'N/A';

      // Card border — light gray
      doc.roundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 2)
        .strokeColor('#cccccc').lineWidth(0.5).stroke();

      // QR code
      const qrX = x + qrPadding;
      const qrY = y + qrPadding;
      const qrPng = qrPngs.get(asset.id)!;
      doc.image(qrPng, qrX, qrY, { width: qrSize, height: qrSize });

      // Serial number — below QR, bold, 6.5pt
      const snY = qrY + qrSize + 4;
      doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#000000');
      const displaySN = truncateText(doc, serialNum, CARD_WIDTH - 6);
      doc.text(displaySN, x, snY, { width: CARD_WIDTH, align: 'center' });

      // Property # — below serial number, 6pt, gray
      const propY = snY + 9;
      doc.fontSize(6).font('Helvetica').fillColor('#555555')
        .text(propNum, x, propY, { width: CARD_WIDTH, align: 'center' });
    }

    doc.end();
  });
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