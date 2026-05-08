import { useState, FormEvent } from 'react';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useLookupOptions } from '@/hooks/useLookupOptions';
import { ShoppingCart, X } from 'lucide-react';

interface Props {
  onSubmit: (data: { assetName: string; type: string; reason: string; notes?: string }) => void;
  onClose: () => void;
}

export function NewRequestModal({ onSubmit, onClose }: Props) {
  const [form, setForm] = useState({
    assetName: '',
    type: '',
    reason: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { options: typeOptions } = useLookupOptions('asset-types');

  function mergeWithFallback(options: { id: number; value: string }[], currentValue: string) {
    if (!currentValue) return options;
    const exists = options.some((o) => o.value === currentValue);
    if (exists) return options;
    return [{ id: -1, value: currentValue }, ...options];
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = {
        assetName: form.assetName,
        type: form.type,
        reason: form.reason,
        notes: form.notes || undefined,
      };
      await onSubmit(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#f8931f] focus:border-transparent transition";
  const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 block";

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-slate-800 shadow-xl" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="bg-[#012061] px-6 py-4 flex items-center justify-between shrink-0 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#f8931f] text-white">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-white">New Request</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/20 bg-white/10 p-1.5 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Asset Name */}
            <div>
              <label className={labelClass}>Asset Name *</label>
              <input
                type="text"
                value={form.assetName}
                onChange={e => set('assetName', e.target.value)}
                required
                placeholder="e.g. Dell Latitude 5540"
                className={inputClass}
              />
            </div>

            {/* Type */}
            <div>
              <label className={labelClass}>Type *</label>
              <Select value={form.type || ''} onValueChange={(val) => val != null && set('type', val)}>
                <SelectTrigger className="w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-[#f8931f]">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {mergeWithFallback(typeOptions, form.type).map((opt) => (
                    <SelectItem key={opt.id} value={opt.value}>
                      {opt.value}{opt.id === -1 && <span className="ml-2 text-xs text-slate-400">(custom)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Free-text fallback */}
              <input
                type="text"
                value={form.type}
                onChange={e => set('type', e.target.value)}
                placeholder="Or type custom..."
                className={`${inputClass} mt-1 text-xs`}
              />
            </div>

            {/* Reason */}
            <div>
              <label className={labelClass}>Reason *</label>
              <textarea
                rows={3}
                value={form.reason}
                onChange={e => set('reason', e.target.value)}
                required
                placeholder="Explain why this asset is needed..."
                className={`${inputClass} resize-none`}
              />
            </div>

            {/* Notes */}
            <div>
              <label className={labelClass}>Notes (Optional)</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Any additional details..."
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="px-6 pt-1 shrink-0">
              <p className="text-sm text-[#7B1113] bg-[#7B1113]/10 border border-[#7B1113]/20 rounded-lg px-4 py-2">{error}</p>
            </div>
          )}

          {/* ── Footer ── */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-[#012061] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !form.assetName || !form.type || !form.reason}
              className="rounded-lg bg-[#f8931f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e0841a] disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
            >
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
