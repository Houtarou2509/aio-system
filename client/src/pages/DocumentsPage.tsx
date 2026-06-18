import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FileArchive, Search, Download, ExternalLink, FileText, Loader2, X, Upload, Calendar, SlidersHorizontal } from 'lucide-react';
import { documentsApi, type DocumentArchiveItem, type DocumentFilters } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const DOCUMENT_TYPES: { value: DocumentArchiveItem['documentType']; label: string }[] = [
  { value: 'ACCOUNTABILITY_FORM', label: 'Accountability Form' },
  { value: 'SIGNED_AGREEMENT', label: 'Signed Agreement' },
  { value: 'RETURN_FORM', label: 'Return Form' },
  { value: 'PURCHASE_DOCUMENT', label: 'Purchase Document' },
  { value: 'DISPOSAL_DOCUMENT', label: 'Disposal Document' },
];

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUPERSEDED', label: 'Superseded' },
  { value: 'VOID', label: 'Void' },
];

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function typeLabel(type: string): string {
  return DOCUMENT_TYPES.find(t => t.value === type)?.label || type;
}

function typeBadge(type: string) {
  return (
    <span className="inline-block rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-slate-600 dark:text-slate-300">
      {typeLabel(type)}
    </span>
  );
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    ACTIVE: { bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-200', border: 'border-emerald-200' },
    SUPERSEDED: { bg: 'bg-slate-50 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300', border: 'border-slate-200' },
    VOID: { bg: 'bg-red-50 dark:bg-red-950', text: 'text-red-700 dark:text-red-300', border: 'border-red-200' },
  };
  const s = map[status] || map.ACTIVE;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide border ${s.bg} ${s.text} ${s.border}`}>
      {status}
    </span>
  );
}

function getLinkedLabel(doc: DocumentArchiveItem): string {
  if (doc.asset) return `Asset: ${doc.asset.name}`;
  if (doc.personnel) return `Personnel: ${doc.personnel.fullName}`;
  if (doc.purchaseRequest) return `Purchase: ${doc.purchaseRequest.assetName}`;
  if (doc.assignment) return `Issuance: ${doc.assignment.assignedTo || doc.assignment.id.slice(0, 8)}`;
  return doc.sourceEntityType ? `${doc.sourceEntityType} ${doc.sourceEntityId?.slice(0, 8) || ''}` : '—';
}

function getLinkedRoute(doc: DocumentArchiveItem): string | null {
  if (doc.assetId) return `/assets?id=${doc.assetId}`;
  if (doc.personnelId) return `/profiles?id=${doc.personnelId}`;
  if (doc.purchaseRequestId) return `/purchase-requests?id=${doc.purchaseRequestId}`;
  if (doc.assignmentId) return `/issuances?id=${doc.assignmentId}`;
  return null;
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const canUpload = user?.role === 'ADMIN' || user?.role === 'STAFF_ADMIN' || (user?.permissions || []).includes('documents:upload');

  const [items, setItems] = useState<DocumentArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<DocumentFilters>({ page: 1, limit: 20 });
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number; totalPages: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const fetchDocuments = useCallback(async (f: DocumentFilters) => {
    setLoading(true);
    try {
      const res = await documentsApi.list(f);
      setItems(res.data ?? []);
      setMeta(res.meta);
    } catch (err: any) {
      console.error('[Documents] fetch failed:', err);
      showToast(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments(filters);
  }, [filters, fetchDocuments]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const updateFilter = <K extends keyof DocumentFilters>(key: K, value: DocumentFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({ page: 1, limit: 20 });
  };

  const handleDownload = async (id: string, fileName?: string) => {
    try {
      const blob = await documentsApi.download(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || `document-${id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      showToast(err.message || 'Download failed');
    }
  };

  const hasFilters = filters.search || filters.documentType || filters.status || filters.dateFrom || filters.dateTo || filters.assetId || filters.personnelId || filters.purchaseRequestId || filters.assignmentId;
  const activeFilterCount = [filters.search, filters.documentType, filters.status, filters.dateFrom, filters.dateTo, filters.assetId, filters.personnelId, filters.purchaseRequestId, filters.assignmentId].filter(Boolean).length;

  return (
    <div className="flex flex-col h-screen pt-14 md:pt-0 bg-[#012061] md:bg-transparent">
      {/* Header */}
      <header className="sticky top-[56px] md:top-0 z-30 shrink-0 bg-[#012061] px-4 sm:px-6 py-3 sm:py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileArchive className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">Documents</h1>
          </div>
          {canUpload && (
            <button
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#f8931f] px-3 sm:px-4 py-2 text-xs font-bold text-white hover:bg-[#e0841a] shadow-sm transition-colors shrink-0"
            >
              <Upload className="h-3.5 w-3.5" /> Upload
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-auto bg-light-bg dark:bg-slate-900">
        <section className="px-4 sm:px-6 pt-4 pb-6 space-y-4">
          {/* Mobile: search + filter toggle */}
          <div className="md:hidden flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search documents..."
                value={filters.search || ''}
                onChange={e => updateFilter('search', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:border-[#f8931f] focus:outline-none"
              />
            </div>
            <button
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors shrink-0 ${
                showMobileFilters || activeFilterCount > 0
                  ? 'border-[#f8931f] bg-[#f8931f]/10 text-[#f8931f]'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 h-4 min-w-[16px] rounded-full bg-[#f8931f] text-[10px] font-bold text-white flex items-center justify-center px-1">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Mobile: expanded filter panel */}
          {showMobileFilters && (
            <div className="md:hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 space-y-2.5">
              <select
                value={filters.documentType || ''}
                onChange={e => updateFilter('documentType', e.target.value as any)}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-2 text-xs text-slate-700 dark:text-slate-300 h-9 focus:border-[#f8931f] focus:outline-none"
              >
                <option value="">Type: All</option>
                {DOCUMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select
                value={filters.status || ''}
                onChange={e => updateFilter('status', e.target.value as any)}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-2 text-xs text-slate-700 dark:text-slate-300 h-9 focus:border-[#f8931f] focus:outline-none"
              >
                <option value="">Status: All</option>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <input
                  type="date"
                  value={filters.dateFrom || ''}
                  onChange={e => updateFilter('dateFrom', e.target.value)}
                  className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-2 text-[10px] text-slate-700 dark:text-slate-300 h-9 focus:border-[#f8931f] focus:outline-none"
                />
                <span className="text-slate-400 text-[10px]">-</span>
                <input
                  type="date"
                  value={filters.dateTo || ''}
                  onChange={e => updateFilter('dateTo', e.target.value)}
                  className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-2 text-[10px] text-slate-700 dark:text-slate-300 h-9 focus:border-[#f8931f] focus:outline-none"
                />
              </div>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="w-full inline-flex items-center justify-center gap-1 text-xs font-semibold text-[#012061] dark:text-slate-100 hover:underline py-1"
                >
                  <X className="h-3 w-3" /> Clear filters
                </button>
              )}
            </div>
          )}

          {/* Desktop: inline filter bar */}
          <div className="hidden md:flex md:flex-row items-center gap-3 flex-wrap rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search document number, title, asset, personnel..."
                value={filters.search || ''}
                onChange={e => updateFilter('search', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:border-[#f8931f] focus:outline-none"
              />
            </div>
            <select
              value={filters.documentType || ''}
              onChange={e => updateFilter('documentType', e.target.value as any)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:border-[#f8931f] focus:outline-none"
            >
              <option value="">All Types</option>
              {DOCUMENT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <select
              value={filters.status || ''}
              onChange={e => updateFilter('status', e.target.value as any)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:border-[#f8931f] focus:outline-none"
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              <input
                type="date"
                value={filters.dateFrom || ''}
                onChange={e => updateFilter('dateFrom', e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:border-[#f8931f] focus:outline-none"
              />
              <span className="text-slate-400">→</span>
              <input
                type="date"
                value={filters.dateTo || ''}
                onChange={e => updateFilter('dateTo', e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:border-[#f8931f] focus:outline-none"
              />
            </div>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="h-3 w-3" /> Clear filters
              </button>
            )}
          </div>

          {/* Mobile: card list */}
          <div className="md:hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            {loading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#f8931f]" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400">
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-8 w-8 text-slate-300" />
                  <p className="text-sm font-semibold">No documents found</p>
                  <p className="text-xs">Upload or generate documents to populate the archive.</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {items.map(doc => {
                  const linkedLabel = getLinkedLabel(doc);
                  const linkedRoute = getLinkedRoute(doc);
                  return (
                    <div key={doc.id} className="p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 break-words">{doc.documentNumber}</p>
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 break-words leading-snug">{doc.title}</p>
                        </div>
                        <div className="shrink-0">{typeBadge(doc.documentType)}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        {linkedRoute ? (
                          <Link to={linkedRoute} className="inline-flex items-center gap-1 text-[#012061] dark:text-slate-300 hover:underline break-words">
                            {linkedLabel}
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </Link>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400 break-words">{linkedLabel}</span>
                        )}
                        <span className="text-slate-300 dark:text-slate-600">|</span>
                        <span className="text-slate-500 dark:text-slate-400">{formatDate(doc.createdAt)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        {statusBadge(doc.status)}
                        {doc.filePath && (
                          <button
                            onClick={() => handleDownload(doc.id, `${doc.documentNumber}.pdf`)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-[#012061] dark:text-slate-300 hover:bg-[#012061]/5 dark:hover:bg-slate-700/40 transition-colors"
                            title="Download PDF"
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#012061]">
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase">Number</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase">Type</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase">Title</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase">Linked Record</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase">Date</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase">Status</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold tracking-widest text-white/70 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center">
                        <div className="flex justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-[#f8931f]" />
                        </div>
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500 dark:text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <FileText className="h-8 w-8 text-slate-300" />
                          <p className="text-sm font-semibold">No documents found</p>
                          <p className="text-xs">Upload or generate documents to populate the archive.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    items.map(doc => {
                      const linkedLabel = getLinkedLabel(doc);
                      const linkedRoute = getLinkedRoute(doc);
                      return (
                        <tr key={doc.id} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <td className="px-3 py-2.5 font-mono text-xs text-slate-700 dark:text-slate-300">{doc.documentNumber}</td>
                          <td className="px-3 py-2.5">{typeBadge(doc.documentType)}</td>
                          <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200 font-medium">{doc.title}</td>
                          <td className="px-3 py-2.5">
                            {linkedRoute ? (
                              <Link to={linkedRoute} className="inline-flex items-center gap-1 text-xs text-[#012061] dark:text-slate-300 hover:underline">
                                {linkedLabel}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            ) : (
                              <span className="text-xs text-slate-500 dark:text-slate-400">{linkedLabel}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{formatDate(doc.createdAt)}</td>
                          <td className="px-3 py-2.5">{statusBadge(doc.status)}</td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {doc.filePath && (
                                <button
                                  onClick={() => handleDownload(doc.id, `${doc.documentNumber}.pdf`)}
                                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-[#012061] dark:text-slate-300 hover:bg-[#012061]/5 dark:hover:bg-slate-700/40 transition-colors"
                                  title="Download PDF"
                                >
                                  <Download className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing {((meta.page - 1) * meta.limit) + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilters(p => ({ ...p, page: Math.max(1, (p.page || 1) - 1) }))}
                  disabled={meta.page <= 1}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">Page {meta.page} of {meta.totalPages}</span>
                <button
                  onClick={() => setFilters(p => ({ ...p, page: Math.min(meta.totalPages, (p.page || 1) + 1) }))}
                  disabled={meta.page >= meta.totalPages}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-[#012061] px-4 py-2.5 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onUploaded={() => { fetchDocuments(filters); setUploadOpen(false); showToast('Document uploaded'); }} />}
    </div>
  );
}

function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [documentType, setDocumentType] = useState<DocumentArchiveItem['documentType']>('ACCOUNTABILITY_FORM');
  const [sourceEntityType, setSourceEntityType] = useState('');
  const [sourceEntityId, setSourceEntityId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);
      formData.append('title', title || file.name.replace(/\.pdf$/i, ''));
      if (documentNumber.trim()) formData.append('documentNumber', documentNumber.trim());
      if (sourceEntityType) formData.append('sourceEntityType', sourceEntityType);
      if (sourceEntityId) formData.append('sourceEntityId', sourceEntityId);
      await documentsApi.upload(formData);
      onUploaded();
    } catch (err: any) {
      alert(err.message || 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Upload Document</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">PDF File</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={e => setFile(e.target.files?.[0] || null)}
              required
              className="block w-full text-sm text-slate-700 dark:text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-[#012061] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Type</label>
              <select
                value={documentType}
                onChange={e => setDocumentType(e.target.value as any)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
              >
                {DOCUMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Document Number (optional)</label>
              <input
                type="text"
                value={documentNumber}
                onChange={e => setDocumentNumber(e.target.value)}
                placeholder="Auto-generated if blank"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Source Type (optional)</label>
              <input
                type="text"
                value={sourceEntityType}
                onChange={e => setSourceEntityType(e.target.value)}
                placeholder="e.g. AgreementDocument"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Source ID (optional)</label>
              <input
                type="text"
                value={sourceEntityId}
                onChange={e => setSourceEntityId(e.target.value)}
                placeholder="UUID"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button
              type="submit"
              disabled={submitting || !file}
              className="px-4 py-2 rounded-lg bg-[#012061] text-xs font-bold text-white hover:bg-[#012061]/90 disabled:opacity-50"
            >
              {submitting ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
