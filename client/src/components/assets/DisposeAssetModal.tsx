import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Asset } from '../../lib/api';

const DISPOSAL_METHODS = [
  { value: 'DONATED', label: 'Donated' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'SCRAPPED', label: 'Scrapped' },
  { value: 'RETURNED_TO_VENDOR', label: 'Returned to Vendor' },
  { value: 'OTHER', label: 'Other' },
];

interface Props {
  asset: Asset;
  onClose: () => void;
  onDisposed: () => void;
}

export function DisposeAssetModal({ asset, onClose, onDisposed }: Props) {
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('SCRAPPED');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!reason.trim()) { setError('Reason is required'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/assets/${asset.id}/dispose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason.trim(), method, date }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to dispose asset');
      onDisposed();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-[#012061]">
            <div className="flex items-center gap-2.5">
              <Trash2 className="h-4 w-4 text-[#f8931f]" />
              <h2 className="text-sm font-bold text-white tracking-tight">Dispose Asset</h2>
            </div>
            <button onClick={onClose} className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            {/* Asset info */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7B1113]/10">
                <Trash2 className="h-4 w-4 text-[#7B1113]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#012061] dark:text-slate-100 truncate">{asset.name}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">{asset.propertyNumber || asset.id?.slice(0, 8)}</p>
              </div>
            </div>

            {/* Method */}
            <div>
              <label className="block text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1.5">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors"
              >
                {DISPOSAL_METHODS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors"
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1.5">Reason</label>
              <textarea
                value={reason}
                onChange={(e) => { setReason(e.target.value); setError(null); }}
                rows={3}
                placeholder="e.g. Equipment broken beyond repair, no longer needed..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors resize-none"
                maxLength={500}
              />
              <p className="text-[10px] text-slate-400 mt-1 text-right">{reason.length}/500</p>
            </div>

            {/* Error */}
            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-[11px] font-medium text-red-600 dark:text-red-300">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white hover:opacity-90 transition-all duration-200 active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: '#7B1113' }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {submitting ? 'Disposing…' : 'Confirm Disposal'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
