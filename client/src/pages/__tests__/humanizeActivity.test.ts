import { describe, it, expect } from 'vitest';
import { humanizeActivity } from '../DashboardPage';

describe('humanizeActivity', () => {
  it('parses server-formatted "viewed an agreement PDF" string', () => {
    const result = humanizeActivity('admin viewed an agreement PDF — Jun 18, 2026, 5:17 PM');
    expect(result.actor).toBe('admin');
    expect(result.action).toBe('viewed an agreement PDF');
    // No duplication
    expect(result.action).not.toContain('admin');
  });

  it('parses server-formatted "archived a document" string', () => {
    const result = humanizeActivity('admin archived a document — Jun 17, 2026, 4:29 PM');
    expect(result.actor).toBe('admin');
    expect(result.action).toBe('archived a document');
    expect(result.action).not.toContain('admin');
  });

  it('parses server-formatted "checked out an asset" string', () => {
    const result = humanizeActivity('admin checked out an asset — Jun 17, 2026, 4:29 PM');
    expect(result.actor).toBe('admin');
    expect(result.action).toBe('checked out an asset');
    expect(result.action).not.toContain('admin');
  });

  it('parses server-formatted "created a bulk issuance" string', () => {
    const result = humanizeActivity('admin created a bulk issuance — Jun 17, 2026, 4:29 PM');
    expect(result.actor).toBe('admin');
    expect(result.action).toBe('created a bulk issuance');
  });

  it('handles legacy raw-format "document.archived" string', () => {
    const result = humanizeActivity('admin document.archived DocumentArchiveItem — Jun 17, 2026, 4:29 PM');
    expect(result.actor).toBe('admin');
    expect(result.action).toBe('archived a document');
    // No raw keys
    expect(result.action).not.toContain('document.archived');
    expect(result.action).not.toContain('DocumentArchiveItem');
  });

  it('handles legacy raw-format "agreement.pdf_viewed" string', () => {
    const result = humanizeActivity('admin agreement.pdf_viewed AgreementDocument — Jun 18, 2026, 5:17 PM');
    expect(result.actor).toBe('admin');
    expect(result.action).toBe('viewed an agreement PDF');
    expect(result.action).not.toContain('agreement.pdf_viewed');
    expect(result.action).not.toContain('AgreementDocument');
  });

  it('handles legacy raw-format "issuance.bulk_created" string', () => {
    const result = humanizeActivity('admin issuance.bulk_created AgreementDocument — Jun 17, 2026, 4:29 PM');
    expect(result.actor).toBe('admin');
    expect(result.action).toBe('created a bulk issuance');
    expect(result.action).not.toContain('issuance.bulk_created');
  });

  it('handles status change field-event strings', () => {
    const result = humanizeActivity('admin changed status from "AVAILABLE" to "PENDING_ASSIGNMENT" on asset — Jun 17, 2026, 4:29 PM');
    expect(result.actor).toBe('admin');
    expect(result.action).toContain('Status changed');
    expect(result.action).toContain('AVAILABLE');
    expect(result.action).toContain('PENDING_ASSIGNMENT');
  });

  it('handles legacy "checkout Assignment" string', () => {
    const result = humanizeActivity('admin checkout Assignment — Jun 17, 2026, 4:29 PM');
    expect(result.actor).toBe('admin');
    expect(result.action).toBe('Asset checked out');
  });

  it('never duplicates the actor in the action field', () => {
    const inputs = [
      'admin viewed an agreement PDF — Jun 18, 2026, 5:17 PM',
      'admin archived a document — Jun 17, 2026, 4:29 PM',
      'admin checked out an asset — Jun 17, 2026, 4:29 PM',
      'admin created a bulk issuance — Jun 17, 2026, 4:29 PM',
      'admin document.archived DocumentArchiveItem — Jun 17, 2026, 4:29 PM',
      'admin agreement.pdf_viewed AgreementDocument — Jun 18, 2026, 5:17 PM',
      'admin issuance.bulk_created AgreementDocument — Jun 17, 2026, 4:29 PM',
      'admin checkout Assignment — Jun 17, 2026, 4:29 PM',
    ];
    for (const input of inputs) {
      const result = humanizeActivity(input);
      expect(result.action).not.toContain(result.actor);
    }
  });

  it('never exposes raw event keys or internal entity names', () => {
    const inputs = [
      'admin document.archived DocumentArchiveItem — Jun 17, 2026, 4:29 PM',
      'admin agreement.pdf_viewed AgreementDocument — Jun 18, 2026, 5:17 PM',
      'admin issuance.bulk_created AgreementDocument — Jun 17, 2026, 4:29 PM',
    ];
    const forbidden = ['document.archived', 'agreement.pdf_viewed', 'issuance.bulk_created', 'DocumentArchiveItem', 'DocumentArchivedItem', 'AgreementDocument', 'AssetAssignment'];
    for (const input of inputs) {
      const result = humanizeActivity(input);
      for (const bad of forbidden) {
        expect(result.action).not.toContain(bad);
      }
    }
  });
});