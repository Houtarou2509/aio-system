import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function QRScannerModal({ open, onClose }: Props) {
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

  // ─── Safe cleanup: never lets stop()/clear() throw to React error boundary ───
  const safeStopAndClearScanner = useCallback(async () => {
    if (!scannerRef.current) return;
    if (isStoppingRef.current) return; // already stopping — bail out

    isStoppingRef.current = true;
    const scanner = scannerRef.current;

    try {
      // Only call stop() if the scanner has actually started
      if (hasStartedRef.current) {
        try {
          await scanner.stop();
        } catch (e: any) {
          // Swallow "Cannot stop, scanner is not running or paused"
          if (!String(e?.message || e || '').includes('not running') && !String(e?.message || e || '').includes('not paused')) {
            console.warn('[QRScanner] stop() error:', e);
          }
        }
      }

      // Always try clear(), never let it throw
      try {
        scanner.clear();
      } catch {}
    } finally {
      scannerRef.current = null;
      hasStartedRef.current = false;
      isStoppingRef.current = false;
      if (isMountedRef.current) setScanning(false);
    }
  }, []);

  // ─── Decode handler — called after scanner has been safely stopped ───
  const resolveAndNavigate = useCallback(async (decodedText: string) => {
    // 1. Guest URL: /guest/<token>
    const guestMatch = decodedText.match(/guest\/([a-zA-Z0-9_-]+)/);
    if (guestMatch) {
      onClose();
      navigate(`/guest/${guestMatch[1]}`);
      return;
    }

    // 2. PROP:<propertyNumber> or ASSET:<id> — resolve via lookup API
    if (decodedText.startsWith('PROP:') || decodedText.startsWith('ASSET:')) {
      setResolving(true);
      try {
        const token = localStorage.getItem('accessToken');
        const res = await fetch(`/api/assets/lookup?q=${encodeURIComponent(decodedText)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.error?.message || body?.message || `Asset not found for QR code: ${decodedText}`);
          setResolving(false);
          return;
        }
        const { data } = await res.json();
        onClose();
        navigate(`/assets?page=1&search=${encodeURIComponent(data.propertyNumber || data.name || data.id)}`);
      } catch {
        setError('Failed to resolve QR code. Check your connection and try again.');
        setResolving(false);
      }
      return;
    }

    // 3. Bare UUID → search
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decodedText)) {
      onClose();
      navigate(`/assets?page=1&search=${encodeURIComponent(decodedText)}`);
      return;
    }

    // 4. Fallback: treat as search query
    onClose();
    navigate(`/assets?page=1&search=${encodeURIComponent(decodedText)}`);
  }, [navigate, onClose]);

  // ─── Close handler — safe stop then close ───
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

  // ─── Main scanner lifecycle: start when open, cleanup on close/unmount ───
  useEffect(() => {
    if (!open) return;

    // Reset state for a fresh open
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

          // Safely stop scanner before navigating
          await safeStopAndClearScanner();

          if (!isMountedRef.current) return;
          resolveAndNavigate(decodedText);
        },
        () => {} // ignore per-frame scan failures
      )
      .then(() => {
        if (cancelled) {
          // Component unmounted before start completed — clean up immediately
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
            className="text-gray-400 hover:text-gray-700 text-lg leading-none disabled:opacity-50"
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