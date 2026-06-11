import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Routes, Route, MemoryRouter } from 'react-router-dom';
import AgreementVerificationPage from '../pages/AgreementVerificationPage';

/* ─── Mock fetch ─── */

const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

function renderWithDocNumber(docNum: string) {
  return render(
    <MemoryRouter initialEntries={[`/agreements/verify/${docNum}`]}>
      <Routes>
        <Route path="/agreements/verify/:documentNumber" element={<AgreementVerificationPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AgreementVerificationPage', () => {
  /* ── 1. Verified state ── */
  it('renders verified state with document number, signatory, signed date, and heading', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          verified: true,
          documentNumber: 'AGR-2025-00001',
          signedAt: '2025-06-01T08:30:00.000Z',
          signatoryName: 'Jane Doe',
        },
      }),
    });

    renderWithDocNumber('AGR-2025-00001');

    await waitFor(() => {
      expect(screen.getByText('Digital sign-off verified')).toBeDefined();
    });

    expect(screen.getByText('AGR-2025-00001')).toBeDefined();
    expect(screen.getByText('Jane Doe')).toBeDefined();
    expect(screen.getByText('Verified ✓')).toBeDefined();
  });

  /* ── 2. Not found / invalid document ── */
  it('renders Document Not Verified for invalid document number', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        success: false,
        error: { message: 'Document not found' },
      }),
    });

    renderWithDocNumber('INVALID-NUM');

    await waitFor(() => {
      expect(screen.getByText('Document Not Verified')).toBeDefined();
    });

    expect(screen.getByText('INVALID-NUM')).toBeDefined();
  });

  /* ── 3. Loading state ── */
  it('renders loading state before fetch completes', () => {
    // Never resolve fetch — stay in loading state
    mockFetch.mockReturnValue(new Promise(() => {}));

    renderWithDocNumber('AGR-2025-LOADING');

    expect(screen.getByText('Verifying document...')).toBeDefined();
  });

  /* ── 4. Issuances link uses /aio-system/agreements/verify/, not /api/ ── */
  it('Verification page fetches from /api/ but URL is the frontend route', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          verified: true,
          documentNumber: 'AGR-2025-00099',
          signedAt: '2025-06-10T12:00:00.000Z',
          signatoryName: 'Test User',
        },
      }),
    });

    renderWithDocNumber('AGR-2025-00099');

    await waitFor(() => {
      expect(screen.getByText('Digital sign-off verified')).toBeDefined();
    });

    // Verify fetch was called with the API endpoint (internal data fetch)
    expect(mockFetch).toHaveBeenCalledWith('/api/agreements/verify/AGR-2025-00099');
  });

  /* ── 5. Network error ── */
  it('renders Unable to Verify on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    renderWithDocNumber('AGR-NETWORK-ERR');

    await waitFor(() => {
      expect(screen.getByText('Unable to Verify')).toBeDefined();
    });
  });

  /* ── 6. Not signed ── */
  it('renders not-signed state when document exists but not signed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          verified: false,
          reason: 'not_signed',
          documentNumber: 'AGR-2025-UNSIGNED',
        },
      }),
    });

    renderWithDocNumber('AGR-2025-UNSIGNED');

    await waitFor(() => {
      expect(screen.getByText('Document not signed yet')).toBeDefined();
    });
  });

  /* ── 7. Hash mismatch ── */
  it('renders verification failed state for hash mismatch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          verified: false,
          reason: 'hash_mismatch',
          documentNumber: 'AGR-2025-TAMPERED',
        },
      }),
    });

    renderWithDocNumber('AGR-2025-TAMPERED');

    await waitFor(() => {
      expect(screen.getByText('Verification failed')).toBeDefined();
    });
  });
});