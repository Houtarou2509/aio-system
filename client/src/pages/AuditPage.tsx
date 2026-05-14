import { useState, useEffect } from 'react';
import { auditApi, AuditLogEntry, AuditFilters } from '../lib/api';
import { RoleGate, PermissionGate } from '../components/auth';
import {
  History,
  PlusCircle,
  Pencil,
  Trash2,
  ArrowRightLeft,
  RotateCcw,
  Eye,
  Loader2,
  Download,
  Monitor,
  Smartphone,
  Tablet,
  ChevronDown,
  ChevronRight,
  X,
  Calendar,
} from 'lucide-react';

/* ─── Action Config ─── */
const ACTION_CONFIG: Record<string, { icon: React.ElementType; accent: string; bg: string; label: string }> = {
  CREATE: { icon: PlusCircle, accent: 'border-l-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950', label: 'Created' },
  UPDATE: { icon: Pencil, accent: 'border-l-blue-400', bg: 'bg-blue-50 dark:bg-blue-950', label: 'Updated' },
  DELETE: { icon: Trash2, accent: 'border-l-red-400', bg: 'bg-red-50 dark:bg-red-950', label: 'Deleted' },
  SOFT_DELETE: { icon: Trash2, accent: 'border-l-red-400', bg: 'bg-red-50 dark:bg-red-950', label: 'Deleted' },
  CHECKOUT: { icon: ArrowRightLeft, accent: 'border-l-purple-400', bg: 'bg-purple-50', label: 'Checked Out' },
  RETURN: { icon: ArrowRightLeft, accent: 'border-l-amber-400', bg: 'bg-amber-50 dark:bg-amber-950', label: 'Returned' },
  REVERT: { icon: RotateCcw, accent: 'border-l-orange-400', bg: 'bg-orange-50', label: 'Reverted' },
  APPROVE: { icon: PlusCircle, accent: 'border-l-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950', label: 'Approved' },
  DENY: { icon: Trash2, accent: 'border-l-red-400', bg: 'bg-red-50 dark:bg-red-950', label: 'Denied' },
  REQUEST: { icon: ArrowRightLeft, accent: 'border-l-blue-400', bg: 'bg-blue-50 dark:bg-blue-950', label: 'Requested' },
};

/* ─── Severity Badge ─── */
function SeverityBadge({ severity }: { severity?: string | null }) {
  if (!severity || severity === 'LOW') {
    return <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600">LOW</span>;
  }
  if (severity === 'MEDIUM') {
    return <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-200">MED</span>;
  }
  return <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-200">HIGH</span>;
}

/* ─── UA Parser (lightweight, no deps) ─── */
interface ParsedUA { browser: string; os: string; device: 'Desktop' | 'Mobile' | 'Tablet' }

function parseUA(ua: string | null | undefined): ParsedUA {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Desktop' };
  let browser = 'Unknown', os = 'Unknown', device: ParsedUA['device'] = 'Desktop';

  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';

  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Android')) { os = 'Android'; device = 'Mobile'; }
  else if (ua.includes('iPhone')) { os = 'iOS'; device = 'Mobile'; }
  else if (ua.includes('iPad')) { os = 'iPadOS'; device = 'Tablet'; }
  else if (ua.includes('Linux')) os = 'Linux';

  return { browser, os, device };
}

function DeviceIcon({ device }: { device: ParsedUA['device'] }) {
  if (device === 'Mobile') return <Smartphone className="w-3 h-3 text-slate-400" />;
  if (device === 'Tablet') return <Tablet className="w-3 h-3 text-slate-400" />;
  return <Monitor className="w-3 h-3 text-slate-400" />;
}

