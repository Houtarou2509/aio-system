import { useState, useEffect } from 'react';
import { X, FileText, Download, ExternalLink, Loader2, ShieldCheck, AlertCircle, Link2, Check } from 'lucide-react';
import { apiFetch, ApiError } from '../../lib/api';

/* ─── Types ─── */

interface AgreementDocumentDetails {
  id: string;
  documentNumber: string;
  title: string;
  status: string;
  issuedAt: string;
  personnelNameSnapshot: string;
  designationSnapshot?: string | null;
  projectSnapshot?: string | null;
  institutionSnapshot?: string | null;
  assetSnapshot: any;
  propertyOfficerName?: string | null;
  authorizedRepName?: string | null;
  recipientSignedAt?: string | null;
  recipientSignatureName?: string | null;
  signedPdfPath?: string | null;
  signedUploadedAt?: string | null;
  templateVersion?: number | null;
  personnelId?: string | null;
  assignments: Array<{
    id: string;
    assignedAt: string;
    returnedAt?: string | null;
    condition?: string | null;
    asset: { id: string; name: string; serialNumber?: string; propertyNumber?: string } | null;
  }>;
}

/* ─── Helpers ─── */

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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

/* ─── Parsed asset snapshot ─── */

interface AssetEntry {
  name?: string;
  serialNumber?: string;
  propertyNumber?: string;
  [key: string]: any;
}

function parseAssetSnapshot(snapshot: any): AssetEntry[] {
  if (Array.isArray(snapshot)) return snapshot;
  if (snapshot && typeof snapshot === 'object') {
    // Might be wrapped: { assets: [...] } or { items: [...] }
    if (Array.isArray(snapshot.assets)) return snapshot.assets;
    if (Array.isArray(snapshot.items)) return snapshot.items;
    // Single object → wrap in array
    return [snapshot];
  }
  return [];
}

/* ─── Component ─── */

interface AgreementDocumentDetailModalProps {
  open: boolean;
  documentNumber: string | null;
  onClose: () => void;
}

export default function AgreementDocumentDetailModal({
  open,
  documentNumber,
  onClose,
}: AgreementDocumentDetailModalProps) {
  const [details, setDetails] = useState<AgreementDocumentDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedLink, setCopiedLink] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (!open || !documentNumber) {
      setDetails(null);
      setError('');
      setCopiedLink('idle');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    apiFetch(`/agreements/document/${encodeURIComponent(documentNumber)}`)
      .then((res) => {
        if (cancelled) return;
        setDetails(res.data);
      })
      .catch((err: any) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError('No agreement found for this number.');
        } else {
          setError(err.message || 'Failed to load document details.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, documentNumber]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const signedPdfUrl = toPublicFileUrl(details?.signedPdfPath);

  const assets = details ? parseAssetSnapshot(details.assetSnapshot) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 flex flex-col relative max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#012061]/10">
              <FileText className="h-5 w-5 text-[#012061]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[#012061] leading-tight">Agreement Document</h2>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                {documentNumber || '—'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-slate-400" />
                <p className="text-sm text-slate-500">Loading document details...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <AlertCircle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
                <p className="text-sm text-slate-700 font-medium">{error}</p>
              </div>
            </div>
          ) : details ? (
            <>
              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <DetailField label="Agreement No." value={details.documentNumber} mono />
                <DetailField label="Status" value={details.status} badge />
                <DetailField label="Personnel" value={details.personnelNameSnapshot} />
                <DetailField label="Designation" value={details.designationSnapshot} />
                <DetailField label="Project" value={details.projectSnapshot} />
                <DetailField label="Institution" value={details.institutionSnapshot} />
                <DetailField label="Issue Date" value={formatDate(details.issuedAt)} />
                <DetailField label="Template Version" value={details.templateVersion ? `v${details.templateVersion}` : null} />
                <DetailField label="Property Officer" value={details.propertyOfficerName} />
                <DetailField label="Authorized Rep." value={details.authorizedRepName} />
              </div>

              {/* Signature info */}
              {details.recipientSignedAt && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-800">Signed</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Signatory:</span>{' '}
                      <span className="font-medium text-slate-800">{details.recipientSignatureName || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Signed at:</span>{' '}
                      <span className="font-medium text-slate-800">{formatDateTime(details.recipientSignedAt)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Assets covered */}
              <div>
                <h3 className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">
                  Assets Covered ({assets.length > 0 ? assets.length : details.assignments.length})
                </h3>
                {(assets.length > 0 ? assets : details.assignments.map(a => a.asset)).filter(Boolean).length > 0 ? (
                  <div className="space-y-1.5">
                    {(assets.length > 0 ? assets : details.assignments.map(a => a.asset && { name: a.asset.name, serialNumber: a.asset.serialNumber, propertyNumber: a.asset.propertyNumber })).filter(Boolean).map((asset: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-slate-800">{asset.name || '—'}</span>
                          {asset.serialNumber && (
                            <span className="ml-2 text-slate-500 font-mono">SN: {asset.serialNumber}</span>
                          )}
                          {asset.propertyNumber && (
                            <span className="ml-2 text-slate-500 font-mono">PN: {asset.propertyNumber}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No assets linked.</p>
                )}
              </div>

              {/* Signed PDF section */}
              <div className="rounded-lg border border-slate-200 p-3">
                <h3 className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">Signed PDF</h3>
                {signedPdfUrl ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span className="font-medium">Signed copy on file</span>
                      {details.signedUploadedAt && (
                        <span className="text-slate-400">— uploaded {formatDateTime(details.signedUploadedAt)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => window.open(signedPdfUrl, '_blank', 'noopener,noreferrer')}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#012061] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#001a4d] transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> View PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadFile(signedPdfUrl, `signed-${details.documentNumber}.pdf`)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Signed PDF not available yet.</span>
                  </div>
                )}
              </div>

              {/* Verification link — copy to clipboard */}
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const url = `${window.location.origin}/aio-system/agreements/verify/${details.documentNumber}`;
                      try {
                        await navigator.clipboard.writeText(url);
                        setCopiedLink('copied');
                      } catch {
                        setCopiedLink('failed');
                      }
                      setTimeout(() => setCopiedLink('idle'), 2500);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      copiedLink === 'copied'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : copiedLink === 'failed'
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-[#012061] text-white hover:bg-[#001a4d]'
                    }`}
                  >
                    {copiedLink === 'copied' ? (
                      <><Check className="h-3.5 w-3.5" /> Verification link copied</>
                    ) : copiedLink === 'failed' ? (
                      <><AlertCircle className="h-3.5 w-3.5" /> Could not copy verification link</>
                    ) : (
                      <><Link2 className="h-3.5 w-3.5" /> Copy verification link</>
                    )}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                  This public link can be shared with auditors to verify the document signature.
                </p>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function DetailField({ label, value, mono, badge }: { label: string; value: string | null | undefined; mono?: boolean; badge?: boolean }) {
  if (!value) {
    return (
      <div>
        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-slate-400 mt-0.5">—</p>
      </div>
    );
  }

  if (badge) {
    const colorClass =
      value.toLowerCase() === 'issued' ? 'bg-blue-50 text-blue-700 border-blue-200' :
      value.toLowerCase() === 'signed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
      value.toLowerCase() === 'voided' ? 'bg-red-50 text-red-700 border-red-200' :
      'bg-slate-50 text-slate-700 border-slate-200';

    return (
      <div>
        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{label}</p>
        <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold border ${colorClass}`}>
          {value}
        </span>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-sm text-slate-800 mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}