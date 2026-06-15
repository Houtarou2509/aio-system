import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import { AuthProvider } from '../context/AuthContext';

/* ── Mock localStorage and fetch for the dashboard page ───────────────────── */
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

function renderDashboardPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('DashboardPage — upcoming maintenance null asset', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders "Unknown asset" when /api/maintenance/upcoming returns asset: null', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/maintenance/upcoming') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: [
              {
                id: 'sched-page-null',
                title: 'Server rack inspection',
                scheduledDate: new Date().toISOString(),
                status: 'pending',
                asset: null,
              },
            ],
          }),
        });
      }
      if (url === '/api/dashboard/stats') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              totalAssets: 0,
              totalAssigned: 0,
              underMaintenance: 0,
              available: 0,
              byStatus: {},
              byType: {},
              activityFeed: [],
            },
          }),
        });
      }
      if (url.startsWith('/api/dashboard/warranties-expiring')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: [] }),
        });
      }
      if (url.startsWith('/api/dashboard/location-stats')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: [] }),
        });
      }
      if (url.startsWith('/api/dashboard/age-stats')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: [] }),
        });
      }
      if (url === '/api/assets/stats') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              warrantiesExpiringSoon: 0,
              warrantiesExpired: 0,
              warrantiesExpiringSoonList: [],
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

    expect(() => renderDashboardPage()).not.toThrow();
    expect(await screen.findAllByText('Unknown asset')).toBeDefined();
  });
});
