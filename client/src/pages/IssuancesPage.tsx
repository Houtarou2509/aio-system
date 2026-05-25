import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { PermissionGate } from '../components/auth';
import {
  FileSignature, PlusCircle, Search, Loader2, X, ArrowRightLeft, RotateCcw,
  FileText, QrCode, CheckCircle2, Calendar, CheckCircle, PenLine, ShieldCheck,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import QRReturnScanner from '../components/issuances/QRReturnScanner';
import PDFPreviewModal from '../components/issuances/PDFPreviewModal';
import BulkIssuanceWizard from '../components/issuances/BulkIssuanceWizard';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

/* ─── Types ─── */
interface Issuance {
  id: string; assetId: string; personnelId: string | null; assignedTo: string | null; assignedAt: string; returnedAt: string | null;
  condition: string | null; conditionAtIssue?: string | null; conditionAtReturn?: string | null; returnRemarks?: string | null; accountabilityStatus?: string | null; accountabilityClosedAt?: string | null;
  notes: string | null; agreementText: string | null; agreementId: string | null; bulkBatchId: string | null;
  recipientSignedAt: string | null; recipientSignatureName: string | null;
  agreementDocument: { id: string; documentNumber: string; status: string; signedPdfPath: string | null; signedUploadedAt: string | null; title: string; resolvedText: string | null; propertyOfficerName: string | null; authorizedRepName: string | null } | null;
  asset: { id: string; name: string; serialNumber: string | null; propertyNumber: string | null; status: string } | null;
  personnel: { id: string; fullName: string; position: string | null; project: string | null; department: string | null; designation: string | null; designationLookup: { name: string } | null } | null;
}

const RETURN_CONDITION_OPTIONS = ['Good', 'Fair', 'Damaged', 'Lost'];

/* ─── Agreement Document Status Badge ─── */
function DocStatusBadge({ status }: { status: string | undefined | null }) {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === 'returned') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-2.5 w-2.5" /> Returned
      </span>
    );
  }
  if (s === 'pending_signature') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#f8931f]/10 px-2 py-0.5 text-[10px] font-bold text-[#f8931f] border border-[#f8931f]/30">
        Pending Sign-off
      </span>
    );
  }
  if (s === 'signed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 border border-sky-200">
        <PenLine className="h-2.5 w-2.5" /> Signed
      </span>
    );
  }
  // 'issued' or any other → Active (navy)
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#012061]/10 px-2 py-0.5 text-[10px] font-bold text-[#012061] border border-[#012061]/20">
      Active
    </span>
  );
}

