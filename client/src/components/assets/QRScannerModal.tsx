import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import type { Asset } from '../../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onAssetResolved?: (asset: Asset) => void;
}

/**
 * Strictly parse a guest token from a QR value.
 * Returns the token string if the value is a guest link path/URL, or null otherwise.
 *
 * Rejects: PROP:..., ASSET:..., "Guest No Owner", any loose "guest" substring.
 * Accepts: /guest/token, /aio-system/guest/token, https://host/aio-system/guest/token
 */
export function parseGuestToken(value: string): string | null {
  const trimmed = value.trim();

  // Fast rejection: internal QR prefixes that must NEVER be treated as guest links
  if (trimmed.startsWith('PROP:') || trimmed.startsWith('ASSET:')) return null;

  try {
    // Try parsing as a full URL (handles https://domain/aio-system/guest/token)
    const url = new URL(trimmed, window.location.origin);
    const match = url.pathname.match(/(?:\/aio-system)?\/guest\/([A-Za-z0-9_-]+)$/);
    if (match) return match[1];
  } catch {
    // Not a URL — try as a bare path (handles /aio-system/guest/token or /guest/token)
    const match = trimmed.match(/^(?:\/aio-system)?\/guest\/([A-Za-z0-9_-]+)$/);
    if (match) return match[1];
  }

  return null;
}

// Html5QrcodeScannerState enum (from html5-qrcode's state-manager.d.ts):
//   UNKNOWN = 0, NOT_STARTED = 1, SCANNING = 2, PAUSED = 3
// Only SCANNING or PAUSED states should be stopped.
const STATE_SCANNING = 2;
const STATE_PAUSED = 3;

// Module-level guard: only one Html5Qrcode instance can exist at a time across
// all renders/mounts. This prevents duplicate camera previews even if React
// re-enters the effect or the user taps Scan repeatedly.
let globalScannerActive: Html5Qrcode | null = null;
let globalSessionId = 0;

