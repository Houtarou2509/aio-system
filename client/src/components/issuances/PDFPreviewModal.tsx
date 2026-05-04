import { useRef, useEffect, useCallback, useState } from 'react';
import { X, Printer, Download, Loader2, FileText, CheckCircle2 } from 'lucide-react';

interface PDFPreviewModalProps {
  open: boolean;
  onClose: () => void;
  blobUrl: string | null;
  loading: boolean;
  downloadFilename?: string;
  personnelId?: string;
  personnelName?: string;
}

export default function PDFPreviewModal({ open, onClose, blobUrl, loading, downloadFilename, personnelId, personnelName }: PDFPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadError, setUploadError] = useState('');

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

  const handleUploadSigned = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !personnelId) return;
    if (file.type !== 'application/pdf') {
      setUploadError('Please upload a PDF file only.');
      setUploadPhase('error');
      return;
    }
    setUploadPhase('uploading');
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/personnel/${personnelId}/signed-agreement`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Upload failed');
      setUploadPhase('done');
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
      setUploadPhase('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-5xl mx-4 flex flex-col relative"
        style={{ height: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close button — floating top-right */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white dark:bg-slate-800/80 hover:bg-white shadow flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        </button>

        {/* Action buttons — floating top-left */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <button
            onClick={handlePrint}
            disabled={!blobUrl}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-slate-800/80 hover:bg-white shadow px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-40"
            title="Print"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <button
            onClick={handleDownload}
            disabled={!blobUrl}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-slate-800/80 hover:bg-white shadow px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-40"
            title="Download"
          >
            <Download className="w-3.5 h-3.5" /> Download
          </button>
        </div>

        {/* Upload Signed Copy — shown when personnelId is provided */}
        {personnelId && (
          <div className="absolute top-12 left-3 z-10 flex flex-col gap-2">
            {uploadPhase === 'done' ? (
              <div className="rounded-lg bg-emerald-500 shadow px-3 py-2 text-xs font-semibold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Signed copy uploaded
              </div>
            ) : uploadPhase === 'error' ? (
              <div className="flex flex-col gap-1">
                <div className="rounded-lg bg-red-500 shadow px-3 py-2 text-xs font-medium text-white">
                  {uploadError}
                </div>
                <button onClick={() => setUploadPhase('idle')}
                  className="rounded-lg bg-white shadow px-3 py-1.5 text-xs font-semibold text-[#f8931f] hover:bg-[#f8931f]/10">
                  Try again
                </button>
              </div>
            ) : (
              <label className={`inline-flex items-center gap-1.5 rounded-lg shadow px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                uploadPhase === 'uploading'
                  ? 'bg-slate-500 text-white'
                  : 'bg-[#012061] text-white hover:bg-[#001a4d]'
              }`}>
                {uploadPhase === 'uploading' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <FileText className="w-3 h-3" />
                )}
                {uploadPhase === 'uploading' ? 'Uploading...' : 'Upload Signed Copy'}
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleUploadSigned}
                  className="hidden"
                  disabled={uploadPhase === 'uploading'}
                />
              </label>
            )}
            {personnelName && (
              <span className="text-[10px] text-white/80 bg-white/10 rounded px-2 py-0.5 backdrop-blur">
                For: {personnelName}
              </span>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 bg-slate-100 dark:bg-slate-800">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-slate-400" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Generating agreement...</p>
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
