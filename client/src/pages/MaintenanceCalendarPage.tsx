import { useState, useEffect, useMemo, useCallback } from 'react';
import { Wrench, Search, CalendarDays, Clock, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import { AssetDetailModal } from '../components/assets';
import type { Asset } from '../lib/api';

/* ─── Types ─── */

interface MaintenanceSchedule {
  id: string;
  assetId: string;
  title: string;
  scheduledDate: string;
  notes: string | null;
  status: 'pending' | 'overdue' | 'done';
  frequency: string;
  completedAt: string | null;
  asset: { id: string; name: string };
}

interface CalendarStats {
  pending: number;
  overdue: number;
  completedThisMonth: number;
}

interface CalendarResponse {
  schedules: MaintenanceSchedule[];
  stats: CalendarStats;
}

/* ─── Helpers ─── */

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ─── Status Badge ─── */

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return (
        <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-200 border border-orange-200 dark:border-orange-800">
          PENDING
        </span>
      );
    case 'overdue':
      return (
        <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-200 border border-red-200 dark:border-red-800">
          OVERDUE
        </span>
      );
    case 'done':
      return (
        <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800">
          DONE
        </span>
      );
    default:
      return (
        <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          {status.toUpperCase()}
        </span>
      );
  }
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

export default function MaintenanceCalendarPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<CalendarResponse | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => getMonthKey(new Date()));

  // Asset detail modal state
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [loadingAsset, setLoadingAsset] = useState<string | null>(null);
  const [assetError, setAssetError] = useState('');

  // Build available month options (6 months back, 12 forward from current)
  const monthOptions = useMemo(() => {
    const now = new Date();
    const options: { value: string; label: string }[] = [];
    for (let i = -6; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      options.push({ value: getMonthKey(d), label: monthLabel(getMonthKey(d)) });
    }
    return options;
  }, []);

  /* ── Fetch ── */
  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/maintenance/calendar?month=${selectedMonth}`);
      setData(res.data);
    } catch (e: any) {
      setError(e.message || 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => { fetchCalendar(); }, [fetchCalendar]);

  /* ── Open Asset Detail ── */
  const handleCardClick = async (schedule: MaintenanceSchedule) => {
    setLoadingAsset(schedule.id);
    setAssetError('');
    try {
      const res = await apiFetch(`/assets/${schedule.assetId}`);
      const asset = res.data ?? res;
      setSelectedAsset(asset);
      setShowDetail(true);
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 401) {
        setAssetError('Session expired. Please log in again.');
      } else if (e instanceof ApiError && e.status === 403) {
        setAssetError('You do not have permission to view this asset.');
      } else {
        setAssetError('Unable to open asset details.');
      }
    } finally {
      setLoadingAsset(null);
    }
  };

  const handleCloseDetail = () => {
    setShowDetail(false);
    setSelectedAsset(null);
    // Refresh calendar data after closing (maintenance actions may have changed schedules)
    fetchCalendar();
  };

  /* ── Filter & Group ── */
  const filtered = useMemo(() => {
    if (!data?.schedules) return [];

    let items = data.schedules;
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        s =>
          s.title.toLowerCase().includes(q) ||
          s.asset.name.toLowerCase().includes(q) ||
          (s.notes && s.notes.toLowerCase().includes(q))
      );
    }
    return items;
  }, [data, search]);

  // Group by month
  const grouped = useMemo(() => {
    const groups: Record<string, MaintenanceSchedule[]> = {};
    for (const s of filtered) {
      const key = getMonthKey(new Date(s.scheduledDate));
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    // Sort keys chronologically
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  /* ── Render ── */
  const stats = data?.stats || { pending: 0, overdue: 0, completedThisMonth: 0 };

  return (
    <div className="flex flex-col h-screen pt-14 md:pt-0 bg-[#012061] md:bg-transparent">
      {/* ═══ HEADER ═══════════════════════════════════════════ */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-4 sm:px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Wrench className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">Maintenance Calendar</h1>
          </div>
          <p className="hidden sm:block text-xs text-white/40 tracking-wide">
            Scheduled Maintenance Overview
          </p>
        </div>
      </header>

      {/* ═══ CONTENT AREA ═════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-auto bg-light-bg dark:bg-slate-900">

        {/* ── KPI Tiles ── */}
        <section className="px-4 sm:px-6 pt-4 shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Pending */}
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f8931f]/15">
                <Clock className="h-5 w-5 text-[#f8931f]" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold leading-tight text-[#f8931f]">{stats.pending}</p>
                <p className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase">Pending</p>
              </div>
            </div>

            {/* Overdue */}
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#7B1113]/15">
                <AlertTriangle className="h-5 w-5 text-[#7B1113]" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold leading-tight text-[#7B1113]">{stats.overdue}</p>
                <p className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase">Overdue</p>
              </div>
            </div>

            {/* Completed This Month */}
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#012061]/15">
                <CheckCircle2 className="h-5 w-5 text-[#012061]" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold leading-tight text-[#012061]">{stats.completedThisMonth}</p>
                <p className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase">Completed This Month</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Filter Bar ── */}
        <section className="px-4 sm:px-6 pt-3 pb-2 shrink-0">
          <div className="flex flex-row items-center gap-3 flex-wrap bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5">
            {/* Search */}
            <div className="relative flex-1 min-w-0 sm:min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by title, asset, notes…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-9 pr-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors"
              />
            </div>

            {/* Month Selector */}
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors cursor-pointer"
              >
                {monthOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* ── Asset Error Toast ── */}
        {assetError && (
          <div className="mx-4 sm:mx-6 mt-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm flex items-center gap-2 justify-between">
            <span>{assetError}</span>
            <button onClick={() => setAssetError('')} className="text-red-400 hover:text-red-600 text-xs font-medium">Dismiss</button>
          </div>
        )}

        {/* ── Schedule List ── */}
        <div className="flex-1 overflow-auto px-4 sm:px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin h-8 w-8 border-2 border-[#f8931f] border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/30 mb-3">
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
              <p className="text-sm text-red-500 font-medium">{error}</p>
            </div>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f8931f]/10 mb-3">
                <CalendarDays className="h-8 w-8 text-[#f8931f]" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">No maintenance schedules found</p>
              <p className="text-xs text-slate-400">
                {search ? 'Try adjusting your search or month filter.' : 'No schedules for this month.'}
              </p>
            </div>
          ) : (
            <div className="space-y-6 pt-2">
              {grouped.map(([monthKey, items]) => (
                <div key={monthKey}>
                  {/* Month Header */}
                  <div className="flex items-center gap-2 mb-3">
                    <CalendarDays className="h-4 w-4 text-[#012061] dark:text-[#f8931f]" />
                    <h3 className="text-sm font-bold text-[#012061] dark:text-white tracking-tight">
                      {monthLabel(monthKey)}
                    </h3>
                    <span className="text-[10px] text-slate-400 ml-1">
                      {items.length} {items.length === 1 ? 'schedule' : 'schedules'}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="space-y-2">
                    {items.map(schedule => {
                      const isOverdue = schedule.status === 'overdue';
                      const isLoading = loadingAsset === schedule.id;
                      return (
                        <button
                          key={schedule.id}
                          onClick={() => handleCardClick(schedule)}
                          disabled={isLoading}
                          className={`w-full text-left rounded-lg border px-4 py-3 transition-all duration-150 hover:border-[#f8931f]/50 hover:shadow-sm group ${
                            isOverdue
                              ? 'bg-red-50/30 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                          } ${isLoading ? 'opacity-70 cursor-wait' : 'cursor-pointer'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              {/* Asset Name */}
                              <p className="text-sm font-bold text-[#012061] dark:text-white leading-tight mb-0.5 group-hover:text-[#f8931f] transition-colors">
                                {schedule.asset.name}
                              </p>
                              {/* Title */}
                              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                {schedule.title}
                              </p>
                              {/* Notes (if any) */}
                              {schedule.notes && (
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 line-clamp-1 italic">
                                  {schedule.notes}
                                </p>
                              )}
                            </div>

                            {/* Right column: date + status */}
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-md px-2 py-0.5">
                                <Clock className="h-3 w-3" />
                                {formatDate(schedule.scheduledDate)}
                              </span>
                              <StatusBadge status={schedule.status} />
                              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#f8931f]" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ ASSET DETAIL MODAL ═══════════════════════════════ */}
      {showDetail && selectedAsset && (
        <AssetDetailModal
          asset={selectedAsset}
          onClose={handleCloseDetail}
          onEdit={(_asset) => { /* Could open edit form if needed */ }}
          initialTab="overview"
        />
      )}
    </div>
  );
}