import { useState, useEffect } from 'react';

interface Props {
  isOpen: boolean;
  assetId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ScheduleMaintenanceModal({ isOpen, assetId, onClose, onSuccess }: Props) {
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [notes, setNotes] = useState('');
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
      setTitleError('');
      setDateError('');
      setServerError('');
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    // Validation
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
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            title: title.trim(),
            scheduledDate,
            notes: notes.trim() || null
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setServerError(result.error || 'Failed to schedule maintenance');
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">Schedule Maintenance</h2>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {serverError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {serverError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Annual cleaning"
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
            {titleError && <p className="text-xs text-destructive mt-1">{titleError}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Scheduled Date *</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={e => setScheduledDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
            {dateError && <p className="text-xs text-destructive mt-1">{dateError}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Describe what needs to be done..."
              rows={3}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSubmitting ? 'Scheduling...' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}