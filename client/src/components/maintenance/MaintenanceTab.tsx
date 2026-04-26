import { useState, useEffect, FormEvent } from 'react';
import { maintenanceApi, MaintenanceLog } from '../../lib/api';
import { RoleGate } from '../auth';
import { useAuth } from '../../context/AuthContext';
import { ScheduleMaintenanceModal } from './ScheduleMaintenanceModal';
import {
  Wrench,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';

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
  frequency?: string;
}

const FREQ_LABELS: Record<string, string> = {
  none: '',
  '3months': '🔁 Every 3 Months',
  '6months': '🔁 Every 6 Months',
  yearly: '🔁 Yearly',
};

/* ─── Schedule Tile (Connectivity Matrix style) ─── */
function ScheduleTile({
  schedule,
  onMarkDone,
  onDelete,
  canDelete,
}: {
  schedule: Schedule;
  onMarkDone: (s: Schedule) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
}) {
  const isOverdue = schedule.status === 'overdue';
  const isDone = schedule.status === 'done';

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
      isDone
        ? 'border-slate-100 bg-slate-50/50 opacity-60'
        : isOverdue
        ? 'border-red-100 bg-red-50/30 hover:border-red-200'
        : 'border-slate-100 bg-white hover:border-slate-200 shadow-xs'
    }`}>
      <div className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${
        isDone
          ? 'bg-emerald-50 text-emerald-600'
          : isOverdue
          ? 'bg-red-50 text-red-600'
          : 'bg-blue-50 text-blue-600'
      }`}>
        {isDone ? <CheckCircle2 className="w-4 h-4" /> : isOverdue ? <AlertCircle className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium truncate ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>{schedule.title}</p>
          {schedule.frequency && schedule.frequency !== 'none' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium shrink-0">
              {FREQ_LABELS[schedule.frequency] || '🔁'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-slate-400">{new Date(schedule.scheduledDate).toLocaleDateString('en-GB')}</span>
          {schedule.notes && <span className="text-xs text-slate-400 truncate">· {schedule.notes}</span>}
          {isDone && schedule.completedAt && (
            <span className="text-xs text-slate-400">· Done {new Date(schedule.completedAt).toLocaleDateString('en-GB')}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {!isDone && (
          <button
            onClick={() => onMarkDone(schedule)}
            className="inline-flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100 transition-colors"
          >
            <CheckCircle2 className="w-3 h-3" />
            Mark Done
          </button>
        )}
        {canDelete && !isDone && (
          <button
            onClick={() => onDelete(schedule.id)}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════
   MAINTENANCE TAB
   ═════════════════════════════════════════════════════ */
export function MaintenanceTab({ assetId, frequentRepair }: Props) {
  const { user } = useAuth();
  const userRole = user?.role || '';

  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ technicianName: '', description: '', cost: '', date: '' });
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await maintenanceApi.list(assetId);
      setLogs(res.data);
    } catch {} finally { setLoading(false); }
  };

  const fetchSchedules = async () => {
    try {
      setSchedulesLoading(true);
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/assets/${assetId}/schedules`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) setSchedules(result.data);
    } catch {} finally { setSchedulesLoading(false); }
  };

  useEffect(() => { fetchLogs(); fetchSchedules(); }, [assetId]);

  const handleMarkDone = async (schedule: Schedule) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/assets/${assetId}/schedules/${schedule.id}/done`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to mark done');
      await fetchSchedules();
      setSuccessMsg('Marked as complete');
      setTimeout(() => setSuccessMsg(null), 3000);
      const prefill = window.confirm('Would you like to log this as a maintenance record?');
      if (prefill) {
        setForm(f => ({ ...f, description: schedule.title, date: new Date().toISOString().split('T')[0] }));
        setShowForm(true);
      }
    } catch {
      setValidationError('Failed to mark as done');
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!window.confirm('Delete this scheduled maintenance?')) return;
    try {
      const token = localStorage.getItem('accessToken');
      await fetch(`/api/assets/${assetId}/schedules/${scheduleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      await fetchSchedules();
      setSuccessMsg('Schedule deleted');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      setValidationError('Failed to delete schedule');
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.technicianName.trim()) { setValidationError('Technician name is required'); return; }
    if (!form.description.trim()) { setValidationError('Description is required'); return; }
    setValidationError(null);
    setSaving(true);
    try {
      await maintenanceApi.create(assetId, {
        technicianName: form.technicianName.trim(),
        description: form.description.trim(),
        cost: form.cost ? Number(form.cost) : 0,
        date: form.date || new Date().toISOString().split('T')[0],
      });
      setForm({ technicianName: '', description: '', cost: '', date: '' });
      setShowForm(false);
      fetchLogs();
      setSuccessMsg('Maintenance log saved');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setValidationError(err.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDelete = async (logId: string) => {
    if (!confirm('Delete this maintenance log?')) return;
    try { await maintenanceApi.delete(assetId, logId); fetchLogs(); } catch {}
  };

  const activeSchedules = schedules.filter(s => s.status !== 'done');
  const completedSchedules = schedules.filter(s => s.status === 'done');
  const canDelete = userRole === 'ADMIN' || userRole === 'STAFF_ADMIN';

  return (
    <div className="space-y-4">
      {/* Frequent repair warning */}
      {frequentRepair && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Frequent repair flag: more than 3 maintenance events in the past 12 months
        </div>
      )}

      {/* ─── Upcoming Maintenance (Connectivity Matrix style) ─── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="w-3.5 h-3.5 text-indigo-600" />
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Upcoming Maintenance</h3>
          </div>
          <button
            onClick={() => setIsScheduleModalOpen(true)}
            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Schedule
          </button>
        </div>
        <div className="p-3 space-y-2">
          {schedulesLoading && (
            <div className="flex items-center justify-center py-6 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading...
            </div>
          )}
          {!schedulesLoading && activeSchedules.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <Wrench className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No upcoming maintenance</p>
            </div>
          )}
          {!schedulesLoading && activeSchedules.map(s => (
            <ScheduleTile key={s.id} schedule={s} onMarkDone={handleMarkDone} onDelete={handleDeleteSchedule} canDelete={canDelete} />
          ))}
        </div>

        {/* Completed schedules */}
        {completedSchedules.length > 0 && (
          <div className="border-t border-slate-200">
            <button
              onClick={() => setIsCompletedExpanded(!isCompletedExpanded)}
              className="w-full flex items-center gap-2 px-4 py-2 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
            >
              {isCompletedExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Completed ({completedSchedules.length})
            </button>
            {isCompletedExpanded && (
              <div className="px-3 pb-3 space-y-2">
                {completedSchedules.map(s => (
                  <ScheduleTile key={s.id} schedule={s} onMarkDone={handleMarkDone} onDelete={handleDeleteSchedule} canDelete={canDelete} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

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

      {/* ─── Maintenance Logs ─── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-indigo-600" />
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Maintenance Logs</h3>
          </div>
          <RoleGate roles={['ADMIN', 'STAFF_ADMIN', 'STAFF']}>
            <button
              onClick={() => { setShowForm(!showForm); setValidationError(null); }}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add Log
            </button>
          </RoleGate>
        </div>

        {/* Add form */}
        {showForm && (
          <form onSubmit={handleCreate} className="p-3 border-b border-slate-200 space-y-2 bg-slate-50/50">
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Technician name *" value={form.technicianName} onChange={e => setForm(f => ({ ...f, technicianName: e.target.value }))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400" />
              <input type="number" step="0.01" placeholder="Cost" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400" />
            </div>
            <textarea placeholder="Description *" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400" rows={2} />
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400" />
            {validationError && <p className="text-xs text-red-600">{validationError}</p>}
            <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </form>
        )}

        {/* Success message */}
        {successMsg && (
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border-b border-emerald-100 text-xs text-emerald-700">
            <CheckCircle2 className="w-3 h-3" />
            {successMsg}
          </div>
        )}

        {/* Log list */}
        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading...
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <Clock className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No maintenance logs</p>
            </div>
          ) : (
            logs.map(l => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-500 shrink-0">
                  <Wrench className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{l.technicianName}</p>
                  <p className="text-xs text-slate-500 truncate">{l.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-500">{new Date(l.date).toLocaleDateString()}</p>
                  {Number(l.cost) > 0 && <p className="text-xs text-indigo-600 font-medium">₱{Number(l.cost).toLocaleString()}</p>}
                </div>
                <RoleGate roles={['ADMIN']}>
                  <button onClick={() => handleDelete(l.id)} className="text-slate-400 hover:text-red-500 transition-colors shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </RoleGate>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}