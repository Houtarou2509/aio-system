import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MaintenanceCalendarPage from '../pages/MaintenanceCalendarPage';

/* ── Mock localStorage and fetch for the page ─────────────────────────────── */
const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: vi.fn().mockReturnValue('fake-token'),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  writable: true,
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/maintenance-calendar']}>
      <MaintenanceCalendarPage />
    </MemoryRouter>
  );
}

describe('MaintenanceCalendarPage — null asset handling', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders "Unknown asset" and search does not crash when asset is null', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/maintenance/calendar')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              stats: { pending: 1, overdue: 0, completedThisMonth: 0 },
              schedules: [
                {
                  id: 'sched-null',
                  assetId: 'deleted-asset',
                  title: 'Quarterly calibration',
                  scheduledDate: new Date().toISOString(),
                  notes: 'Check sensors',
                  status: 'pending',
                  frequency: 'quarterly',
                  asset: null,
                },
              ],
            },
          }),
        });
      }
      if (url.startsWith('/api/auth/refresh')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: false, error: { message: 'No refresh' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: [] }),
      });
    });

    expect(() => renderPage()).not.toThrow();
    expect(await screen.findByText('Quarterly calibration')).toBeDefined();
    expect(screen.getByText('Unknown asset')).toBeDefined();
  });
});
