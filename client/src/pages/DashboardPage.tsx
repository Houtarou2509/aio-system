import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Package, Users, Wrench, CheckCircle,
  ScanLine, ClipboardList, Settings,
  PieChart, BarChart3, ShieldAlert, Activity,
  Clock, CalendarDays, Layers,
  SlidersHorizontal, RefreshCw, AlertTriangle, ArrowRight,
} from 'lucide-react';
import { PermissionGate } from '../components/auth';
import { CustomizePanel } from '../components/dashboard/CustomizePanel';
import { loadWidgetPrefs, saveWidgetPrefs, type WidgetPref } from '../lib/widgetRegistry';

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
  if (upper.includes('CHECKOUT') || upper.includes('BULK_CREATED')) return 'CREATED';
  if (upper.includes('AGREEMENT.PDF_VIEWED')) return 'LOG';
  if (upper.includes('CHANGED PHOTOURL') || upper.includes('CHANGED EMAIL')) return 'UPDATED';
  if (upper.includes('CHANGED RETURNEDAT') || upper.includes('CHANGED RETURNEE')) return 'UPDATED';
  if (upper.includes('CHANGED STATUS')) return 'UPDATED';
  const keywords = ['CREATED', 'UPDATED', 'DELETED', 'ASSIGNED', 'UNASSIGNED', 'TRANSFERRED', 'RETIRE', 'MAINTENANCE', 'AUDIT', 'SCAN'];
  for (const kw of keywords) {
    if (upper.includes(kw)) return kw;
  }
  return 'LOG';
}

function humanizeActionType(type: string): string {
  const map: Record<string, string> = {
    CREATED: 'Created',
    UPDATED: 'Updated',
    DELETED: 'Deleted',
    ASSIGNED: 'Assigned',
    UNASSIGNED: 'Unassigned',
    TRANSFERRED: 'Transferred',
    RETIRE: 'Retired',
    MAINTENANCE: 'Maintenance',
    AUDIT: 'Audit',
    SCAN: 'Scanned',
    LOG: 'Activity',
  };
  return map[type] || type;
}

