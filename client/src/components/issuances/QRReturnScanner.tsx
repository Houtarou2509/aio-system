import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { apiFetch, ApiError } from '../../lib/api';
import { QrCode, X, CheckCircle2, AlertCircle, Loader2, Package, Users } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onReturned: () => void;
}

interface IssuanceInfo {
  id: string;
  asset: { id: string; name: string; serialNumber: string | null; propertyNumber: string | null; status: string } | null;
  personnel: { id: string; fullName: string; position: string | null; project: string | null; department: string | null } | null;
  assignedAt: string;
}

type QRReturnPayload =
  | { kind: 'assetLookup'; value: string }
  | { kind: 'assetId'; value: string };

export function parseQRReturnPayload(decodedText: string): QRReturnPayload | null {
  const value = decodedText.trim();
  if (!value) return null;

  if (value.startsWith('PROP:') || value.startsWith('ASSET:')) {
    return { kind: 'assetLookup', value };
  }

  try {
    const url = new URL(value, 'http://localhost');
    const assetPathMatch = url.pathname.match(/\/assets\/([A-Za-z0-9_-]+)$/);
    if (assetPathMatch) return { kind: 'assetId', value: assetPathMatch[1] };
    if (url.pathname.match(/\/guest\/[A-Za-z0-9_-]+$/)) return null;
  } catch {
    // Fall through to raw UUID parsing.
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return { kind: 'assetId', value };
  }

  return null;
}

