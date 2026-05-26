import { useState, useEffect } from 'react';
import { Wrench } from 'lucide-react';

interface Props {
  isOpen: boolean;
  assetId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const FREQUENCY_OPTIONS = [
  { value: 'none', label: 'Does not repeat' },
  { value: '3months', label: 'Every 3 Months' },
  { value: '6months', label: 'Every 6 Months' },
  { value: 'yearly', label: 'Yearly' },
];

const inputClass =
  'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] outline-none transition';
const labelClass = 'block text-[10px] text-slate-400 uppercase tracking-widest font-medium mb-1.5';

export function ScheduleMaintenanceModal({ isOpen, assetId, onClose, onSuccess }: Props) {
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [notes, setNotes] = useState('');
  const [frequency, setFrequency] = useState('none');
  const [titleError, setTitleError] = useState('');
  const [dateError, setDateError] = useState('');
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setScheduledDate('');
      setNotes('');
      setFrequency('none');
      setTitleError('');
      setDateError('');
      setServerError('');
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    let valid = true;
    setTitleError('');
    setDateError('');
    setServerError('');

    if (!title.trim()) {
      setTitleError('Title is required');
      valid = false;
    }
    if (!scheduledDate) {
      setDateError('Date is required');
      valid = false;
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(scheduledDate) < today) {
        setDateError('Date must be today or in the future');
        valid = false;
      }
    }

    if (!valid) return;

    try {
      setIsSubmitting(true);
      const token = localStorage.getItem('accessToken');
      const response = await fetch(
        `/api/assets/${assetId}/schedules`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: title.trim(),
            scheduledDate,
            notes: notes.trim() || null,
            frequency,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setServerError(result.error?.message || 'Failed to schedule maintenance');
        return;
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Schedule maintenance error:', error);
      setServerError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const selectedFreq = FREQUENCY_OPTIONS.find(f => f.value === frequency);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 bg-[#012061] px-4 py-3 flex items-center gap-2.5">
          <Wrench className="h-4 w-4 text-white" />
          <h2 className="text-sm font-semibold text-white tracking-tight">Schedule Maintenance</h2>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {serverError && (
            <div className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              {serverError}
            </div>
          )}

          <div>
            <label className={labelClass}>Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Annual cleaning"
              className={inputClass}
            />
            {titleError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{titleError}</p>}
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800" />

          <div>
            <label className={labelClass}>Scheduled Date *</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={e => setScheduledDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className={inputClass}
            />
            {dateError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{dateError}</p>}
          </div>

          <div>
            <label className={labelClass}>Repeat Task?</label>
            <select
              value={frequency}
              onChange={e => setFrequency(e.target.value)}
              className={inputClass}
            >
              {FREQUENCY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {frequency !== 'none' && scheduledDate && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                🔄 Next auto-scheduled date will be calculated when this task is completed
              </p>
            )}
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800" />

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Describe what needs to be done..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          {frequency !== 'none' ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">🔁 {selectedFreq?.label}</span>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-[#012061] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="rounded-lg bg-[#f8931f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e0841a] transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Scheduling…' : 'Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}