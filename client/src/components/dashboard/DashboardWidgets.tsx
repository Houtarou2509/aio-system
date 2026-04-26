import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

import { PieChart, BarChart3, ShieldAlert, Wrench, Activity, ArrowRight } from 'lucide-react';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement);

/* ── Data interfaces (unchanged) ─────────────────────────── */

interface DashboardData {
  totalAssets: number;
  totalAssigned: number;
  underMaintenance: number;
  available: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  activityFeed: string[];
}

interface UpcomingSchedule {
  id: string;
  title: string;
  scheduledDate: string;
  status: string;
  asset: { id: string; name: string };
}

interface WarrantyExpiring {
  id: string;
  name: string;
  warrantyExpiry: string;
  status: string;
  location: string | null;
  daysUntilExpiry: number;
  warrantyStatus: 'expired' | 'expiring' | 'active';
}

interface LocationStat {
  location: string;
  count: number;
}

interface AgeStat {
  label: string;
  count: number;
}

/* ── Chart palette (Indigo / Slate / Teal) ───────────────── */

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: '#14b8a6',  // teal-500
  ASSIGNED: '#6366f1',  // indigo-500
  MAINTENANCE: '#f59e0b', // amber-500 (kept for semantics)
  RETIRED: '#94a3b8',   // slate-400
  LOST: '#ef4444',      // red-500 (kept for semantics)
};

const TYPE_COLORS = [
  '#6366f1', '#14b8a6', '#8b5cf6', '#0ea5e9', '#64748b', '#a78bfa',
];