/* ─── Main Component ─── */
export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AuditFilters>({});
  const [meta, setMeta] = useState<any>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await auditApi.list({ ...filters, page: filters.page || 1, limit: 20 });
      setLogs(res.data);
      setMeta(res.meta);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(); }, [filters]);

  const handleRevert = async (id: string) => {
    if (!confirm('Revert this change? This will restore the old value.')) return;
    try {
      await auditApi.revert(id);
      fetchLogs();
    } catch (e: any) { alert(e.message); }
  };

  const handleExport = () => { auditApi.exportCsv(filters); };

  const hasActiveFilters = filters.entityType || filters.action || filters.severity || filters.dateFrom || filters.dateTo || filters.module;

  return (
    <div className="flex flex-col h-screen pt-14 md:pt-0 bg-[#012061] md:bg-transparent">

      {/* ═══ STICKY NAVY HEADER ═════════════════════════════ */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Title */}
          <div className="flex items-center gap-3">
            <History className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">Audit Trail</h1>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button onClick={handleExport}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        </div>
      </header>

      {/* ═══ CONTENT AREA ════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-auto bg-light-bg dark:bg-slate-900">

      {/* ═══ HORIZONTAL FILTER BAR ══════════════════════════ */}
      <section className="px-6 pt-3 pb-2 shrink-0">
        <div className="flex flex-row items-center gap-3 flex-wrap bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5">
          {/* Entity Type */}
          <select
            value={filters.entityType || ''}
            onChange={(e) => setFilters({ ...filters, entityType: e.target.value || undefined, page: 1 })}
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 h-8 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
          >
            <option value="">Type: All</option>
            <option value="Asset">Type: Asset</option>
            <option value="Assignment">Type: Assignment</option>
            <option value="MaintenanceLog">Type: Maintenance</option>
            <option value="Personnel">Type: Personnel</option>
            <option value="User">Type: User</option>
          </select>

          {/* Module */}
          <select
            value={filters.module || ''}
            onChange={(e) => setFilters({ ...filters, module: e.target.value || undefined, page: 1 })}
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 h-8 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
          >
            <option value="">Module: All</option>
            <option value="INVENTORY">Module: Inventory</option>
            <option value="ACCOUNTABILITY">Module: Accountability</option>
            <option value="SYSTEM">Module: System</option>
          </select>

          {/* Action */}
          <select
            value={filters.action || ''}
            onChange={(e) => setFilters({ ...filters, action: e.target.value || undefined, page: 1 })}
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 h-8 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
          >
            <option value="">Action: All</option>
            <option value="CREATE">Action: Create</option>
            <option value="UPDATE">Action: Update</option>
            <option value="DELETE">Action: Delete</option>
            <option value="CHECKOUT">Action: Checkout</option>
            <option value="RETURN">Action: Return</option>
            <option value="REVERT">Action: Revert</option>
          </select>

          {/* Severity */}
          <select
            value={filters.severity || ''}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value || undefined, page: 1 })}
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 h-8 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
          >
            <option value="">Severity: All</option>
            <option value="HIGH">Severity: High</option>
            <option value="MEDIUM">Severity: Medium</option>
            <option value="LOW">Severity: Low</option>
          </select>

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="date"
              value={filters.dateFrom ? filters.dateFrom.split('T')[0] : ''}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined, page: 1 })}
              className="w-[120px] rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1.5 text-[10px] text-slate-700 dark:text-slate-300 h-8 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
            />
            <span className="text-slate-400 text-[10px]">-</span>
            <input
              type="date"
              value={filters.dateTo ? filters.dateTo.split('T')[0] : ''}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined, page: 1 })}
              className="w-[120px] rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1.5 text-[10px] text-slate-700 dark:text-slate-300 h-8 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
            />
          </div>

          {/* Clear */}
          {hasActiveFilters && (
            <button onClick={() => setFilters({ page: 1 })} className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#012061] dark:text-slate-100 hover:underline shrink-0">
              <X className="h-3 w-3" /> Clear All
            </button>
          )}
        </div>
      </section>

      {/* ═══ TABLE ══════════════════════════════════════════ */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 text-slate-400 animate-spin" /></div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#f8931f]/10 mb-4">
              <History className="h-10 w-10 text-[#f8931f]" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">No audit logs</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">No activity has been recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#012061] text-left">
                  <th className="px-3 py-2.5 w-8" />
                  <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Action</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Asset Name</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Serial #</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Summary</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">By / Device</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Date</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {logs.map((l) => {
                  const conf = ACTION_CONFIG[l.action] || { icon: Eye, accent: 'border-l-slate-400', bg: 'bg-slate-50 dark:bg-slate-900', label: l.action };
                  const Icon = conf.icon;
                  const ua = parseUA(l.userAgent);
                  const isExpanded = expandedRow === l.id;
                  return (
                    <>
                      <tr key={l.id} className={`bg-white dark:bg-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-all cursor-pointer group ${isExpanded ? 'bg-slate-50 dark:bg-slate-900' : ''}`}
                        onClick={() => setExpandedRow(isExpanded ? null : l.id)}>
                        {/* Expand chevron */}
                        <td className="px-3 py-3">
                          {l.field && l.field !== '*' && (
                            isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-white/50" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </td>

                        {/* Action + Module + Severity */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${conf.bg}`}>
                              <Icon className="w-2.5 h-2.5" />{conf.label}
                            </span>
                            {(l as any).module && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${(l as any).module === 'INVENTORY' ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-200 border-blue-200' : (l as any).module === 'ACCOUNTABILITY' ? 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-200 border-amber-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200'}`}>
                                {(l as any).module}
                              </span>
                            )}
                            <SeverityBadge severity={l.severity} />
                          </div>
                        </td>

                        {/* Asset Name */}
                        <td className="px-3 py-3">
                          <span className="text-sm font-semibold text-[#012061] dark:text-slate-100">
                            {l.assetName || <span className="text-slate-400 italic text-xs">N/A (Deleted)</span>}
                          </span>
                        </td>

                        {/* Serial Number */}
                        <td className="px-3 py-3">
                          <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                            {l.serialNumber || <span className="text-slate-400 italic">—</span>}
                          </span>
                        </td>

                        {/* Summary */}
                        <td className="px-3 py-3 max-w-xs">
                          {l.summary ? (
                            <span className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{l.summary}</span>
                          ) : l.field && l.field !== '*' ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400">{l.field}: {l.oldValue || '—'} → {l.newValue || '—'}</span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>

                        {/* By + Device */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <DeviceIcon device={ua.device} />
                            <div>
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{(l.performedBy as any)?.username || 'system'}</span>
                              {ua.browser !== 'Unknown' && (
                                <span className="text-[10px] text-slate-400 ml-1">{ua.browser}</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Date */}
                        <td className="px-3 py-3">
                          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{new Date(l.performedAt).toLocaleDateString()}</div>
                          <div className="text-[10px] text-slate-400 tabular-nums">{new Date(l.performedAt).toLocaleTimeString()}</div>
                        </td>

                        {/* Revert */}
                        <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <PermissionGate permissions={['audit:export']}>
                            {l.field && l.field !== '*' && l.oldValue !== null && String(l.oldValue) !== String(l.newValue) && (
                              <button onClick={() => handleRevert(l.id)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-[#f8931f] hover:underline transition-colors">
                                <RotateCcw className="w-3 h-3" /> Revert
                              </button>
                            )}
                          </PermissionGate>
                        </td>
                      </tr>

                      {/* Expanded Technical View */}
                      {isExpanded && (
                        <tr key={`${l.id}-detail`} className="bg-slate-50 dark:bg-slate-700/30">
                          <td colSpan={8} className="px-6 py-3">
                            <div className="flex gap-6 text-xs">
                              <div className="space-y-1 min-w-0">
                                <span className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">Technical View</span>
                                {l.field && l.field !== '*' && (
                                  <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-700">
                                    <span className="font-medium text-slate-600 dark:text-slate-400">{l.field}:</span>
                                    <span className="line-through text-red-500">{l.oldValue || '—'}</span>
                                    <span className="text-slate-400">→</span>
                                    <span className="text-emerald-600">{l.newValue || '—'}</span>
                                  </div>
                                )}
                                {l.oldImageUrl && (
                                  <div className="flex items-center gap-2">
                                    <a href={l.oldImageUrl} target="_blank" rel="noopener noreferrer" className="group">
                                      <img src={l.oldImageUrl} alt="Previous" className="h-12 w-12 rounded object-cover border border-slate-200 dark:border-slate-700 group-hover:border-[#f8931f] transition-colors" />
                                    </a>
                                    <span className="text-slate-400">Previous image</span>
                                  </div>
                                )}
                              </div>
                              <div className="space-y-1">
                                <span className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">Device & Network</span>
                                <div className="bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-700 space-y-0.5">
                                  <div><span className="text-slate-500 dark:text-slate-400">Browser:</span> <span className="font-medium">{ua.browser}</span></div>
                                  <div><span className="text-slate-500 dark:text-slate-400">OS:</span> <span className="font-medium">{ua.os}</span></div>
                                  <div><span className="text-slate-500 dark:text-slate-400">Device:</span> <span className="font-medium">{ua.device}</span></div>
                                  {l.ipAddress && <div><span className="text-slate-500 dark:text-slate-400">IP:</span> <span className="font-mono font-medium">{l.ipAddress}</span></div>}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <span className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">Entity</span>
                                <div className="bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-700 space-y-0.5">
                                  <div><span className="text-slate-500 dark:text-slate-400">Type:</span> <span className="font-medium">{l.entityType}</span></div>
                                  <div><span className="text-slate-500 dark:text-slate-400">ID:</span> <span className="font-mono font-medium text-[10px]">{l.entityId}</span></div>
                                  <div><span className="text-slate-500 dark:text-slate-400">Severity:</span> <SeverityBadge severity={l.severity} /></div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ PAGINATION ════════════════════════════════════ */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 border-t border-slate-200 dark:border-slate-700 px-6 py-2 shrink-0 bg-white dark:bg-slate-800">
          <button className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            disabled={meta.page <= 1} onClick={() => setFilters({ ...filters, page: meta.page - 1 })}>Prev</button>
          <span className="text-sm text-slate-500 dark:text-slate-400">Page {meta.page} of {meta.totalPages}</span>
          <button className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            disabled={meta.page >= meta.totalPages} onClick={() => setFilters({ ...filters, page: meta.page + 1 })}>Next</button>
        </div>
      )}
      </div>{/* close content area */}
    </div>
  );
}