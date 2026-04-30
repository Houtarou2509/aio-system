import { useRef, useEffect, useCallback, useState } from 'react';
import { X, Printer, Download, Loader2 } from 'lucide-react';

interface PDFPreviewModalProps {
  open: boolean;
  onClose: () => void;
  blobUrl: string | null;
  loading: boolean;
  downloadFilename?: string;
}

export default function PDFPreviewModal({ open, onClose, blobUrl, loading, downloadFilename }: PDFPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeKey, setIframeKey] = useState(0);

  // Force iframe reload when blobUrl changes or modal opens
  useEffect(() => {
    if (open && blobUrl) {
      setIframeKey(k => k + 1);
    }
  }, [open, blobUrl]);

  // Cleanup blob URL on unmount and close
  const cleanup = useCallback(() => {
    if (blobUrl) {
      // Brief delay to let iframe detach before revoking
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    }
  }, [blobUrl]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const handleClose = () => {
    cleanup();
    onClose();
  };

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  if (!open) return null;

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  };

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = downloadFilename || 'agreement.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-4 flex flex-col"
        style={{ height: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0 rounded-t-xl" style={{ background: '#012061' }}>
          <h2 className="text-sm font-bold text-white">Agreement Preview</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={!blobUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 transition-colors disabled:opacity-40"
              title="Print"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button
              onClick={handleDownload}
              disabled={!blobUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 transition-colors disabled:opacity-40"
              title="Download"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button onClick={handleClose} className="text-white/70 hover:text-white ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 bg-slate-100">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-slate-400" />
                <p className="text-sm text-slate-500">Generating agreement...</p>
              </div>
            </div>
          ) : blobUrl ? (
            <iframe
              ref={iframeRef}
              key={iframeKey}
              src={blobUrl ? `${blobUrl}#toolbar=0` : ''}
              className="w-full h-full border-0"
              title="Agreement PDF Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-slate-400">Failed to generate preview</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
