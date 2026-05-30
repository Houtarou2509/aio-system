import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLookupOptions } from '../hooks/useLookupOptions';
import { ShoppingCart, PlusCircle, CheckCircle, XCircle, Loader2, PackagePlus, Link as LinkIcon } from 'lucide-react';
import { NewRequestModal } from '../components/purchase/NewRequestModal';
import { ResponsiveTable } from '../components/ui/ResponsiveTable';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/* ── Types ── */
interface PurchaseRequest {
  id: string;
  assetName: string;
  type: string;
  reason: string;
  status: string;
  notes: string | null;
  requestedById: string;
  approvedById: string | null;
  approvedAt: string | null;
  convertedToAssetId: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requestedBy?: { id: string; username: string; email?: string };
  approvedBy?: { id: string; username: string; email?: string } | null;
}

interface Supplier {
  id: string;
  name: string;
}

/* ── Status Badge ── */
function StatusBadge({ status, convertedToAssetId }: { status: string; convertedToAssetId?: string | null }) {
  if (convertedToAssetId || status === 'fulfilled') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200 border border-emerald-200">
        <CheckCircle className="w-3 h-3" /> Converted
      </span>
    );
  }
  switch (status) {
    case 'PENDING':
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-200 border border-amber-200">
          Pending
        </span>
      );
    case 'APPROVED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200 border border-emerald-200">
          <CheckCircle className="w-3 h-3" /> Approved
        </span>
      );
    case 'REJECTED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-200 border border-red-200">
          <XCircle className="w-3 h-3" /> Rejected
        </span>
      );
    default:
      return (
        <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          {status}
        </span>
      );
  }
}

/* ── Truncate text helper ── */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

