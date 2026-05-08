import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShoppingCart, PlusCircle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { NewRequestModal } from '../components/purchase/NewRequestModal';
import { ResponsiveTable } from '../components/ui/ResponsiveTable';

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
  createdAt: string;
  updatedAt: string;
  requestedBy?: { id: string; username: string; email?: string };
  approvedBy?: { id: string; username: string; email?: string } | null;
}

/* ── Status Badge ── */
function StatusBadge({ status }: { status: string }) {
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

/* ── Main Component ── */
export default function PurchaseRequestsPage() {
  const { user: currentUser, accessToken } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';

  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

  return (
    <div className="min-h-dvh flex flex-col pt-14 md:pt-0 bg-[#012061] md:bg-transparent">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 bg-[#012061] px-6 py-4 flex items-center justify-between shadow-md">
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

      {/* ── Toast ── */}
      {toast && (
        <div className="shrink-0 px-6 py-2 bg-[#f8931f]/10 border-b border-[#f8931f]/20 text-sm text-[#012061] dark:text-slate-100 text-center font-medium">
          {toast}
        </div>
      )}

      {/* ── Table / Empty State ── */}
      <div className="flex-1 overflow-auto px-6 py-4">
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
                render: (r) => <StatusBadge status={r.status} />,
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
