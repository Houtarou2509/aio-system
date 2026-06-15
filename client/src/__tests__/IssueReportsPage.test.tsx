import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import IssueReportsPage from '../pages/IssueReportsPage';

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

describe('IssueReportsPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('disables the admin response field for resolved issue reports', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/issues')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: [
              {
                id: 'issue-resolved',
                reporterName: 'Staff DRDF',
                reporterEmail: 'staff@drdf.com',
                reporterRole: 'STAFF_ADMIN',
                pageUrl: 'http://localhost:3000/aio-system/settings',
                issueType: 'UI_ISSUE',
                description: 'This just issue',
                stepsToReproduce: 'This is the issue',
                status: 'RESOLVED',
                adminNotes: 'This issue is done',
                createdAt: new Date().toISOString(),
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: [] }),
      });
    });

    render(<IssueReportsPage />);

    const textarea = await screen.findByDisplayValue('This issue is done');
    expect((textarea as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('sends the current admin response when marking an open issue as resolved', async () => {
    mockFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/issues/issue-open') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              id: 'issue-open',
              reporterName: 'Staff DRDF',
              reporterEmail: 'staff@drdf.com',
              reporterRole: 'STAFF_ADMIN',
              pageUrl: 'http://localhost:3000/aio-system/settings',
              issueType: 'UI_ISSUE',
              description: 'This just issue',
              stepsToReproduce: 'This is the issue',
              status: 'RESOLVED',
              adminNotes: JSON.parse(String(options?.body)).adminNotes,
              createdAt: new Date().toISOString(),
            },
          }),
        });
      }

      if (url.startsWith('/api/issues')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: [
              {
                id: 'issue-open',
                reporterName: 'Staff DRDF',
                reporterEmail: 'staff@drdf.com',
                reporterRole: 'STAFF_ADMIN',
                pageUrl: 'http://localhost:3000/aio-system/settings',
                issueType: 'UI_ISSUE',
                description: 'This just issue',
                stepsToReproduce: 'This is the issue',
                status: 'OPEN',
                adminNotes: null,
                createdAt: new Date().toISOString(),
              },
            ],
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: [] }),
      });
    });

    render(<IssueReportsPage />);

    const textarea = await screen.findByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'This issue is done' } });

    const statusSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(statusSelect, { target: { value: 'RESOLVED' } });

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(([url, options]) =>
        url === '/api/issues/issue-open' && options?.method === 'PATCH'
      );
      expect(patchCall).toBeTruthy();
      expect(JSON.parse(String(patchCall![1]?.body))).toMatchObject({
        status: 'RESOLVED',
        adminNotes: 'This issue is done',
      });
    });
  });
});
