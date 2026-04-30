import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { apiFetch } from '../../lib/api';
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

export default function QRReturnScanner({ open, onClose, onReturned }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [issuance, setIssuance] = useState<IssuanceInfo | null>(null);
  const [notFound, setNotFound] = useState('');
  const [returning, setReturning] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset state on open
    setIssuance(null);
    setNotFound('');
    setError('');
    setSuccess(false);
    setReturning(false);

    let isCancelled = false;
    const scanner = new Html5Qrcode('qr-return-reader');
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (isCancelled) return;
          isCancelled = true;
          // Stop scanning
          try { await scanner.stop(); scanner.clear(); } catch {}
          setScanning(false);

          // Extract assetId from QR — supports URLs, paths, or raw IDs
          let assetId = decodedText;
          const urlMatch = decodedText.match(/assets\/([a-zA-Z0-9_-]+)/);
          const guestMatch = decodedText.match(/guest\/([a-zA-Z0-9_-]+)/);
          if (urlMatch) assetId = urlMatch[1];
          else if (guestMatch) assetId = guestMatch[1];

          // Look up active issuance for this asset
          try {
            const res = await apiFetch(`/api/issuances/active/asset/${assetId}`);
            if (res.data) {
              setIssuance(res.data);
            } else {
              setNotFound(res.message || 'No active issuance found for this asset');
            }
          } catch (e: any) {
            setNotFound('Asset not found or no active issuance');
          }
        },
        () => {} // ignore scan failures
      )
      .then(() => { if (!isCancelled) setScanning(true); })
      .catch((err) => {
        if (!isCancelled) setError(typeof err === 'string' ? err : 'Camera access denied or unavailable');
      });

    return () => {
      isCancelled = true;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    };
  }, [open]);

  const handleReturn = async () => {
    if (!issuance) return;
    setReturning(true);
    try {
      await apiFetch(`/api/issuances/${issuance.id}/return`, { method: 'POST', body: { condition: 'Good', viaQR: true } });
      setSuccess(true);
      onReturned();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setReturning(false);
    }
  };

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    if (scannerRef.current) {
      scannerRef.current.stop()
        .then(() => scannerRef.current?.clear())
        .catch(() => scannerRef.current?.clear())
        .finally(() => {
          scannerRef.current = null;
          setScanning(false);
          onClose();
          setIsClosing(false);
        });
    } else {
      setScanning(false);
      onClose();
      setIsClosing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={handleClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background: '#012061' }}>
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[#f8931f]" />
            <h3 className="text-sm font-bold text-white">QR Return Scanner</h3>
          </div>
          <button onClick={handleClose} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5">
          {/* Success State */}
          {success && (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
              <h3 className="text-base font-bold text-emerald-700 mb-1">Asset Returned!</h3>
              <p className="text-xs text-slate-500 mb-4">
                {issuance?.asset?.name} has been marked as returned from {issuance?.personnel?.fullName || '—'}
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

              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-[#f8931f]" />
                  <div>
                    <p className="text-xs text-slate-500">Asset</p>
                    <p className="text-sm font-semibold" style={{ color: '#012061' }}>{issuance.asset?.name}</p>
                    <p className="text-[10px] text-slate-400">S/N: {issuance.asset?.serialNumber || '—'} • P/N: {issuance.asset?.propertyNumber || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-[#f8931f]" />
                  <div>
                    <p className="text-xs text-slate-500">Currently Held By</p>
                    <p className="text-sm font-semibold" style={{ color: '#012061' }}>{issuance.personnel?.fullName || '—'}</p>
                    <p className="text-[10px] text-slate-400">{issuance.personnel?.position || ''} {issuance.personnel?.department ? `• ${issuance.personnel.department}` : ''}</p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">Issued: {new Date(issuance.assignedAt).toLocaleDateString()}</p>
              </div>

              <div className="flex gap-2">
                <button onClick={handleClose} className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50">
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
              <p className="text-xs text-slate-500 mb-4">{notFound}</p>
              <button onClick={() => { setNotFound(''); setScanning(false); }} className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#012061] text-white hover:bg-[#001a4d]">
                Scan Again
              </button>
            </div>
          )}

          {/* Scanner State */}
          {!issuance && !notFound && !success && (
            <>
              <div
                id="qr-return-reader"
                className="w-full rounded-lg overflow-hidden bg-slate-100"
                style={{ minHeight: scanning ? '250px' : '0' }}
              />
              {!scanning && !error && (
                <p className="text-center text-sm text-slate-500 py-8">Starting camera...</p>
              )}
              {error && (
                <div className="text-center py-8">
                  <p className="text-sm text-red-600 mb-3">{error}</p>
                  <p className="text-xs text-slate-500">Make sure camera permissions are granted and you're using HTTPS or localhost.</p>
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