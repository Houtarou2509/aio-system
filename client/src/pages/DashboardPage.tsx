import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Package, Users, Wrench, CheckCircle,
  Plus, ScanLine, ClipboardList, Settings,
  PieChart, BarChart3, ShieldAlert, Activity, ArrowRight,
} from 'lucide-react';
import { RoleGate } from '../components/auth';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement);

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

function extractInitials(text: string): string {
  const words = text
    .replace(/["{}\[\]:,]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0 && !/^(the|a|an|of|to|in|for|by|on|at|from|was|is|with|and|or|not|no)$/i.test(w));
  return (words[0]?.[0] || '?') + (words[1]?.[0] || '').toUpperCase();
}

function truncateFeed(text: string, max = 72): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function extractRelativeTime(text: string): string {
  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  if (isoMatch) {
    const date = new Date(isoMatch[0]);
    if (!isNaN(date.getTime())) return relativeDate(date.toISOString());
  }
  const dateMatch = text.match(/\d{2}\/\d{2}\/\d{4}/);
  if (dateMatch) {
    const parts = dateMatch[0].split('/');
    const date = new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
    if (!isNaN(date.getTime())) return relativeDate(date.toISOString());
  }
  return '—';
}

function extractActionType(text: string): string {
  const upper = text.toUpperCase();
  const keywords = ['CREATED', 'UPDATED', 'DELETED', 'ASSIGNED', 'UNASSIGNED', 'TRANSFERRED', 'RETIRE', 'MAINTENANCE', 'AUDIT', 'SCAN'];
  for (const kw of keywords) {
    if (upper.includes(kw)) return kw;
  }
  return 'LOG';
}

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

/* ── Data interfaces ──────────────────────────────────────── */

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

interface KpiData {
  totalAssets: number;
  totalAssigned: number;
  underMaintenance: number;
  available: number;
}

/* ── Constants ────────────────────────────────────────────── */

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: '#012061',
  ASSIGNED: '#f8931f',
  MAINTENANCE: '#94a3b8',
  RETIRED: '#cbd5e1',
  LOST: '#ef4444',
};

const TYPE_COLORS = ['#012061', '#f8931f', '#94a3b8', '#14b8a6', '#64748b', '#0ea5e9'];

const KPI_CARDS: { key: keyof KpiData; label: string; icon: React.ElementType }[] = [
  { key: 'totalAssets', label: 'TOTAL ASSETS', icon: Package },
  { key: 'totalAssigned', label: 'ASSIGNED', icon: Users },
  { key: 'underMaintenance', label: 'MAINTENANCE', icon: Wrench },
  { key: 'available', label: 'AVAILABLE', icon: CheckCircle },
];

/* ── Shared primitives ───────────────────────────────────── */

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg border border-slate-100 bg-white overflow-hidden ${className}`}
      style={{ borderTop: '2px solid #012061' }}
    >
      {children}
    </div>
  );
}

function CardTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="px-4 pt-3 pb-2">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-[#f8931f]" />
        <h3 className="text-sm font-semibold text-[#012061]">{children}</h3>
      </div>
      <div className="h-[2px] w-8 rounded-full bg-[#f8931f]" />
    </div>
  );
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/* ── KPI Bar ──────────────────────────────────────────────── */

function KpiBar() {
  const [data, setData] = useState<KpiData | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    fetch('/api/dashboard/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data); })
      .catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-slate-100 animate-pulse">
            <div className="h-10 w-10 rounded-lg bg-slate-100" />
            <div className="space-y-1.5">
              <div className="h-5 w-12 rounded bg-slate-100" />
              <div className="h-2.5 w-16 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {KPI_CARDS.map(({ key, label, icon: Icon }) => (
        <div key={key} className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-slate-100">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#012061]/5">
            <Icon className="h-5 w-5 text-[#f8931f]" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-tight text-[#f8931f]">{data[key]}</p>
            <p className="text-[10px] tracking-widest text-slate-500 uppercase">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────── */

export default function DashboardPage() {
  const now = useClock();
  const navigate = useNavigate();

  /* ── All dashboard state ──────────────────────────────── */
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upcomingMaintenance, setUpcomingMaintenance] = useState<UpcomingSchedule[]>([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [warrantiesExpiring, setWarrantiesExpiring] = useState<WarrantyExpiring[]>([]);
  const [warrantiesLoading, setWarrantiesLoading] = useState(true);
  const [locationStats, setLocationStats] = useState<LocationStat[]>([]);
  const [ageStats, setAgeStats] = useState<AgeStat[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const h = { Authorization: `Bearer ${token}` };

    fetch('/api/dashboard/stats', { headers: h })
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch('/api/maintenance/upcoming', { headers: h })
      .then(r => r.json())
      .then(d => { if (d.success) setUpcomingMaintenance(d.data); })
      .catch(() => {})
      .finally(() => setMaintenanceLoading(false));

    fetch('/api/dashboard/warranties-expiring', { headers: h })
      .then(r => r.json())
      .then(d => { if (d.success) setWarrantiesExpiring(d.data); })
      .catch(() => {})
      .finally(() => setWarrantiesLoading(false));

    fetch('/api/dashboard/location-stats', { headers: h })
      .then(r => r.json())
      .then(d => { if (d.success) setLocationStats(d.data); })
      .catch(() => {});

    fetch('/api/dashboard/age-stats', { headers: h })
      .then(r => r.json())
      .then(d => { if (d.success) setAgeStats(d.data); })
      .catch(() => {});
  }, []);

  /* ── Chart data ───────────────────────────────────────── */

  const statusData = data ? {
    labels: Object.keys(data.byStatus),
    datasets: [{
      data: Object.values(data.byStatus),
      backgroundColor: Object.keys(data.byStatus).map(s => STATUS_COLORS[s] || '#94a3b8'),
      borderWidth: 0,
    }],
  } : null;

  const typeData = data ? {
    labels: Object.keys(data.byType),
    datasets: [{
      data: Object.values(data.byType),
      backgroundColor: TYPE_COLORS.slice(0, Object.keys(data.byType).length),
      borderWidth: 0,
    }],
  } : null;

  const legendOpts = {
    position: 'bottom' as const,
    labels: { boxWidth: 10, padding: 12, font: { size: 11 }, color: '#012061' },
  };

  const hiddenScrollbarStyle = { height: 400, scrollbarWidth: 'none' as const };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">AIO System Dashboard</h1>
          </div>
          <span className="hidden sm:flex items-center gap-2 text-xs text-white/60 bg-white/10 rounded-lg px-3 py-2 tabular-nums">
            <Activity className="w-3.5 h-3.5" />
            {now.toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            {' · '}
            {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </header>

      {/* ── KPI Bar ────────────────────────────────────────── */}
      <section className="px-6 pt-4 pb-2">
        <KpiBar />
      </section>

      {/* ── Quick Actions ──────────────────────────────────── */}
      <section className="px-6 pt-3 pb-2">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/assets')} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors">
            <Package className="h-3.5 w-3.5 text-[#f8931f]" /> View Assets
          </button>
          <button onClick={() => navigate('/assets?action=scan')} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors">
            <ScanLine className="h-3.5 w-3.5 text-[#f8931f]" /> Scan QR
          </button>
          <RoleGate roles={['ADMIN', 'STAFF_ADMIN']}>
            <button onClick={() => navigate('/assets?action=create')} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors">
              <Plus className="h-3.5 w-3.5 text-[#f8931f]" /> Add Asset
            </button>
          </RoleGate>
          <button onClick={() => navigate('/audit')} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors">
            <ClipboardList className="h-3.5 w-3.5 text-[#f8931f]" /> Audit Trail
          </button>
          <RoleGate roles={['ADMIN']}>
            <button onClick={() => navigate('/settings')} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors">
              <Settings className="h-3.5 w-3.5 text-[#f8931f]" /> Settings
            </button>
          </RoleGate>
        </div>
      </section>

      {/* ── Dashboard content ───────────────────────────────── */}
      <div className="px-6 pb-6">
        {loading || !data ? (
          <p className="text-sm text-slate-500">Loading dashboard…</p>
        ) : (
          <div className="space-y-4">

            {/* ═══ ANALYTICS GRID — 3 columns ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Status Distribution */}
              <Card>
                <CardTitle icon={PieChart}>Status Distribution</CardTitle>
                <div className="px-4 pb-3 h-52 flex items-center justify-center">
                  <Doughnut
                    data={statusData!}
                    options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: legendOpts, tooltip: { enabled: true } } }}
                  />
                </div>
              </Card>

              {/* Assets by Type */}
              <Card>
                <CardTitle icon={BarChart3}>Assets by Type</CardTitle>
                <div className="px-4 pb-3 h-52 flex items-center justify-center">
                  <Bar
                    data={typeData!}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1, color: '#012061', font: { size: 10 } }, grid: { color: '#f1f5f9' } },
                        x: { ticks: { color: '#012061', font: { size: 10 } }, grid: { display: false } },
                      },
                    }}
                  />
                </div>
              </Card>

              {/* Warranty / Maintenance Overview */}
              <Card className="flex flex-col">
                <CardTitle icon={ShieldAlert}>Warranty &amp; Maintenance</CardTitle>
                <div className="flex-1 px-4 pb-3 overflow-y-auto max-h-52 space-y-0">
                  <div className="flex items-center gap-1.5 py-1">
                    <Wrench className="h-3 w-3 shrink-0 text-[#f8931f]" />
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
                        s.status === 'overdue' ? 'bg-red-50 text-red-600' : 'bg-[#012061]/5 text-[#f8931f]'
                      }`}>
                        {s.status.toUpperCase()}
                      </span>
                    </div>
                  ))}

                  <div className="border-t border-slate-100 my-1" />

                  <div className="flex items-center gap-1.5 py-1">
                    <ShieldAlert className="h-3 w-3 shrink-0 text-[#f8931f]" />
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
                        {a.daysUntilExpiry < 0 ? `${Math.abs(a.daysUntilExpiry)}d overdue` : `${a.daysUntilExpiry}d left`}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* ═══ LOCATION + AGE — 2 columns ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardTitle icon={BarChart3}>Assets by Location</CardTitle>
                <div className="px-4 pb-3 h-48 flex items-center justify-center">
                  {locationStats.length === 0 ? (
                    <p className="text-xs text-slate-400">No location data</p>
                  ) : (
                    <Bar
                      data={{
                        labels: locationStats.map(l => l.location),
                        datasets: [{ data: locationStats.map(l => l.count), backgroundColor: '#012061', borderWidth: 0, borderRadius: 3 }],
                      }}
                      options={{
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                          x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, color: '#012061', font: { size: 10 } }, grid: { color: '#f1f5f9' } },
                          y: { ticks: { color: '#012061', font: { size: 10 } }, grid: { display: false } },
                        },
                      }}
                    />
                  )}
                </div>
              </Card>
              <Card>
                <CardTitle icon={PieChart}>Assets by Age</CardTitle>
                <div className="px-4 pb-3 h-48 flex items-center justify-center">
                  {ageStats.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No purchase date data</p>
                  ) : (
                    <Doughnut
                      data={{
                        labels: ageStats.map(a => a.label),
                        datasets: [{ data: ageStats.map(a => a.count), backgroundColor: ['#012061', '#f8931f', '#94a3b8', '#14b8a6', '#64748b', '#0ea5e9'], borderWidth: 0 }],
                      }}
                      options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: legendOpts } }}
                    />
                  )}
                </div>
              </Card>
            </div>

            {/* ═══ FEEDS — Activity & Maintenance 50/50 ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Recent Activity */}
              <Card className="flex flex-col">
                <CardTitle icon={Activity}>Recent Activity</CardTitle>
                <div className="flex-1 px-4 pb-3 overflow-y-auto" style={hiddenScrollbarStyle}>
                  {data.activityFeed.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#012061]/5 mb-2">
                        <Activity className="h-5 w-5 text-[#f8931f]" />
                      </div>
                      <p className="text-sm font-medium text-[#012061]">All Quiet</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">No recent activity to show</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {data.activityFeed.map((item, i) => {
                        const initials = extractInitials(cleanActivityText(item));
                        const actionType = extractActionType(cleanActivityText(item));
                        return (
                          <div
                            key={i}
                            className="flex items-center gap-3 py-2.5 hover:bg-slate-50 transition-colors cursor-default"
                            style={{ borderLeft: '2px solid transparent' }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderLeftColor = '#f8931f'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderLeftColor = 'transparent'; }}
                          >
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#012061] text-[10px] font-semibold text-white">
                              {initials}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-[#012061] font-medium truncate">{truncateFeed(cleanActivityText(item))}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{extractRelativeTime(cleanActivityText(item))}</p>
                            </div>
                            <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#f8931f]/10 text-[#f8931f]">
                              {actionType}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Card>

              {/* Upcoming Maintenance */}
              <Card className="flex flex-col">
                <CardTitle icon={Wrench}>Upcoming Maintenance</CardTitle>
                <div className="flex-1 px-4 pb-3 overflow-y-auto" style={hiddenScrollbarStyle}>
                  {maintenanceLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-xs text-slate-400">Loading…</p>
                    </div>
                  ) : upcomingMaintenance.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#012061]/5 mb-2">
                        <CheckCircle className="h-5 w-5 text-[#f8931f]" />
                      </div>
                      <p className="text-sm font-medium text-[#012061]">All Clear</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">No upcoming maintenance</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {upcomingMaintenance.map(s => (
                        <div
                          key={s.id}
                          className="flex items-center gap-3 py-2.5 hover:bg-slate-50 transition-colors cursor-default"
                          style={{ borderLeft: '2px solid transparent' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderLeftColor = '#f8931f'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderLeftColor = 'transparent'; }}
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#012061]">
                            <Wrench className="h-3.5 w-3.5 text-[#f8931f]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-[#012061] font-medium truncate">{s.asset.name}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{s.title} · {relativeDate(s.scheduledDate)}</p>
                          </div>
                          <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            s.status === 'overdue' ? 'bg-red-50 text-red-600'
                              : s.status === 'completed' ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-[#012061]/5 text-[#012061]'
                          }`}>
                            {s.status.toUpperCase()}
                          </span>
                        </div>
                      ))}
                      <button
                        onClick={() => navigate('/assets')}
                        className="flex items-center gap-1 text-[10px] text-[#f8931f] hover:underline pt-2 w-full justify-end"
                      >
                        View All <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}