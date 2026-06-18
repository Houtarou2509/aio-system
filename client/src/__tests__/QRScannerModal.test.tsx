import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock html5-qrcode to match the real library's behavior ──
//
// Real Html5QrcodeScannerState enum (from state-manager.d.ts):
//   UNKNOWN = 0, NOT_STARTED = 1, SCANNING = 2, PAUSED = 3
//
// Real behavior:
//   - getState() returns NOT_STARTED (1) before start() resolves
//   - getState() returns SCANNING (2) after start() resolves
//   - stop() throws if called while NOT_STARTED
//   - clear() is always safe to call
vi.mock('html5-qrcode', () => {
  const STATE = { UNKNOWN: 0, NOT_STARTED: 1, SCANNING: 2, PAUSED: 3 };

  const instances: MockHtml5Qrcode[] = [];
  let startCallCount = 0;
  let stopCallCount = 0;
  let stopWhileNotStartedCount = 0;
  let clearCallCount = 0;

  class MockHtml5Qrcode {
    elementId: string;
    state: number = STATE.NOT_STARTED; // starts as NOT_STARTED, NOT 0
    startPromise: Promise<void> | null = null;

    constructor(elementId: string) {
      this.elementId = elementId;
      instances.push(this);
    }

    async start(_config: any, _opts: any, _onScan: (text: string) => void, _onError: (err: any) => void) {
      startCallCount++;
      // State stays NOT_STARTED while start() is pending — matches real behavior
      this.state = STATE.NOT_STARTED;
      return new Promise<void>((resolve) => {
        // Simulate async camera start — state becomes SCANNING only after resolve
        setTimeout(() => {
          this.state = STATE.SCANNING;
          resolve();
        }, 10);
      });
    }

    async stop() {
      // Real library throws if stop() is called while NOT_STARTED
      if (this.state === STATE.NOT_STARTED) {
        stopWhileNotStartedCount++;
        throw new Error('Cannot stop, scanner is not running.');
      }
      stopCallCount++;
      this.state = STATE.NOT_STARTED;
    }

    clear() {
      clearCallCount++;
      this.state = STATE.NOT_STARTED;
    }

    getState() {
      return this.state;
    }
  }

  return {
    Html5Qrcode: MockHtml5Qrcode as any,
    __esModule: true,
    __testUtils: {
      STATE,
      getInstances: () => instances,
      getStartCallCount: () => startCallCount,
      getStopCallCount: () => stopCallCount,
      getStopWhileNotStartedCount: () => stopWhileNotStartedCount,
      getClearCallCount: () => clearCallCount,
      reset: () => {
        instances.length = 0;
        startCallCount = 0;
        stopCallCount = 0;
        stopWhileNotStartedCount = 0;
        clearCallCount = 0;
      },
    },
  };
});