function humanizeActivity(raw: string): { actor: string; action: string; context: string } {
  const cleaned = cleanActivityText(raw);

  // "uppidrdf changed photoUrl from ..."
  if (/changed photoUrl/i.test(cleaned)) {
    const actor = cleaned.split(' ')[0];
    return { actor, action: 'Profile photo updated', context: '' };
  }

  // "uppidrdf agreement.pdf_viewed AgreementDocument — May 25, 2026..."
  if (/agreement\.pdf_viewed/i.test(cleaned)) {
    const actor = cleaned.split(' ')[0];
    return { actor, action: 'Agreement PDF viewed', context: '' };
  }

  // "uppidrdf changed returnedAt from ... to ... on Assignment — ..."
  if (/changed returnedAt/i.test(cleaned)) {
    const actor = cleaned.split(' ')[0];
    return { actor, action: 'Asset returned', context: '' };
  }

  // "uppidrdf changed recipientSignedAt from null to ... on Assignment"
  if (/changed recipientSignedAt/i.test(cleaned)) {
    const actor = cleaned.split(' ')[0];
    return { actor, action: 'Agreement signed', context: '' };
  }

  // "uppidrdf changed status from AVAILABLE to PENDING_ASSIGNMENT on Asset — ..."
  const statusMatch = cleaned.match(/changed status from "(\w+)" to "(\w+)"/i) || cleaned.match(/changed status from (\w+) to (\w+)/i);
  if (statusMatch) {
    const actor = cleaned.split(' ')[0];
    return { actor, action: `Status changed: ${statusMatch[1]} → ${statusMatch[2]}`, context: '' };
  }

  // "uppidrdf checkout Assignment — ..."
  if (/checkout\s+Assignment/i.test(cleaned)) {
    const actor = cleaned.split(' ')[0];
    return { actor, action: 'Asset checked out', context: '' };
  }

  // "uppidrdf issuance.bulk_created AgreementDocument — ..."
  if (/issuance\.bulk_created/i.test(cleaned)) {
    const actor = cleaned.split(' ')[0];
    return { actor, action: 'Bulk issuance created', context: '' };
  }

  // Fallback: truncate
  const actor = cleaned.split(' ')[0] || '';
  return { actor, action: truncateFeed(cleaned, 60), context: '' };
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

/* ── Action badge style helper ───────────────────────────── */

const ACTION_BADGE_STYLE: Record<string, string> = {
  CREATED: 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  UPDATED: 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  DELETED: 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 border-red-200 dark:border-red-800',
  ASSIGNED: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  UNASSIGNED: 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  TRANSFERRED: 'bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-300 border-violet-200 dark:border-violet-800',
  RETIRE: 'bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  MAINTENANCE: 'bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
  AUDIT: 'bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  SCAN: 'bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  LOG: 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
};

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

interface WarrantyAlertAsset {
  id: string;
  name: string;
  serialNumber: string | null;
  propertyNumber: string | null;
  warrantyExpiry: string;
  status: string;
  assignedTo: string | null;
}

interface WarrantyStats {
  warrantiesExpiringSoon: number;
  warrantiesExpired: number;
  warrantiesExpiringSoonList: WarrantyAlertAsset[];
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

const KPI_CARDS: { key: keyof KpiData; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'totalAssets', label: 'TOTAL ASSETS', icon: Package, color: '#012061' },
  { key: 'totalAssigned', label: 'ASSIGNED', icon: Users, color: '#f8931f' },
  { key: 'underMaintenance', label: 'MAINTENANCE', icon: Wrench, color: '#94a3b8' },
  { key: 'available', label: 'AVAILABLE', icon: CheckCircle, color: '#14b8a6' },
];

/* ── Shared primitives ───────────────────────────────────── */

function BentoCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] dark:shadow-none overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function BentoCardTitle({ icon: Icon, children, accent = '#f8931f', linkTo, linkLabel }: { icon: React.ElementType; children: React.ReactNode; accent?: string; linkTo?: string; linkLabel?: string }) {
  const navigate = useNavigate();
  return (
    <div className="px-5 pt-4 pb-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}15` }}>
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
        <h3 className="text-xs font-bold tracking-widest uppercase text-slate-500 dark:text-slate-400">{children}</h3>
      </div>
      <div className="flex items-center gap-2">
        {linkTo && (
          <button
            onClick={() => navigate(linkTo)}
            className="text-[10px] font-semibold text-[#f8931f] hover:text-[#e0841a] hover:underline transition-colors flex items-center gap-0.5"
          >
            {linkLabel || 'View details'} <ArrowRight className="w-2.5 h-2.5" />
          </button>
        )}
        <div className="h-[3px] w-8 rounded-full" style={{ backgroundColor: accent }} />
      </div>
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
  const navigate = useNavigate();

  const KPI_ROUTES: Record<string, string> = {
    totalAssets: '/assets',
    totalAssigned: '/assets?status=ASSIGNED',
    underMaintenance: '/maintenance',
    available: '/assets?status=AVAILABLE',
  };

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    fetch('/api/dashboard/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data); })
      .catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-xl border border-slate-100 dark:border-slate-700 border-l-4 border-l-slate-200 dark:border-l-slate-600 animate-pulse">
            <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-700" />
            <div className="space-y-2">
              <div className="h-6 w-14 rounded bg-slate-100 dark:bg-slate-700" />
              <div className="h-2.5 w-16 rounded bg-slate-100 dark:bg-slate-700" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {KPI_CARDS.map(({ key, label, icon: Icon, color }) => (
        <div
          key={key}
          onClick={() => navigate(KPI_ROUTES[key] || '/assets')}
          className="group flex items-center gap-3 px-4 py-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-xl border border-slate-100 dark:border-slate-700 transition-all duration-200 hover:bg-white dark:hover:bg-slate-700/80 hover:shadow-lg hover:border-slate-200 dark:hover:border-slate-600 hover:ring-1 hover:ring-slate-200/60 dark:hover:ring-slate-600/40 cursor-pointer"
          style={{ borderLeftWidth: '4px', borderLeftColor: color }}
          title={`Go to ${label.toLowerCase()}`}
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-200"
            style={{ backgroundColor: `${color}12` }}
          >
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold tabular-nums leading-tight text-slate-900 dark:text-slate-100">{data[key]}</p>
            <p className="text-[10px] tracking-widest text-slate-400 dark:text-slate-500 uppercase font-medium">{label}</p>
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
  const [widgetPrefs, setWidgetPrefs] = useState<WidgetPref[]>(() => loadWidgetPrefs());
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /* ── All dashboard state ──────────────────────────────── */
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upcomingMaintenance, setUpcomingMaintenance] = useState<UpcomingSchedule[]>([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [warrantiesExpiring, setWarrantiesExpiring] = useState<WarrantyExpiring[]>([]);
  const [warrantiesLoading, setWarrantiesLoading] = useState(true);
  const [locationStats, setLocationStats] = useState<LocationStat[]>([]);
  const [ageStats, setAgeStats] = useState<AgeStat[]>([]);
  const [warrantyStats, setWarrantyStats] = useState<WarrantyStats | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Shared refresh function ─────────────────────────── */
  const refreshData = useCallback((showSpinner = false) => {
    const token = localStorage.getItem('accessToken');
    const h = { Authorization: `Bearer ${token}` };

    if (showSpinner) setIsRefreshing(true);

    fetch('/api/dashboard/stats', { headers: h })
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data); })
      .catch((e) => console.error('[Dashboard] Failed to load stats:', e))
      .finally(() => { setLoading(false); if (showSpinner) setIsRefreshing(false); });

    fetch('/api/maintenance/upcoming', { headers: h })
      .then(r => r.json())
      .then(d => { if (d.success) setUpcomingMaintenance(d.data); })
      .catch((e) => console.error('[Dashboard] Failed to load upcoming maintenance:', e))
      .finally(() => setMaintenanceLoading(false));

    fetch('/api/dashboard/warranties-expiring', { headers: h })
      .then(r => r.json())
      .then(d => { if (d.success) setWarrantiesExpiring(d.data); })
      .catch((e) => console.error('[Dashboard] Failed to load warranties expiring:', e))
      .finally(() => setWarrantiesLoading(false));

    fetch('/api/dashboard/location-stats', { headers: h })
      .then(r => r.json())
      .then(d => { if (d.success) setLocationStats(d.data); })
      .catch((e) => console.error('[Dashboard] Failed to load location stats:', e));

    fetch('/api/dashboard/age-stats', { headers: h })
      .then(r => r.json())
      .then(d => { if (d.success) setAgeStats(d.data); })
      .catch((e) => console.error('[Dashboard] Failed to load age stats:', e));

    fetch('/api/assets/stats', { headers: h })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setWarrantyStats({
            warrantiesExpiringSoon: d.data.warrantiesExpiringSoon ?? 0,
            warrantiesExpired: d.data.warrantiesExpired ?? 0,
            warrantiesExpiringSoonList: d.data.warrantiesExpiringSoonList ?? [],
          });
        }
      })
      .catch((e) => console.error('[Dashboard] Failed to load warranty stats:', e));
  }, []);

  /* ── Initial load ────────────────────────────────────── */
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  /* ── Auto-refresh interval (60s) ─────────────────────── */
  useEffect(() => {
    if (liveEnabled) {
      intervalRef.current = setInterval(() => refreshData(true), 60_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [liveEnabled, refreshData]);

  /* ── Chart data ───────────────────────────────────────── */

  const statusData = data ? {
    labels: Object.keys(data.byStatus),
    datasets: [{
      data: Object.values(data.byStatus),
      backgroundColor: Object.keys(data.byStatus).map(s => STATUS_COLORS[s] || '#94a3b8'),
      borderWidth: 0,
      hoverBorderWidth: 2,
      hoverBorderColor: '#ffffff',
    }],
  } : null;

  const typeData = data ? {
    labels: Object.keys(data.byType),
    datasets: [{
      data: Object.values(data.byType),
      backgroundColor: TYPE_COLORS.slice(0, Object.keys(data.byType).length),
      borderWidth: 0,
      borderRadius: 4,
    }],
  } : null;

  const legendOpts = {
    position: 'bottom' as const,
    labels: {
      boxWidth: 10,
      padding: 14,
      font: { size: 10, family: "'Geist Variable', sans-serif" },
      color: '#64748b',
      usePointStyle: true,
      pointStyleWidth: 8,
    },
  };

  const chartCommonOpts = {
    responsive: true,
    maintainAspectRatio: false,
  };

  /* ── Widget renderer ───────────────────────────────────── */

  function renderWidget(id: string): React.ReactNode {
    switch (id) {
      case 'status-distribution':
        return (
          <BentoCard>
            <BentoCardTitle icon={PieChart} accent="#014da3" linkTo="/assets" linkLabel="View assets">Status Distribution</BentoCardTitle>
            <div className="px-5 pb-4 h-48 flex items-center justify-center">
              {statusData && Object.keys(data!.byStatus).length > 0 ? (
                <Doughnut
                  data={statusData}
                  options={{ ...chartCommonOpts, plugins: { legend: legendOpts, tooltip: { backgroundColor: '#012061', titleFont: { size: 11 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8 } } }}
                />
              ) : (
                <p className="text-xs text-slate-400 italic">No status data yet</p>
              )}
            </div>
          </BentoCard>
        );

      case 'assets-by-type':
        return (
          <BentoCard>
            <BentoCardTitle icon={BarChart3} accent="#014da3" linkTo="/assets" linkLabel="View assets">Assets by Type</BentoCardTitle>
            <div className="px-5 pb-4 h-48 flex items-center justify-center">
              {typeData && Object.keys(data!.byType).length > 0 ? (
                <Bar
                  data={typeData}
                  options={{
                    ...chartCommonOpts,
                    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#012061', titleFont: { size: 11 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8 } },
                    scales: {
                      y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, color: '#64748b', font: { size: 10 } }, grid: { color: '#e2e8f0' } },
                      x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } },
                    },
                  }}
                />
              ) : (
                <p className="text-xs text-slate-400 italic">No type data yet</p>
              )}
            </div>
          </BentoCard>
        );

      case 'warranty-maintenance':
        return (
          <BentoCard className="flex flex-col">
            <BentoCardTitle icon={ShieldAlert} accent="#7B1113" linkTo="/maintenance" linkLabel="View maintenance">Warranty & Maintenance</BentoCardTitle>
            <div className="flex-1 px-5 pb-4 overflow-y-auto space-y-1 min-h-0 h-48" style={{ scrollbarWidth: 'thin' }}>
              <div className="flex items-center gap-1.5 pt-0.5 pb-1">
                <Wrench className="h-3 w-3 shrink-0 text-[#f8931f]" />
                <span className="text-[10px] tracking-widest text-slate-400 dark:text-slate-500 uppercase font-medium">Maintenance</span>
              </div>
              {maintenanceLoading && <p className="text-xs text-slate-400 pl-4">Loading…</p>}
              {!maintenanceLoading && upcomingMaintenance.length === 0 && (
                <p className="text-xs text-slate-400 italic pl-4 py-1">All clear</p>
              )}
              {!maintenanceLoading && upcomingMaintenance.slice(0, 4).map(s => (
                <div key={s.id} className={`flex items-center justify-between py-2 pl-4 border-b border-slate-50 dark:border-slate-700/50 last:border-b-0 transition-all duration-200 rounded-md px-2 -mx-1 hover:bg-slate-50 dark:hover:bg-slate-700/30 ${
                  s.status === 'overdue' ? 'shadow-[0_0_10px_rgba(239,68,68,0.1)] bg-red-50/30 dark:bg-red-950/20' : ''
                }`}>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{s.asset.name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ml-2 border ${
                    s.status === 'overdue'
                      ? 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 border-red-200 dark:border-red-800'
                      : s.status === 'completed'
                        ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : 'bg-[#012061]/5 dark:bg-slate-700/50 text-[#f8931f] border-[#f8931f]/20'
                  }`}>
                    {s.status.toUpperCase()}
                  </span>
                </div>
              ))}
              <div className="border-t border-slate-100 dark:border-slate-700 my-1.5" />
              <div className="flex items-center gap-1.5 pt-0.5 pb-1">
                <CalendarDays className="h-3 w-3 shrink-0 text-[#f8931f]" />
                <span className="text-[10px] tracking-widest text-slate-400 dark:text-slate-500 uppercase font-medium">Warranties</span>
              </div>
              {warrantiesLoading && <p className="text-xs text-slate-400 pl-4">Loading…</p>}
              {!warrantiesLoading && warrantiesExpiring.length === 0 && (
                <p className="text-xs text-slate-400 italic pl-4 py-1">No expiring warranties</p>
              )}
              {!warrantiesLoading && warrantiesExpiring.slice(0, 4).map(a => (
                <div key={a.id} className={`flex items-center justify-between py-2 pl-4 border-b border-slate-50 dark:border-slate-700/50 last:border-b-0 transition-all duration-200 rounded-md px-2 -mx-1 hover:bg-slate-50 dark:hover:bg-slate-700/30 ${
                  a.warrantyStatus === 'expired' ? 'shadow-[0_0_10px_rgba(239,68,68,0.12)] bg-red-50/30 dark:bg-red-950/20' : ''
                }`}>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{a.name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ml-2 border ${
                    a.warrantyStatus === 'expired'
                      ? 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 border-red-200 dark:border-red-800'
                      : 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  }`}>
                    {a.daysUntilExpiry < 0 ? `${Math.abs(a.daysUntilExpiry)}d overdue` : `${a.daysUntilExpiry}d left`}
                  </span>
                </div>
              ))}
            </div>
          </BentoCard>
        );

      case 'assets-by-location':
        return (
          <BentoCard>
            <BentoCardTitle icon={Layers} accent="#014da3" linkTo="/assets" linkLabel="View assets">Assets by Location</BentoCardTitle>
            <div className="px-5 pb-4 h-44 flex items-center justify-center">
              {locationStats.length === 0 ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
                    <Layers className="h-5 w-5 text-slate-300 dark:text-slate-500" />
                  </div>
                  <p className="text-xs text-slate-400">No location data</p>
                </div>
              ) : (
                <Bar
                  data={{
                    labels: locationStats.map(l => l.location),
                    datasets: [{
                      data: locationStats.map(l => l.count),
                      backgroundColor: ['#012061', '#f8931f', '#94a3b8', '#14b8a6', '#64748b', '#0ea5e9'],
                      borderWidth: 0,
                      borderRadius: 3,
                    }],
                  }}
                  options={{
                    indexAxis: 'y',
                    ...chartCommonOpts,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, color: '#64748b', font: { size: 10 } }, grid: { color: '#e2e8f0' } },
                      y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } },
                    },
                  }}
                />
              )}
            </div>
          </BentoCard>
        );

      case 'assets-by-age':
        return (
          <BentoCard>
            <BentoCardTitle icon={PieChart} accent="#014da3" linkTo="/assets" linkLabel="View assets">Assets by Age</BentoCardTitle>
            <div className="px-5 pb-4 h-44 flex items-center justify-center">
              {ageStats.length === 0 ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
                    <PieChart className="h-5 w-5 text-slate-300 dark:text-slate-500" />
                  </div>
                  <p className="text-xs text-slate-400 italic">No purchase date data</p>
                </div>
              ) : (
                <Doughnut
                  data={{
                    labels: ageStats.map(a => a.label),
                    datasets: [{
                      data: ageStats.map(a => a.count),
                      backgroundColor: ['#012061', '#f8931f', '#94a3b8', '#14b8a6', '#64748b', '#0ea5e9'],
                      borderWidth: 0,
                    }],
                  }}
                  options={{ ...chartCommonOpts, plugins: { legend: legendOpts } }}
                />
              )}
            </div>
          </BentoCard>
        );

      case 'activity-timeline':
        return (
          <BentoCard className="flex flex-col">
            <BentoCardTitle icon={Activity} accent="#014da3" linkTo="/audit" linkLabel="View audit log">Activity Timeline</BentoCardTitle>
            <div className="flex-1 px-5 pb-4 overflow-y-auto" style={{ scrollbarWidth: 'thin', maxHeight: 400 }}>
              {data!.activityFeed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 mb-3">
                    <Activity className="h-6 w-6 text-slate-300 dark:text-slate-500" />
                  </div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">All Quiet</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">No recent activity to show</p>
                </div>
              ) : (
                <div className="relative pl-6">
                  <div className="absolute left-[7px] top-2 bottom-2 w-[2px] rounded-full bg-slate-200 dark:bg-slate-700" />
                  {data!.activityFeed.map((item, i) => {
                    const actionType = extractActionType(cleanActivityText(item));
                    const badgeStyle = ACTION_BADGE_STYLE[actionType] || ACTION_BADGE_STYLE.LOG;
                    const { actor, action } = humanizeActivity(item);
                    const rawText = cleanActivityText(item);
                    return (
                      <div
                        key={i}
                        className="relative flex items-start gap-3 py-2.5 group transition-all duration-200 hover:translate-x-1 cursor-default"
                        title={rawText}
                      >
                        <div className={`absolute left-[-23px] top-3.5 h-[8px] w-[8px] rounded-full border-2 border-white dark:border-slate-800 ${
                          actionType === 'DELETED' ? 'bg-red-500' :
                          actionType === 'CREATED' ? 'bg-blue-500' :
                          actionType === 'UPDATED' ? 'bg-amber-500' :
                          actionType === 'ASSIGNED' ? 'bg-emerald-500' : 'bg-[#f8931f]'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                            <span className="text-[#012061] dark:text-slate-100 font-semibold">{actor}</span>{' '}
                            <span>{action}</span>
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-slate-400 tabular-nums">
                              {extractRelativeTime(rawText)}
                            </span>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${badgeStyle}`}>
                              {humanizeActionType(actionType)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </BentoCard>
        );

      default:
        return null;
    }
  }

  return (
    <div className="min-h-dvh bg-[#f1f3f5] dark:bg-slate-900">

      {/* ═══════════════════════════════════════════════════════
          COMMAND CENTER HEADER
          ═══════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-30 bg-[#012061] shadow-[0_1px_0_#f8931f,0_4px_16px_rgba(1,32,97,0.3)]">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          {/* Left: brand + title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f8931f]/15">
              <BarChart3 className="h-5 w-5 text-[#f8931f]" />
            </div>
            <div className="min-w-0 hidden sm:block">
              <h1 className="text-base font-bold text-white tracking-tight leading-none">Command Center</h1>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">AIO System Dashboard</p>
            </div>
          </div>

          {/* Center: live clock */}
          <div className="hidden md:flex items-center gap-2 text-xs text-white/60 bg-white/8 rounded-lg px-3 py-2 tabular-nums font-medium">
            <Clock className="w-3.5 h-3.5 text-[#f8931f]" />
            {now.toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            <span className="text-[#f8931f] font-bold">{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>

          {/* Right: quick actions — primary always visible, secondary collapse on small screens */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            <button onClick={() => navigate('/assets')} title="Go to Assets page" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200">
              <Package className="h-3.5 w-3.5 text-[#f8931f]" />
              <span className="hidden sm:inline">Assets</span>
            </button>
            <button onClick={() => navigate('/assets?action=scan')} title="Scan barcode or QR code" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200">
              <ScanLine className="h-3.5 w-3.5 text-[#f8931f]" />
              <span className="hidden sm:inline">Scan</span>
            </button>

            {/* Secondary actions — hidden on small screens */}
            <button onClick={() => navigate('/audit')} title="View audit log" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200 hidden md:inline-flex">
              <ClipboardList className="h-3.5 w-3.5 text-[#f8931f]" />
              Audit
            </button>
            {/* Live / Paused indicator */}
            <button
              onClick={() => setLiveEnabled(v => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-all duration-300 ${
                liveEnabled
                  ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
              title={liveEnabled ? 'Live refresh enabled — click to pause' : 'Live refresh disabled — click to resume'}
            >
              {isRefreshing ? (
                <RefreshCw className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    liveEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                  }`}
                />
              )}
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                {liveEnabled ? 'Live' : 'Paused'}
              </span>
            </button>
            <button onClick={() => setCustomizeOpen(true)} title="Customize dashboard widgets" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200 hidden md:inline-flex">
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#f8931f]" />
              <span className="hidden lg:inline">Customize</span>
            </button>
            <PermissionGate permissions={['settings:view']}>
              <button onClick={() => navigate('/settings')} title="System settings" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200 hidden md:inline-flex">
                <Settings className="h-3.5 w-3.5 text-[#f8931f]" />
              </button>
            </PermissionGate>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════
          WARRANTY EXPIRY ALERT CARDS
          ═══════════════════════════════════════════════════════ */}
      {warrantyStats && warrantyStats.warrantiesExpiringSoon > 0 && (
        <section className="px-4 sm:px-6 pt-3 pb-1">
          <div className="rounded-xl border-2 border-[#f8931f]/40 bg-gradient-to-r from-[#f8931f]/8 via-[#f8931f]/4 to-transparent dark:from-[#f8931f]/10 dark:via-[#f8931f]/5 dark:to-transparent overflow-hidden">
            <div className="px-5 pt-4 pb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f8931f]/15">
                <AlertTriangle className="h-5 w-5 text-[#f8931f]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[#012061] dark:text-slate-100">
                  ⚠ {warrantyStats.warrantiesExpiringSoon} Warrant{warrantyStats.warrantiesExpiringSoon === 1 ? 'y' : 'ies'} Expiring Within 30 Days
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">These assets will fall out of warranty soon</p>
              </div>
            </div>
            <div className="px-5 pb-3 space-y-1.5">
              {warrantyStats.warrantiesExpiringSoonList.slice(0, 5).map(a => (
                <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg bg-white/60 dark:bg-slate-800/60 px-3 py-2 border border-[#f8931f]/10 dark:border-[#f8931f]/20 gap-1 sm:gap-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{a.name}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">{a.serialNumber || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      Expires: {new Date(a.warrantyExpiry).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      a.status === 'ASSIGNED' ? 'bg-[#f8931f]/10 text-[#f8931f] border border-[#f8931f]/30' :
                      a.status === 'AVAILABLE' ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' :
                      'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600'
                    }`}>
                      {a.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 pb-4 pt-1">
              <button
                onClick={() => navigate('/assets?warrantyExpiring=1')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#f8931f] hover:text-[#e0841a] transition-colors"
              >
                View all expiring warranties <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </section>
      )}

      {warrantyStats && warrantyStats.warrantiesExpired > 0 && (
        <section className="px-4 sm:px-6 pt-3 pb-1">
          <div className="rounded-xl border-2 border-[#7B1113]/40 bg-gradient-to-r from-[#7B1113]/8 via-[#7B1113]/4 to-transparent dark:from-[#7B1113]/10 dark:via-[#7B1113]/5 dark:to-transparent overflow-hidden">
            <div className="px-5 pt-4 pb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#7B1113]/15">
                <ShieldAlert className="h-5 w-5 text-[#7B1113]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[#012061] dark:text-slate-100">
                  {warrantyStats.warrantiesExpired} Warrant{warrantyStats.warrantiesExpired === 1 ? 'y' : 'ies'} Already Expired
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">These assets are past warranty — repairs may not be covered</p>
              </div>
            </div>
            <div className="px-5 pb-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {warrantyStats.warrantiesExpired} active asset{warrantyStats.warrantiesExpired !== 1 ? 's' : ''} with expired warranties.{' '}
                <button onClick={() => navigate('/assets?warrantyExpired=1')} className="inline-flex items-center gap-1 text-[#7B1113] font-semibold hover:underline">
                  View expired warranties <ArrowRight className="w-3 h-3" />
                </button>
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          KPI POWER TILES
          ═══════════════════════════════════════════════════════ */}
      <section className="px-4 sm:px-6 pt-4 pb-1">
        <KpiBar />
      </section>

      {/* ═══════════════════════════════════════════════════════
          DASHBOARD CONTENT
          ═══════════════════════════════════════════════════════ */}
      <div className="px-4 sm:px-6 pb-8">
        {loading || !data ? (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-64 rounded-xl bg-white dark:bg-slate-800 animate-pulse border border-slate-100 dark:border-slate-700" />
            ))}
          </div>
        ) : (
          <div className="space-y-4 mt-1">
            {/* Filter visible widgets in preference order */}
            {(() => {
              const visible = widgetPrefs.filter(p => p.visible);
              if (visible.length === 0) {
                return (
                  <BentoCard className="flex flex-col items-center justify-center py-16">
                    <SlidersHorizontal className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No widgets enabled</p>
                    <p className="text-xs text-slate-400 mt-1">Click "Customize" to add widgets</p>
                  </BentoCard>
                );
              }
              // Chunk into rows of 3
              const rows: WidgetPref[][] = [];
              for (let i = 0; i < visible.length; i += 3) {
                rows.push(visible.slice(i, i + 3));
              }
              return rows.map((row, rowIdx) => (
                <div key={rowIdx} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {row.map(pref => (
                    <Fragment key={pref.id}>{renderWidget(pref.id)}</Fragment>
                  ))}
                </div>
              ));
            })()}
          </div>
        )}
      </div>

      {/* Customize Panel */}
      {customizeOpen && (
        <CustomizePanel
          prefs={widgetPrefs}
          onSave={(newPrefs) => {
            saveWidgetPrefs(newPrefs);
            setWidgetPrefs(newPrefs);
          }}
          onClose={() => setCustomizeOpen(false)}
        />
      )}
    </div>
  );
}