/* ─── Verified Badge with Popover ─── */
function VerifiedBadge({ signedAt, signatoryName, documentNumber }: { signedAt: string; signatoryName: string | null; documentNumber: string }) {
  const [open, setOpen] = useState(false);
  const verifyUrl = `${window.location.origin}/api/agreements/verify/${documentNumber}`;
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
      >
        <ShieldCheck className="h-2.5 w-2.5" /> Verified
      </button>
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-72 rounded-lg border border-slate-200 bg-white shadow-xl p-3 text-xs text-slate-700">
          <div className="font-bold text-sm text-[#012061] mb-2 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> Signature Verified
          </div>
          <div className="space-y-1.5">
            <div><span className="text-slate-400">Signed at:</span> <span className="font-medium">{new Date(signedAt).toLocaleString()}</span></div>
            <div><span className="text-slate-400">Signatory:</span> <span className="font-medium">{signatoryName || '—'}</span></div>
            <div><span className="text-slate-400">Document:</span> <span className="font-mono font-medium">{documentNumber}</span></div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100">
            <a href={verifyUrl} target="_blank" rel="noopener noreferrer"
              className="text-emerald-700 hover:text-emerald-900 font-semibold underline underline-offset-2 break-all">
              Verify authenticity ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function ReturnDetailsFields({
  condition,
  note,
  error,
  onConditionChange,
  onNoteChange,
}: {
  condition: string;
  note: string;
  error?: string;
  onConditionChange: (value: string | null) => void;
  onNoteChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Return Condition <span className="text-[#7B1113]">*</span></label>
        <Select value={condition} onValueChange={onConditionChange}>
          <SelectTrigger className={`w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-[#f8931f] ${error ? 'border-[#7B1113] ring-1 ring-[#7B1113]/20' : ''}`}>
            <SelectValue placeholder="Select return condition" />
          </SelectTrigger>
          <SelectContent>
            {RETURN_CONDITION_OPTIONS.map(option => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="mt-1 text-xs font-semibold text-[#7B1113]">{error}</p>}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="block text-xs font-semibold text-slate-600">Return Note</label>
          <span className="text-[10px] text-slate-400">{note.length}/1000</span>
        </div>
        <Textarea
          value={note}
          onChange={e => onNoteChange(e.target.value.slice(0, 1000))}
          maxLength={1000}
          rows={4}
          placeholder="Optional note about the asset condition on return..."
          className="resize-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-[#f8931f]"
        />
      </div>
    </div>
  );
}

/* ─── Return Station ─── */
function ReturnStationModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: () => void }) {
  const [scanValue, setScanValue] = useState('');
  const [searchResults, setSearchResults] = useState<Issuance[]>([]);
  const [returning, setReturning] = useState(false);
  const [message, setMessage] = useState('');
  const [returnCondition, setReturnCondition] = useState('');
  const [returnNote, setReturnNote] = useState('');
  const [returnError, setReturnError] = useState('');

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
    if (!returnCondition) {
      setReturnError('Return condition is required.');
      return;
    }
    setReturning(true);
    try {
      await apiFetch(`/issuances/${id}/return`, {
        method: 'POST',
        body: { returnCondition, returnNote: returnNote.trim() || null },
      });
      setMessage('Asset returned successfully!');
      setSearchResults([]);
      setScanValue('');
      setReturnCondition('');
      setReturnNote('');
      setReturnError('');
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
          <ReturnDetailsFields
            condition={returnCondition}
            note={returnNote}
            error={returnError}
            onConditionChange={(value) => { setReturnCondition(value || ''); setReturnError(''); }}
            onNoteChange={setReturnNote}
          />
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
  const [page, setPage] = useState(1);
  const [showReturn, setShowReturn] = useState(false);
  const [showQRReturn, setShowQRReturn] = useState(false);
  const [showBulkWizard, setShowBulkWizard] = useState(false);
  const [signingTarget, setSigningTarget] = useState<Issuance | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signing, setSigning] = useState(false);
  const [returnTargets, setReturnTargets] = useState<Issuance[]>([]);
  const [returnCondition, setReturnCondition] = useState('');
  const [returnNote, setReturnNote] = useState('');
  const [returnError, setReturnError] = useState('');
  const [returnSubmitError, setReturnSubmitError] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  // Transfer modal state
  const [transferTarget, setTransferTarget] = useState<Issuance | null>(null);
  const [transferPersonnelList, setTransferPersonnelList] = useState<Array<{ id: string; fullName: string; designation: string | null; designationLookup: { name: string } | null; project: string | null; projectLookup: { name: string } | null; institution: { name: string } | null }>>([]);
  const [transferToPersonnelId, setTransferToPersonnelId] = useState('');
  const [transferCondition, setTransferCondition] = useState('Good');
  const [transferNote, setTransferNote] = useState('');
  const [transferTemplateId, setTransferTemplateId] = useState<string>('');
  const [transferTemplates, setTransferTemplates] = useState<Array<{ id: string; name: string; title: string }>>([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState('');

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const fetchIssuances = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('status', statusFilter);
      if (preFilterPersonnel) params.set('personnelId', preFilterPersonnel);
      params.set('page', String(page));
      params.set('limit', '50');
      const res = await apiFetch(`/issuances?${params}`);
      setIssuances(res.data || []);
      setMeta(res.meta);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchIssuances(); }, [search, statusFilter, preFilterPersonnel, page]);

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

  const openReturnModal = (items: Issuance[]) => {
    const activeItems = items.filter(item => !item.returnedAt);
    if (activeItems.length === 0) {
      showToast('No active issuances selected for return');
      return;
    }
    setReturnTargets(activeItems);
    setReturnCondition('');
    setReturnNote('');
    setReturnError('');
    setReturnSubmitError('');
  };

  const closeReturnModal = () => {
    if (returnSubmitting) return;
    setReturnTargets([]);
    setReturnCondition('');
    setReturnNote('');
    setReturnError('');
    setReturnSubmitError('');
  };

  const submitReturnModal = async () => {
    if (!returnCondition) {
      setReturnError('Return condition is required.');
      setReturnSubmitError('');
      return;
    }
    const activeTargets = returnTargets.filter(item => !item.returnedAt);
    if (activeTargets.length === 0) {
      setReturnSubmitError('No active issuances selected for return.');
      return;
    }
    setReturnSubmitting(true);
    setReturnSubmitError('');
    try {
      if (activeTargets.length === 1) {
        await apiFetch(`/issuances/${activeTargets[0].id}/return`, {
          method: 'POST',
          body: { returnCondition, returnNote: returnNote.trim() || null },
        });
      } else {
        await apiFetch('/issuances/bulk-return', {
          method: 'POST',
          body: {
            assignmentIds: activeTargets.map(item => item.id),
            returnCondition,
            returnNote: returnNote.trim() || null,
          },
        });
      }
      const returnedCount = activeTargets.length;
      setSelectedIds(new Set());
      setReturnTargets([]);
      setReturnCondition('');
      setReturnNote('');
      setReturnError('');
      setReturnSubmitError('');
      showToast(`${returnedCount} asset${returnedCount === 1 ? '' : 's'} returned successfully.`);
      fetchIssuances();
    } catch (e: any) {
      const message = e instanceof ApiError ? e.message : 'Return failed. Please try again.';
      setReturnSubmitError(message);
      showToast(message);
    } finally {
      setReturnSubmitting(false);
    }
  };

  const handleBulkReturn = () => {
    const selectedActiveItems = issuances.filter(iss => selectedIds.has(iss.id) && !iss.returnedAt);
    openReturnModal(selectedActiveItems);
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
  const [pdfSignedPdfPath, setPdfSignedPdfPath] = useState<string | null>(null);
  const [pdfSignedUploadedAt, setPdfSignedUploadedAt] = useState<string | null>(null);

  const toPublicFileUrl = (path?: string | null) => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return path.startsWith('/') ? path : `/${path}`;
  };

  const openAgreementPreview = useCallback(async (params: Record<string, any>) => {
    setPdfPreview({ blobUrl: null, loading: true, filename: 'agreement.pdf' });
    setPdfPersonnelId(params.personnelId || undefined);
    setPdfPersonnelName(params.personnelName || undefined);
    setPdfAgreementDocumentId(params.agreementDocumentId || undefined);
    setPdfSignedPdfPath(params.signedPdfPath || null);
    setPdfSignedUploadedAt(params.signedUploadedAt || null);
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
    setPdfSignedPdfPath(null);
    setPdfSignedUploadedAt(null);
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

  /* ─── Transfer modal logic ─── */
  const openTransferModal = useCallback(async (iss: Issuance) => {
    setTransferTarget(iss);
    setTransferToPersonnelId('');
    setTransferCondition(iss.condition || 'Good');
    setTransferNote('');
    setTransferTemplateId('');
    setTransferError('');
    setTransferLoading(true);
    try {
      const [personnelRes, templatesRes] = await Promise.all([
        apiFetch('/issuances/personnel/active'),
        apiFetch('/agreements/templates'),
      ]);
      setTransferPersonnelList(Array.isArray(personnelRes.data) ? personnelRes.data : []);
      setTransferTemplates(Array.isArray(templatesRes.data) ? templatesRes.data : []);
    } catch {
      setTransferPersonnelList([]);
      setTransferTemplates([]);
    } finally {
      setTransferLoading(false);
    }
  }, []);

  const closeTransferModal = useCallback(() => {
    setTransferTarget(null);
    setTransferToPersonnelId('');
    setTransferCondition('Good');
    setTransferNote('');
    setTransferTemplateId('');
    setTransferError('');
    setTransferSubmitting(false);
    setTransferLoading(false);
  }, []);

  const submitTransfer = useCallback(async () => {
    if (!transferTarget || !transferToPersonnelId) return;
    setTransferSubmitting(true);
    setTransferError('');
    try {
      const body: Record<string, any> = {
        toPersonnelId: transferToPersonnelId,
        condition: transferCondition,
      };
      if (transferNote.trim()) body.transferNote = transferNote.trim();
      if (transferTemplateId) body.agreementTemplateId = transferTemplateId;

      const res = await apiFetch(`/issuances/${transferTarget.id}/transfer`, {
        method: 'POST',
        body,
      });
      const recipientName = res.data?.newAssignment?.personnel?.fullName || res.data?.newAssignment?.assignedTo || 'new holder';
      showToast(`Asset transferred to ${recipientName} successfully.`);
      closeTransferModal();
      fetchIssuances();
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : 'Transfer failed. Please try again.';
      setTransferError(msg);
    } finally {
      setTransferSubmitting(false);
    }
  }, [transferTarget, transferToPersonnelId, transferCondition, transferNote, transferTemplateId, closeTransferModal]);

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
            <button onClick={() => setShowQRReturn(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors" title="Return assets using QR code">
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
      <section className="px-4 sm:px-6 pt-3 shrink-0">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {KPI_CARDS.map(({ key, label, icon: Icon, value }) => (
            <div key={key} className="flex flex-col items-center text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f8931f]/10">
                  <Icon className="h-4 w-4 text-[#f8931f]" />
                </div>
                <p className="text-lg sm:text-xl font-bold leading-tight text-[#f8931f]">{value}</p>
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
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-9 pr-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as any); setPage(1); }}
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
            <PermissionGate permissions={['issuances:return']}>
              <button onClick={handleBulkReturn}
                className="rounded-lg bg-[#012061] px-3 py-1 text-xs text-white hover:bg-[#012061]/90 disabled:opacity-50">
                Bulk Return
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
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-300px)] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#012061] text-left">
                  <th className="px-4 py-2.5 w-10 bg-[#012061]">
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
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase bg-[#012061]">Asset Details</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase bg-[#012061]">Assigned Personnel</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase bg-[#012061]">Issuance Date</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase bg-[#012061]">Return Status</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase bg-[#012061] text-center w-40">Actions</th>
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
                        {/* Return status */}
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

                        {/* Document status — separated */}
                        {(iss.recipientSignedAt || iss.agreementDocument?.status) && (
                          <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700/50 space-y-1">
                            {iss.recipientSignedAt && (
                              <div className="text-[10px] font-semibold text-[#012061] dark:text-slate-200">
                                Signed by {iss.recipientSignatureName || 'recipient'}
                              </div>
                            )}
                            {iss.agreementDocument?.signedPdfPath && (
                              <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" /> Signed PDF on file
                              </div>
                            )}
                            <DocStatusBadge status={iss.agreementDocument?.status} />
                            {iss.recipientSignedAt && iss.agreementDocument?.documentNumber && (
                              <VerifiedBadge
                                signedAt={iss.recipientSignedAt}
                                signatoryName={iss.recipientSignatureName}
                                documentNumber={iss.agreementDocument.documentNumber}
                              />
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {!iss.returnedAt && (
                            <PermissionGate permissions={['issuances:create']}>
                              <button
                                onClick={() => openTransferModal(iss)}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all group-hover:shadow-sm"
                                title="Transfer asset to another personnel"
                              >
                                <ArrowRightLeft className="w-4 h-4" />
                              </button>
                            </PermissionGate>
                          )}
                          // Return button visibility:
                          // 1. PermissionGate: user must have issuances:return
                          // 2. Row condition: returnedAt must be null (not yet returned)
                          // 3. ADMIN role always passes PermissionGate regardless of permission array
                          {!iss.returnedAt && (
                            <PermissionGate permissions={['issuances:return']}>
                              <button
                                onClick={() => openReturnModal([iss])}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all group-hover:shadow-sm"
                                title="Return this asset"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            </PermissionGate>
                          )}
                          {!iss.returnedAt && !iss.recipientSignedAt && (
                            <PermissionGate permissions={['issuances:edit']}>
                              <button
                                onClick={() => openSignModal(iss)}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all group-hover:shadow-sm"
                                title="Digital sign-off"
                              >
                                <PenLine className="w-4 h-4" />
                              </button>
                            </PermissionGate>
                          )}
                          {iss.agreementDocument?.signedPdfPath && (
                            <button
                              onClick={() => {
                                const url = toPublicFileUrl(iss.agreementDocument?.signedPdfPath);
                                if (url) window.open(url, '_blank', 'noopener,noreferrer');
                              }}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all group-hover:shadow-sm"
                              title="View signed agreement document"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          )}
                          {iss.agreementDocument || iss.agreementText ? (
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
                                signedPdfPath: iss.agreementDocument?.signedPdfPath || undefined,
                                signedUploadedAt: iss.agreementDocument?.signedUploadedAt || undefined,
                                personnelId: iss.personnelId || undefined,
                                recipientSignedAt: iss.recipientSignedAt || undefined,
                                recipientSignatureName: iss.recipientSignatureName || undefined,
                              })}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-[#012061] dark:hover:text-white transition-all group-hover:shadow-sm"
                              title="View agreement document"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          ) : (
                            <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-300 dark:text-slate-600 cursor-not-allowed" title="No agreement document available">
                              <FileText className="w-4 h-4" />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  }
                  // Batch row — multiple assets in one agreement
                  if (row.type !== 'batch') return null;
                  const batchItems = row.items;
                  const first = batchItems[0];
                  const batchAgreementDocument = batchItems.find((item: Issuance) => item.agreementDocument)?.agreementDocument || first.agreementDocument;
                  const allReturned = batchItems.every((i: Issuance) => i.returnedAt);
                  const anyReturned = batchItems.some((i: Issuance) => i.returnedAt);
                  const batchId = row.batchId;
                  const isExpanded = expandedBatches.has(batchId || '');
                  const toggleBatch = () => {
                    setExpandedBatches(prev => {
                      const next = new Set(prev);
                      if (next.has(batchId || '')) next.delete(batchId || '');
                      else next.add(batchId || '');
                      return next;
                    });
                  };
                  return (
                    <React.Fragment key={`batch-${batchId}`}>
                    <tr className={`bg-white dark:bg-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-all group ${isExpanded ? 'border-b-0' : ''}`}>
                      <td className="px-4 py-4 align-top pt-5">
                        <button
                          onClick={toggleBatch}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer transition-colors"
                          title={isExpanded ? 'Collapse issuance' : 'Expand issuance'}
                        >
                          {isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5 text-[#012061]" />
                            : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                          }
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          <button onClick={toggleBatch} className="text-left font-bold text-sm hover:text-[#f8931f] transition-colors" style={{ color: '#012061' }}>
                            {batchItems.length} Assets
                          </button>
                          <ul className="space-y-0.5">
                            {batchItems.map(bi => (
                              <li key={bi.id} className={`flex items-center gap-1.5 text-xs ${bi.returnedAt ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-400'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${bi.returnedAt ? 'bg-emerald-400' : 'bg-[#f8931f]/40'}`} />
                                {bi.returnedAt && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />}
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
                        {/* Return status */}
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

                        {/* Document status — separated */}
                        {(first.recipientSignedAt || batchAgreementDocument?.status) && (
                          <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700/50 space-y-1">
                            {first.recipientSignedAt && (
                              <div className="text-[10px] font-semibold text-[#012061] dark:text-slate-200">
                                Signed by {first.recipientSignatureName || 'recipient'}
                              </div>
                            )}
                            {batchAgreementDocument?.signedPdfPath && (
                              <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" /> Signed PDF on file
                              </div>
                            )}
                            <DocStatusBadge status={batchAgreementDocument?.status} />
                            {first.recipientSignedAt && batchAgreementDocument?.documentNumber && (
                              <VerifiedBadge
                                signedAt={first.recipientSignedAt}
                                signatoryName={first.recipientSignatureName}
                                documentNumber={batchAgreementDocument.documentNumber}
                              />
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center align-middle">
                        <div className="flex items-center justify-center gap-2 flex-nowrap">
                          {!allReturned && (
                            <PermissionGate permissions={['issuances:return']}>
                              <button
                                onClick={() => openReturnModal(batchItems.filter((item: Issuance) => !item.returnedAt))}
                                className="inline-flex items-center gap-1 rounded-md border border-[#012061]/30 bg-white h-8 px-2.5 text-[10px] font-semibold text-[#012061] whitespace-nowrap hover:border-[#f8931f] hover:text-[#f8931f] hover:shadow-sm transition-all"
                                title="Return all active assets in this batch"
                              >
                                <RotateCcw className="w-3 h-3 shrink-0" /> Return all
                              </button>
                            </PermissionGate>
                          )}
                          {!allReturned && !first.recipientSignedAt && (
                            <PermissionGate permissions={['issuances:edit']}>
                              <button
                                onClick={() => openSignModal(first)}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all group-hover:shadow-sm"
                                title="Digital sign-off for batch"
                              >
                                <PenLine className="w-4 h-4" />
                              </button>
                            </PermissionGate>
                          )}
                        {batchAgreementDocument?.signedPdfPath && (
                          <button
                            onClick={() => {
                              const url = toPublicFileUrl(batchAgreementDocument?.signedPdfPath);
                              if (url) window.open(url, '_blank', 'noopener,noreferrer');
                            }}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all group-hover:shadow-sm"
                            title="View signed agreement document"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        )}
                        {batchAgreementDocument || first.agreementText ? (
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
                            agreementText: batchAgreementDocument?.resolvedText || first.agreementText || undefined,
                            title: batchAgreementDocument?.title || undefined,
                            documentNumber: batchAgreementDocument?.documentNumber || undefined,
                            propertyOfficerName: batchAgreementDocument?.propertyOfficerName || undefined,
                            authorizedRepName: batchAgreementDocument?.authorizedRepName || undefined,
                            agreementDocumentId: batchAgreementDocument?.id || undefined,
                            signedPdfPath: batchAgreementDocument?.signedPdfPath || undefined,
                            signedUploadedAt: batchAgreementDocument?.signedUploadedAt || undefined,
                            personnelId: first.personnelId || undefined,
                            assets: batchItems.map(bi => ({
                              name: bi.asset?.name || '—',
                              serialNumber: bi.asset?.serialNumber || undefined,
                              propertyNumber: bi.asset?.propertyNumber || undefined,
                              condition: bi.condition || first.condition || undefined,
                            })),
                            recipientSignedAt: first.recipientSignedAt || undefined,
                            recipientSignatureName: first.recipientSignatureName || undefined,
                          })}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-[#012061] dark:hover:text-white transition-all group-hover:shadow-sm"
                          title="View agreement document"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        ) : (
                          <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-300 dark:text-slate-600 cursor-not-allowed" title="No agreement document available">
                            <FileText className="w-4 h-4" />
                          </span>
                        )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && batchItems.map((bi: Issuance) => (
                      <tr key={`batch-item-${bi.id}`} className="bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
                        <td className="px-4 py-2.5 text-center">
                          <span className="text-slate-300 dark:text-slate-500">↳</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${bi.returnedAt ? 'bg-emerald-400' : 'bg-[#f8931f]'}`} />
                            <div>
                              <p className={`text-xs font-semibold ${bi.returnedAt ? 'text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                {bi.returnedAt && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 inline mr-0.5" />}
                                {bi.asset?.name || '—'}
                              </p>
                              {bi.asset?.serialNumber && (
                                <p className="text-[10px] text-slate-400">S/N: {bi.asset.serialNumber}</p>
                              )}
                              {bi.asset?.propertyNumber && (
                                <p className="text-[10px] text-slate-400">P/N: {bi.asset.propertyNumber}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">—</td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">—</td>
                        <td className="px-4 py-2.5">
                              {bi.returnedAt ? (
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span className="text-[10px] font-semibold text-emerald-500">Returned</span>
                              {bi.conditionAtReturn && (
                                <span className="text-[9px] text-slate-400 ml-1">({bi.conditionAtReturn})</span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Active</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {!bi.returnedAt && (
                              <PermissionGate permissions={['issuances:create']}>
                                <button
                                  onClick={() => openTransferModal(bi)}
                                  className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all"
                                  title="Transfer asset to another personnel"
                                >
                                  <ArrowRightLeft className="w-3.5 h-3.5" />
                                </button>
                              </PermissionGate>
                            )}
                            {/* Per-item Return button: user must have issuances:return, item must be active */}
                            {!bi.returnedAt && (
                              <PermissionGate permissions={['issuances:return']}>
                                <button
                                  onClick={() => openReturnModal([bi])}
                                  className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all"
                                  title={`Return ${bi.asset?.name || 'this asset'}`}
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              </PermissionGate>
                            )}
                            {!bi.returnedAt && !bi.recipientSignedAt && (
                              <PermissionGate permissions={['issuances:edit']}>
                                <button
                                  onClick={() => openSignModal(bi)}
                                  className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all"
                                  title="Digital sign-off"
                                >
                                  <PenLine className="w-3.5 h-3.5" />
                                </button>
                              </PermissionGate>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    </React.Fragment>
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
            disabled={meta.page <= 1 || loading} onClick={() => setPage(Math.max(1, meta.page - 1))}>Prev</button>
          <span className="text-sm text-slate-500 dark:text-slate-400">Page {meta.page} of {meta.totalPages}</span>
          <button className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            disabled={meta.page >= meta.totalPages || loading} onClick={() => setPage(Math.min(meta.totalPages, meta.page + 1))}>Next</button>
        </div>
      )}

      {/* ═══ MODALS ════════════════════════════════════════ */}
      {showBulkWizard && <BulkIssuanceWizard onClose={() => setShowBulkWizard(false)} onSave={fetchIssuances} onPreviewPdf={openAgreementPreview} />}
      <ReturnStationModal open={showReturn} onClose={() => setShowReturn(false)} onSave={fetchIssuances} />
      <QRReturnScanner open={showQRReturn} onClose={() => setShowQRReturn(false)} onReturned={fetchIssuances} />
      <Dialog open={returnTargets.length > 0} onOpenChange={(open) => { if (!open) closeReturnModal(); }}>
        <DialogContent showCloseButton={false} className="max-w-lg overflow-hidden rounded-xl border-0 bg-white p-0 shadow-2xl dark:bg-slate-900">
          <div className="flex items-center justify-between px-5 py-4" style={{ background: '#012061' }}>
            <DialogHeader className="gap-0">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-[#f8931f]" />
                <DialogTitle className="text-sm font-bold text-white">
                  Return {returnTargets.length === 1 ? 'Asset' : 'All Assets'}
                </DialogTitle>
              </div>
              <DialogDescription className="sr-only">
                Confirm the active assets to return, choose a return condition, and optionally add a return note.
              </DialogDescription>
            </DialogHeader>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={closeReturnModal}
              disabled={returnSubmitting}
              className="text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="p-5 space-y-4">
            <div className="rounded-lg border border-[#012061]/10 bg-[#012061]/5 px-3 py-2">
              <p className="text-xs font-semibold text-[#012061]">
                {returnTargets.length === 1
                  ? `Returning ${returnTargets[0].asset?.name || 'selected asset'}`
                  : `Returning ${returnTargets.length} active assets in this batch`}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Choose the observed condition when the asset is received back. The note is optional.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/70">
              <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#012061] dark:text-slate-200">
                  Assets to be returned
                </p>
              </div>
              <ul className="max-h-48 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700">
                {returnTargets.map(target => (
                  <li key={target.id} className="flex items-start gap-2 px-3 py-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#f8931f] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {target.asset?.name || 'Unnamed asset'}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Serial No: {target.asset?.serialNumber || '—'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <ReturnDetailsFields
              condition={returnCondition}
              note={returnNote}
              error={returnError}
              onConditionChange={(value) => { setReturnCondition(value || ''); setReturnError(''); setReturnSubmitError(''); }}
              onNoteChange={setReturnNote}
            />
            {returnSubmitError && (
              <div className="rounded-lg border border-[#7B1113]/20 bg-[#7B1113]/5 px-3 py-2 text-xs font-semibold text-[#7B1113]">
                {returnSubmitError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeReturnModal}
                disabled={returnSubmitting}
                className="border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submitReturnModal}
                disabled={returnSubmitting}
                className="bg-[#f8931f] px-4 text-xs font-semibold text-white hover:bg-[#e0841a] disabled:opacity-50"
              >
                {returnSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm Return
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
      {/* ─── Transfer Modal ─── */}
      <Dialog open={!!transferTarget} onOpenChange={(open) => { if (!open) closeTransferModal(); }}>
        <DialogContent showCloseButton={false} className="max-w-lg overflow-hidden rounded-xl border-0 bg-white p-0 shadow-2xl dark:bg-slate-900">
          <div className="flex items-center justify-between px-5 py-4" style={{ background: '#012061' }}>
            <DialogHeader className="gap-0">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-[#f8931f]" />
                <DialogTitle className="text-sm font-bold text-white">
                  Transfer Asset
                </DialogTitle>
              </div>
              <DialogDescription className="sr-only">
                Transfer this asset to a different personnel. The asset will remain ASSIGNED with no gap.
              </DialogDescription>
            </DialogHeader>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={closeTransferModal}
              disabled={transferSubmitting}
              className="text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="p-5 space-y-4">
            {transferLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 text-[#f8931f] animate-spin" /></div>
            ) : (
              <>
                <div className="rounded-lg border border-[#012061]/10 bg-[#012061]/5 px-3 py-2">
                  <p className="text-xs font-semibold text-[#012061]">
                    Transferring: {transferTarget?.asset?.name || 'selected asset'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    From: {transferTarget?.personnel?.fullName || transferTarget?.assignedTo || '—'}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    The asset will remain ASSIGNED throughout — no AVAILABLE gap.
                  </p>
                </div>

                {/* Recipient selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Transfer To <span className="text-[#7B1113]">*</span>
                  </label>
                  <Select value={transferToPersonnelId} onValueChange={(v) => setTransferToPersonnelId(v ?? '')}>
                    <SelectTrigger className={`w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-[#f8931f] ${!transferToPersonnelId && transferError ? 'border-[#7B1113] ring-1 ring-[#7B1113]/20' : ''}`}>
                      <SelectValue placeholder="Select recipient..." />
                    </SelectTrigger>
                    <SelectContent>
                      {transferPersonnelList
                        .filter(p => p.id !== transferTarget?.personnelId)
                        .map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.fullName} — {p.designationLookup?.name || p.designation || 'No designation'}{p.projectLookup?.name ? ` · ${p.projectLookup.name}` : p.project ? ` · ${p.project}` : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {!transferToPersonnelId && transferError && (
                    <p className="mt-1 text-xs font-semibold text-[#7B1113]">Please select a recipient.</p>
                  )}
                </div>

                {/* Condition at transfer */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Condition at Transfer <span className="text-[#7B1113]">*</span>
                  </label>
                  <Select value={transferCondition} onValueChange={(v) => setTransferCondition(v ?? 'Good')}>
                    <SelectTrigger className="w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-[#f8931f]">
                      <SelectValue placeholder="Select condition" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Good">Good</SelectItem>
                      <SelectItem value="Fair">Fair</SelectItem>
                      <SelectItem value="Damaged">Damaged</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Transfer note */}
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-xs font-semibold text-slate-600">Transfer Note</label>
                    <span className="text-[10px] text-slate-400">{transferNote.length}/1000</span>
                  </div>
                  <Textarea
                    value={transferNote}
                    onChange={e => setTransferNote(e.target.value.slice(0, 1000))}
                    maxLength={1000}
                    rows={3}
                    placeholder="Optional reason or note for the transfer..."
                    className="resize-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-[#f8931f]"
                  />
                </div>

                {/* Agreement template (optional) */}
                {transferTemplates.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Generate New Agreement?
                    </label>
                    <Select value={transferTemplateId} onValueChange={(v) => setTransferTemplateId(v ?? '')}>
                      <SelectTrigger className="w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-[#f8931f]">
                        <SelectValue placeholder="Default template (auto-detect)" />
                      </SelectTrigger>
                      <SelectContent>
                        {transferTemplates.map(t => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name || t.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {transferError && (
                  <div className="rounded-lg border border-[#7B1113]/20 bg-[#7B1113]/5 px-3 py-2 text-xs font-semibold text-[#7B1113]">
                    {transferError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeTransferModal}
                    disabled={transferSubmitting}
                    className="border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={submitTransfer}
                    disabled={transferSubmitting || !transferToPersonnelId}
                    className="bg-[#012061] px-4 text-xs font-semibold text-white hover:bg-[#001a4d] disabled:opacity-50"
                  >
                    {transferSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
                    Confirm Transfer
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <PDFPreviewModal
        open={!!(pdfPreview.blobUrl || pdfPreview.loading)}
        onClose={closePdfPreview}
        blobUrl={pdfPreview.blobUrl}
        loading={pdfPreview.loading}
        downloadFilename={pdfPreview.filename}
        personnelId={pdfPersonnelId}
        personnelName={pdfPersonnelName}
        agreementDocumentId={pdfAgreementDocumentId}
        signedPdfPath={pdfSignedPdfPath}
        signedUploadedAt={pdfSignedUploadedAt}
        onSignedCopyUploaded={(document) => {
          setPdfSignedPdfPath(document?.signedPdfPath || null);
          setPdfSignedUploadedAt(document?.signedUploadedAt || null);
          fetchIssuances();
        }}
      />
      </div>{/* close content area */}
    </div>
  );
}
