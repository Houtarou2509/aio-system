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

export default function QRScannerModal({ open, onClose, onAssetResolved }: Props) {
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStoppingRef = useRef(false);
  const hasStartedRef = useRef(false);
  const hasHandledScanRef = useRef(false);
  const isMountedRef = useRef(true);

  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // ─── Safe cleanup ───
  const safeStopAndClearScanner = useCallback(async () => {
    if (!scannerRef.current) return;
    if (isStoppingRef.current) return;

    isStoppingRef.current = true;
    const scanner = scannerRef.current;

    try {
      if (hasStartedRef.current) {
        try {
          await scanner.stop();
        } catch (e: any) {
          if (!String(e?.message || e || '').includes('not running') && !String(e?.message || e || '').includes('not paused')) {
            console.warn('[QRScanner] stop() error:', e);
          }
        }
      }
      try { scanner.clear(); } catch {}
    } finally {
      scannerRef.current = null;
      hasStartedRef.current = false;
      isStoppingRef.current = false;
      if (isMountedRef.current) setScanning(false);
    }
  }, []);

  // ─── Decode handler — routing order: internal QR first, guest last ───
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
          onClose();
          onAssetResolved?.(partialAsset as Asset);
          return;
        }
        const detailBody = await detailRes.json();

        onClose();
        onAssetResolved?.(detailBody.data as Asset);
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
          onClose();
          onAssetResolved?.(detailBody.data as Asset);
          return;
        }
      } catch {
        // fall through to search
      }
      setResolving(false);
      onClose();
      navigate(`/assets?page=1&search=${encodeURIComponent(value)}`);
      return;
    }

    // ── 3. Guest link — strict URL/path parsing only ──
    const guestToken = parseGuestToken(value);
    if (guestToken) {
      console.info('[QRScanner] route: guest');
      onClose();
      navigate(`/guest/${guestToken}`);
      return;
    }

    // ── 4. Fallback: treat as search query ──
    console.info('[QRScanner] route: search');
    onClose();
    navigate(`/assets?page=1&search=${encodeURIComponent(value)}`);
  }, [navigate, onClose, onAssetResolved]);

  // ─── Close handler ───
  const handleClose = useCallback(async () => {
    if (isClosing) return;
    setIsClosing(true);
    await safeStopAndClearScanner();
    onClose();
    setIsClosing(false);
  }, [isClosing, safeStopAndClearScanner, onClose]);

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

  // ─── Main scanner lifecycle ───
  useEffect(() => {
    if (!open) return;

    setError('');
    setScanning(false);
    setResolving(false);
    setIsClosing(false);
    hasHandledScanRef.current = false;
    isStoppingRef.current = false;

    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;
    let cancelled = false;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (cancelled || hasHandledScanRef.current) return;
          hasHandledScanRef.current = true;

          await safeStopAndClearScanner();
          if (!isMountedRef.current) return;
          resolveAndNavigate(decodedText);
        },
        () => {}
      )
      .then(() => {
        if (cancelled) {
          safeStopAndClearScanner();
          return;
        }
        hasStartedRef.current = true;
        setScanning(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(typeof err === 'string' ? err : 'Camera access denied or unavailable');
      });

    return () => {
      cancelled = true;
      safeStopAndClearScanner();
    };
  }, [open, safeStopAndClearScanner, resolveAndNavigate]);

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