export default function QRReturnScanner({ open, onClose, onReturned }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStoppingRef = useRef(false);
  const hasStartedRef = useRef(false);
  const hasHandledScanRef = useRef(false);
  const isMountedRef = useRef(true);

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [issuance, setIssuance] = useState<IssuanceInfo | null>(null);
  const [notFound, setNotFound] = useState('');
  const [returning, setReturning] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [scanSession, setScanSession] = useState(0);

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
          const message = String(e?.message || e || '');
          if (!message.includes('not running') && !message.includes('not paused')) {
            console.warn('[QRReturnScanner] stop() error:', e);
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

  const resolveAssetId = useCallback(async (decodedText: string): Promise<string | null> => {
    const payload = parseQRReturnPayload(decodedText);
    if (!payload) return null;

    if (payload.kind === 'assetId') return payload.value;

    const res = await apiFetch(`/assets/lookup?q=${encodeURIComponent(payload.value)}`);
    return res.data?.id || null;
  }, []);

  const resolveActiveIssuance = useCallback(async (decodedText: string) => {
    try {
      const assetId = await resolveAssetId(decodedText);
      if (!isMountedRef.current) return;

      if (!assetId) {
        setNotFound('Asset not found or no active issuance');
        return;
      }

      const res = await apiFetch(`/issuances/active/asset/${encodeURIComponent(assetId)}`);
      if (!isMountedRef.current) return;

      if (res.data) {
        setIssuance(res.data);
      } else {
        setNotFound(res.message || 'No active issuance found for this asset');
      }
    } catch (e: any) {
      if (!isMountedRef.current) return;
      const message = e instanceof ApiError && e.status !== 404
        ? e.message
        : 'Asset not found or no active issuance';
      setNotFound(message);
    }
  }, [resolveAssetId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!open) return;

    setIssuance(null);
    setNotFound('');
    setError('');
    setSuccess(false);
    setReturning(false);
    setScanning(false);
    setIsClosing(false);
    hasHandledScanRef.current = false;
    isStoppingRef.current = false;

    let isCancelled = false;
    const scanner = new Html5Qrcode('qr-return-reader');
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (isCancelled || hasHandledScanRef.current) return;
          hasHandledScanRef.current = true;

          await safeStopAndClearScanner();
          if (!isMountedRef.current || isCancelled) return;
          resolveActiveIssuance(decodedText);
        },
        () => {}
      )
      .then(() => {
        if (isCancelled) {
          safeStopAndClearScanner();
          return;
        }
        hasStartedRef.current = true;
        setScanning(true);
      })
      .catch((err) => {
        if (!isCancelled) setError(typeof err === 'string' ? err : 'Camera access denied or unavailable');
      });

    return () => {
      isCancelled = true;
      safeStopAndClearScanner();
    };
  }, [open, scanSession, safeStopAndClearScanner, resolveActiveIssuance]);

  const handleReturn = async () => {
    if (!issuance) return;
    setReturning(true);
    try {
      await apiFetch(`/issuances/${issuance.id}/return`, { method: 'POST', body: { returnCondition: 'Good', viaQR: true } });
      setSuccess(true);
      onReturned();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setReturning(false);
    }
  };

  const handleClose = useCallback(async () => {
    if (isClosing) return;
    setIsClosing(true);
    await safeStopAndClearScanner();
    onClose();
    if (isMountedRef.current) setIsClosing(false);
  }, [isClosing, safeStopAndClearScanner, onClose]);

  const handleScanAgain = useCallback(() => {
    setNotFound('');
    setError('');
    setScanning(false);
    setIssuance(null);
    setSuccess(false);
    hasHandledScanRef.current = false;
    setScanSession((current) => current + 1);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background: '#012061' }}>
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[#f8931f]" />
            <h3 className="text-sm font-bold text-white">QR Return Scanner</h3>
          </div>
          <button onClick={handleClose} disabled={isClosing} className="text-white/70 hover:text-white disabled:opacity-50"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5">
          {/* Success State */}
          {success && (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
              <h3 className="text-base font-bold text-emerald-700 mb-1">Asset Returned!</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                {issuance?.asset?.name} has been marked as returned from {issuance?.personnel?.fullName || '-'}
              </p>
              <button onClick={handleClose} className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#012061] text-white hover:bg-[#001a4d]">
                Done
              </button>
            </div>
          )}

          {/* Confirmation State */}
          {issuance && !success && (
            <div className="space-y-4">
              <div className="text-center">
                <QrCode className="w-8 h-8 mx-auto mb-2 text-[#f8931f]" />
                <h3 className="text-sm font-bold" style={{ color: '#012061' }}>Confirm Return</h3>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-[#f8931f]" />
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Asset</p>
                    <p className="text-sm font-semibold" style={{ color: '#012061' }}>{issuance.asset?.name}</p>
                    <p className="text-[10px] text-slate-400">S/N: {issuance.asset?.serialNumber || '-'} | P/N: {issuance.asset?.propertyNumber || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-[#f8931f]" />
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Currently Held By</p>
                    <p className="text-sm font-semibold" style={{ color: '#012061' }}>{issuance.personnel?.fullName || '-'}</p>
                    <p className="text-[10px] text-slate-400">{issuance.personnel?.position || ''} {issuance.personnel?.department ? `| ${issuance.personnel.department}` : ''}</p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">Issued: {new Date(issuance.assignedAt).toLocaleDateString()}</p>
              </div>

              <div className="flex gap-2">
                <button onClick={handleClose} className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700">
                  Cancel
                </button>
                <button onClick={handleReturn} disabled={returning}
                  className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-white bg-[#f8931f] hover:bg-[#e07e0a] disabled:opacity-50 flex items-center justify-center gap-1">
                  {returning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {returning ? 'Returning...' : 'Confirm Return'}
                </button>
              </div>
            </div>
          )}

          {/* Not Found State */}
          {notFound && !issuance && !success && (
            <div className="text-center py-6">
              <AlertCircle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
              <h3 className="text-sm font-bold text-amber-700 mb-1">No Active Issuance</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{notFound}</p>
              <button onClick={handleScanAgain} className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#012061] text-white hover:bg-[#001a4d]">
                Scan Again
              </button>
            </div>
          )}

          {/* Scanner State */}
          {!issuance && !notFound && !success && (
            <>
              <div
                id="qr-return-reader"
                className="w-full rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800"
                style={{ minHeight: scanning ? '250px' : '0' }}
              />
              {!scanning && !error && (
                <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">Starting camera...</p>
              )}
              {error && (
                <div className="text-center py-8">
                  <p className="text-sm text-red-600 mb-3">{error}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Make sure camera permissions are granted and you're using HTTPS or localhost.</p>
                </div>
              )}
              {scanning && (
                <p className="text-xs text-center text-slate-400 mt-3">
                  Point your camera at an asset QR code to initiate the return process.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