/* ── Shared card wrapper ────────────────────────────────── */

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg border border-slate-100 bg-white overflow-hidden ${className}`}
      style={{ borderTop: '2px solid #4f46e5' }}
    >
      {children}
    </div>
  );
}

function CardTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 px-4 pt-3 pb-2 text-sm font-semibold text-slate-900">
      <Icon className="h-4 w-4 text-indigo-600" />
      {children}
    </h3>
  );
}

/* ── Main component ──────────────────────────────────────── */

export function DashboardWidgets() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upcomingMaintenance, setUpcomingMaintenance] = useState<UpcomingSchedule[]>([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [warrantiesExpiring, setWarrantiesExpiring] = useState<WarrantyExpiring[]>([]);
  const [warrantiesLoading, setWarrantiesLoading] = useState(true);
  const [locationStats, setLocationStats] = useState<LocationStat[]>([]);
  const [ageStats, setAgeStats] = useState<AgeStat[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    fetch('/api/dashboard/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch('/api/maintenance/upcoming', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setUpcomingMaintenance(d.data); })
      .catch(() => {})
      .finally(() => setMaintenanceLoading(false));

    fetch('/api/dashboard/warranties-expiring', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setWarrantiesExpiring(d.data); })
      .catch(() => {})
      .finally(() => setWarrantiesLoading(false));

    fetch('/api/dashboard/location-stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setLocationStats(d.data); })
      .catch(() => {});

    fetch('/api/dashboard/age-stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setAgeStats(d.data); })
      .catch(() => {});
  }, []);

  if (loading || !data) return <p className="text-sm text-slate-500">Loading dashboard…</p>;

  /* ── Chart data (palette applied) ──────────────────────── */

  const statusData = {
    labels: Object.keys(data.byStatus),
    datasets: [{
      data: Object.values(data.byStatus),
      backgroundColor: Object.keys(data.byStatus).map(s => STATUS_COLORS[s] || '#94a3b8'),
      borderWidth: 0,
    }],
  };

  const typeData = {
    labels: Object.keys(data.byType),
    datasets: [{
      data: Object.values(data.byType),
      backgroundColor: TYPE_COLORS.slice(0, Object.keys(data.byType).length),
      borderWidth: 0,
    }],
  };

  /* ── Shared chart options ──────────────────────────────── */

  const legendOpts = {
    position: 'bottom' as const,
    labels: { boxWidth: 10, padding: 12, font: { size: 11 }, color: '#64748b' },
  };

  return (
    <div className="space-y-4">

      {/* ══════════════════════════════════════════════════════
          ANALYTICS GRID — 3 columns
          Col 1: Status Doughnut
          Col 2: Type Bar
          Col 3: Warranty / Maintenance compact list
      ════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Status Distribution ──────────────────────────── */}
        <Card>
          <CardTitle icon={PieChart}>Status Distribution</CardTitle>
          <div className="px-4 pb-3 h-52 flex items-center justify-center">
            <Doughnut
              data={statusData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: legendOpts, tooltip: { enabled: true } },
              }}
            />
          </div>
        </Card>

        {/* ── Assets by Type ───────────────────────────────── */}
        <Card>
          <CardTitle icon={BarChart3}>Assets by Type</CardTitle>
          <div className="px-4 pb-3 h-52 flex items-center justify-center">
            <Bar
              data={typeData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: true, ticks: { stepSize: 1, color: '#94a3b8', font: { size: 10 } }, grid: { color: '#f1f5f9' } },
                  x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
                },
              }}
            />
          </div>
        </Card>

        {/* ── Warranty / Maintenance Overview ───────────────── */}
        <Card className="flex flex-col">
          <CardTitle icon={ShieldAlert}>Warranty &amp; Maintenance</CardTitle>
          <div className="flex-1 px-4 pb-3 overflow-y-auto max-h-52 space-y-0">

            {/* Maintenance items */}
            <div className="flex items-center gap-1.5 py-1">
              <Wrench className="h-3 w-3 shrink-0 text-indigo-600" />
              <span className="text-[10px] tracking-widest text-slate-500 uppercase">Maintenance</span>
            </div>
            {maintenanceLoading && <p className="text-xs text-slate-400 pl-5">Loading…</p>}
            {!maintenanceLoading && upcomingMaintenance.length === 0 && (
              <p className="text-xs text-slate-400 italic pl-5">No upcoming</p>
            )}
            {!maintenanceLoading && upcomingMaintenance.slice(0, 3).map(s => (
              <div key={s.id} className="flex items-center justify-between py-1.5 pl-5 border-b border-slate-50 last:border-b-0">
                <span className="text-xs font-medium text-slate-700 truncate">{s.asset.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ml-2 ${
                  s.status === 'overdue' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'
                }`}>
                  {s.status.toUpperCase()}
                </span>
              </div>
            ))}

            {/* Divider */}
            <div className="border-t border-slate-100 my-1" />

            {/* Warranty items */}
            <div className="flex items-center gap-1.5 py-1">
              <ShieldAlert className="h-3 w-3 shrink-0 text-indigo-600" />
              <span className="text-[10px] tracking-widest text-slate-500 uppercase">Warranties</span>
            </div>
            {warrantiesLoading && <p className="text-xs text-slate-400 pl-5">Loading…</p>}
            {!warrantiesLoading && warrantiesExpiring.length === 0 && (
              <p className="text-xs text-slate-400 italic pl-5">No expiring warranties</p>
            )}
            {!warrantiesLoading && warrantiesExpiring.slice(0, 3).map(a => (
              <div key={a.id} className="flex items-center justify-between py-1.5 pl-5 border-b border-slate-50 last:border-b-0">
                <span className="text-xs font-medium text-slate-700 truncate">{a.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ml-2 ${
                  a.warrantyStatus === 'expired' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                }`}>
                  {a.daysUntilExpiry < 0
                    ? `${Math.abs(a.daysUntilExpiry)}d overdue`
                    : `${a.daysUntilExpiry}d left`}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ══════════════════════════════════════════════════════
          LOCATION + AGE — 2 columns
      ════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Location */}
        <Card>
          <CardTitle icon={BarChart3}>Assets by Location</CardTitle>
          <div className="px-4 pb-3 h-48 flex items-center justify-center">
            {locationStats.length === 0 ? (
              <p className="text-xs text-slate-400">No location data</p>
            ) : (
              <Bar
                data={{
                  labels: locationStats.map(l => l.location),
                  datasets: [{
                    data: locationStats.map(l => l.count),
                    backgroundColor: '#6366f1',
                    borderWidth: 0,
                    borderRadius: 3,
                  }],
                }}
                options={{
                  indexAxis: 'y',
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, color: '#94a3b8', font: { size: 10 } }, grid: { color: '#f1f5f9' } },
                    y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
                  },
                }}
              />
            )}
          </div>
        </Card>

        {/* Age */}
        <Card>
          <CardTitle icon={PieChart}>Assets by Age</CardTitle>
          <div className="px-4 pb-3 h-48 flex items-center justify-center">
            {ageStats.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No purchase date data</p>
            ) : (
              <Doughnut
                data={{
                  labels: ageStats.map(a => a.label),
                  datasets: [{
                    data: ageStats.map(a => a.count),
                    backgroundColor: ['#6366f1', '#14b8a6', '#8b5cf6', '#0ea5e9', '#64748b', '#94a3b8'],
                    borderWidth: 0,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: legendOpts },
                }}
              />
            )}
          </div>
        </Card>
      </div>

      {/* ══════════════════════════════════════════════════════
          FEEDS — Activity & Maintenance 50/50
      ════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Recent Activity ─────────────────────────────── */}
        <Card className="flex flex-col">
          <CardTitle icon={Activity}>Recent Activity</CardTitle>
          <div
            className="flex-1 px-4 pb-3 overflow-y-auto space-y-0"
            style={{ height: 400, scrollbarWidth: 'none' }}
          >
            <style>{`div[data-feed-activity]::-webkit-scrollbar{display:none}`}</style>
            {data.activityFeed.length === 0 && (
              <p className="text-xs text-slate-400 italic py-4 text-center">No recent activity</p>
            )}
            {data.activityFeed.map((item, i) => {
              const initials = extractInitials(cleanActivityText(item));
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-b-0"
                >
                  {/* Circular initials */}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-semibold text-indigo-600">
                    {initials}
                  </div>
                  {/* Text */}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-900 truncate">
                      {truncateFeed(cleanActivityText(item))}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {extractRelativeTime(cleanActivityText(item))}
                    </p>
                  </div>
                  {/* Badge */}
                  <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {extractActionType(cleanActivityText(item))}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── Upcoming Maintenance ────────────────────────── */}
        <Card className="flex flex-col">
          <CardTitle icon={Wrench}>Upcoming Maintenance</CardTitle>
          <div
            className="flex-1 px-4 pb-3 overflow-y-auto space-y-0"
            style={{ height: 400, scrollbarWidth: 'none' }}
          >
            {maintenanceLoading && (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-slate-400">Loading…</p>
              </div>
            )}
            {!maintenanceLoading && upcomingMaintenance.length === 0 && (
              <p className="text-xs text-slate-400 italic py-4 text-center">No upcoming maintenance</p>
            )}
            {!maintenanceLoading && upcomingMaintenance.map(s => {
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-b-0"
                >
                  {/* Circular icon */}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50">
                    <Wrench className="h-3.5 w-3.5 text-indigo-600" />
                  </div>
                  {/* Text */}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-900 truncate">
                      {s.asset.name}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {s.title} · {relativeDate(s.scheduledDate)}
                    </p>
                  </div>
                  {/* Status badge */}
                  <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    s.status === 'overdue'
                      ? 'bg-red-50 text-red-600'
                      : s.status === 'completed'
                        ? 'bg-teal-50 text-teal-600'
                        : 'bg-indigo-50 text-indigo-600'
                  }`}>
                    {s.status.toUpperCase()}
                  </span>
                </div>
              );
            })}
            {!maintenanceLoading && upcomingMaintenance.length > 0 && (
              <button
                onClick={() => navigate('/assets')}
                className="flex items-center gap-1 text-[10px] text-indigo-600 hover:underline mt-2 w-full justify-end"
              >
                View All <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────── */

function cleanActivityText(text: string): string {
  return text
    .replace(
      /"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^"]*"/g,
      (match) => {
        const dateStr = match.replace(/"/g, '');
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return match;
        return `"${date.toLocaleDateString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit' })}"`;
      }
    )
    .replace(
      /"[A-Z][a-z]+ [A-Z][a-z]+ \d+ \d{4}[^"]*"/g,
      (match) => {
        const dateStr = match.replace(/"/g, '');
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return match;
        return `"${date.toLocaleDateString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit' })}"`;
      }
    );
}

/* Extract 1-2 char initials from first meaningful words */
function extractInitials(text: string): string {
  const words = text.replace(/["{}\[\]:,]/g, ' ').split(/\s+/).filter(w => w.length > 0 && !/^(the|a|an|of|to|in|for|by|on|at|from|was|is|with|and|or|not|no)$/i.test(w));
  return (words[0]?.[0] || '?') + (words[1]?.[0] || '').toUpperCase();
}

/* Truncate feed text for display */
function truncateFeed(text: string, max = 72): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/* Try to extract a relative-time string like "2m ago" from embedded dates */
function extractRelativeTime(text: string): string {
  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  if (isoMatch) {
    const date = new Date(isoMatch[0]);
    if (!isNaN(date.getTime())) return relativeDate(date.toISOString());
  }
  // Fallback: look for a locale date pattern
  const dateMatch = text.match(/\d{2}\/\d{2}\/\d{4}/);
  if (dateMatch) {
    const parts = dateMatch[0].split('/');
    const date = new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
    if (!isNaN(date.getTime())) return relativeDate(date.toISOString());
  }
  return '—';
}

/* Extract action type (CREATED, UPDATED, ASSIGNED, etc.) for badge */
function extractActionType(text: string): string {
  const upper = text.toUpperCase();
  const keywords = ['CREATED', 'UPDATED', 'DELETED', 'ASSIGNED', 'UNASSIGNED', 'TRANSFERRED', 'RETIRE', 'MAINTENANCE', 'AUDIT', 'SCAN'];
  for (const kw of keywords) {
    if (upper.includes(kw)) return kw;
  }
  return 'LOG';
}

/* Relative date string ("2m ago", "3d ago", etc.) */
function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}