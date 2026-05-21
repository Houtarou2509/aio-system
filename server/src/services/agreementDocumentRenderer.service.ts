const FALLBACK_AGREEMENT_TITLE = 'ISSUANCE & ACCOUNTABILITY AGREEMENT';

function sanitizeAgreementText(text: string | null | undefined): string {
  if (!text) return '';

  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      const percentCount = (trimmed.match(/%/g) || []).length;

      if (
        (percentCount >= 5 && /^[%\s\-–—_]+$/.test(trimmed)) ||
        /^[\s\-–—_─━═=]{5,}$/.test(trimmed)
      ) {
        return '';
      }

      return line.replace(/[ \t]*%[%\s\-–—_]{4,}%[%\s\-–—_]*/g, ' ');
    })
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface AgreementDocumentAssetInput {
  name: string;
  serialNumber?: string | null;
  propertyNumber?: string | null;
  condition?: string | null;
}

export interface AgreementDocumentViewInput {
  title?: string | null;
  documentNumber?: string | null;
  personnelName: string;
  designation?: string | null;
  position?: string | null;
  project?: string | null;
  institution?: string | null;
  assetName?: string | null;
  serialNumber?: string | null;
  propertyNumber?: string | null;
  condition?: string | null;
  agreementText?: string | null;
  assets?: AgreementDocumentAssetInput[] | null;
  propertyOfficerName?: string | null;
  authorizedRepName?: string | null;
  recipientSignedAt?: string | Date | null;
  recipientSignatureName?: string | null;
}

export interface AgreementDocumentViewAsset {
  no: number;
  name: string;
  serialNumber: string;
  propertyNumber: string;
  condition: string;
}

export interface AgreementDocumentViewSignature {
  role: 'Recipient' | 'Property Officer' | 'Authorized Representative';
  label: string;
  subtitle?: string;
}

export interface AgreementDocumentView {
  title: string;
  documentNumber: string | null;
  recipient: {
    name: string;
    designation: string | null;
    institution: string | null;
    project: string | null;
  };
  bodyText: string;
  bodyParagraphs: string[];
  assets: AgreementDocumentViewAsset[];
  signatures: AgreementDocumentViewSignature[];
}

function normalizeValue(value: string | null | undefined): string {
  const cleaned = String(value ?? '').trim();
  return cleaned || '—';
}

const LEGACY_ASSET_HEADER_PATTERN = /\bNo\.\s+Asset Name\s+Serial Number\s+Property Number\s+Condition\b/i;

function isAssetHeader(line: string): boolean {
  return LEGACY_ASSET_HEADER_PATTERN.test(line.trim());
}

function looksLikeAssetRow(line: string): boolean {
  const trimmed = line.trim();
  if (!/^\d+\s+/.test(trimmed)) return false;
  // Legacy rendered table rows contain multiple columns separated by repeated spaces.
  return /\s{2,}/.test(trimmed);
}

function stripSignatureAndLegacyTable(text: string): string {
  const lines = sanitizeAgreementText(text).split('\n');
  const kept: string[] = [];
  let skippingAssetTable = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (!skippingAssetTable) kept.push('');
      continue;
    }

    if (/^_{5,}/.test(line) || line.includes('By signing below')) break;

    const headerMatch = line.match(LEGACY_ASSET_HEADER_PATTERN);
    if (headerMatch?.index !== undefined) {
      const beforeHeader = line.slice(0, headerMatch.index).trim();
      if (beforeHeader) kept.push(beforeHeader);
      skippingAssetTable = true;
      continue;
    }

    if (isAssetHeader(line)) {
      skippingAssetTable = true;
      continue;
    }

    if (skippingAssetTable) {
      if (looksLikeAssetRow(line)) continue;
      skippingAssetTable = false;
    }

    kept.push(line);
  }

  return sanitizeAgreementText(kept.join('\n'));
}

function buildAssets(input: AgreementDocumentViewInput): AgreementDocumentViewAsset[] {
  const source = input.assets?.length
    ? input.assets
    : input.assetName
      ? [{
          name: input.assetName,
          serialNumber: input.serialNumber,
          propertyNumber: input.propertyNumber,
          condition: input.condition,
        }]
      : [];

  return source.map((asset, index) => ({
    no: index + 1,
    name: normalizeValue(asset.name),
    serialNumber: normalizeValue(asset.serialNumber),
    propertyNumber: normalizeValue(asset.propertyNumber),
    condition: normalizeValue(asset.condition ?? input.condition ?? 'Good'),
  }));
}

function buildSignatures(input: AgreementDocumentViewInput): AgreementDocumentViewSignature[] {
  const signedAt = input.recipientSignedAt
    ? new Date(input.recipientSignedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return [
    {
      role: 'Recipient',
      label: input.recipientSignatureName?.trim() || input.personnelName || '_________________',
      subtitle: signedAt ? `Digitally signed ${signedAt}` : 'Recipient',
    },
    {
      role: 'Property Officer',
      label: input.propertyOfficerName?.trim() || '_________________',
      subtitle: 'Property Officer',
    },
    {
      role: 'Authorized Representative',
      label: input.authorizedRepName?.trim() || '_________________',
      subtitle: 'Authorized Representative',
    },
  ];
}

export function buildAgreementDocumentView(input: AgreementDocumentViewInput): AgreementDocumentView {
  const bodyText = stripSignatureAndLegacyTable(input.agreementText || '');

  return {
    title: input.title?.trim() || FALLBACK_AGREEMENT_TITLE,
    documentNumber: input.documentNumber?.trim() || null,
    recipient: {
      name: input.personnelName,
      designation: input.designation || input.position || null,
      institution: input.institution || null,
      project: input.project || null,
    },
    bodyText,
    bodyParagraphs: bodyText.split(/\n{2,}|\n/).map(line => line.trim()).filter(Boolean),
    assets: buildAssets(input),
    signatures: buildSignatures(input),
  };
}
