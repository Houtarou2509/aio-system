import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardWidgets } from '../components/dashboard/DashboardWidgets';

/* ── Mock localStorage and fetch for the widget ───────────────────────────── */
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

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardWidgets />
    </MemoryRouter>
  );
}

describe('DashboardWidgets — upcoming maintenance null asset', () => {
  it('renders "Unknown asset" when a schedule has asset: null', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/dashboard/stats') {
        return Promise.resolve({
          ok: true,
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
      if (url === '/api/maintenance/upcoming') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                id: 'sched-1',
                title: 'Annual service',
                scheduledDate: new Date().toISOString(),
                status: 'pending',
                asset: null,
              },
            ],
          }),
        });
      }
      if (url === '/api/dashboard/warranties-expiring') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: [] }),
        });
      }
      if (url === '/api/dashboard/location-stats') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: [] }),
        });
      }
      if (url === '/api/dashboard/age-stats') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: [] }) });
    });

    expect(() => renderDashboard()).not.toThrow();
    const unknownAssets = await screen.findAllByText('Unknown asset');
    expect(unknownAssets.length).toBeGreaterThanOrEqual(2); // compact + list rows
  });

  it('renders the asset name when asset is present', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/dashboard/stats') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              totalAssets: 1,
              totalAssigned: 0,
              underMaintenance: 0,
              available: 1,
              byStatus: {},
              byType: {},
              activityFeed: [],
            },
          }),
        });
      }
      if (url === '/api/maintenance/upcoming') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                id: 'sched-2',
                title: 'Battery replacement',
                scheduledDate: new Date().toISOString(),
                status: 'overdue',
                asset: { id: 'asset-1', name: 'Lenovo ThinkPad X1' },
              },
            ],
          }),
        });
      }
      if (url === '/api/dashboard/warranties-expiring') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: [] }),
        });
      }
      if (url === '/api/dashboard/location-stats') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: [] }),
        });
      }
      if (url === '/api/dashboard/age-stats') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: [] }) });
    });

    expect(() => renderDashboard()).not.toThrow();
    expect(await screen.findAllByText('Lenovo ThinkPad X1')).toBeDefined();
  });
});
