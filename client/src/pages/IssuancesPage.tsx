import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { PermissionGate } from '../components/auth';
import {
  FileSignature, PlusCircle, Search, Loader2, X, ArrowRightLeft, RotateCcw,
  Package, FileText, QrCode, CheckCircle2, Calendar, CheckCircle, PenLine,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import QRReturnScanner from '../components/issuances/QRReturnScanner';
import PDFPreviewModal from '../components/issuances/PDFPreviewModal';
import BulkIssuanceWizard from '../components/issuances/BulkIssuanceWizard';

/* ─── Types ─── */
interface Issuance {
  id: string; assetId: string; personnelId: string | null; assignedTo: string | null; assignedAt: string; returnedAt: string | null;
  condition: string | null; notes: string | null; agreementText: string | null; agreementId: string | null; bulkBatchId: string | null;
  recipientSignedAt: string | null; recipientSignatureName: string | null;
  agreementDocument: { id: string; documentNumber: string; status: string; signedPdfPath: string | null; title: string; resolvedText: string | null; propertyOfficerName: string | null; authorizedRepName: string | null } | null;
  asset: { id: string; name: string; serialNumber: string | null; propertyNumber: string | null; status: string } | null;
  personnel: { id: string; fullName: string; position: string | null; project: string | null; department: string | null; designation: string | null; designationLookup: { name: string } | null } | null;
}

/* ─── Return Station ─── */
function ReturnStationModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: () => void }) {
  const [scanValue, setScanValue] = useState('');
  const [searchResults, setSearchResults] = useState<Issuance[]>([]);
  const [returning, setReturning] = useState(false);
  const [message, setMessage] = useState('');

  if (!open) return null;

  const handleSearch = async () => {
    if (!scanValue.trim()) return;
    try {
      const res = await apiFetch(`/issuances?search=${encodeURIComponent(scanValue)}&status=active&limit=10`);
      setSearchResults(res.data || []);
      setMessage('');
    } catch { setSearchResults([]); }
  };

  const handleReturn = async (id: string) => {
    setReturning(true);
    try {
      await apiFetch(`/issuances/${id}/return`, { method: 'POST', body: { condition: 'Good' } });
      setMessage('Asset returned successfully!');
      setSearchResults([]);
      setScanValue('');
      onSave();
    } catch (e: any) { setMessage(e instanceof ApiError ? e.message : 'An unexpected error occurred'); } finally { setReturning(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b rounded-t-xl" style={{ background: '#012061' }}>
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[#f8931f]" />
            <h2 className="text-sm font-bold text-white">Return Station</h2>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500">Scan QR code or enter asset name/serial/property # to find active issuances.</p>
          <div className="flex gap-2">
            <input value={scanValue} onChange={e => setScanValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Scan or type..."
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent"
              autoFocus />
            <button onClick={handleSearch} className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#012061] text-white hover:bg-[#001a4d]">Find</button>
          </div>
          {message && (
            <div className={`text-xs px-3 py-2 rounded-lg ${message.includes('success') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {message.includes('success') && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />}
              {message}
            </div>
          )}
          {searchResults.length > 0 && (
            <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
              {searchResults.map(iss => (
                <div key={iss.id} className="px-3 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#012061' }}>{iss.asset?.name || '—'}</p>
                    <p className="text-[10px] text-slate-500">
                      S/N: {iss.asset?.serialNumber || '—'} • Issued to: {iss.personnel?.fullName || iss.assignedTo || '—'} • {new Date(iss.assignedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button onClick={() => handleReturn(iss.id)} disabled={returning}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold border-2 border-[#f8931f] text-[#f8931f] hover:bg-[#f8931f] hover:text-white transition-colors disabled:opacity-50">
                    <RotateCcw className="w-3 h-3" /> Return
                  </button>
                </div>
              ))}
            </div>
          )}
          {searchResults.length === 0 && scanValue && !message && (
            <p className="text-xs text-slate-400 text-center">No active issuances found</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Empty State ─── */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#f8931f]/10 mb-4">
        <FileSignature className="h-10 w-10 text-[#f8931f]" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">No issuances yet</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-xs">
        Issue an asset to personnel to start tracking accountability.
      </p>
      <PermissionGate permissions={['issuances:create']}>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-[#f8931f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors"
        >
          <PlusCircle className="h-4 w-4" /> New Issuance
        </button>
      </PermissionGate>
    </div>
  );
}

/* ─── Main Page ─── */
export default function IssuancesPage() {
  const [issuances, setIssuances] = useState<Issuance[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const preFilterPersonnel = searchParams.get('personnel');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'returned'>(preFilterPersonnel ? 'active' : 'all');
  const [showReturn, setShowReturn] = useState(false);
  const [showQRReturn, setShowQRReturn] = useState(false);
  const [showBulkWizard, setShowBulkWizard] = useState(false);
  const [signingTarget, setSigningTarget] = useState<Issuance | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signing, setSigning] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkReturning, setBulkReturning] = useState(false);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const fetchIssuances = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('status', statusFilter);
      if (preFilterPersonnel) params.set('personnelId', preFilterPersonnel);
      params.set('limit', '50');
      const res = await apiFetch(`/issuances?${params}`);
      setIssuances(res.data || []);
      setMeta(res.meta);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchIssuances(); }, [search, statusFilter]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const activeCount = issuances.filter(i => !i.returnedAt).length;
  const returnedCount = issuances.filter(i => i.returnedAt).length;
  const returnedThisMonth = issuances.filter(i => {
    if (!i.returnedAt) return false;
    const d = new Date(i.returnedAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === issuances.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(issuances.map(i => i.id)));
  }, [selectedIds.size, issuances]);

  const deselectAll = () => setSelectedIds(new Set());

  // Group issuances: batch records appear as single rows, unbatched as individual
  type GroupRow = { type: 'batch'; batchId: string; items: Issuance[] } | { type: 'single'; item: Issuance };
  const groupedIssuances: GroupRow[] = useMemo(() => {
    const batches: Record<string, Issuance[]> = {};
    const singles: Issuance[] = [];
    for (const iss of issuances) {
      if (iss.bulkBatchId) {
        if (!batches[iss.bulkBatchId]) batches[iss.bulkBatchId] = [];
        batches[iss.bulkBatchId].push(iss);
      } else {
        singles.push(iss);
      }
    }
    const result: GroupRow[] = [];
    for (const [, items] of Object.entries(batches)) {
      result.push({ type: 'batch', batchId: items[0].bulkBatchId!, items });
    }
    for (const item of singles) {
      result.push({ type: 'single', item });
    }
    // Sort by assignedAt desc (most recent first)
    result.sort((a, b) => {
      const aDate = a.type === 'batch' ? a.items[0].assignedAt : a.item.assignedAt;
      const bDate = b.type === 'batch' ? b.items[0].assignedAt : b.item.assignedAt;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
    return result;
  }, [issuances]);

  const handleBulkReturn = async () => {
    setBulkReturning(true);
    let succeeded = 0;
    let failed = 0;
    for (const id of selectedIds) {
      try {
        await apiFetch(`/issuances/${id}/return`, { method: 'POST', body: { condition: 'Good' } });
        succeeded++;
      } catch { failed++; }
    }
    setBulkReturning(false);
    setSelectedIds(new Set());
    showToast(`${succeeded} returned${failed > 0 ? `, ${failed} failed` : ''}`);
    fetchIssuances();
  };

  const KPI_CARDS = [
    { key: 'activeCount', label: 'ACTIVE ISSUANCES', icon: ArrowRightLeft, value: activeCount },
    { key: 'returnedCount', label: 'TOTAL RETURNED', icon: CheckCircle, value: returnedCount },
    { key: 'returnedThisMonth', label: 'RETURNED THIS MONTH', icon: Calendar, value: returnedThisMonth },
  ];

  const [pdfPreview, setPdfPreview] = useState<{ blobUrl: string | null; loading: boolean; filename: string }>({ blobUrl: null, loading: false, filename: 'agreement.pdf' });
  const [pdfPersonnelId, setPdfPersonnelId] = useState<string | undefined>(undefined);
  const [pdfPersonnelName, setPdfPersonnelName] = useState<string | undefined>(undefined);
  const [pdfAgreementDocumentId, setPdfAgreementDocumentId] = useState<string | undefined>(undefined);

  const openAgreementPreview = useCallback(async (params: Record<string, any>) => {
    setPdfPreview({ blobUrl: null, loading: true, filename: 'agreement.pdf' });
    setPdfPersonnelId(params.personnelId || undefined);
    setPdfPersonnelName(params.personnelName || undefined);
    setPdfAgreementDocumentId(params.agreementDocumentId || undefined);
    try {
      const token = localStorage.getItem('accessToken');
      let res = await fetch('/api/agreements/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/pdf',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(params),
      });
      if (res.status === 401) {
        const rt = localStorage.getItem('refreshToken');
        if (rt) {
          const refreshRes = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rt }),
          });
          const refreshData = await refreshRes.json();
          if (refreshData.success) {
            localStorage.setItem('accessToken', refreshData.data.accessToken);
            localStorage.setItem('refreshToken', refreshData.data.refreshToken);
            res = await fetch('/api/agreements/pdf', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/pdf',
                Authorization: `Bearer ${refreshData.data.accessToken}`,
              },
              body: JSON.stringify(params),
            });
          }
        }
      }
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const typedBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
      const url = URL.createObjectURL(typedBlob);
      const pName = params.personnelName || 'unknown';
      setPdfPreview({ blobUrl: url, loading: false, filename: `agreement-${pName.replace(/\s+/g, '-').toLowerCase()}.pdf` });
    } catch (e: any) {
      setPdfPreview({ blobUrl: null, loading: false, filename: 'agreement.pdf' });
      alert(e instanceof ApiError ? e.message : 'Failed to generate agreement preview');
    }
  }, []);

  const closePdfPreview = useCallback(() => {
    setPdfPreview({ blobUrl: null, loading: false, filename: 'agreement.pdf' });
    setPdfPersonnelId(undefined);
    setPdfPersonnelName(undefined);
    setPdfAgreementDocumentId(undefined);
  }, []);

  const openSignModal = (iss: Issuance) => {
    setSigningTarget(iss);
    setSignerName(iss.personnel?.fullName || iss.assignedTo || '');
  };

  const submitSignOff = async () => {
    if (!signingTarget || !signerName.trim()) return;
    setSigning(true);
    try {
      await apiFetch(`/issuances/${signingTarget.id}/sign`, { method: 'POST', body: { signerName: signerName.trim() } });
      showToast(signingTarget.bulkBatchId ? 'Batch digitally signed' : 'Issuance digitally signed');
      setSigningTarget(null);
      setSignerName('');
      fetchIssuances();
    } catch (e: any) {
      showToast(e instanceof ApiError ? e.message : 'Sign-off failed');
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="flex flex-col h-screen pt-14 md:pt-0 bg-[#012061] md:bg-transparent">

      {/* ═══ STICKY NAVY HEADER ═════════════════════════════ */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Title */}
          <div className="flex items-center gap-3">
            <FileSignature className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">Issuances</h1>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowQRReturn(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors">
              <QrCode className="h-3.5 w-3.5" /> QR Return
            </button>
            <PermissionGate permissions={['issuances:create']}>
              <button onClick={() => setShowBulkWizard(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#f8931f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors">
                <PlusCircle className="h-3.5 w-3.5" /> New Issuance
              </button>
            </PermissionGate>
          </div>
        </div>
      </header>

      {/* ═══ CONTENT AREA ════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-auto bg-light-bg dark:bg-slate-900">

      {/* ═══ KPI TILES ═══════════════════════════════════════ */}
      <section className="px-4 sm:px-6 pt-4 shrink-0">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {KPI_CARDS.map(({ key, label, icon: Icon, value }) => (
            <div key={key} className="flex flex-col items-center text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 sm:p-4">
              <div className="flex items-center justify-center gap-2 mb-1.5 sm:mb-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f8931f]/10">
                  <Icon className="h-5 w-5 text-[#f8931f]" />
                </div>
                <p className="text-xl sm:text-2xl font-bold leading-tight text-[#f8931f]">{value}</p>
              </div>
              <p className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pre-filter banner */}
      {preFilterPersonnel && (
        <div className="shrink-0 px-6 py-2 bg-[#f8931f]/10 border-b border-[#f8931f]/20 flex items-center justify-between">
          <span className="text-xs font-semibold text-[#f8931f]">Filtered by profile — showing only this person's active issuances</span>
          <a href="/issuances" className="text-xs font-semibold text-[#012061] hover:underline">Clear filter</a>
        </div>
      )}

      {/* ═══ HORIZONTAL FILTER BAR ══════════════════════════ */}
      <section className="px-6 pt-3 pb-2 shrink-0">
        <div className="flex flex-row items-center gap-4 flex-wrap bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search asset, serial, personnel..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-9 pr-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 h-8 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
          >
            <option value="all">Status: All</option>
            <option value="active">Status: Active</option>
            <option value="returned">Status: Returned</option>
          </select>
        </div>
      </section>

      {/* ═══ BULK ACTION TOOLBAR ════════════════════════════ */}
      {selectedIds.size > 0 && (
        <div className="shrink-0 px-6 py-2 bg-[#012061]/5 dark:bg-slate-700/40 border-b border-[#012061]/10 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#012061] dark:text-slate-100">
            ☑ {selectedIds.size} issuance{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <PermissionGate permissions={['issuances:create']}>
              <button onClick={handleBulkReturn} disabled={bulkReturning}
                className="rounded-lg bg-[#012061] px-3 py-1 text-xs text-white hover:bg-[#012061]/90 disabled:opacity-50">
                {bulkReturning ? 'Returning...' : 'Bulk Return'}
              </button>
            </PermissionGate>
            <button onClick={deselectAll}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="shrink-0 px-6 py-2 bg-[#f8931f]/10 border-b border-[#f8931f]/20 text-sm text-[#012061] dark:text-slate-100 text-center font-medium">
          {toast}
        </div>
      )}

      {/* ═══ TABLE or EMPTY STATE ═══════════════════════════ */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 text-slate-400 animate-spin" /></div>
        ) : issuances.length === 0 ? (
          <EmptyState onAdd={() => setShowBulkWizard(true)} />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#012061] text-left">
                  <th className="px-4 py-2.5 w-10">
                    <span
                      onClick={toggleSelectAll}
                      className={`inline-flex items-center justify-center w-4 h-4 rounded border cursor-pointer ${
                        selectedIds.size > 0 && selectedIds.size < issuances.length ? 'bg-[#f8931f]/20 border-[#f8931f]' :
                        selectedIds.size === issuances.length && issuances.length > 0 ? 'bg-[#f8931f] border-[#f8931f]' :
                        'border-white/30'
                      }`}
                    >
                      {selectedIds.size === issuances.length && issuances.length > 0 && (
                        <CheckCircle className="w-3 h-3 text-white" />
                      )}
                      {selectedIds.size > 0 && selectedIds.size < issuances.length && (
                        <div className="w-2 h-0.5 rounded-full bg-[#f8931f]" />
                      )}
                    </span>
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Asset Details</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Assigned Personnel</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Issuance Date</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Return Status</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase text-center w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {groupedIssuances.map(row => {
                  if (row.type === 'single') {
                    const iss = row.item;
                    return (
                      <tr key={iss.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-all group">
                        <td className="px-4 py-4">
                          <span
                            onClick={() => toggleSelect(iss.id)}
                            className={`inline-flex items-center justify-center w-4 h-4 rounded border cursor-pointer ${
                              selectedIds.has(iss.id) ? 'bg-[#012061] border-[#012061]' : 'border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {selectedIds.has(iss.id) && <CheckCircle className="w-3 h-3 text-white" />}
                          </span>
                        </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <p className="font-bold text-sm" style={{ color: '#012061' }}>{iss.asset?.name || '—'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-tight">S/N:</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">{iss.asset?.serialNumber || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">{iss.personnel?.fullName || iss.assignedTo || '—'}</p>
                          {iss.personnel && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 italic mt-0.5">
                              {iss.personnel.designationLookup?.name || iss.personnel.designation || 'No designation'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs font-medium text-slate-600 dark:text-slate-400 tabular-nums">
                        {new Date(iss.assignedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-4">
                        {iss.returnedAt ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              Returned {new Date(iss.returnedAt).toLocaleDateString()}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Active</span>
                          </div>
                        )}
                        {iss.recipientSignedAt && (
                          <div className="mt-1 text-[10px] font-semibold text-[#012061] dark:text-slate-200">
                            Signed by {iss.recipientSignatureName || 'recipient'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {!iss.returnedAt && (
                            <PermissionGate permissions={['issuances:edit']}>
                              <button
                                onClick={async () => {
                                  try {
                                    await apiFetch(`/issuances/${iss.id}/return`, { method: 'POST', body: { condition: 'Good' } });
                                    showToast('Asset returned successfully');
                                    fetchIssuances();
                                  } catch (e: any) { showToast(e instanceof ApiError ? e.message : 'Return failed'); }
                                }}
                                className="p-2 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all group-hover:shadow-sm"
                                title="Return Asset"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            </PermissionGate>
                          )}
                          {!iss.returnedAt && !iss.recipientSignedAt && (
                            <PermissionGate permissions={['issuances:edit']}>
                              <button
                                onClick={() => openSignModal(iss)}
                                className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all group-hover:shadow-sm"
                                title="Digital Sign-off"
                              >
                                <PenLine className="w-4 h-4" />
                              </button>
                            </PermissionGate>
                          )}
                          <button
                            onClick={() => openAgreementPreview({
                              personnelName: iss.personnel?.fullName,
                              position: iss.personnel?.position || undefined,
                              department: iss.personnel?.department || undefined,
                              project: iss.personnel?.project || undefined,
                              assetName: iss.asset?.name,
                              serialNumber: iss.asset?.serialNumber || undefined,
                              propertyNumber: iss.asset?.propertyNumber || undefined,
                              condition: iss.condition,
                              templateId: iss.agreementId || undefined,
                              agreementText: iss.agreementDocument?.resolvedText || iss.agreementText || undefined,
                              title: iss.agreementDocument?.title || undefined,
                              documentNumber: iss.agreementDocument?.documentNumber || undefined,
                              propertyOfficerName: iss.agreementDocument?.propertyOfficerName || undefined,
                              authorizedRepName: iss.agreementDocument?.authorizedRepName || undefined,
                              agreementDocumentId: iss.agreementDocument?.id || undefined,
                              personnelId: iss.personnelId || undefined,
                              recipientSignedAt: iss.recipientSignedAt || undefined,
                              recipientSignatureName: iss.recipientSignatureName || undefined,
                            })}
                            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-[#012061] dark:hover:text-white transition-all group-hover:shadow-sm"
                            title="View Agreement"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  }
                  // Batch row — multiple assets in one agreement
                  if (row.type !== 'batch') return null;
                  const batchItems = row.items;
                  const first = batchItems[0];
                  const allReturned = batchItems.every((i: Issuance) => i.returnedAt);
                  const anyReturned = batchItems.some((i: Issuance) => i.returnedAt);
                  const batchId = row.batchId;
                  return (
                    <tr key={`batch-${batchId}`} className="bg-white dark:bg-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-all group">
                      <td className="px-4 py-4 align-top pt-5">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded border border-slate-300 dark:border-slate-600 cursor-pointer"
                          title="Bulk batch — select individual assets to return">
                          <Package className="w-2.5 h-2.5 text-slate-300" />
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          <p className="font-bold text-sm" style={{ color: '#012061' }}>
                            {batchItems.length} Assets
                          </p>
                          <ul className="space-y-0.5">
                            {batchItems.map(bi => (
                              <li key={bi.id} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#f8931f]/40 shrink-0" />
                                {bi.asset?.name || '—'}
                                {bi.asset?.serialNumber && <span className="text-slate-400">· {bi.asset.serialNumber}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top pt-5">
                        <div className="flex flex-col">
                          <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">{first.personnel?.fullName || first.assignedTo || '—'}</p>
                          {first.personnel && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 italic mt-0.5">
                              {first.personnel.designationLookup?.name || first.personnel.designation || 'No designation'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs font-medium text-slate-600 dark:text-slate-400 tabular-nums align-top pt-5">
                        {new Date(first.assignedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-4 align-top pt-5">
                        {allReturned ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              All returned
                            </span>
                          </div>
                        ) : anyReturned ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                {batchItems.filter(i => i.returnedAt).length}/{batchItems.length} returned
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Active</span>
                          </div>
                        )}
                        {first.recipientSignedAt && (
                          <div className="mt-1 text-[10px] font-semibold text-[#012061] dark:text-slate-200">
                            Signed by {first.recipientSignatureName || 'recipient'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center align-top pt-5">
                        <div className="flex items-center justify-center gap-1.5">
                          {!allReturned && !first.recipientSignedAt && (
                            <PermissionGate permissions={['issuances:edit']}>
                              <button
                                onClick={() => openSignModal(first)}
                                className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all group-hover:shadow-sm"
                                title="Digital Sign-off Batch"
                              >
                                <PenLine className="w-4 h-4" />
                              </button>
                            </PermissionGate>
                          )}
                        <button
                          onClick={() => openAgreementPreview({
                            personnelName: first.personnel?.fullName,
                            position: first.personnel?.position || undefined,
                            department: first.personnel?.department || undefined,
                            project: first.personnel?.project || undefined,
                            assetName: `${batchItems.length} assets`,
                            serialNumber: undefined,
                            propertyNumber: undefined,
                            condition: first.condition,
                            templateId: first.agreementId || undefined,
                            agreementText: first.agreementDocument?.resolvedText || first.agreementText || undefined,
                            title: first.agreementDocument?.title || undefined,
                            documentNumber: first.agreementDocument?.documentNumber || undefined,
                            propertyOfficerName: first.agreementDocument?.propertyOfficerName || undefined,
                            authorizedRepName: first.agreementDocument?.authorizedRepName || undefined,
                            agreementDocumentId: first.agreementDocument?.id || undefined,
                            personnelId: first.personnelId || undefined,
                            assets: batchItems.map(bi => ({
                              name: bi.asset?.name || '—',
                              serialNumber: bi.asset?.serialNumber || undefined,
                              propertyNumber: bi.asset?.propertyNumber || undefined,
                            })),
                            recipientSignedAt: first.recipientSignedAt || undefined,
                            recipientSignatureName: first.recipientSignatureName || undefined,
                          })}
                          className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-[#012061] dark:hover:text-white transition-all group-hover:shadow-sm"
                          title="View Agreement"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ═══ PAGINATION ════════════════════════════════════ */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 border-t border-slate-200 dark:border-slate-700 px-6 py-2 shrink-0 bg-white dark:bg-slate-800">
          <button className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            disabled={meta.page <= 1} onClick={() => {
              // TODO: page navigation if supported by API
            }}>Prev</button>
          <span className="text-sm text-slate-500 dark:text-slate-400">Page {meta.page} of {meta.totalPages}</span>
          <button className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            disabled={meta.page >= meta.totalPages} onClick={() => {
              // TODO: page navigation if supported by API
            }}>Next</button>
        </div>
      )}

      {/* ═══ MODALS ════════════════════════════════════════ */}
      {showBulkWizard && <BulkIssuanceWizard onClose={() => setShowBulkWizard(false)} onSave={fetchIssuances} onPreviewPdf={openAgreementPreview} />}
      <ReturnStationModal open={showReturn} onClose={() => setShowReturn(false)} onSave={fetchIssuances} />
      <QRReturnScanner open={showQRReturn} onClose={() => setShowQRReturn(false)} onReturned={fetchIssuances} />
      {signingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSigningTarget(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b rounded-t-xl" style={{ background: '#012061' }}>
              <div className="flex items-center gap-2">
                <PenLine className="w-5 h-5 text-[#f8931f]" />
                <h2 className="text-sm font-bold text-white">Digital Recipient Sign-off</h2>
              </div>
              <button onClick={() => setSigningTarget(null)} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">Typed sign-off records the recipient acknowledgement timestamp and signer name. For a batch, all active assignments in the batch are signed together.</p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Signer Name</label>
                <input value={signerName} onChange={e => setSignerName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" autoFocus />
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-500">
                Asset: <span className="font-semibold text-[#012061]">{signingTarget.asset?.name || (signingTarget.bulkBatchId ? 'Batch issuance' : '—')}</span>
              </div>
              <button onClick={submitSignOff} disabled={signing || !signerName.trim()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#012061] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#001a4d] disabled:opacity-50">
                {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                Confirm Digital Sign-off
              </button>
            </div>
          </div>
        </div>
      )}
      <PDFPreviewModal open={!!(pdfPreview.blobUrl || pdfPreview.loading)} onClose={closePdfPreview} blobUrl={pdfPreview.blobUrl} loading={pdfPreview.loading} downloadFilename={pdfPreview.filename} personnelId={pdfPersonnelId} personnelName={pdfPersonnelName} agreementDocumentId={pdfAgreementDocumentId} />
      </div>{/* close content area */}
    </div>
  );
}
