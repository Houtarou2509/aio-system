import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => {
  const prisma: any = {
    $transaction: vi.fn(async (cb: any) => cb(prisma)),
    agreementTemplate: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    agreementTemplateVersion: {
      create: vi.fn(),
    },
  };
  return prisma;
});

vi.mock('../../server/src/lib/prisma', () => ({ prisma: mockPrisma }));

import { duplicateTemplate } from '../../server/src/services/agreement.service';

function resetMocks() {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  mockPrisma.agreementTemplate.findUnique.mockResolvedValue(null);
  mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
}

describe('duplicateTemplate', () => {
  beforeEach(resetMocks);

  const sourceTemplate = {
    id: 'source-1',
    name: 'Template 9',
    title: 'ISSUANCE & ACCOUNTABILITY AGREEMENT',
    content: 'I, {{fullName}}, employed as {{designation}}...',
    contentJson: { type: 'doc', content: [{ type: 'paragraph' }] },
    headerLogo: '/uploads/logos/logo.png',
    letterheadPath: '/uploads/letterheads/letterhead.png',
    isDefault: true,
    defaultPropertyOfficer: 'Officer A',
    defaultAuthorizedRep: 'Rep B',
    currentVersion: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    versions: [
      {
        id: 'ver-3',
        templateId: 'source-1',
        versionNumber: 3,
        name: 'Template 9',
        title: 'ISSUANCE & ACCOUNTABILITY AGREEMENT',
        content: 'I, {{fullName}}, employed as {{designation}}...',
        contentJson: { type: 'doc', content: [{ type: 'paragraph' }] },
        headerLogo: '/uploads/logos/logo.png',
        letterheadPath: '/uploads/letterheads/letterhead.png',
        defaultPropertyOfficer: 'Officer A',
        defaultAuthorizedRep: 'Rep B',
        changeSummary: 'Updated content',
        createdAt: new Date(),
      },
    ],
  };

  const createdTemplate = {
    id: 'new-dup-1',
    name: 'Template 9 (Copy)',
    title: 'ISSUANCE & ACCOUNTABILITY AGREEMENT',
    content: 'I, {{fullName}}, employed as {{designation}}...',
    contentJson: { type: 'doc', content: [{ type: 'paragraph' }] },
    isDefault: false,
    defaultPropertyOfficer: 'Officer A',
    defaultAuthorizedRep: 'Rep B',
    headerLogo: '/uploads/logos/logo.png',
    letterheadPath: '/uploads/letterheads/letterhead.png',
    currentVersion: 1,
  };

  // 1. Duplicate creates a new template with copied fields
  it('creates a new template with copied fields from source', async () => {
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(sourceTemplate);
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null); // name not taken
    mockPrisma.agreementTemplate.create.mockResolvedValue(createdTemplate);
    mockPrisma.agreementTemplateVersion.create.mockResolvedValue({ id: 'ver-dup-1' });

    const result = await duplicateTemplate('source-1');

    expect(result).toEqual(createdTemplate);
    // Verify create was called with correct data
    const createData = mockPrisma.agreementTemplate.create.mock.calls[0][0].data;
    expect(createData.name).toBe('Template 9 (Copy)');
    expect(createData.title).toBe('ISSUANCE & ACCOUNTABILITY AGREEMENT');
    expect(createData.content).toBe('I, {{fullName}}, employed as {{designation}}...');
    expect(createData.isDefault).toBe(false);
    expect(createData.defaultPropertyOfficer).toBe('Officer A');
    expect(createData.defaultAuthorizedRep).toBe('Rep B');
    expect(createData.headerLogo).toBe('/uploads/logos/logo.png');
    expect(createData.letterheadPath).toBe('/uploads/letterheads/letterhead.png');
    // Verify version was created
    expect(mockPrisma.agreementTemplateVersion.create).toHaveBeenCalled();
    const versionData = mockPrisma.agreementTemplateVersion.create.mock.calls[0][0].data;
    expect(versionData.versionNumber).toBe(1);
    expect(versionData.changeSummary).toContain('Duplicated');
  });

  // 2. Duplicate sets isDefault: false even when source is default
  it('sets isDefault to false even when source is default', async () => {
    const defaultTemplate = { ...sourceTemplate, isDefault: true };
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(defaultTemplate);
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.create.mockResolvedValue(createdTemplate);
    mockPrisma.agreementTemplateVersion.create.mockResolvedValue({ id: 'ver-dup-1' });

    await duplicateTemplate('source-1');

    const createData = mockPrisma.agreementTemplate.create.mock.calls[0][0].data;
    expect(createData.isDefault).toBe(false);
  });

  // 3. Duplicate creates version 1 with copied contentJson, headerLogo, letterheadPath
  it('creates version 1 with copied contentJson, headerLogo, and letterheadPath', async () => {
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(sourceTemplate);
    mockPrisma.agreementTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.agreementTemplate.create.mockResolvedValue(createdTemplate);
    mockPrisma.agreementTemplateVersion.create.mockResolvedValue({ id: 'ver-dup-1' });

    await duplicateTemplate('source-1');

    const versionData = mockPrisma.agreementTemplateVersion.create.mock.calls[0][0].data;
    expect(versionData.contentJson).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(versionData.headerLogo).toBe('/uploads/logos/logo.png');
    expect(versionData.letterheadPath).toBe('/uploads/letterheads/letterhead.png');
  });

  // 4. Duplicate generates unique names
  it('generates "Template 9 (Copy)" then "Template 9 (Copy 2)" when copy exists', async () => {
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(sourceTemplate);
    // First call: "Template 9 (Copy)" already exists
    mockPrisma.agreementTemplate.findFirst
      .mockResolvedValueOnce({ id: 'existing-copy', name: 'Template 9 (Copy)' }) // first name taken
      .mockResolvedValueOnce(null); // "Template 9 (Copy 2)" is free
    mockPrisma.agreementTemplate.create.mockResolvedValue({ ...createdTemplate, name: 'Template 9 (Copy 2)' });
    mockPrisma.agreementTemplateVersion.create.mockResolvedValue({ id: 'ver-dup-2' });

    await duplicateTemplate('source-1');

    const createData = mockPrisma.agreementTemplate.create.mock.calls[0][0].data;
    expect(createData.name).toBe('Template 9 (Copy 2)');
    // Should have checked for both names
    expect(mockPrisma.agreementTemplate.findFirst).toHaveBeenCalledTimes(2);
  });

  it('generates "Template 9 (Copy 3)" when copies 1 and 2 exist', async () => {
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(sourceTemplate);
    mockPrisma.agreementTemplate.findFirst
      .mockResolvedValueOnce({ id: 'copy1', name: 'Template 9 (Copy)' })
      .mockResolvedValueOnce({ id: 'copy2', name: 'Template 9 (Copy 2)' })
      .mockResolvedValueOnce(null); // "Template 9 (Copy 3)" is free
    mockPrisma.agreementTemplate.create.mockResolvedValue({ ...createdTemplate, name: 'Template 9 (Copy 3)' });
    mockPrisma.agreementTemplateVersion.create.mockResolvedValue({ id: 'ver-dup-3' });

    await duplicateTemplate('source-1');

    const createData = mockPrisma.agreementTemplate.create.mock.calls[0][0].data;
    expect(createData.name).toBe('Template 9 (Copy 3)');
  });

  // 5. Duplicate returns 404 for missing source template
  it('throws with status 404 for missing source template', async () => {
    mockPrisma.agreementTemplate.findUnique.mockResolvedValue(null);

    const error: any = await duplicateTemplate('nonexistent-id').catch(e => e);
    expect(error.message).toBe('Template not found');
    expect(error.status).toBe(404);
  });
});