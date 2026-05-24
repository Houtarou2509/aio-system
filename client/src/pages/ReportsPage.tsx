import { useState, useEffect } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  BarChart3, DollarSign, Wrench,
  TrendingUp, Download, Package,
  CalendarDays, Filter, Loader2,
} from 'lucide-react';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

/* ── Data interfaces ──────────────────────────────────────── */

interface ValuationData {
  totalAssets: number;
  totalPurchasePrice: number;
  averagePrice: number;
  assetsWithPrice: number;
  byType: { type: string; count: number; totalPrice: number }[];
  byStatus: { status: string; count: number }[];
}

interface UtilizationData {
  topUtilized: { assetId: string; name: string; type: string; checkoutCount: number; avgDurationDays: number; uniqueAssignees: number }[];
}

interface MaintenanceCostData {
  totalMaintenanceCount: number;
  totalCost: number;
  averageCost: number;
  byAsset: { assetId: string; name: string; totalCost: number; maintenanceCount: number; purchasePrice: number; costRatio: number }[];
}

interface AgeStat {
  label: string;
  count: number;
}

interface MaintenanceCostSummary {
  totalCost: number;
  totalLogs: number;
  avgCostPerAsset: number;
  topCostAssets: { assetId: string; assetName: string; serialNumber: string | null; totalCost: number }[];
  costByAssetType: { type: string; totalCost: number; logCount: number }[];
}

/* ── Shared primitives ────────────────────────────────────── */

function BentoCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] dark:shadow-none overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function BentoCardTitle({ icon: Icon, children, accent = '#014da3', onExport }: { icon: React.ElementType; children: React.ReactNode; accent?: string; onExport?: () => void }) {
  return (
    <div className="px-5 pt-4 pb-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}15` }}>
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
        <h3 className="text-xs font-bold tracking-widest uppercase text-slate-500 dark:text-slate-400">{children}</h3>
      </div>
      <div className="flex items-center gap-2">
        {onExport && (
          <button onClick={onExport} className="p-1.5 rounded-md text-slate-300 hover:text-[#f8931f] hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="Export CSV">
            <Download className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="h-[3px] w-8 rounded-full" style={{ backgroundColor: accent }} />
      </div>
    </div>
  );
}

function Skeleton({ h = 'h-64' }: { h?: string }) {
  return <div className={`${h} rounded-xl bg-white dark:bg-slate-800 animate-pulse border border-slate-100 dark:border-slate-700`} />;
}

function StatRow({ label, value, highlight, subtitle }: { label: string; value: string; highlight?: boolean; subtitle?: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
        {subtitle && <span className="text-[10px] text-slate-300 dark:text-slate-600 ml-1">{subtitle}</span>}
      </div>
      <span className={`text-xs font-bold tabular-nums ${highlight ? 'text-[#f8931f]' : 'text-slate-700 dark:text-slate-300'}`}>{value}</span>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: '#012061',
  ASSIGNED: '#f8931f',
  MAINTENANCE: '#94a3b8',
  RETIRED: '#cbd5e1',
  LOST: '#ef4444',
};

function formatPeso(value: number): string {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ── CSV helpers ───────────────────────────────────────────── */

function triggerCsv(filename: string, headers: string[], rows: string[][]) {
  const esc = (v: string) => v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ═════════════════════════════════════════════════════════════
   REPORTS PAGE — analytics-only, no dashboard duplication
   ═════════════════════════════════════════════════════════════ */

export default function ReportsPage() {
  const [valuation, setValuation] = useState<ValuationData | null>(null);
  const [utilization, setUtilization] = useState<UtilizationData | null>(null);
  const [maintenanceCosts, setMaintenanceCosts] = useState<MaintenanceCostData | null>(null);
  const [ageStats, setAgeStats] = useState<AgeStat[]>([]);
  const [loading, setLoading] = useState(true);

  // System-wide maintenance cost summary (Phase 5-B)
  const [costSummary, setCostSummary] = useState<MaintenanceCostSummary | null>(null);
  const [costSummaryLoading, setCostSummaryLoading] = useState(false);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterAssetType, setFilterAssetType] = useState('');

  const fetchCostSummary = async () => {
    setCostSummaryLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const params = new URLSearchParams();
      if (filterFrom) params.set('from', filterFrom);
      if (filterTo) params.set('to', filterTo);
      if (filterAssetType) params.set('assetType', filterAssetType);
      const qs = params.toString();
      const res = await fetch(`/api/maintenance/cost-summary${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.success) setCostSummary(result.data);
    } catch { /* ignore */ }
    finally { setCostSummaryLoading(false); }
  };

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const h = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch('/api/reports/inventory-valuation', { headers: h }).then(r => r.json()),
      fetch('/api/reports/asset-utilization', { headers: h }).then(r => r.json()),
      fetch('/api/reports/maintenance-costs', { headers: h }).then(r => r.json()),
      fetch('/api/dashboard/age-stats', { headers: h }).then(r => r.json()),
    ])
      .then(([v, u, m, a]) => {
        if (v.success) setValuation(v.data);
        if (u.success) setUtilization(u.data);
        if (m.success) setMaintenanceCosts(m.data);
        if (a.success) setAgeStats(a.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Fetch system-wide cost summary on mount and when filters change
  useEffect(() => {
    fetchCostSummary();
  }, [filterFrom, filterTo, filterAssetType]);

  /* ── Export handlers ───────────────────────────────────── */

  const exportValuation = () => {
    if (!valuation) return;
    triggerCsv(
      `inventory-valuation-${new Date().toISOString().split('T')[0]}.csv`,
      ['Type', 'Count', 'Total Value'],
      valuation.byType.map(t => [t.type, String(t.count), String(t.totalPrice)]),
    );
  };

  const exportUtilization = () => {
    if (!utilization) return;
    triggerCsv(
      `asset-utilization-${new Date().toISOString().split('T')[0]}.csv`,
      ['Asset', 'Type', 'Checkouts', 'Avg Duration (Days)', 'Unique Assignees'],
      utilization.topUtilized.map(a => [a.name, a.type, String(a.checkoutCount), String(a.avgDurationDays), String(a.uniqueAssignees)]),
    );
  };

  const exportMaintenance = () => {
    if (!maintenanceCosts) return;
    triggerCsv(
      `maintenance-costs-${new Date().toISOString().split('T')[0]}.csv`,
      ['Asset', 'Total Cost', 'Entries', 'Purchase Price', 'Cost Ratio %'],
      maintenanceCosts.byAsset.map(a => [a.name, String(a.totalCost), String(a.maintenanceCount), String(a.purchasePrice), String(Math.round(a.costRatio))]),
    );
  };

  const exportCostSummary = () => {
    if (!costSummary) return;
    triggerCsv(
      `maintenance-summary-${new Date().toISOString().split('T')[0]}.csv`,
      ['Asset', 'Serial No.', 'Total Cost'],
      costSummary.topCostAssets.map(a => [a.assetName, a.serialNumber || '', String(a.totalCost)]),
    );
  };

  /* ── Chart configs ────────────────────────────────────── */

  const chartCommon = { responsive: true, maintainAspectRatio: false };

  const legendOpts = {
    position: 'bottom' as const,
    labels: {
      boxWidth: 10, padding: 12,
      font: { size: 10 }, color: '#64748b',
      usePointStyle: true, pointStyleWidth: 8,
    },
  };

  const tooltipOpts = {
    backgroundColor: '#012061',
    titleFont: { size: 11 },
    bodyFont: { size: 11 },
    padding: 10,
    cornerRadius: 8,
  };

  return (
    <div className="min-h-dvh bg-[#f1f3f5] dark:bg-slate-900">
      {/* ═══ NAVY HEADER ══════════════════════════════════ */}
      <header className="sticky top-0 z-30 bg-[#012061] shadow-[0_1px_0_#f8931f,0_4px_16px_rgba(1,32,97,0.3)]">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f8931f]/15">
              <BarChart3 className="h-5 w-5 text-[#f8931f]" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">Reports</h1>
              <p className="text-[11px] text-slate-400 font-medium">Analytics & Financial Insights</p>
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-6 py-4">
        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Skeleton h="h-[420px]" /><Skeleton h="h-[420px]" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Skeleton h="h-[380px]" /><Skeleton h="h-[380px]" />
            </div>
          </div>
        ) : (
          <div className="space-y-4">

            {/* ═══ ROW 1: Valuation + Utilization ═══════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* ── Inventory Valuation ───────────────────── */}
              <BentoCard>
                <BentoCardTitle icon={DollarSign} accent="#014da3" onExport={exportValuation}>Inventory Valuation</BentoCardTitle>
                <div className="px-5 pb-5">
                  {valuation ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Stats */}
                      <div className="space-y-2">
                        <StatRow label="Total Assets" value={valuation.totalAssets.toString()} />
                        <StatRow label="Total Value" value={`₱${valuation.totalPurchasePrice.toLocaleString()}`} highlight />
                        <StatRow label="Avg Price" value={`₱${Math.round(valuation.averagePrice).toLocaleString()}`} subtitle={`(${valuation.assetsWithPrice} priced)`} />
                        <div className="mt-2">
                          <div className="text-[10px] tracking-widest text-slate-400 uppercase font-semibold mb-1.5">Value by Type</div>
                          {valuation.byType
                            .filter(t => t.totalPrice > 0)
                            .sort((a, b) => b.totalPrice - a.totalPrice)
                            .map(t => (
                              <div key={t.type} className="flex items-center justify-between py-1 border-b border-slate-50 dark:border-slate-700/30 last:border-0">
                                <span className="text-xs text-slate-600 dark:text-slate-400">{t.type} ({t.count})</span>
                                <span className="text-xs font-semibold text-[#012061] dark:text-slate-200">₱{t.totalPrice.toLocaleString()}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                      {/* Chart */}
                      <div className="h-52">
                        {valuation.byStatus.length > 0 ? (
                          <Doughnut
                            data={{
                              labels: valuation.byStatus.map(s => s.status),
                              datasets: [{
                                data: valuation.byStatus.map(s => s.count),
                                backgroundColor: valuation.byStatus.map(s => STATUS_COLORS[s.status] || '#94a3b8'),
                                borderWidth: 0,
                              }],
                            }}
                            options={{ ...chartCommon, plugins: { legend: legendOpts, tooltip: tooltipOpts } }}
                          />
                        ) : (
                          <p className="text-xs text-slate-400 italic text-center py-10">No data</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic py-8 text-center">No valuation data yet</p>
                  )}
                </div>
              </BentoCard>

              {/* ── Asset Utilization ──────────────────────── */}
              <BentoCard>
                <BentoCardTitle icon={TrendingUp} accent="#014da3" onExport={exportUtilization}>Top Utilized Assets</BentoCardTitle>
                <div className="px-5 pb-5">
                  {utilization && utilization.topUtilized.length > 0 ? (
                    <div className="h-[340px]">
                      <Bar
                        data={{
                          labels: utilization.topUtilized.map(a => a.name.length > 20 ? a.name.slice(0, 19) + '…' : a.name),
                          datasets: [{
                            label: 'Checkouts',
                            data: utilization.topUtilized.map(a => a.checkoutCount),
                            backgroundColor: '#012061',
                            borderWidth: 0,
                            borderRadius: 3,
                          }],
                        }}
                        options={{
                          indexAxis: 'y',
                          ...chartCommon,
                          plugins: {
                            legend: { display: false },
                            tooltip: {
                              ...tooltipOpts,
                              callbacks: {
                                afterLabel: (ctx: any) => {
                                  const item = utilization.topUtilized[ctx.dataIndex];
                                  return [
                                    `Avg duration: ${item.avgDurationDays}d`,
                                    `Unique assignees: ${item.uniqueAssignees}`,
                                  ];
                                },
                              },
                            },
                          },
                          scales: {
                            x: { beginAtZero: true, ticks: { stepSize: 1, color: '#64748b', font: { size: 10 } }, grid: { color: '#e2e8f0' } },
                            y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } },
                          },
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic py-16 text-center">No checkout history yet</p>
                  )}
                </div>
              </BentoCard>
            </div>

            {/* ═══ ROW 2: Maintenance + Asset Age ══════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* ── Maintenance Cost Analysis ─────────────── */}
              <BentoCard>
                <BentoCardTitle icon={Wrench} accent="#014da3" onExport={exportMaintenance}>Maintenance Cost Analysis</BentoCardTitle>
                <div className="px-5 pb-5">
                  {maintenanceCosts && maintenanceCosts.totalCost > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Summary */}
                      <div className="space-y-2">
                        <StatRow label="Total Spend" value={`₱${maintenanceCosts.totalCost.toLocaleString()}`} highlight />
                        <StatRow label="Events" value={maintenanceCosts.totalMaintenanceCount.toString()} />
                        <StatRow label="Avg / Event" value={`₱${Math.round(maintenanceCosts.averageCost).toLocaleString()}`} />
                        <div className="mt-2">
                          <div className="text-[10px] tracking-widest text-slate-400 uppercase font-semibold mb-1.5">Cost Ratio Warnings</div>
                          {maintenanceCosts.byAsset.filter(a => a.costRatio > 50).length === 0 ? (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400">All assets under 50% cost ratio</p>
                          ) : (
                            maintenanceCosts.byAsset.filter(a => a.costRatio > 50).map(a => (
                              <div key={a.assetId} className="flex items-center justify-between py-1 text-xs">
                                <span className="text-slate-600 dark:text-slate-400 truncate mr-2">{a.name}</span>
                                <span className="text-[#7B1113] font-semibold shrink-0">{Math.round(a.costRatio)}%</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      {/* Chart */}
                      <div className="h-52">
                        <Bar
                          data={{
                            labels: maintenanceCosts.byAsset.map(a => a.name.length > 14 ? a.name.slice(0, 13) + '…' : a.name),
                            datasets: [{
                              label: 'Cost (₱)',
                              data: maintenanceCosts.byAsset.map(a => a.totalCost),
                              backgroundColor: maintenanceCosts.byAsset.map(a => a.costRatio > 50 ? '#7B1113' : '#f8931f'),
                              borderWidth: 0,
                              borderRadius: 3,
                            }],
                          }}
                          options={{
                            ...chartCommon,
                            plugins: { legend: { display: false }, tooltip: tooltipOpts },
                            scales: {
                              y: { beginAtZero: true, ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#e2e8f0' } },
                              x: { ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 45 }, grid: { display: false } },
                            },
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic py-8 text-center">No maintenance data yet</p>
                  )}
                </div>
              </BentoCard>

              {/* ── Asset Age Distribution ────────────────── */}
              <BentoCard>
                <BentoCardTitle icon={Package} accent="#014da3">Age Distribution</BentoCardTitle>
                <div className="px-5 pb-5">
                  {ageStats.length > 0 ? (
                    <div className="h-[320px] flex items-center justify-center">
                      <Doughnut
                        data={{
                          labels: ageStats.map(a => a.label),
                          datasets: [{
                            data: ageStats.map(a => a.count),
                            backgroundColor: ['#012061', '#f8931f', '#94a3b8', '#14b8a6', '#64748b', '#0ea5e9'],
                            borderWidth: 0,
                            hoverBorderWidth: 2,
                            hoverBorderColor: '#ffffff',
                          }],
                        }}
                        options={{
                          ...chartCommon,
                          plugins: {
                            legend: legendOpts,
                            tooltip: {
                              ...tooltipOpts,
                              callbacks: {
                                label: (ctx: any) => `${ctx.label}: ${ctx.raw} asset${ctx.raw !== 1 ? 's' : ''}`,
                              },
                            },
                          },
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic py-20 text-center">No purchase date data available</p>
                  )}
                </div>
              </BentoCard>
            </div>

            {/* ═══ ROW 3: Maintenance Costs (system-wide summary) ═══ */}
            <BentoCard>
              <BentoCardTitle icon={DollarSign} accent="#012061" onExport={exportCostSummary}>Maintenance Costs Summary</BentoCardTitle>
              <div className="px-5 pb-5">
                {/* ── Date Range Filter ─── */}
                <div className="flex flex-wrap items-end gap-3 mb-4 pb-4 border-b border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <Filter className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-semibold tracking-widest uppercase">Filters</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">From</label>
                    <input
                      type="date"
                      value={filterFrom}
                      onChange={e => setFilterFrom(e.target.value)}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#012061]/20 focus:border-[#012061]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">To</label>
                    <input
                      type="date"
                      value={filterTo}
                      onChange={e => setFilterTo(e.target.value)}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#012061]/20 focus:border-[#012061]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Asset Type</label>
                    <input
                      type="text"
                      placeholder="e.g. Laptop"
                      value={filterAssetType}
                      onChange={e => setFilterAssetType(e.target.value)}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#012061]/20 focus:border-[#012061] w-28"
                    />
                  </div>
                  {(filterFrom || filterTo || filterAssetType) && (
                    <button
                      onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterAssetType(''); }}
                      className="text-[10px] text-[#7B1113] hover:underline font-medium"
                    >
                      Clear filters
                    </button>
                  )}
                </div>

                {costSummaryLoading ? (
                  <div className="flex items-center justify-center py-12 text-sm text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Loading cost summary…
                  </div>
                ) : costSummary ? (
                  <div className="space-y-5">
                    {/* ── Summary Cards ─── */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-xl bg-[#012061] px-4 py-3 text-white shadow-sm">
                        <div className="flex items-center gap-1.5 mb-1">
                          <DollarSign className="w-3.5 h-3.5 text-white/60" />
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/60">Total Spend</span>
                        </div>
                        <p className="text-xl font-bold">{formatPeso(costSummary.totalCost)}</p>
                      </div>
                      <div className="rounded-xl bg-[#012061] px-4 py-3 text-white shadow-sm">
                        <div className="flex items-center gap-1.5 mb-1">
                          <CalendarDays className="w-3.5 h-3.5 text-white/60" />
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/60">Total Logs</span>
                        </div>
                        <p className="text-xl font-bold">{costSummary.totalLogs.toLocaleString()}</p>
                      </div>
                      <div className="rounded-xl bg-[#012061] px-4 py-3 text-white shadow-sm">
                        <div className="flex items-center gap-1.5 mb-1">
                          <TrendingUp className="w-3.5 h-3.5 text-white/60" />
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/60">Avg per Asset</span>
                        </div>
                        <p className="text-xl font-bold">{formatPeso(costSummary.avgCostPerAsset)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* ── Top 10 Most Expensive Assets ─── */}
                      <div>
                        <div className="text-[10px] tracking-widest text-slate-400 uppercase font-semibold mb-2">
                          Top 10 Most Expensive Assets
                        </div>
                        {costSummary.topCostAssets.length > 0 ? (
                          <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-[#012061]">
                                  <th className="text-left text-white/70 uppercase tracking-widest text-[10px] font-semibold px-3 py-2">Asset</th>
                                  <th className="text-left text-white/70 uppercase tracking-widest text-[10px] font-semibold px-3 py-2">Serial No.</th>
                                  <th className="text-right text-white/70 uppercase tracking-widest text-[10px] font-semibold px-3 py-2">Total Cost</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {costSummary.topCostAssets.map((a, i) => (
                                  <tr key={a.assetId} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                                      <span className="text-slate-400 mr-1.5">{i + 1}.</span>
                                      {a.assetName}
                                    </td>
                                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 font-mono text-[11px]">{a.serialNumber || '—'}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-[#f8931f]">{formatPeso(a.totalCost)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic py-6 text-center">No assets with maintenance costs</p>
                        )}
                      </div>

                      {/* ── Cost by Asset Type ─── */}
                      <div>
                        <div className="text-[10px] tracking-widest text-slate-400 uppercase font-semibold mb-2">
                          Cost by Asset Type
                        </div>
                        {costSummary.costByAssetType.length > 0 ? (
                          <div className="space-y-2">
                            {costSummary.costByAssetType.map(t => {
                              const pct = costSummary.totalCost > 0 ? (t.totalCost / costSummary.totalCost) * 100 : 0;
                              return (
                                <div key={t.type} className="rounded-lg border border-slate-100 dark:border-slate-700 p-3">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t.type}</span>
                                    <span className="text-xs font-bold text-[#f8931f]">{formatPeso(t.totalCost)}</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-[#012061] rounded-full transition-all"
                                      style={{ width: `${Math.min(pct, 100)}%` }}
                                    />
                                  </div>
                                  <div className="flex justify-between mt-1">
                                    <span className="text-[10px] text-slate-400">{t.logCount} log{t.logCount !== 1 ? 's' : ''}</span>
                                    <span className="text-[10px] text-slate-400">{pct.toFixed(1)}%</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic py-6 text-center">No cost data by type</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic py-8 text-center">Unable to load maintenance cost summary</p>
                )}
              </div>
            </BentoCard>
          </div>
        )}
      </div>
    </div>
  );
}