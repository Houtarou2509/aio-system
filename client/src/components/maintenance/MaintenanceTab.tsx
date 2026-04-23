import { useState, useEffect, FormEvent } from 'react';
import { maintenanceApi, MaintenanceLog } from '../../lib/api';
import { RoleGate } from '../auth';
import { useAuth } from '../../context/AuthContext';
import { ScheduleMaintenanceModal } from './ScheduleMaintenanceModal';

interface Props {
  assetId: string;
  frequentRepair?: boolean;
}

interface Schedule {
  id: string;
  title: string;
  notes?: string;
  scheduledDate: string;
  status: string;
  completedAt?: string;
}

export function MaintenanceTab({ assetId, frequentRepair }: Props) {
  const { user } = useAuth();
  const userRole = user?.role || '';

  // Existing maintenance log state
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ technicianName: '', description: '', cost: '', date: '' });
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Schedule state
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await maintenanceApi.list(assetId);
      setLogs(res.data);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const fetchSchedules = async () => {
    try {
      setSchedulesLoading(true);
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/assets/${assetId}/schedules`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        setSchedules(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
    } finally {
      setSchedulesLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); fetchSchedules(); }, [assetId]);

  // Mark schedule as done
  const handleMarkDone = async (schedule: Schedule) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(
        `/api/assets/${assetId}/schedules/${schedule.id}/done`,
        {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      if (!response.ok) throw new Error('Failed to mark done');

      await fetchSchedules();
      setSuccessMsg('Marked as complete');
      setTimeout(() => setSuccessMsg(null), 3000);

      const prefill = window.confirm(
        'Would you like to log this as a maintenance record?'
      );
      if (prefill) {
        setForm(f => ({ ...f, description: schedule.title, date: new Date().toISOString().split('T')[0] }));
        setShowForm(true);
      }
    } catch (error) {
      console.error('Mark done error:', error);
      setValidationError('Failed to mark as done');
    }
  };

  // Delete a schedule
  const handleDeleteSchedule = async (scheduleId: string) => {
    const confirmed = window.confirm('Delete this scheduled maintenance?');
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(
        `/api/assets/${assetId}/schedules/${scheduleId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      if (!response.ok) throw new Error('Failed to delete');
      await fetchSchedules();
      setSuccessMsg('Schedule deleted');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (error) {
      console.error('Delete schedule error:', error);
      setValidationError('Failed to delete schedule');
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();

    if (!form.technicianName.trim()) {
      setValidationError('Technician name is required');
      return;
    }
    if (!form.description.trim()) {
      setValidationError('Description is required');
      return;
    }

    setValidationError(null);
    setSaving(true);

    try {
      const payload = {
        technicianName: form.technicianName.trim(),
        description: form.description.trim(),
        cost: form.cost ? Number(form.cost) : 0,
        date: form.date || new Date().toISOString().split('T')[0],
      };

      await maintenanceApi.create(assetId, payload);

      setForm({ technicianName: '', description: '', cost: '', date: '' });
      setShowForm(false);
      fetchLogs();
      setSuccessMsg('Maintenance log saved successfully');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('[Maintenance] Save error:', err);
      setValidationError(err.message || 'Failed to save maintenance log');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (logId: string) => {
    if (!confirm('Delete this maintenance log?')) return;
    try {
      await maintenanceApi.delete(assetId, logId);
      fetchLogs();
    } catch { /* ignore */ }
  };

  const activeSchedules = schedules.filter(s => s.status !== 'done');
  const completedSchedules = schedules.filter(s => s.status === 'done');

  return (
    <div className="space-y-3">
      {frequentRepair && (
        <div className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-800">
          ⚠️ Frequent repair flag: more than 3 maintenance events in the past 12 months
        </div>
      )}

      {/* Upcoming Maintenance Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Upcoming Maintenance</h3>
          <button
            onClick={() => setIsScheduleModalOpen(true)}
            className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
          >
            + Schedule
          </button>
        </div>

        {schedulesLoading && (
          <p className="text-sm text-gray-400">Loading schedules...</p>
        )}

        {!schedulesLoading && activeSchedules.length === 0 && (
          <p className="text-sm text-gray-400 italic">
            No upcoming maintenance scheduled
          </p>
        )}

        {!schedulesLoading && activeSchedules.map(schedule => (
          <div
            key={schedule.id}
            className="flex items-center justify-between py-2 border-b last:border-b-0"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span>📅</span>
                <span className="font-medium text-sm truncate">
                  {schedule.title}
                </span>
              </div>
              {schedule.notes && (
                <p className="text-xs text-gray-400 ml-5 truncate">
                  {schedule.notes}
                </p>
              )}
            </div>

            <span className="text-xs text-gray-500 mx-3 shrink-0">
              {new Date(schedule.scheduledDate).toLocaleDateString('en-GB')}
            </span>

            <span className={`text-xs px-2 py-0.5 rounded-full font-medium mr-2 shrink-0
              ${schedule.status === 'overdue'
                ? 'bg-red-100 text-red-700'
                : 'bg-blue-100 text-blue-700'
              }`}
            >
              {schedule.status.toUpperCase()}
            </span>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleMarkDone(schedule)}
                className="text-xs px-2 py-1 border border-green-400 text-green-600 rounded hover:bg-green-50"
              >
                ✓ Done
              </button>
              {(userRole === 'ADMIN' || userRole === 'STAFF_ADMIN') && (
                <button
                  onClick={() => handleDeleteSchedule(schedule.id)}
                  className="text-xs px-2 py-1 border border-gray-300 text-gray-400 rounded hover:bg-gray-50"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}

        {completedSchedules.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setIsCompletedExpanded(!isCompletedExpanded)}
              className="text-xs text-gray-500 flex items-center gap-1"
            >
              {isCompletedExpanded ? '▼' : '▶'} Completed ({completedSchedules.length})
            </button>

            {isCompletedExpanded && (
              <div className="mt-2">
                {completedSchedules.map(schedule => (
                  <div
                    key={schedule.id}
                    className="flex items-center justify-between py-2 border-b last:border-b-0 opacity-60"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span>✅</span>
                        <span className="text-sm truncate line-through">
                          {schedule.title}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 ml-5">
                        Completed: {' '}
                        {schedule.completedAt ? new Date(schedule.completedAt).toLocaleDateString('en-GB') : 'N/A'}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium mr-2">
                      DONE
                    </span>
                    {(userRole === 'ADMIN' || userRole === 'STAFF_ADMIN') && (
                      <button
                        onClick={() => handleDeleteSchedule(schedule.id)}
                        className="text-xs px-2 py-1 border border-gray-300 text-gray-400 rounded hover:bg-gray-50"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <hr className="mb-4" />

      <ScheduleMaintenanceModal
        isOpen={isScheduleModalOpen}
        assetId={assetId}
        onClose={() => setIsScheduleModalOpen(false)}
        onSuccess={() => {
          fetchSchedules();
          setSuccessMsg('Maintenance scheduled');
          setTimeout(() => setSuccessMsg(null), 3000);
        }}
      />

      {/* Existing maintenance log form and list below — unchanged */}

      <RoleGate roles={['ADMIN', 'STAFF_ADMIN', 'STAFF']}>
        <button onClick={() => { setShowForm(!showForm); setValidationError(null); }} className="text-xs text-primary hover:underline">
          {showForm ? 'Cancel' : '+ Add Maintenance Log'}
        </button>
      </RoleGate>

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-2 rounded-md border border-border bg-muted/50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Technician name *" value={form.technicianName} onChange={e => setForm(f => ({ ...f, technicianName: e.target.value }))} className="rounded-md border border-input bg-background px-2 py-1 text-sm" />
            <input type="number" step="0.01" placeholder="Cost" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} className="rounded-md border border-input bg-background px-2 py-1 text-sm" />
          </div>
          <textarea placeholder="Description *" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm" rows={2} />
          <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="rounded-md border border-input bg-background px-2 py-1 text-sm" />
          {validationError && <p className="text-xs text-destructive">{validationError}</p>}
          <button type="submit" disabled={saving} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      )}

      {successMsg && (
        <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
          {successMsg}
        </div>
      )}

      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
        <div className="space-y-2">
          {logs.map(l => (
            <div key={l.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">{l.technicianName}</span>
                <span className="text-muted-foreground text-xs">{new Date(l.date).toLocaleDateString()}</span>
              </div>
              <p className="text-muted-foreground">{l.description}</p>
              {Number(l.cost) > 0 && <p className="text-xs text-muted-foreground">Cost: ₱{Number(l.cost).toLocaleString()}</p>}
              <RoleGate roles={['ADMIN']}>
                <button onClick={() => handleDelete(l.id)} className="text-xs text-destructive hover:underline mt-1">Delete</button>
              </RoleGate>
            </div>
          ))}
          {logs.length === 0 && <p className="text-sm text-muted-foreground">No maintenance logs</p>}
        </div>
      )}
    </div>
  );
}