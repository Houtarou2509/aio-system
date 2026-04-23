import { useState, useEffect } from 'react';

interface PendingRequest {
  id: string;
  assetId: string;
  userId: string;
  assignedTo: string | null;
  assignedAt: string;
  requestStatus: 'PENDING' | 'APPROVED' | 'DENIED';
  requestNote: string | null;
  asset: { id: string; name: string; type: string; status: string; imageUrl?: string };
  user: { id: string; username: string; email: string; fullName: string | null };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAction: () => void;
}

export default function PendingRequestsModal({ open, onClose, onAction }: Props) {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'PENDING' | 'APPROVED' | 'DENIED'>('PENDING');

  useEffect(() => {
    if (!open) return;
    loadRequests();
  }, [open, filter]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/assets/requests?status=${filter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setRequests(data.data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    setProcessing(id);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/assets/request/${id}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setRequests(prev => prev.filter(r => r.id !== id));
        onAction();
      }
    } catch {
      // ignore
    } finally {
      setProcessing(null);
    }
  };

  const handleDeny = async (id: string) => {
    const note = prompt('Reason for denial (optional):');
    setProcessing(id);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/assets/request/${id}/deny`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ denialNote: note || '' }),
      });
      const data = await res.json();
      if (data.success) {
        setRequests(prev => prev.filter(r => r.id !== id));
        onAction();
      }
    } catch {
      // ignore
    } finally {
      setProcessing(null);
    }
  };

  if (!open) return null;

  const tabs: Array<{ label: string; value: 'PENDING' | 'APPROVED' | 'DENIED' }> = [
    { label: 'Pending', value: 'PENDING' },
    { label: 'Approved', value: 'APPROVED' },
    { label: 'Denied', value: 'DENIED' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-lg border border-gray-200 shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Asset Requests</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        {/* Filter tabs */}
        <div className="flex border-b border-gray-200 px-4">
          {tabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                filter === tab.value
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Request list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
          {loading && <p className="text-sm text-gray-500 text-center py-8">Loading...</p>}
          {!loading && requests.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No {filter.toLowerCase()} requests</p>
          )}
          {requests.map(req => (
            <div key={req.id} className="rounded-md border border-gray-200 p-3 space-y-2 bg-white">
              {/* Asset info */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{req.asset.name}</p>
                  <p className="text-xs text-gray-500">{req.asset.type} · {req.asset.status}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold
                  ${req.requestStatus === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                    req.requestStatus === 'APPROVED' ? 'bg-green-100 text-green-700' :
                    'bg-red-100 text-red-700'}`}>
                  {req.requestStatus}
                </span>
              </div>

              {/* Requester info */}
              <div className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">{req.user.fullName || req.user.username}</span>
                {' '}requested on {new Date(req.assignedAt).toLocaleDateString('en-GB')}
              </div>

              {/* Request note */}
              {req.requestNote && (
                <p className="text-xs text-gray-500 italic">"{req.requestNote}"</p>
              )}

              {/* Actions */}
              {req.requestStatus === 'PENDING' && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleApprove(req.id)}
                    disabled={processing === req.id}
                    className="rounded-md bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50 h-7"
                  >
                    {processing === req.id ? '...' : '✓ Approve'}
                  </button>
                  <button
                    onClick={() => handleDeny(req.id)}
                    disabled={processing === req.id}
                    className="rounded-md bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50 h-7"
                  >
                    {processing === req.id ? '...' : '✕ Deny'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