/* ── Convert to Asset Dialog ── */
function ConvertDialog({
  request,
  onClose,
  onSuccess,
}: {
  request: PurchaseRequest;
  onClose: () => void;
  onSuccess: (assetId: string) => void;
}) {
  const { accessToken } = useAuth();
  const { options: locationOptions } = useLookupOptions('locations');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [form, setForm] = useState({
    propertyNumber: '',
    serialNumber: '',
    location: '',
    supplierId: '',
    purchaseDate: '',
    purchasePrice: '',
    warrantyExpiry: '',
    warrantyNotes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = accessToken || localStorage.getItem('accessToken');
    fetch('/api/suppliers', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setSuppliers(d.data); })
      .catch(() => {});
  }, [accessToken]);

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.propertyNumber.trim() || !form.serialNumber.trim()) {
      setError('Property Number and Serial Number are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = accessToken || localStorage.getItem('accessToken');
      const body: Record<string, unknown> = {
        propertyNumber: form.propertyNumber,
        serialNumber: form.serialNumber,
      };
      if (form.location) body.location = form.location;
      if (form.supplierId) body.supplierId = form.supplierId;
      if (form.purchaseDate) body.purchaseDate = form.purchaseDate;
      if (form.purchasePrice) body.purchasePrice = Number(form.purchasePrice);
      if (form.warrantyExpiry) body.warrantyExpiry = form.warrantyExpiry;
      if (form.warrantyNotes) body.warrantyNotes = form.warrantyNotes;

      const res = await fetch(`/api/purchase-requests/${request.id}/convert-to-asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Conversion failed');
      }
      onSuccess(data.data.asset.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#f8931f] focus:border-transparent transition";
  const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 block";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#012061]">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f8931f] text-white shrink-0">
              <PackagePlus className="w-4 h-4" />
            </div>
            Convert to Asset
          </DialogTitle>
          <DialogDescription>
            Convert this approved purchase request into an inventory asset.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Read-only fields */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 space-y-3">
            <div>
              <span className={labelClass}>Asset Name</span>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{request.assetName}</p>
            </div>
            <div>
              <span className={labelClass}>Type</span>
              <p className="text-xs bg-slate-100 dark:bg-slate-700 inline-block px-2 py-0.5 rounded">{request.type}</p>
            </div>
          </div>

          {/* Editable fields */}
          <div>
            <label className={labelClass}>Property Number *</label>
            <input type="text" value={form.propertyNumber} onChange={e => set('propertyNumber', e.target.value)} required placeholder="e.g. PN-2026-001" className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Serial Number *</label>
            <input type="text" value={form.serialNumber} onChange={e => set('serialNumber', e.target.value)} required placeholder="e.g. SN-TEST-001" className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Location</label>
            <Select value={form.location} onValueChange={(val) => val != null && set('location', val)}>
              <SelectTrigger className="w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locationOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.value}>{opt.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={labelClass}>Supplier</label>
            <Select value={form.supplierId} onValueChange={(val) => val != null && set('supplierId', val)}>
              <SelectTrigger className="w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Purchase Date</label>
              <input type="date" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Purchase Price</label>
              <input type="number" step="0.01" value={form.purchasePrice} onChange={e => set('purchasePrice', e.target.value)} placeholder="0.00" className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Warranty Expiry</label>
              <input type="date" value={form.warrantyExpiry} onChange={e => set('warrantyExpiry', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Warranty Notes</label>
              <input type="text" value={form.warrantyNotes} onChange={e => set('warrantyNotes', e.target.value)} placeholder="Optional" className={inputClass} />
            </div>
          </div>

          {error && (
            <p className="text-sm text-[#7B1113] bg-[#7B1113]/10 border border-[#7B1113]/20 rounded-lg px-4 py-2">{error}</p>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-[#012061] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !form.propertyNumber.trim() || !form.serialNumber.trim()}
              className="rounded-lg bg-[#f8931f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e0841a] disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
            >
              {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Converting...</> : <><PackagePlus className="w-3.5 h-3.5" /> Convert to Asset</>}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Success Toast with Asset Link ── */
function SuccessToast({ assetId, onDismiss }: { assetId: string; onDismiss: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="shrink-0 px-4 sm:px-6 py-2.5 bg-emerald-50 dark:bg-emerald-950/50 border-b border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-200 text-center font-medium flex items-center justify-center gap-3">
      <span>Asset created successfully from purchase request.</span>
      <button
        onClick={() => { navigate(`/assets?highlight=${assetId}`); onDismiss(); }}
        className="inline-flex items-center gap-1 rounded-md bg-[#012061] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#012061]/80 transition-colors"
      >
        <LinkIcon className="w-3 h-3" /> View Asset
      </button>
      <button onClick={onDismiss} className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-100 transition-colors">
        <XCircle className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ── Main Component ── */
export default function PurchaseRequestsPage() {
  const { user: currentUser, accessToken } = useAuth();
  const navigate = useNavigate();
  const isAdmin = currentUser?.role === 'ADMIN';

  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [convertTarget, setConvertTarget] = useState<PurchaseRequest | null>(null);
  const [successAssetId, setSuccessAssetId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const token = accessToken || localStorage.getItem('accessToken');
      const res = await fetch('/api/purchase-requests', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to fetch requests');
      setRequests(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  /* ── Create ── */
  const handleCreate = async (formData: { assetName: string; type: string; reason: string; notes?: string }) => {
    const token = accessToken || localStorage.getItem('accessToken');
    const res = await fetch('/api/purchase-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(formData),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Failed to create request');
    showToast('Request submitted successfully');
    setShowNewModal(false);
    fetchRequests();
  };

  /* ── Approve ── */
  const handleApprove = async (id: string) => {
    try {
      setActionLoading(id);
      const token = accessToken || localStorage.getItem('accessToken');
      const res = await fetch(`/api/purchase-requests/${id}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to approve');
      showToast('Request approved — asset created');
      fetchRequests();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  /* ── Reject ── */
  const handleReject = async (id: string) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;
    try {
      setActionLoading(id);
      const token = accessToken || localStorage.getItem('accessToken');
      const res = await fetch(`/api/purchase-requests/${id}/reject`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to reject');
      showToast('Request rejected');
      fetchRequests();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  /* ── Convert success handler ── */
  const handleConvertSuccess = (assetId: string) => {
    setConvertTarget(null);
    setSuccessAssetId(assetId);
    fetchRequests();
  };

  return (
    <div className="min-h-dvh flex flex-col pt-14 md:pt-0 bg-[#012061] md:bg-transparent">
      {/* ── Header ── */}
      <header className="sticky top-[56px] md:top-0 z-10 bg-[#012061] px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#f8931f] text-white">
            <ShoppingCart className="w-4 h-4" />
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight">Purchase Requests</h1>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#f8931f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e0841a] transition-colors shadow-sm"
        >
          <PlusCircle className="w-4 h-4" /> New Request
        </button>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 flex flex-col bg-light-bg dark:bg-slate-900">

      {/* ── Success Toast ── */}
      {successAssetId && (
        <SuccessToast assetId={successAssetId} onDismiss={() => setSuccessAssetId(null)} />
      )}

      {/* ── Regular Toast ── */}
      {toast && !successAssetId && (
        <div className="shrink-0 px-4 sm:px-6 py-2 bg-[#f8931f]/10 border-b border-[#f8931f]/20 text-sm text-[#012061] dark:text-slate-100 text-center font-medium">
          {toast}
        </div>
      )}

      {/* ── Table / Empty State ── */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#f8931f] animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-red-500 mb-3">{error}</p>
            <button
              onClick={fetchRequests}
              className="text-sm text-[#f8931f] hover:underline"
            >
              Try again
            </button>
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#f8931f]/10 mb-4">
              <ShoppingCart className="h-10 w-10 text-[#f8931f]" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
              No purchase requests yet
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-xs">
              Submit a request for new assets to be purchased or procured.
            </p>
            <button
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#f8931f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors"
            >
              <PlusCircle className="h-4 w-4" /> New Request
            </button>
          </div>
        ) : (
          <ResponsiveTable
            columns={[
              {
                key: 'assetName', header: 'Asset',
                render: (r) => <span className="font-semibold text-[#012061] dark:text-slate-100">{r.assetName}</span>,
              },
              {
                key: 'type', header: 'Type',
                render: (r) => <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">{r.type}</span>,
              },
              {
                key: 'reason', header: 'Reason', mobileHidden: true,
                render: (r) => <span className="text-xs text-slate-500 dark:text-slate-400" title={r.reason}>{truncate(r.reason, 60)}</span>,
              },
              {
                key: 'requestedBy', header: 'By',
                render: (r) => r.requestedBy?.username || r.requestedById,
              },
              {
                key: 'status', header: 'Status',
                render: (r) => <StatusBadge status={r.status} convertedToAssetId={r.convertedToAssetId} />,
              },
              {
                key: 'actions', header: 'Actions',
                render: (r) => {
                  const busy = actionLoading === r.id;
                  return (
                    <div className="flex items-center justify-end gap-1">
                      {isAdmin && r.status === 'PENDING' && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); handleApprove(r.id); }} disabled={busy}
                            className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950 text-slate-400 hover:text-emerald-600 transition-colors" title="Approve">
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleReject(r.id); }} disabled={busy}
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-slate-400 hover:text-[#7B1113] transition-colors" title="Reject">
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {isAdmin && r.status === 'APPROVED' && !r.convertedToAssetId && (
                        <button onClick={(e) => { e.stopPropagation(); setConvertTarget(r); }} disabled={busy}
                          className="p-1.5 rounded-lg hover:bg-[#f8931f]/10 text-slate-400 hover:text-[#f8931f] transition-colors" title="Convert to Asset">
                          <PackagePlus className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {r.convertedToAssetId && (
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/assets?highlight=${r.convertedToAssetId}`); }}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200 border border-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors" title="View converted asset">
                          <LinkIcon className="w-3 h-3" /> Asset
                        </button>
                      )}
                      {r.status === 'REJECTED' && r.notes && (
                        <span className="text-xs text-red-500 dark:text-red-400 italic cursor-help" title={r.notes}>
                          {truncate(r.notes, 30)}
                        </span>
                      )}
                    </div>
                  );
                },
              },
            ]}
            data={requests}
            keyExtractor={(r) => r.id}
          />
        )}
      </div>

      {/* ── Convert to Asset Modal ── */}
      {convertTarget && (
        <ConvertDialog
          request={convertTarget}
          onClose={() => setConvertTarget(null)}
          onSuccess={handleConvertSuccess}
        />
      )}

      {/* ── New Request Modal ── */}
      {showNewModal && (
        <NewRequestModal
          onSubmit={handleCreate}
          onClose={() => setShowNewModal(false)}
        />
      )}
      </div>{/* close content area */}
    </div>
  );
}