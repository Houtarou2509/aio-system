import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function QRScannerModal({ open, onClose }: Props) {
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!open) return;

    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // Stop scanning on first successful scan
          scanner.stop().then(() => {
            setScanning(false);
            scanner.clear();

            // Extract token from URL — supports both full URLs and paths
            const match = decodedText.match(/guest\/([a-zA-Z0-9_-]+)/);
            if (match) {
              navigate(`/guest/${match[1]}`);
            } else {
              // If it's a raw token (no URL), navigate directly
              navigate(`/guest/${decodedText}`);
            }
            onClose();
          }).catch(() => {});
        },
        () => {} // ignore scan failures (no QR found in frame)
      )
      .then(() => setScanning(true))
      .catch((err) => {
        setError(typeof err === 'string' ? err : 'Camera access denied or unavailable');
      });

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
      }
    };
  }, [open, navigate, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card rounded-lg border border-border shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Scan QR Code</h3>
          <button
            onClick={() => {
              if (scannerRef.current) {
                scannerRef.current.stop().catch(() => {});
                scannerRef.current.clear();
              }
              setScanning(false);
              onClose();
            }}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
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
          {!scanning && !error && (
            <p className="text-center text-sm text-muted-foreground py-8">
              Starting camera...
            </p>
          )}
          {error && (
            <div className="text-center py-8">
              <p className="text-sm text-destructive mb-3">{error}</p>
              <p className="text-xs text-muted-foreground">
                Make sure camera permissions are granted and you're using HTTPS or localhost.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4">
          <p className="text-xs text-center text-muted-foreground">
            Point your camera at an asset QR code to view its details.
          </p>
        </div>
      </div>
    </div>
  );
}