export default function QRScannerModal({ open, onClose, onAssetResolved }: Props) {
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStoppingRef = useRef(false);
  const hasStartedRef = useRef(false);
  const hasHandledScanRef = useRef(false);
  const isMountedRef = useRef(true);
  const sessionIdRef = useRef(0);

  // Refs to hold the latest callbacks so the scanner effect can depend only on
  // `open` without risking a stale closure for resolveAndNavigate / onClose / onAssetResolved.
  const onCloseRef = useRef(onClose);
  const onAssetResolvedRef = useRef(onAssetResolved);
  const navigateRef = useRef(navigate);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    onAssetResolvedRef.current = onAssetResolved;
  }, [onAssetResolved]);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // ─── Safe cleanup ───
  // Idempotent: safe to call multiple times. Stops the scanner, clears the DOM,
  // nulls all refs, and removes any leftover children from #qr-reader.
  const safeStopAndClearScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner && !globalScannerActive) {
      // Still clean up the DOM container in case html5-qrcode left orphan children
      const container = document.getElementById('qr-reader');
      if (container) {
        while (container.firstChild) container.removeChild(container.firstChild);
      }
      isStoppingRef.current = false;
      hasStartedRef.current = false;
      if (isMountedRef.current) setScanning(false);
      return;
    }

    // Use whichever scanner instance is active (prefer ref, fall back to global)
    const activeScanner = scanner || globalScannerActive;
    if (isStoppingRef.current && activeScanner === scannerRef.current) return;
    isStoppingRef.current = true;

    try {
      if (hasStartedRef.current && activeScanner) {
        try {
          // Only call stop() if the scanner is in SCANNING or PAUSED state.
          // Calling stop() on NOT_STARTED throws in the real library.
          const state = (activeScanner as any).getState?.();
          if (state === STATE_SCANNING || state === STATE_PAUSED) {
            await activeScanner.stop();
          }
        } catch (e: any) {
          if (!String(e?.message || e || '').includes('not running') && !String(e?.message || e || '').includes('not paused')) {
            console.warn('[QRScanner] stop() error:', e);
          }
        }
      }
      try { activeScanner?.clear(); } catch {}
    } finally {
      scannerRef.current = null;
      if (globalScannerActive === activeScanner) globalScannerActive = null;
      hasStartedRef.current = false;
      isStoppingRef.current = false;

      // Always empty the #qr-reader container to remove any orphaned video/canvas
      const container = document.getElementById('qr-reader');
      if (container) {
        while (container.firstChild) container.removeChild(container.firstChild);
      }

      if (isMountedRef.current) setScanning(false);
    }
  }, []);

  // ─── Decode handler — routing order: internal QR first, guest last ───
  // Reads from refs so the scanner effect can stay dep-free on these callbacks.
  const resolveAndNavigate = useCallback(async (decodedText: string) => {
    const value = decodedText.trim();
    console.info('[QRScanner] decoded:', value);

    // ── 1. Internal QR payloads: PROP: / ASSET: — ALWAYS route to asset detail ──
    if (value.startsWith('PROP:') || value.startsWith('ASSET:')) {
      console.info('[QRScanner] route: asset (internal QR)');
      setResolving(true);
      try {
        const token = localStorage.getItem('accessToken');
        const lookupRes = await fetch(`/api/assets/lookup?q=${encodeURIComponent(value)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!lookupRes.ok) {
          const body = await lookupRes.json().catch(() => ({}));
          setError(body?.error?.message || body?.message || `Asset not found for QR code: ${value}`);
          setResolving(false);
          return;
        }
        const { data: partialAsset } = await lookupRes.json();

        // Fetch full asset details for the detail modal
        const detailRes = await fetch(`/api/assets/${partialAsset.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!detailRes.ok) {
          // Fallback: use partial data from lookup
          onCloseRef.current();
          onAssetResolvedRef.current?.(partialAsset as Asset);
          return;
        }
        const detailBody = await detailRes.json();

        onCloseRef.current();
        onAssetResolvedRef.current?.(detailBody.data as Asset);
      } catch {
        setError('Failed to resolve QR code. Check your connection and try again.');
        setResolving(false);
      }
      return;
    }

    // ── 2. Bare UUID — try asset detail, then fallback to search ──
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      console.info('[QRScanner] route: asset (bare UUID)');
      setResolving(true);
      try {
        const token = localStorage.getItem('accessToken');
        const detailRes = await fetch(`/api/assets/${value}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (detailRes.ok) {
          const detailBody = await detailRes.json();
          onCloseRef.current();
          onAssetResolvedRef.current?.(detailBody.data as Asset);
          return;
        }
      } catch {
        // fall through to search
      }
      setResolving(false);
      onCloseRef.current();
      navigateRef.current(`/assets?page=1&search=${encodeURIComponent(value)}`);
      return;
    }

    // ── 3. Guest link — strict URL/path parsing only ──
    const guestToken = parseGuestToken(value);
    if (guestToken) {
      console.info('[QRScanner] route: guest');
      onCloseRef.current();
      navigateRef.current(`/guest/${guestToken}`);
      return;
    }

    // ── 4. Fallback: treat as search query ──
    console.info('[QRScanner] route: search');
    onCloseRef.current();
    navigateRef.current(`/assets?page=1&search=${encodeURIComponent(value)}`);
  }, []);

  // ─── Close handler ───
  const handleClose = useCallback(async () => {
    if (isClosing) return;
    setIsClosing(true);
    await safeStopAndClearScanner();
    onCloseRef.current();
    setIsClosing(false);
  }, [isClosing, safeStopAndClearScanner]);

  // ─── Try-again handler ───
  const handleTryAgain = useCallback(() => {
    setError('');
    setScanning(false);
    setIsClosing(false);
    hasHandledScanRef.current = false;
  }, []);

  // ─── Mount/unmount tracking ───
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ─── Main scanner lifecycle (idempotent) ───
  // This effect runs only when `open` changes. Callbacks are accessed via refs
  // so the scan handler always calls the latest version without re-running the effect.
  useEffect(() => {
    if (!open) return;

    // Reset state for this open cycle
    setError('');
    setScanning(false);
    setResolving(false);
    setIsClosing(false);
    hasHandledScanRef.current = false;
    isStoppingRef.current = false;

    // ── Guard 1: If a scanner is somehow still active globally, stop it first ──
    // This handles the case where a previous effect's cleanup hasn't completed yet.
    let mySessionId = ++globalSessionId;
    sessionIdRef.current = mySessionId;
    let cancelled = false;

    const startScanner = async () => {
      // If a previous scanner is still active, stop and clear it first
      if (globalScannerActive) {
        try {
          const state = (globalScannerActive as any).getState?.();
          // Only stop if SCANNING or PAUSED; NOT_STARTED throws on stop()
          if (state === STATE_SCANNING || state === STATE_PAUSED) {
            await globalScannerActive.stop().catch(() => {});
          }
          globalScannerActive.clear();
        } catch {}
        globalScannerActive = null;
      }

      // Also null our ref if it pointed to the old scanner
      scannerRef.current = null;
      hasStartedRef.current = false;
      isStoppingRef.current = false;

      // ── Guard 2: Empty the #qr-reader container before creating a new instance ──
      // This removes any orphaned <video>/<canvas> children from a prior session.
      const container = document.getElementById('qr-reader');
      if (container) {
        while (container.firstChild) container.removeChild(container.firstChild);
      }

      // ── Guard 3: Bail if effect was cancelled during async cleanup ──
      if (cancelled || sessionIdRef.current !== mySessionId) return;
      if (!isMountedRef.current) return;

      // Create a fresh Html5Qrcode instance
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      globalScannerActive = scanner;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            if (cancelled || hasHandledScanRef.current) return;
            if (sessionIdRef.current !== mySessionId) return;
            hasHandledScanRef.current = true;

            await safeStopAndClearScanner();
            if (!isMountedRef.current) return;
            resolveAndNavigate(decodedText);
          },
          () => {}
        );

        // ── Guard 4: start() may resolve after close — discard if stale ──
        if (cancelled || sessionIdRef.current !== mySessionId) {
          // This scanner is stale — stop it immediately
          try {
            const state = (scanner as any).getState?.();
            if (state === STATE_SCANNING || state === STATE_PAUSED) {
              await scanner.stop().catch(() => {});
            }
            scanner.clear();
          } catch {}
          if (globalScannerActive === scanner) globalScannerActive = null;
          if (scannerRef.current === scanner) scannerRef.current = null;
          return;
        }

        hasStartedRef.current = true;
        setScanning(true);
      } catch (err: any) {
        if (cancelled || sessionIdRef.current !== mySessionId) return;
        // Clean up the failed scanner
        if (globalScannerActive === scanner) globalScannerActive = null;
        if (scannerRef.current === scanner) scannerRef.current = null;
        try { scanner.clear(); } catch {}
        setError(typeof err === 'string' ? err : 'Camera access denied or unavailable');
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      safeStopAndClearScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Scan QR Code</h3>
          <button
            onClick={handleClose}
            disabled={isClosing}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 text-lg leading-none disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Scanner area */}
        <div className="p-4">
          <div
            id="qr-reader"
            className="w-full rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800"
            style={{ minHeight: scanning ? '250px' : '0' }}
          />
          {!scanning && !error && !resolving && (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
              Starting camera...
            </p>
          )}
          {resolving && (
            <p className="text-center text-sm text-blue-600 py-8">
              Resolving asset...
            </p>
          )}
          {error && (
            <div className="text-center py-8">
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <button
                onClick={handleTryAgain}
                className="text-xs text-blue-600 hover:underline"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4">
          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            Point your camera at an asset QR code to view its details.
          </p>
        </div>
      </div>
    </div>
  );
}