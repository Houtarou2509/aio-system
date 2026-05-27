import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => {
  const prisma: any = {
    $transaction: vi.fn(async (cb: any) => cb(prisma)),
    asset: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    assignment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    agreementDocument: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    agreementTemplate: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    agreementTemplateVersion: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    personnel: {
      findUnique: vi.fn(),
    },
  };
  return prisma;
});

vi.mock('../../server/src/lib/prisma', () => ({ prisma: mockPrisma }));

import { generateAgreementPdf, attachSignedAgreementDocument, backfillAgreementDocuments, getDefaultTemplate } from '../../server/src/services/agreement.service';
import { lockAssetsForIssuance, releaseAssetsFromIssuance, signIssuance, resolveTemplate } from '../../server/src/services/issuance.service';
import { parseTemplate } from '../../server/src/utils/templateParser';

function resetPrismaMocks() {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
  mockPrisma.agreementTemplate.findUnique.mockResolvedValue(null);
  mockPrisma.agreementTemplateVersion.findUnique.mockResolvedValue(null);
}

describe('agreement document hardening regressions', () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  it('locks only AVAILABLE assets and release cleanup only unlocks PENDING_ASSIGNMENT assets', async () => {
    mockPrisma.asset.findMany.mockResolvedValueOnce([
      { id: 'asset-1', name: 'Laptop 1', serialNumber: 'SN-1', status: 'AVAILABLE' },
      { id: 'asset-2', name: 'Laptop 2', serialNumber: 'SN-2', status: 'ASSIGNED' },
    ]);
    mockPrisma.asset.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.auditLog.create.mockResolvedValue({});

    const locked = await lockAssetsForIssuance(['asset-1', 'asset-2', 'missing'], 'user-1', '127.0.0.1', 'vitest');

    expect(locked.locked).toEqual([
      { id: 'asset-1', name: 'Laptop 1', serialNumber: 'SN-1', status: 'PENDING_ASSIGNMENT' },
    ]);
    expect(locked.errors).toEqual([
      { assetId: 'asset-2', reason: 'Asset is ASSIGNED' },
      { assetId: 'missing', reason: 'Asset not found' },
    ]);
    expect(mockPrisma.asset.updateMany).toHaveBeenCalledWith({
      where: { id: 'asset-1', status: 'AVAILABLE', deletedAt: null },
      data: { status: 'PENDING_ASSIGNMENT' },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'ISSUANCE_LOCK', entityType: 'Asset', entityId: 'asset-1', userId: 'user-1' }),
    }));

    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.asset.findMany.mockResolvedValueOnce([
      { id: 'asset-1', name: 'Laptop 1', serialNumber: 'SN-1' },
    ]);
    mockPrisma.asset.updateMany.mockResolvedValueOnce({ count: 1 });

    const released = await releaseAssetsFromIssuance(['asset-1', 'asset-3'], 'user-1');

    expect(released.released).toEqual([{ id: 'asset-1', name: 'Laptop 1', serialNumber: 'SN-1' }]);
    expect(mockPrisma.asset.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['asset-1', 'asset-3'] }, status: 'PENDING_ASSIGNMENT', deletedAt: null },
      select: { id: true, name: true, serialNumber: true },
    });
    expect(mockPrisma.asset.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['asset-1'] }, status: 'PENDING_ASSIGNMENT', deletedAt: null },
      data: { status: 'AVAILABLE' },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'ISSUANCE_UNLOCK', entityType: 'Asset' }),
    }));
  });

  it('parses multi-asset smart placeholders and one-vs-many conditional blocks', () => {
    const template = [
      'Recipient: {{personnelName}}',
      'Count: {{assetCount}}',
      '{{#ifSingleAsset}}SINGLE {{assetParagraph}}{{/ifSingleAsset}}',
      '{{#ifMultipleAssets}}MULTI {{assetSection}}{{/ifMultipleAssets}}',
    ].join('\n');

    const resolved = parseTemplate(template, {
      personnelName: 'Juan Dela Cruz',
      assets: [
        { name: 'Dell Latitude 5540', serialNumber: 'SN-001', propertyNumber: 'PN-001', condition: 'Good' },
        { name: 'HP LaserJet Pro', serialNumber: 'SN-002', propertyNumber: 'PN-002', condition: 'Good' },
      ],
    });

    expect(resolved).toContain('Recipient: Juan Dela Cruz');
    expect(resolved).toContain('Count: 2');
    expect(resolved).toContain('MULTI');
    expect(resolved).toContain('Dell Latitude 5540');
    expect(resolved).toContain('HP LaserJet Pro');
    expect(resolved).toContain('Property No.');
    expect(resolved).not.toContain('SINGLE');
    expect(resolved).not.toContain('{{assetSection}}');
  });

  it('uses only an explicit default template and never arbitrary most-recent fallback', async () => {
    const defaultTemplate = { id: 'default-template', isDefault: true, content: 'Default {{personnelName}}' };
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(defaultTemplate);

    await expect(getDefaultTemplate()).resolves.toBe(defaultTemplate);

    expect(mockPrisma.agreementTemplate.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.agreementTemplate.findFirst).toHaveBeenCalledWith({ where: { isDefault: true } });
    expect(mockPrisma.agreementTemplate.findFirst).not.toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: 'desc' } }));
  });

  it('resolves a deterministic DRDF-safe fallback when no explicit default template exists', async () => {
    mockPrisma.personnel.findUnique.mockResolvedValue({
      id: 'personnel-1',
      fullName: 'Juan Dela Cruz',
      designation: 'Research Assistant',
      project: 'Population Study',
      designationLookup: null,
      projectLookup: null,
      institution: { name: 'DRDF' },
    });
    mockPrisma.asset.findMany.mockResolvedValue([
      { id: 'asset-1', name: 'Dell Latitude 5540', serialNumber: 'SN-001', propertyNumber: 'PN-001' },
      { id: 'asset-2', name: 'HP LaserJet Pro', serialNumber: 'SN-002', propertyNumber: 'PN-002' },
    ]);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);

    const result = await resolveTemplate({ personnelId: 'personnel-1', assetIds: ['asset-1', 'asset-2'], condition: 'Good' });

    expect(result.templateId).toBeNull();
    expect(result.templateVersion).toBeNull();
    expect(result.templateVersionId).toBeNull();
    expect(result.templateTitle).toBe('ISSUANCE & ACCOUNTABILITY AGREEMENT');
    expect(result.resolvedText).toContain('Demographic Research and Development Foundation, Inc. (DRDF)');
    expect(result.resolvedText).toContain('2nd Floor Palma Hall, UP Diliman, Quezon City');
    expect(result.resolvedText).toContain('Juan Dela Cruz, Research Assistant of DRDF (Population Study)');
    expect(result.resolvedText).toContain('Dell Latitude 5540');
    expect(result.resolvedText).toContain('HP LaserJet Pro');
    expect(result.resolvedText).not.toContain('{{');
    expect(mockPrisma.agreementTemplate.findFirst).toHaveBeenCalledWith({ where: { isDefault: true } });
    expect(mockPrisma.agreementTemplate.findFirst).not.toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: 'desc' } }));
    expect(mockPrisma.agreementTemplateVersion.findUnique).not.toHaveBeenCalled();
  });

  it('generates a real multi-page PDF from saved agreement text without requiring a live template', async () => {
    const longSavedAgreement = Array.from({ length: 115 }, (_, i) => `${i + 1}. Regression clause ${i + 1}: the issued asset remains accountable to the recipient.`).join('\n');

    const pdf = await generateAgreementPdf({
      personnelName: 'Juan Dela Cruz',
      designation: 'Research Assistant',
      institution: 'DRDF',
      assetName: 'Dell Latitude 5540',
      serialNumber: 'SN-001',
      propertyNumber: 'PN-001',
      agreementText: longSavedAgreement,
      title: 'ISSUANCE & ACCOUNTABILITY AGREEMENT',
      documentNumber: 'AGR-TEST-001',
      assets: [
        { name: 'Dell Latitude 5540', serialNumber: 'SN-001', propertyNumber: 'PN-001' },
        { name: 'HP LaserJet Pro', serialNumber: 'SN-002', propertyNumber: 'PN-002' },
      ],
    });

    const pdfText = pdf.toString('latin1');
    const pageObjectCount = (pdfText.match(/\/Type\s*\/Page\b/g) || []).length;
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1_000);
    expect(pageObjectCount).toBeGreaterThan(1);
    expect(mockPrisma.agreementTemplate.findFirst).toHaveBeenCalled();
  });

  it('batch sign-off updates all unsigned active assignments and mirrors metadata on the agreement document', async () => {
    const assignment = {
      id: 'assignment-1',
      bulkBatchId: 'batch-1',
      returnedAt: null,
      recipientSignedAt: null,
      agreementDocumentId: 'document-1',
      asset: { id: 'asset-1', name: 'Laptop', serialNumber: 'SN-001' },
      personnel: { id: 'personnel-1', fullName: 'Juan Dela Cruz' },
    };
    mockPrisma.assignment.findUnique.mockResolvedValue(assignment);
    mockPrisma.assignment.updateMany.mockResolvedValue({ count: 3 });
    mockPrisma.agreementDocument.update.mockResolvedValue({ id: 'document-1' });
    mockPrisma.auditLog.create.mockResolvedValue({});

    const result = await signIssuance('assignment-1', '  Juan Dela Cruz  ', 'admin-1', '10.0.0.1', 'vitest');

    expect(result).toMatchObject({ signed: 3, signerName: 'Juan Dela Cruz', batchId: 'batch-1' });
    expect(mockPrisma.assignment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { bulkBatchId: 'batch-1', returnedAt: null, recipientSignedAt: null },
      data: expect.objectContaining({
        recipientSignatureName: 'Juan Dela Cruz',
        recipientSignatureMethod: 'typed',
        recipientSignatureIp: '10.0.0.1',
      }),
    }));
    expect(mockPrisma.agreementDocument.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'document-1' },
      data: expect.objectContaining({
        status: 'signed',
        recipientSignatureName: 'Juan Dela Cruz',
        recipientSignatureMethod: 'typed',
        recipientSignatureIp: '10.0.0.1',
      }),
    }));
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'issuance.signed', entityType: 'Assignment', entityId: 'assignment-1', userId: 'admin-1' }),
    }));
  });

  it('backfills historical assignments by bulk batch, snapshots assets, links assignments, and audits the document', async () => {
    const historicalAssignments = [
      {
        id: 'assignment-1',
        bulkBatchId: 'batch-1',
        personnelId: 'personnel-1',
        assignedTo: 'Juan Dela Cruz',
        condition: 'Good',
        assignedAt: new Date('2026-01-01T00:00:00Z'),
        userId: 'issuer-1',
        agreementText: 'Saved historical agreement text',
        recipientSignedAt: new Date('2026-01-02T00:00:00Z'),
        recipientSignatureName: 'Juan Dela Cruz',
        recipientSignatureMethod: 'typed',
        recipientSignatureIp: '127.0.0.1',
        asset: { id: 'asset-1', name: 'Laptop', serialNumber: 'SN-001', propertyNumber: 'PN-001' },
        personnel: { id: 'personnel-1', fullName: 'Juan Dela Cruz', designation: 'RA', project: 'AIO', signedAgreementPath: '/uploads/signed.pdf', designationLookup: null, projectLookup: null, institution: { name: 'DRDF' } },
        agreementId: 'template-1',
        agreement: { id: 'template-1', title: 'Accountability Letter', headerLogo: null, defaultPropertyOfficer: 'Property Officer', defaultAuthorizedRep: 'Authorized Rep', currentVersion: 2, versions: [{ id: 'version-2', versionNumber: 2 }] },
      },
      {
        id: 'assignment-2',
        bulkBatchId: 'batch-1',
        personnelId: 'personnel-1',
        assignedTo: 'Juan Dela Cruz',
        condition: 'Good',
        assignedAt: new Date('2026-01-01T00:00:00Z'),
        userId: 'issuer-1',
        agreementText: 'Saved historical agreement text',
        recipientSignedAt: null,
        recipientSignatureName: null,
        recipientSignatureMethod: null,
        recipientSignatureIp: null,
        asset: { id: 'asset-2', name: 'Printer', serialNumber: 'SN-002', propertyNumber: 'PN-002' },
        personnel: { id: 'personnel-1', fullName: 'Juan Dela Cruz', designation: 'RA', project: 'AIO', signedAgreementPath: null, designationLookup: null, projectLookup: null, institution: { name: 'DRDF' } },
        agreementId: 'template-1',
        agreement: { id: 'template-1', title: 'Accountability Letter', headerLogo: null, defaultPropertyOfficer: 'Property Officer', defaultAuthorizedRep: 'Authorized Rep', currentVersion: 2, versions: [{ id: 'version-2', versionNumber: 2 }] },
      },
    ];
    mockPrisma.assignment.findMany.mockResolvedValue(historicalAssignments);
    mockPrisma.agreementDocument.findFirst.mockResolvedValue(null);
    mockPrisma.agreementDocument.create.mockResolvedValue({ id: 'document-1', documentNumber: 'AGR-BF-TEST' });
    mockPrisma.assignment.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.auditLog.create.mockResolvedValue({});

    const dryRun = await backfillAgreementDocuments({ performedById: 'admin-1', dryRun: true });
    expect(dryRun).toMatchObject({ dryRun: true, missingAssignments: 2, groups: 1 });
    expect(dryRun.planned[0]).toMatchObject({ key: 'batch:batch-1', assignmentIds: ['assignment-1', 'assignment-2'], assetCount: 2 });

    const result = await backfillAgreementDocuments({ performedById: 'admin-1' });

    expect(result).toMatchObject({ dryRun: false, missingAssignments: 2, groups: 1, documentsCreated: 1, assignmentsLinked: 2 });
    expect(mockPrisma.agreementDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        templateId: 'template-1',
        templateVersionId: 'version-2',
        templateVersion: 2,
        bulkBatchId: 'batch-1',
        assetSnapshot: [
          { id: 'asset-1', name: 'Laptop', serialNumber: 'SN-001', propertyNumber: 'PN-001', condition: 'Good' },
          { id: 'asset-2', name: 'Printer', serialNumber: 'SN-002', propertyNumber: 'PN-002', condition: 'Good' },
        ],
        signedPdfPath: '/uploads/signed.pdf',
      }),
    });
    expect(mockPrisma.assignment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['assignment-1', 'assignment-2'] }, agreementDocumentId: null },
      data: { agreementDocumentId: 'document-1' },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: 'AgreementDocument', action: 'BACKFILL', userId: 'admin-1' }),
    }));
  });

  it('signed-copy upload and replacement updates document status and writes audit history', async () => {
    mockPrisma.agreementDocument.findUnique.mockResolvedValue({
      id: 'document-1',
      documentNumber: 'AGR-001',
      signedPdfPath: '/uploads/old-signed.pdf',
      recipientSignedAt: new Date('2026-01-02T00:00:00Z'),
    });
    mockPrisma.agreementDocument.update.mockResolvedValue({
      id: 'document-1',
      documentNumber: 'AGR-001',
      signedPdfPath: '/uploads/new-signed.pdf',
      status: 'signed_uploaded',
    });
    mockPrisma.auditLog.create.mockResolvedValue({});

    const document = await attachSignedAgreementDocument('document-1', '/uploads/new-signed.pdf', 'admin-1');

    expect(document).toMatchObject({ id: 'document-1', signedPdfPath: '/uploads/new-signed.pdf', status: 'signed_uploaded' });
    expect(mockPrisma.agreementDocument.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'document-1' },
      data: expect.objectContaining({
        signedPdfPath: '/uploads/new-signed.pdf',
        signedUploadedById: 'admin-1',
        status: 'signed_uploaded',
      }),
    }));
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: 'AgreementDocument',
        entityId: 'document-1',
        action: 'REPLACE_SIGNED_COPY',
        userId: 'admin-1',
      }),
    });
  });
});
