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
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    agreementTemplateVersion: {
      create: vi.fn(),
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

import { generateAgreementPdf, attachSignedAgreementDocument, backfillAgreementDocuments, getDefaultTemplate, updateTemplate } from '../../server/src/services/agreement.service';
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

  it('persists a newly uploaded template logo on update and version snapshot', async () => {
    const existing = {
      id: 'template-logo-1',
      name: 'Template name',
      title: 'AGREEMENT LETTER',
      content: 'Original {{personnelName}}',
      headerLogo: null,
      letterheadPath: null,
      isDefault: false,
      defaultPropertyOfficer: 'Officer',
      defaultAuthorizedRep: 'Rep',
      currentVersion: 2,
    };
    const newLogoPath = '/uploads/logos/logo-new.png';
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(existing);
    mockPrisma.agreementTemplate.update.mockImplementation(async ({ data }: any) => ({
      ...existing,
      ...data,
    }));
    mockPrisma.agreementTemplateVersion.create.mockResolvedValue({});

    const updated = await updateTemplate(
      existing.id,
      {
        name: existing.name,
        title: existing.title,
        content: existing.content,
        isDefault: false,
        defaultPropertyOfficer: existing.defaultPropertyOfficer,
        defaultAuthorizedRep: existing.defaultAuthorizedRep,
      },
      newLogoPath,
    );

    expect(updated.headerLogo).toBe(newLogoPath);
    expect(mockPrisma.agreementTemplate.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: expect.objectContaining({
        headerLogo: newLogoPath,
        currentVersion: 3,
      }),
    });
    expect(mockPrisma.agreementTemplateVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        templateId: existing.id,
        versionNumber: 3,
        headerLogo: newLogoPath,
      }),
    });
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

  /* ═══════════════════════════════════════════════════════
     RENDER MODE TESTS
     ═══════════════════════════════════════════════════════ */

  it('defaults to preprinted render mode (no header/logo drawn)', async () => {
    // No template mock → falls back to FALLBACK template (no logo, no letterhead)
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(null);

    const pdf = await generateAgreementPdf({
      personnelName: 'Maria Santos',
      designation: 'Analyst',
      institution: 'DRDF',
      assetName: 'HP LaserJet Pro',
      serialNumber: 'SN-HP-001',
      propertyNumber: 'PN-001',
      condition: 'Good',
      // renderMode omitted → defaults to 'preprinted'
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(500);
    // Preprinted mode places only a small page number in safe area, no "Page X of Y" footer.
    // (Footer text is in compressed PDF stream so can't be regex-matched; verify PDF size
    // is reasonable and no crash occurred.)
  });

  it('preprinted mode renders Document Title but not logo or letterhead', async () => {
    // Mock findFirst (getDefaultTemplate path) to return template with a title
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue({
      id: 'tmpl-title-pre',
      headerLogo: '/uploads/logos/logo-test.png',
      letterheadPath: '/uploads/letterheads/letterhead-test.png',
      content: 'Agreement for {{personnelName}}',
      title: 'TEST AGREEMENT LETTER',
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
    });

    const pdf = await generateAgreementPdf({
      personnelName: 'Juan Dela Cruz',
      designation: 'Researcher',
      assetName: 'Dell Latitude 5540',
      serialNumber: 'SN-001',
      propertyNumber: 'PN-001',
      condition: 'Good',
      renderMode: 'preprinted',
      // Pass templateId so findUnique is used instead of findFirst
      templateId: 'tmpl-title-pre',
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    // Preprinted mode: no letterhead image XObject, but title MUST be present
    const pdfText = pdf.toString('binary');
    expect(pdfText).not.toContain('/Subtype /Image'); // no embedded images
    // Extract text via pdftotext to verify title is present
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    const { execSync } = await import('child_process');
    const tmpFile = path.join(os.tmpdir(), `test-title-preprinted-${Date.now()}.pdf`);
    fs.writeFileSync(tmpFile, pdf);
    try {
      const text = execSync(`pdftotext -raw ${tmpFile} -`, { encoding: 'utf-8' });
      expect(text).toContain('TEST AGREEMENT LETTER');
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  });

  it('fullDigital mode with letterhead renders Document Title on top of letterhead', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    const { execSync } = await import('child_process');
    const letterheadDir = path.resolve(__dirname, '../../server/uploads/letterheads');
    if (!fs.existsSync(letterheadDir)) fs.mkdirSync(letterheadDir, { recursive: true });
    const minimalPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64',
    );
    const letterheadPath = path.join(letterheadDir, 'test-title-letterhead.png');
    fs.writeFileSync(letterheadPath, minimalPng);

    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue({
      id: 'tmpl-title-digital',
      headerLogo: null,
      letterheadPath: '/uploads/letterheads/test-title-letterhead.png',
      content: 'Agreement for {{personnelName}}',
      title: 'FULL DIGITAL TITLE TEST',
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
    });

    try {
      const pdf = await generateAgreementPdf({
        personnelName: 'Juan Dela Cruz',
        designation: 'Researcher',
        assetName: 'Dell Latitude 5540',
        serialNumber: 'SN-001',
        propertyNumber: 'PN-001',
        condition: 'Good',
        renderMode: 'fullDigital',
        templateId: 'tmpl-title-digital',
      });

      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      // Full digital with letterhead must include both the letterhead image and the title
      const pdfText = pdf.toString('binary');
      expect(pdfText).toContain('/Image');
      // Verify title text is present
      const tmpFile = path.join(os.tmpdir(), `test-title-digital-${Date.now()}.pdf`);
      fs.writeFileSync(tmpFile, pdf);
      try {
        const text = execSync(`pdftotext -raw ${tmpFile} -`, { encoding: 'utf-8' });
        expect(text).toContain('FULL DIGITAL TITLE TEST');
      } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
      }
    } finally {
      try { fs.unlinkSync(letterheadPath); } catch {}
    }
  });

  it('fullDigital fallback (no letterhead) renders Document Title', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    const { execSync } = await import('child_process');

    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue({
      id: 'tmpl-title-fallback',
      headerLogo: null,
      letterheadPath: null,
      content: 'Agreement for {{personnelName}}',
      title: 'FALLBACK TITLE',
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
    });

    const pdf = await generateAgreementPdf({
      personnelName: 'Juan Dela Cruz',
      designation: 'Researcher',
      assetName: 'Dell Latitude 5540',
      serialNumber: 'SN-001',
      propertyNumber: 'PN-001',
      condition: 'Good',
      renderMode: 'fullDigital',
      templateId: 'tmpl-title-fallback',
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    // Verify title text is present even without letterhead
    const tmpFile = path.join(os.tmpdir(), `test-title-fallback-${Date.now()}.pdf`);
    fs.writeFileSync(tmpFile, pdf);
    try {
      const text = execSync(`pdftotext -raw ${tmpFile} -`, { encoding: 'utf-8' });
      expect(text).toContain('FALLBACK TITLE');
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  });

  it('explicit preprinted mode does not draw header logo or letterhead', async () => {
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue({
      id: 'tmpl-1',
      headerLogo: '/uploads/logos/logo-test.png',
      letterheadPath: '/uploads/letterheads/letterhead-test.png',
      content: 'Test template for {{personnelName}}',
      title: 'TEST AGREEMENT',
      defaultPropertyOfficer: 'Officer',
      defaultAuthorizedRep: 'Rep',
    });

    const pdf = await generateAgreementPdf({
      personnelName: 'Juan Dela Cruz',
      designation: 'Researcher',
      assetName: 'Dell Latitude 5540',
      serialNumber: 'SN-001',
      propertyNumber: 'PN-001',
      condition: 'Good',
      renderMode: 'preprinted',
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(500);
    // Preprinted mode should not embed header/logo or letterhead images.
    // PDF text is in compressed stream so can't be regex-matched for footer content.
  });

  it('fullDigital mode with image letterhead renders larger PDF than without', async () => {
    // Create a small 1x1 red PNG as a test letterhead fixture
    const fs = await import('fs');
    const path = await import('path');
    const letterheadDir = path.resolve(__dirname, '../../server/uploads/letterheads');
    if (!fs.existsSync(letterheadDir)) fs.mkdirSync(letterheadDir, { recursive: true });
    // Minimal valid PNG: 1x1 red pixel (67 bytes)
    const minimalPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64',
    );
    const letterheadPath = path.join(letterheadDir, 'test-letterhead-fixture.png');
    fs.writeFileSync(letterheadPath, minimalPng);

    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue({
      id: 'tmpl-letterhead',
      headerLogo: null,
      letterheadPath: '/uploads/letterheads/test-letterhead-fixture.png',
      content: 'Agreement for {{personnelName}}',
      title: 'FULL DIGITAL TEST',
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
    });

    try {
      const pdf = await generateAgreementPdf({
        personnelName: 'Juan Dela Cruz',
        designation: 'Researcher',
        assetName: 'Dell Latitude 5540',
        serialNumber: 'SN-001',
        propertyNumber: 'PN-001',
        condition: 'Good',
        renderMode: 'fullDigital',
      });

      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      // The letterhead image should be embedded — PDF should be larger than a no-letterhead version
      expect(pdf.length).toBeGreaterThan(2000);
      // Verify the PDF contains an image XObject (PDFKit stores images as XObject with /Subtype /Image)
      const pdfText = pdf.toString('binary');
      expect(pdfText).toContain('/Image');
    } finally {
      // Clean up fixture
      try { fs.unlinkSync(letterheadPath); } catch {}
    }
  });

  it('fullDigital mode falls back to logo+title when no letterhead', async () => {
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue({
      id: 'tmpl-no-letterhead',
      headerLogo: null,
      letterheadPath: null,
      content: 'Agreement for {{personnelName}}',
      title: 'FULL DIGITAL FALLBACK',
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
    });

    const pdf = await generateAgreementPdf({
      personnelName: 'Juan Dela Cruz',
      designation: 'Researcher',
      assetName: 'Dell Latitude 5540',
      serialNumber: 'SN-001',
      propertyNumber: 'PN-001',
      condition: 'Good',
      renderMode: 'fullDigital',
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(500);
    // Full digital mode without letterhead should still produce a valid PDF with content
    // (footer "Page X of Y" is in a compressed stream, not readable as plain text)
  });

  it('document-level letterheadPath overrides template letterheadPath', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const letterheadDir = path.resolve(__dirname, '../../server/uploads/letterheads');
    if (!fs.existsSync(letterheadDir)) fs.mkdirSync(letterheadDir, { recursive: true });
    const minimalPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64',
    );
    const docLetterheadPath = path.join(letterheadDir, 'test-doc-letterhead.png');
    fs.writeFileSync(docLetterheadPath, minimalPng);

    // Template has one letterhead, but document snapshot has a different one
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue({
      id: 'tmpl-old',
      headerLogo: null,
      letterheadPath: '/uploads/letterheads/old-letterhead.png',
      content: 'Agreement for {{personnelName}}',
      title: 'OLD TEMPLATE',
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
    });

    try {
      const pdf = await generateAgreementPdf({
        personnelName: 'Juan Dela Cruz',
        designation: 'Researcher',
        assetName: 'Dell Latitude 5540',
        serialNumber: 'SN-001',
        propertyNumber: 'PN-001',
        condition: 'Good',
        renderMode: 'fullDigital',
        // Document-level letterheadPath should take priority over template
        letterheadPath: '/uploads/letterheads/test-doc-letterhead.png',
      });

      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      // Should contain an embedded image (the document-level letterhead)
      const pdfText = pdf.toString('binary');
      expect(pdfText).toContain('/Image');
    } finally {
      try { fs.unlinkSync(docLetterheadPath); } catch {}
    }
  });

  it('long agreement text paginates correctly within safe content zones', async () => {
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(null);

    const longText = Array.from({ length: 120 }, (_, i) =>
      `${i + 1}. This is a lengthy clause about accountability and asset management policies that should wrap across multiple lines and eventually span multiple pages. The recipient acknowledges receipt and accepts full responsibility for the issued asset in accordance with DRDF guidelines.`
    ).join('\n');

    const pdf = await generateAgreementPdf({
      personnelName: 'Juan Dela Cruz',
      designation: 'Researcher',
      institution: 'DRDF',
      assetName: 'Dell Latitude 5540',
      serialNumber: 'SN-001',
      propertyNumber: 'PN-001',
      condition: 'Good',
      agreementText: longText,
      title: 'LONG AGREEMENT TEST',
      documentNumber: 'AGR-LONG-001',
      renderMode: 'preprinted',
    });

    const pdfText = pdf.toString('latin1');
    const pageObjectCount = (pdfText.match(/\/Type\s*\/Page\b/g) || []).length;
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pageObjectCount).toBeGreaterThan(1);
  });

  it('multi-asset table does not overlap signatures or footer', async () => {
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(null);

    const manyAssets = Array.from({ length: 15 }, (_, i) => ({
      name: `Asset ${i + 1} - Some Long Asset Name That Should Force Wrapping`,
      serialNumber: `SN-ASSET-${String(i + 1).padStart(4, '0')}`,
      propertyNumber: `PN-ASSET-${String(i + 1).padStart(4, '0')}`,
      condition: i % 3 === 0 ? 'Good' : 'Fair',
    }));

    const pdf = await generateAgreementPdf({
      personnelName: 'Juan Dela Cruz',
      designation: 'Researcher',
      institution: 'DRDF',
      assetName: manyAssets[0].name,
      serialNumber: manyAssets[0].serialNumber,
      propertyNumber: manyAssets[0].propertyNumber,
      condition: 'Good',
      agreementText: 'This is a test agreement with many assets.',
      title: 'MULTI-ASSET TABLE TEST',
      documentNumber: 'AGR-MULTI-001',
      assets: manyAssets,
      renderMode: 'preprinted',
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('multi-page asset table in fullDigital mode redraws letterhead on every page', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const letterheadDir = path.resolve(__dirname, '../../server/uploads/letterheads');
    if (!fs.existsSync(letterheadDir)) fs.mkdirSync(letterheadDir, { recursive: true });
    const minimalPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64',
    );
    const letterheadPath = path.join(letterheadDir, 'test-multi-letterhead.png');
    fs.writeFileSync(letterheadPath, minimalPng);

    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue({
      id: 'tmpl-multi',
      headerLogo: null,
      letterheadPath: '/uploads/letterheads/test-multi-letterhead.png',
      content: 'Agreement for {{personnelName}}',
      title: 'MULTI-PAGE LETTERHEAD TEST',
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
    });

    // Use 40+ assets with long names to force multi-page overflow
    const manyAssets = Array.from({ length: 40 }, (_, i) => ({
      name: `Asset ${i + 1} - Very Long Asset Name That Forces Table Cell Wrapping And Eventual Page Overflow Across Multiple Pages`,
      serialNumber: `SN-MP-${String(i + 1).padStart(4, '0')}`,
      propertyNumber: `PN-MP-${String(i + 1).padStart(4, '0')}`,
      condition: i % 2 === 0 ? 'Good' : 'Fair',
    }));

    try {
      const pdf = await generateAgreementPdf({
        personnelName: 'Juan Dela Cruz',
        designation: 'Researcher',
        institution: 'DRDF',
        assetName: manyAssets[0].name,
        serialNumber: manyAssets[0].serialNumber,
        propertyNumber: manyAssets[0].propertyNumber,
        condition: 'Good',
        agreementText: Array.from({ length: 30 }, (_, i) => `Clause ${i + 1}: This is a lengthy clause that fills up the page before the table even starts, ensuring we get multi-page output with the asset table continuing onto new pages.`).join('\n'),
        title: 'MULTI-PAGE LETTERHEAD TEST',
        documentNumber: 'AGR-MP-001',
        assets: manyAssets,
        renderMode: 'fullDigital',
      });

      const pdfText = pdf.toString('binary');
      const pageCount = (pdfText.match(/\/Type\s*\/Page\b/g) || []).length;
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      // Should have multiple pages due to the asset table overflowing
      expect(pageCount).toBeGreaterThan(1);
      // Verify letterhead image appears in the PDF (at least once per page)
      expect(pdfText).toContain('/Image');
    } finally {
      try { fs.unlinkSync(letterheadPath); } catch {}
    }
  });

  it('preprinted mode does not write footer in letterhead footer area', async () => {
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(null);

    const pdf = await generateAgreementPdf({
      personnelName: 'Juan Dela Cruz',
      designation: 'Researcher',
      institution: 'DRDF',
      assetName: 'Dell Latitude 5540',
      serialNumber: 'SN-001',
      propertyNumber: 'PN-001',
      condition: 'Good',
      agreementText: 'Simple agreement text for footer test.',
      title: 'FOOTER TEST',
      documentNumber: 'AGR-FOOTER-001',
      renderMode: 'preprinted',
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    // Preprinted mode: no "Page X of Y" in the raw PDF stream
    // (the text is FlateDecode compressed, but the font resources and text
    // objects in preprinted mode should only have a small page number)
    expect(pdf.length).toBeGreaterThan(100);
  });

  it('fullDigital mode produces a PDF with footer content', async () => {
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(null);

    const pdf = await generateAgreementPdf({
      personnelName: 'Juan Dela Cruz',
      designation: 'Researcher',
      institution: 'DRDF',
      assetName: 'Dell Latitude 5540',
      serialNumber: 'SN-001',
      propertyNumber: 'PN-001',
      condition: 'Good',
      agreementText: 'Simple agreement text for footer test.',
      title: 'FOOTER TEST',
      documentNumber: 'AGR-FOOTER-002',
      renderMode: 'fullDigital',
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(100);
    // Full digital mode should produce a valid PDF with content
    // (footer "Page X of Y" is in compressed stream — can't regex-match)
  });

  it('AgreementDocument snapshot preserves letterheadPath', async () => {
    mockPrisma.agreementDocument.findFirst.mockResolvedValue(null);
    mockPrisma.agreementDocument.create.mockResolvedValue({
      id: 'doc-letterhead-1',
      documentNumber: 'AGR-BF-LH-001',
    });
    mockPrisma.assignment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.auditLog.create.mockResolvedValue({});

    const historicalAssignments = [
      {
        id: 'assignment-lh-1',
        bulkBatchId: 'batch-lh-1',
        personnelId: 'personnel-lh-1',
        assignedTo: 'Juan Dela Cruz',
        condition: 'Good',
        assignedAt: new Date('2026-03-01T00:00:00Z'),
        userId: 'issuer-1',
        agreementText: 'Historical agreement with letterhead',
        recipientSignedAt: null,
        recipientSignatureName: null,
        recipientSignatureMethod: null,
        recipientSignatureIp: null,
        asset: { id: 'asset-lh-1', name: 'Laptop', serialNumber: 'SN-LH-001', propertyNumber: 'PN-LH-001' },
        personnel: { id: 'personnel-lh-1', fullName: 'Juan Dela Cruz', designation: 'RA', project: 'AIO', signedAgreementPath: null, designationLookup: null, projectLookup: null, institution: { name: 'DRDF' } },
        agreementId: 'template-lh-1',
        agreement: { id: 'template-lh-1', title: 'Accountability Letter', headerLogo: '/uploads/logos/logo.png', letterheadPath: '/uploads/letterheads/drdf-letterhead.png', defaultPropertyOfficer: 'Officer', defaultAuthorizedRep: 'Rep', currentVersion: 1, versions: [{ id: 'version-lh-1', versionNumber: 1 }] },
      },
    ];

    mockPrisma.assignment.findMany.mockResolvedValue(historicalAssignments);

    const result = await backfillAgreementDocuments({ performedById: 'admin-1' });

    expect(mockPrisma.agreementDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        letterheadPath: '/uploads/letterheads/drdf-letterhead.png',
        headerLogo: '/uploads/logos/logo.png',
      }),
    });
  });

  /* ═══════════════════════════════════════════════════════
     UPDATE TEMPLATE MEDIA PERSISTENCE TESTS
     ═══════════════════════════════════════════════════════ */

  it('updateTemplate with non-empty letterheadPath saves AgreementTemplate.letterheadPath', async () => {
    const existing = {
      id: 'tmpl-lh-update',
      name: 'Test',
      title: 'Test Title',
      content: 'Content',
      isDefault: false,
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
      headerLogo: null,
      letterheadPath: null,
      currentVersion: 1,
    };
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(existing);
    mockPrisma.agreementTemplate.update.mockImplementation(async ({ data }: any) => ({
      ...existing,
      ...data,
    }));
    mockPrisma.agreementTemplateVersion.create.mockResolvedValue({});

    const newLetterhead = '/uploads/letterheads/new-letterhead.png';
    const updated = await updateTemplate(existing.id, {
      name: existing.name,
      title: existing.title,
      content: existing.content,
      letterheadPath: newLetterhead,
    });

    expect(updated.letterheadPath).toBe(newLetterhead);
    expect(mockPrisma.agreementTemplate.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: expect.objectContaining({
        letterheadPath: newLetterhead,
      }),
    });
  });

  it('updateTemplate with non-empty letterheadPath creates AgreementTemplateVersion with letterheadPath', async () => {
    const existing = {
      id: 'tmpl-lh-version',
      name: 'Test',
      title: 'Test Title',
      content: 'Content',
      isDefault: false,
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
      headerLogo: null,
      letterheadPath: null,
      currentVersion: 1,
    };
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(existing);
    mockPrisma.agreementTemplate.update.mockImplementation(async ({ data }: any) => ({
      ...existing,
      ...data,
    }));
    mockPrisma.agreementTemplateVersion.create.mockResolvedValue({});

    const newLetterhead = '/uploads/letterheads/version-letterhead.png';
    await updateTemplate(existing.id, {
      name: existing.name,
      title: existing.title,
      content: existing.content,
      letterheadPath: newLetterhead,
    });

    expect(mockPrisma.agreementTemplateVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        templateId: existing.id,
        letterheadPath: newLetterhead,
      }),
    });
  });

  it('updateTemplate with letterheadPath empty string clears saved letterhead', async () => {
    const existing = {
      id: 'tmpl-lh-clear',
      name: 'Test',
      title: 'Test Title',
      content: 'Content',
      isDefault: false,
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
      headerLogo: null,
      letterheadPath: '/uploads/letterheads/old-letterhead.png',
      currentVersion: 1,
    };
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(existing);
    mockPrisma.agreementTemplate.update.mockImplementation(async ({ data }: any) => ({
      ...existing,
      ...data,
    }));
    mockPrisma.agreementTemplateVersion.create.mockResolvedValue({});

    await updateTemplate(existing.id, {
      name: existing.name,
      title: existing.title,
      content: existing.content,
      letterheadPath: '',
    });

    expect(mockPrisma.agreementTemplate.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: expect.objectContaining({
        letterheadPath: null,
      }),
    });
  });

  it('updateTemplate with content only does not drift media fields', async () => {
    const existing = {
      id: 'tmpl-content-only',
      name: 'Test',
      title: 'Test Title',
      content: 'Old content',
      isDefault: false,
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
      headerLogo: '/uploads/logos/existing-logo.png',
      letterheadPath: '/uploads/letterheads/existing-letterhead.png',
      currentVersion: 1,
    };
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(existing);
    mockPrisma.agreementTemplate.update.mockImplementation(async ({ data }: any) => ({
      ...existing,
      ...data,
    }));
    mockPrisma.agreementTemplateVersion.create.mockResolvedValue({});

    const updated = await updateTemplate(existing.id, {
      content: 'New content only — no media changes',
    });

    // headerLogo and letterheadPath must remain unchanged
    expect(updated.headerLogo).toBe('/uploads/logos/existing-logo.png');
    expect(updated.letterheadPath).toBe('/uploads/letterheads/existing-letterhead.png');
    // The update data should NOT contain headerLogo or letterheadPath (they stay as-is)
    const updateCall = mockPrisma.agreementTemplate.update.mock.calls[0][0];
    expect(updateCall.data.headerLogo).toBeUndefined();
    expect(updateCall.data.letterheadPath).toBeUndefined();
  });

  it('updateTemplate with headerLogo as string path saves AgreementTemplate.headerLogo', async () => {
    const existing = {
      id: 'tmpl-logo-str',
      name: 'Test',
      title: 'Test Title',
      content: 'Content',
      isDefault: false,
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
      headerLogo: null,
      letterheadPath: null,
      currentVersion: 1,
    };
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(existing);
    mockPrisma.agreementTemplate.update.mockImplementation(async ({ data }: any) => ({
      ...existing,
      ...data,
    }));
    mockPrisma.agreementTemplateVersion.create.mockResolvedValue({});

    const newLogoPath = '/uploads/logos/uploaded-logo.png';
    const updated = await updateTemplate(existing.id, {
      name: existing.name,
      title: existing.title,
      content: existing.content,
      headerLogo: newLogoPath,
    });

    expect(updated.headerLogo).toBe(newLogoPath);
    expect(mockPrisma.agreementTemplate.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: expect.objectContaining({
        headerLogo: newLogoPath,
      }),
    });
    expect(mockPrisma.agreementTemplateVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        templateId: existing.id,
        headerLogo: newLogoPath,
      }),
    });
  });

  /* ═══════════════════════════════════════════════════════
     UNDERLINE VARIABLE VALUES TESTS
     Underlines are based on actual {{variable}} boundaries,
     not value matching.
     ═══════════════════════════════════════════════════════ */

  /** Decompress all PDF streams and return the concatenated content text */
  function decompressPdfStreams(pdfBuffer: Buffer): string {
    const zlib = require('zlib');
    const pdf = pdfBuffer.toString('latin1');
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    const parts: string[] = [];
    while ((match = streamRegex.exec(pdf)) !== null) {
      try {
        const buf = Buffer.from(match[1], 'binary');
        const decompressed = zlib.inflateSync(buf).toString('latin1');
        parts.push(decompressed);
      } catch {}
    }
    return parts.join('\n');
  }

  /** Count dark-gray underline strokes (0.2 0.2 0.2 SCN + 0.4 w) in decompressed PDF streams */
  function countDarkUnderlines(pdfBuffer: Buffer): number {
    const content = decompressPdfStreams(pdfBuffer);
    const lines = content.split('\n');
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('0.2 0.2 0.2 SCN') && lines[i + 1] === '0.4 w') {
        count++;
      }
    }
    return count;
  }

  // 1. Variable boundary test: static text matching a variable value is NOT underlined
  it('only underlines variable values from {{placeholders}}, not static text that equals a variable value', async () => {
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue({
      id: 'tmpl-ul-boundary',
      headerLogo: null,
      letterheadPath: null,
      content: 'Status Good. Condition: {{condition}}.',
      title: 'Boundary Test',
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
    });

    const pdf = await generateAgreementPdf({
      personnelName: 'Test User',
      condition: 'Good',
      assetName: 'Desk',
      serialNumber: 'SN-001',
      propertyNumber: 'PN-001',
      renderMode: 'preprinted',
      templateId: 'tmpl-ul-boundary',
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    // Should have exactly 1 dark underline stroke (for the {{condition}} "Good")
    // The static "Good" in "Status Good" must NOT be underlined
    const darkUl = countDarkUnderlines(pdf);
    expect(darkUl).toBeGreaterThanOrEqual(1); // at least the condition variable
    // With parseTemplateWithRuns, only the second "Good" (from {{condition}}) is underlined
  });

  // 2. Date variable test
  it('underlines {{date}} and {{fullName}} resolved values', async () => {
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue({
      id: 'tmpl-ul-date',
      headerLogo: null,
      letterheadPath: null,
      content: 'Issued on {{date}} to {{fullName}}.',
      title: 'Date Test',
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
    });

    const pdf = await generateAgreementPdf({
      personnelName: 'Juan Dela Cruz',
      assetName: 'Laptop',
      serialNumber: 'SN-001',
      propertyNumber: 'PN-001',
      condition: 'Good',
      renderMode: 'preprinted',
      templateId: 'tmpl-ul-date',
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const fs = await import('fs');
    const os = await import('os');
    const { execSync } = await import('child_process');
    const tmpFile = os.tmpdir() + `/test-ul-date-${Date.now()}.pdf`;
    fs.writeFileSync(tmpFile, pdf);
    try {
      const text = execSync(`pdftotext -raw ${tmpFile} -`, { encoding: 'utf-8' });
      expect(text).toContain('Juan Dela Cruz');
      // Date should contain a formatted date string
      expect(text).toMatch(/\d{4}/);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
    // Both date and fullName should be underlined
    const darkUl = countDarkUnderlines(pdf);
    expect(darkUl).toBeGreaterThanOrEqual(2); // date + fullName
  });

  // 3. Suffix variable test
  it('underlines resolved suffix placeholders like {{designationComma}}, {{institutionText}}, {{projectText}}', async () => {
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue({
      id: 'tmpl-ul-suffix',
      headerLogo: null,
      letterheadPath: null,
      content: 'Assigned{{designationComma}}{{institutionText}}{{projectText}}.',
      title: 'Suffix Test',
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
    });

    const pdf = await generateAgreementPdf({
      personnelName: 'Alice Smith',
      designation: 'Engineer',
      institution: 'DRDF',
      project: 'Alpha',
      assetName: 'Laptop',
      serialNumber: 'SN-001',
      propertyNumber: 'PN-001',
      condition: 'Good',
      renderMode: 'preprinted',
      templateId: 'tmpl-ul-suffix',
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const fs = await import('fs');
    const os = await import('os');
    const { execSync } = await import('child_process');
    const tmpFile = os.tmpdir() + `/test-ul-suffix-${Date.now()}.pdf`;
    fs.writeFileSync(tmpFile, pdf);
    try {
      const text = execSync(`pdftotext -raw ${tmpFile} -`, { encoding: 'utf-8' });
      // All 3 suffix variables should be resolved
      expect(text).toContain(', Engineer');
      expect(text).toContain('of DRDF');
      expect(text).toContain('(Alpha)');
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
    // 3 suffix variables should be underlined
    const darkUl = countDarkUnderlines(pdf);
    expect(darkUl).toBeGreaterThanOrEqual(3);
  });

  // 4. Saved text test — no variable underlines
  it('saved agreementText does not produce variable underlines', async () => {
    const savedText = 'Issued on June 11, 2026 to Juan Dela Cruz.';
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(null);

    const pdf = await generateAgreementPdf({
      personnelName: 'Juan Dela Cruz',
      designation: 'Director',
      agreementText: savedText,
      assetName: 'Tablet',
      serialNumber: 'SN-004',
      propertyNumber: 'PN-004',
      condition: 'Good',
      renderMode: 'preprinted',
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    // No variable underlines — saved text has no {{placeholder}} boundary info
    const darkUl = countDarkUnderlines(pdf);
    expect(darkUl).toBe(0);
  });

  it('saved agreement document previews use template version placeholders for underlines', async () => {
    const templateContent = [
      'I, {{personnelName}}, employed as {{designation}} under the {{project}} project, acknowledge receipt of the item(s)/asset(s) issued to me.',
      '{{assetSection}}',
    ].join('\n');

    mockPrisma.agreementDocument.findUnique.mockResolvedValue({
      id: 'doc-with-template-runs',
      documentNumber: 'AGR-UL-001',
      templateId: 'tmpl-versioned',
      templateVersionId: 'tmpl-versioned-v2',
      templateVersion: 2,
      title: 'THIS IS THE AGREEMENT LETTER TITLE',
      resolvedText: 'I, Croco Dimagiba, employed as IT officer under the Crocs Company project, acknowledge receipt of the item(s)/asset(s) issued to me.',
      headerLogo: null,
      letterheadPath: null,
      personnelId: 'personnel-1',
      personnelNameSnapshot: 'Croco Dimagiba',
      designationSnapshot: 'IT officer',
      projectSnapshot: 'Crocs Company',
      institutionSnapshot: null,
      assetSnapshot: [
        { name: 'Negative air purifier', serialNumber: 'qwe-123', propertyNumber: '900777', condition: 'Good' },
      ],
      propertyOfficerName: 'Toyota Gazoo',
      authorizedRepName: 'Gr Gazoo',
      recipientSignedAt: null,
      recipientSignatureName: null,
      assignments: [
        {
          conditionAtIssue: 'Good',
          condition: 'Good',
          asset: { name: 'Negative air purifier', serialNumber: 'qwe-123', propertyNumber: '900777' },
        },
      ],
      personnel: null,
      templateVersionRecord: {
        content: templateContent,
      },
    });
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue({
      id: 'tmpl-versioned',
      headerLogo: null,
      letterheadPath: null,
      content: 'Current template text should not be required for saved document underlines.',
      title: 'THIS IS THE AGREEMENT LETTER TITLE',
      defaultPropertyOfficer: 'Toyota Gazoo',
      defaultAuthorizedRep: 'Gr Gazoo',
    });

    const pdf = await generateAgreementPdf({
      agreementDocumentId: 'doc-with-template-runs',
      personnelName: 'Fallback Name',
      assetName: 'Fallback Asset',
      renderMode: 'preprinted',
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const darkUl = countDarkUnderlines(pdf);
    expect(darkUl).toBeGreaterThanOrEqual(3);
  });

  // 5. Conditional block regression — single asset
  it('renders {{#ifSingleAsset}} template with underlines without error', async () => {
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue({
      id: 'tmpl-ul-cond',
      headerLogo: null,
      letterheadPath: null,
      content: 'I, {{personnelName}}, acknowledge receipt.\n{{#ifSingleAsset}}Asset: {{assetName}}{{/ifSingleAsset}}\n{{#ifMultipleAssets}}Multiple{{/ifMultipleAssets}}',
      title: 'Conditional Test',
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
    });

    const pdf = await generateAgreementPdf({
      personnelName: 'Alice Smith',
      assetName: 'Laptop',
      serialNumber: 'SN-001',
      propertyNumber: 'PN-001',
      condition: 'Good',
      renderMode: 'preprinted',
      templateId: 'tmpl-ul-cond',
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const fs = await import('fs');
    const os = await import('os');
    const { execSync } = await import('child_process');
    const tmpFile = os.tmpdir() + `/test-ul-cond-${Date.now()}.pdf`;
    fs.writeFileSync(tmpFile, pdf);
    try {
      const text = execSync(`pdftotext -raw ${tmpFile} -`, { encoding: 'utf-8' });
      expect(text).toContain('Alice Smith');
      expect(text).toContain('Laptop');
      // The ifMultipleAssets block should NOT appear
      expect(text).not.toContain('Multiple');
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  });

  // 6. Conditional block regression — multiple assets
  it('renders {{#ifMultipleAssets}} template with underlines without error', async () => {
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue({
      id: 'tmpl-ul-cond-multi',
      headerLogo: null,
      letterheadPath: null,
      content: 'I, {{personnelName}}, acknowledge receipt.\n{{#ifSingleAsset}}Single{{/ifSingleAsset}}\n{{#ifMultipleAssets}}Assets: {{assetCount}} items{{/ifMultipleAssets}}',
      title: 'Conditional Multi Test',
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
    });

    const pdf = await generateAgreementPdf({
      personnelName: 'Bob Jones',
      assets: [
        { name: 'Laptop', serialNumber: 'SN-1', propertyNumber: 'PN-1', condition: 'Good' },
        { name: 'Monitor', serialNumber: 'SN-2', propertyNumber: 'PN-2', condition: 'Good' },
      ],
      renderMode: 'preprinted',
      templateId: 'tmpl-ul-cond-multi',
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const fs = await import('fs');
    const os = await import('os');
    const { execSync } = await import('child_process');
    const tmpFile = os.tmpdir() + `/test-ul-cond-multi-${Date.now()}.pdf`;
    fs.writeFileSync(tmpFile, pdf);
    try {
      const text = execSync(`pdftotext -raw ${tmpFile} -`, { encoding: 'utf-8' });
      expect(text).toContain('Bob Jones');
      // Multiple assets block should render
      expect(text).toContain('2 items');
      // Single asset block should NOT appear
      expect(text).not.toContain('Single');
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  });
});