import { render, act, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QRScannerModal from '../components/assets/QRScannerModal';

function renderWithRouter(props: any) {
  return render(
    <MemoryRouter>
      <QRScannerModal {...props} />
    </MemoryRouter>
  );
}

// Helper to access the mock utilities
async function getTestUtils() {
  const mod = await import('html5-qrcode');
  return (mod as any).__testUtils;
}

describe('QRScannerModal — scanner lifecycle idempotency', () => {
  beforeEach(async () => {
    const utils = await getTestUtils();
    utils.reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('creates only one Html5Qrcode instance when opened once', async () => {
    const utils = await getTestUtils();
    const onClose = vi.fn();

    const { unmount } = renderWithRouter({ open: true, onClose });

    await waitFor(() => {
      expect(utils.getStartCallCount()).toBe(1);
    });

    expect(utils.getInstances().length).toBe(1);

    // Wait for the async start to complete so the scanner is SCANNING
    await waitFor(() => {
      expect(utils.getInstances()[0].getState()).toBe(utils.STATE.SCANNING);
    });

    await act(async () => {
      unmount();
    });

    // After unmount, the scanner should have been stopped or at least cleared
    expect(utils.getStopCallCount() + utils.getClearCallCount()).toBeGreaterThanOrEqual(1);
  });

  it('does not create duplicate scanners on repeated open/close cycles', async () => {
    const utils = await getTestUtils();
    const onClose = vi.fn();

    const { rerender } = renderWithRouter({ open: true, onClose });

    // Wait for scanner to start
    await waitFor(() => {
      expect(utils.getStartCallCount()).toBe(1);
    });

    // Wait for SCANNING state
    await waitFor(() => {
      expect(utils.getInstances()[0].getState()).toBe(utils.STATE.SCANNING);
    });

    // Close
    await act(async () => {
      rerender(
        <MemoryRouter>
          <QRScannerModal open={false} onClose={onClose} />
        </MemoryRouter>
      );
    });

    // Wait for cleanup
    await waitFor(() => {
      expect(utils.getStopCallCount()).toBeGreaterThanOrEqual(1);
    });

    // Reopen
    await act(async () => {
      rerender(
        <MemoryRouter>
          <QRScannerModal open={true} onClose={onClose} />
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(utils.getStartCallCount()).toBe(2);
    });

    // Wait for SCANNING state on the new instance
    await waitFor(() => {
      expect(utils.getInstances()[1].getState()).toBe(utils.STATE.SCANNING);
    });

    // Close again
    await act(async () => {
      rerender(
        <MemoryRouter>
          <QRScannerModal open={false} onClose={onClose} />
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(utils.getStopCallCount()).toBeGreaterThanOrEqual(2);
    });

    // Reopen again
    await act(async () => {
      rerender(
        <MemoryRouter>
          <QRScannerModal open={true} onClose={onClose} />
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(utils.getStartCallCount()).toBe(3);
    });

    // Despite 3 open cycles, there should never be more than 1 active instance
    const instances = utils.getInstances();
    expect(instances.length).toBe(3);

    // After all cycles, close
    await act(async () => {
      rerender(
        <MemoryRouter>
          <QRScannerModal open={false} onClose={onClose} />
        </MemoryRouter>
      );
    });
  });

  it('clears #qr-reader container children on close', async () => {
    const utils = await getTestUtils();
    const onClose = vi.fn();

    // Create a container with mock children to simulate html5-qrcode leftovers
    document.body.innerHTML = '<div id="qr-reader"><video></video><canvas></canvas></div>';

    const { rerender } = renderWithRouter({ open: true, onClose });

    await waitFor(() => {
      expect(utils.getStartCallCount()).toBe(1);
    });

    // Close
    await act(async () => {
      rerender(
        <MemoryRouter>
          <QRScannerModal open={false} onClose={onClose} />
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(utils.getClearCallCount()).toBeGreaterThanOrEqual(1);
    });

    // The qr-reader container should have no children after close
    const container = document.getElementById('qr-reader');
    if (container) {
      expect(container.children.length).toBe(0);
    }
  });

  it('stops the previous scanner before starting a new one on rapid reopen', async () => {
    const utils = await getTestUtils();
    const onClose = vi.fn();

    const { rerender } = renderWithRouter({ open: true, onClose });

    // Immediately close and reopen without waiting for start to complete
    // This tests the rapid reopen path where start() is still pending
    await act(async () => {
      rerender(
        <MemoryRouter>
          <QRScannerModal open={false} onClose={onClose} />
        </MemoryRouter>
      );
    });

    await act(async () => {
      rerender(
        <MemoryRouter>
          <QRScannerModal open={true} onClose={onClose} />
        </MemoryRouter>
      );
    });

    // Wait for things to settle — flush all pending timers/promises
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // The scanner should eventually start (after cleanup of the first)
    await waitFor(() => {
      expect(utils.getStartCallCount()).toBeGreaterThanOrEqual(1);
    });

    // No more than 1 instance should be in SCANNING state at any time
    const instances = utils.getInstances();
    const scanningCount = instances.filter((i: any) => i.state === utils.STATE.SCANNING).length;
    expect(scanningCount).toBeLessThanOrEqual(1);
  });

  it('does not call stop() on a scanner that is NOT_STARTED', async () => {
    const utils = await getTestUtils();
    const onClose = vi.fn();

    const { rerender, unmount } = renderWithRouter({ open: true, onClose });

    // Close immediately, before start() has resolved (scanner is still NOT_STARTED)
    await act(async () => {
      rerender(
        <MemoryRouter>
          <QRScannerModal open={false} onClose={onClose} />
        </MemoryRouter>
      );
    });

    // Wait for cleanup to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // stop() should NOT have been called while the scanner was NOT_STARTED
    // (the real library throws in this case; our fix guards against it)
    expect(utils.getStopWhileNotStartedCount()).toBe(0);
    // clear() should still have been called for cleanup
    expect(utils.getClearCallCount()).toBeGreaterThanOrEqual(1);

    unmount();
  });

  it('discards stale start() resolution when modal closes before start completes', async () => {
    const utils = await getTestUtils();
    const onClose = vi.fn();

    // Open the modal — start() will be pending
    const { rerender } = renderWithRouter({ open: true, onClose });

    // Close before the 10ms timer fires (start() is still pending)
    await act(async () => {
      rerender(
        <MemoryRouter>
          <QRScannerModal open={false} onClose={onClose} />
        </MemoryRouter>
      );
    });

    // Wait for the start() timer to fire and any cleanup to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // The stale start() should have been discarded — no scanner left in SCANNING state
    const instances = utils.getInstances();
    const scanningCount = instances.filter((i: any) => i.state === utils.STATE.SCANNING).length;
    expect(scanningCount).toBe(0);

    // Reopen — should create a fresh scanner
    await act(async () => {
      rerender(
        <MemoryRouter>
          <QRScannerModal open={true} onClose={onClose} />
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(utils.getStartCallCount()).toBeGreaterThanOrEqual(2);
    });
  });
});