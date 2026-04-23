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

  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!open) return;

    let isCancelled = false;
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (isCancelled) return;
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
      .then(() => {
        if (!isCancelled) setScanning(true);
      })
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
  }, [open, navigate, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-lg border border-gray-200 shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Scan QR Code</h3>
          <button
            onClick={() => {
              if (isClosing) return;
              setIsClosing(true);
              if (scannerRef.current) {
                scannerRef.current.stop()
                  .then(() => {
                    scannerRef.current?.clear();
                  })
                  .catch(() => {
                    scannerRef.current?.clear();
                  })
                  .finally(() => {
                    scannerRef.current = null;
                    setScanning(false);
                    onClose();
                  });
              } else {
                setScanning(false);
                onClose();
              }
            }}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Scanner area */}
        <div className="p-4">
          <div
            id="qr-reader"
            className="w-full rounded-md overflow-hidden bg-gray-100"
            style={{ minHeight: scanning ? '250px' : '0' }}
          />
          {!scanning && !error && (
            <p className="text-center text-sm text-gray-500 py-8">
              Starting camera...
            </p>
          )}
          {error && (
            <div className="text-center py-8">
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <p className="text-xs text-gray-500">
                Make sure camera permissions are granted and you're using HTTPS or localhost.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4">
          <p className="text-xs text-center text-gray-500">
            Point your camera at an asset QR code to view its details.
          </p>
        </div>
      </div>
    </div>
  );
}
