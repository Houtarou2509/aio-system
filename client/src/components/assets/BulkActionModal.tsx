import { useState, useEffect } from 'react';
import { X, Users, MapPin, Loader2 } from 'lucide-react';

interface Props {
  action: 'assign' | 'update' | 'none';
  selectedCount: number;
  onClose: () => void;
  onAssign: (personnelId: string, notes?: string) => Promise<void>;
  onUpdate: (updates: { location?: string; status?: string }) => Promise<void>;
  loading: boolean;
}

interface PersonnelOption {
  id: string;
  fullName: string;
  designation?: string;
}

const STATUSES = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST'];

export default function BulkActionModal({ action, selectedCount, onClose, onAssign, onUpdate, loading }: Props) {
  const [personnel, setPersonnel] = useState<PersonnelOption[]>([]);
  const [personnelLoading, setPersonnelLoading] = useState(false);
  const [selectedPersonnel, setSelectedPersonnel] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    if (action === 'assign') {
      setPersonnelLoading(true);
      const token = localStorage.getItem('accessToken');
      fetch('/api/personnel?limit=500&status=active', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => {
          if (d.success) setPersonnel(d.data || []);
        })
        .catch(() => {})
        .finally(() => setPersonnelLoading(false));
    }
  }, [action]);

  const handleSubmit = async () => {
    if (action === 'assign') {
      if (!selectedPersonnel) return;
      await onAssign(selectedPersonnel, notes || undefined);
    } else if (action === 'update') {
      if (!status && !location) return;
      await onUpdate({ status: status || undefined, location: location || undefined });
    }
  };

  if (action === 'none') return null;

  const isAssign = action === 'assign';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            {isAssign ? <Users className="w-5 h-5 text-[#f8931f]" /> : <MapPin className="w-5 h-5 text-[#f8931f]" />}
            <h2 className="text-base font-bold text-[#012061] dark:text-slate-100">
              {isAssign ? 'Bulk Assign' : 'Bulk Update'} ({selectedCount} selected)
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isAssign ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Personnel *</label>
              {personnelLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
              ) : (
                <select
                  value={selectedPersonnel}
                  onChange={(e) => setSelectedPersonnel(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent"
                >
                  <option value="">Select personnel...</option>
                  {personnel.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}{p.designation ? ` — ${p.designation}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent"
                placeholder="Add any notes for this bulk assignment..."
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent"
              >
                <option value="">Keep unchanged</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Location</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent"
                placeholder="Leave blank to keep current location"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || (isAssign ? !selectedPersonnel : (!status && !location))}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#f8931f] text-white hover:bg-[#e07e0a] disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...</span>
            ) : (
              isAssign ? 'Assign Assets' : 'Update Assets'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
