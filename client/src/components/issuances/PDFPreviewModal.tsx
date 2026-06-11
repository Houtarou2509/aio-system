import { useRef, useEffect, useCallback, useState } from 'react';
import { X, Printer, Download, Loader2, FileText, CheckCircle2 } from 'lucide-react';
import { PermissionGate } from '../auth';

type RenderMode = 'preprinted' | 'fullDigital';

interface PDFPreviewModalProps {
  open: boolean;
  onClose: () => void;
  blobUrl: string | null;
  loading: boolean;
  downloadFilename?: string;
  personnelId?: string;
  personnelName?: string;
  agreementDocumentId?: string;
  signedPdfPath?: string | null;
  signedUploadedAt?: string | null;
  onSignedCopyUploaded?: (document: any) => void;
  /** Callback to regenerate the preview when the mode changes. */
  onRenderModeChange?: (mode: RenderMode) => void;
  /** Current render mode, defaults to 'preprinted'. */
  renderMode?: RenderMode;
}

function toPublicFileUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return path.startsWith('/') ? path : `/${path}`;
}

function downloadFile(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function PDFPreviewModal({
  open,
  onClose,
  blobUrl,
  loading,
  downloadFilename,
  personnelId,
  personnelName,
  agreementDocumentId,
  signedPdfPath,
  signedUploadedAt,
  onSignedCopyUploaded,
  onRenderModeChange,
  renderMode: renderModeProp = 'preprinted',
}: PDFPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadError, setUploadError] = useState('');
  const [currentSignedPdfPath, setCurrentSignedPdfPath] = useState<string | null>(signedPdfPath || null);
  const [currentSignedUploadedAt, setCurrentSignedUploadedAt] = useState<string | null>(signedUploadedAt || null);
  const [localRenderMode, setLocalRenderMode] = useState<RenderMode>(renderModeProp);

  // Sync render mode from parent
  useEffect(() => {
    setLocalRenderMode(renderModeProp);
  }, [renderModeProp]);

  useEffect(() => {
    setCurrentSignedPdfPath(signedPdfPath || null);
    setCurrentSignedUploadedAt(signedUploadedAt || null);
    setUploadPhase('idle');
    setUploadError('');
  }, [signedPdfPath, signedUploadedAt, agreementDocumentId]);

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

  const signedCopyUrl = toPublicFileUrl(currentSignedPdfPath);
  const canUploadSignedCopy = Boolean(agreementDocumentId || personnelId);
  const isDocumentLevel = Boolean(agreementDocumentId);

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  };

  const handleDownload = () => {
    if (!blobUrl) return;
    downloadFile(blobUrl, downloadFilename || 'agreement.pdf');
  };

  const handleUploadSigned = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canUploadSignedCopy) return;
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
      const uploadUrl = agreementDocumentId
        ? `/api/agreements/documents/${agreementDocumentId}/signed-copy`
        : `/api/personnel/${personnelId}/signed-agreement`;
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Upload failed');
      const document = data.data;
      if (document?.signedPdfPath) setCurrentSignedPdfPath(document.signedPdfPath);
      if (document?.signedUploadedAt) setCurrentSignedUploadedAt(document.signedUploadedAt);
      setUploadPhase('done');
      onSignedCopyUploaded?.(document);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
      setUploadPhase('error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-6xl mx-4 flex flex-col relative"
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
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap">
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

          {/* Render mode selector */}
          {onRenderModeChange && (
            <div className="inline-flex rounded-lg shadow overflow-hidden bg-white dark:bg-slate-800/80">
              <button
                onClick={() => {
                  setLocalRenderMode('preprinted');
                  onRenderModeChange('preprinted');
                }}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  localRenderMode === 'preprinted'
                    ? 'bg-[#012061] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
                title="Preprinted letterhead — content only, for printing on pre-printed A4 paper"
              >
                Preprinted
              </button>
              <button
                onClick={() => {
                  setLocalRenderMode('fullDigital');
                  onRenderModeChange('fullDigital');
                }}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors border-l border-slate-200 dark:border-slate-600 ${
                  localRenderMode === 'fullDigital'
                    ? 'bg-[#012061] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
                title="Full digital PDF — includes letterhead background for sharing or printing on blank paper"
              >
                Full Digital
              </button>
            </div>
          )}
        </div>

        {/* Document-level signed copy manager */}
        {canUploadSignedCopy && (
          <div className="absolute top-12 left-3 z-10 w-72 rounded-xl border border-white/20 bg-white/95 dark:bg-slate-900/95 shadow-xl backdrop-blur p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#012061] dark:text-white">
                  {isDocumentLevel ? 'Document Signed Copy' : 'Profile Signed Copy'}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                  {personnelName ? `For ${personnelName}` : 'Upload a scanned signed PDF'}
                </p>
              </div>
              {signedCopyUrl ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> On file
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  Missing
                </span>
              )}
            </div>

            {signedCopyUrl ? (
              <div className="mt-3 space-y-2">
                {currentSignedUploadedAt && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Uploaded {new Date(currentSignedUploadedAt).toLocaleString()}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => window.open(signedCopyUrl, '_blank', 'noopener,noreferrer')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#012061] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#001a4d]"
                  >
                    <FileText className="h-3.5 w-3.5" /> View
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadFile(signedCopyUrl, `signed-${downloadFilename || 'agreement.pdf'}`)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                No scanned signed PDF is attached to this {isDocumentLevel ? 'agreement document' : 'profile'} yet.
              </p>
            )}

            <PermissionGate permissions={['issuances:edit']}>
              <div className="mt-3">
                {uploadPhase === 'done' ? (
                  <div className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Signed copy saved
                  </div>
                ) : uploadPhase === 'error' ? (
                  <div className="flex flex-col gap-2">
                    <div className="rounded-lg bg-red-500 px-3 py-2 text-xs font-medium text-white">
                      {uploadError}
                    </div>
                    <button onClick={() => setUploadPhase('idle')}
                      className="rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#f8931f] hover:bg-[#f8931f]/10">
                      Try again
                    </button>
                  </div>
                ) : (
                  <label className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                    uploadPhase === 'uploading'
                      ? 'bg-slate-500 text-white'
                      : signedCopyUrl
                        ? 'bg-[#f8931f] text-white hover:bg-[#e0841a]'
                        : 'bg-[#012061] text-white hover:bg-[#001a4d]'
                  }`}>
                    {uploadPhase === 'uploading' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : signedCopyUrl ? (
                      <FileText className="w-3.5 h-3.5" />
                    ) : (
                      <FileText className="w-3.5 h-3.5" />
                    )}
                    {uploadPhase === 'uploading' ? 'Uploading...' : signedCopyUrl ? 'Replace Signed Copy' : 'Upload Signed Copy'}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={handleUploadSigned}
                      className="hidden"
                      disabled={uploadPhase === 'uploading'}
                    />
                  </label>
                )}
              </div>
            </PermissionGate>
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
