import { useState, useEffect } from 'react';
import { auditApi, AuditLogEntry, AuditFilters } from '../lib/api';
import { RoleGate } from '../components/auth';
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
  CREATE: { icon: PlusCircle, accent: 'border-l-emerald-400', bg: 'bg-emerald-50', label: 'Created' },
  UPDATE: { icon: Pencil, accent: 'border-l-blue-400', bg: 'bg-blue-50', label: 'Updated' },
  DELETE: { icon: Trash2, accent: 'border-l-red-400', bg: 'bg-red-50', label: 'Deleted' },
  SOFT_DELETE: { icon: Trash2, accent: 'border-l-red-400', bg: 'bg-red-50', label: 'Deleted' },
  CHECKOUT: { icon: ArrowRightLeft, accent: 'border-l-purple-400', bg: 'bg-purple-50', label: 'Checked Out' },
  RETURN: { icon: ArrowRightLeft, accent: 'border-l-amber-400', bg: 'bg-amber-50', label: 'Returned' },
  REVERT: { icon: RotateCcw, accent: 'border-l-orange-400', bg: 'bg-orange-50', label: 'Reverted' },
  APPROVE: { icon: PlusCircle, accent: 'border-l-emerald-400', bg: 'bg-emerald-50', label: 'Approved' },
  DENY: { icon: Trash2, accent: 'border-l-red-400', bg: 'bg-red-50', label: 'Denied' },
  REQUEST: { icon: ArrowRightLeft, accent: 'border-l-blue-400', bg: 'bg-blue-50', label: 'Requested' },
};

/* ─── Severity Badge ─── */
function SeverityBadge({ severity }: { severity?: string | null }) {
  if (!severity || severity === 'LOW') {
    return <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">LOW</span>;
  }
  if (severity === 'MEDIUM') {
    return <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">MED</span>;
  }
  return <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">HIGH</span>;
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
    <div className="min-h-screen bg-white">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <History className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">Audit Trail</h1>
          </div>
        </div>
      </header>

      {/* ── Filter Toolbar ── */}
      <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Entity Type */}
          <select
            value={filters.entityType || ''}
            onChange={(e) => setFilters({ ...filters, entityType: e.target.value || undefined, page: 1 })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f8931f] focus:border-transparent"
          >
            <option value="">All Types</option>
            <option value="Asset">Asset</option>
            <option value="Assignment">Assignment</option>
            <option value="MaintenanceLog">Maintenance</option>
            <option value="Personnel">Personnel</option>
            <option value="User">User</option>
          </select>

          {/* Module */}
          <select
            value={filters.module || ''}
            onChange={(e) => setFilters({ ...filters, module: e.target.value || undefined, page: 1 })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f8931f] focus:border-transparent"
          >
            <option value="">All Modules</option>
            <option value="INVENTORY">📦 Inventory</option>
            <option value="ACCOUNTABILITY">📋 Accountability</option>
            <option value="SYSTEM">⚙️ System</option>
          </select>

          {/* Action */}
          <select
            value={filters.action || ''}
            onChange={(e) => setFilters({ ...filters, action: e.target.value || undefined, page: 1 })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f8931f] focus:border-transparent"
          >
            <option value="">All Actions</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
            <option value="CHECKOUT">Checkout</option>
            <option value="RETURN">Return</option>
            <option value="REVERT">Revert</option>
          </select>

          {/* Severity Filter */}
          <select
            value={filters.severity || ''}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value || undefined, page: 1 })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f8931f] focus:border-transparent"
          >
            <option value="">All Severities</option>
            <option value="HIGH">🔴 High</option>
            <option value="MEDIUM">🟡 Medium</option>
            <option value="LOW">🟢 Low</option>
          </select>

          {/* Date From */}
          <div className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={filters.dateFrom ? filters.dateFrom.split('T')[0] : ''}
              onChange={(e) => setFilters({
                ...filters,
                dateFrom: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined,
                page: 1,
              })}
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#f8931f] focus:border-transparent"
            />
            <span className="text-xs text-slate-400">→</span>
            <input
              type="date"
              value={filters.dateTo ? filters.dateTo.split('T')[0] : ''}
              onChange={(e) => setFilters({
                ...filters,
                dateTo: e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined,
                page: 1,
              })}
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#f8931f] focus:border-transparent"
            />
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={() => setFilters({ page: 1 })}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#7B1113] hover:underline"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}

          <div className="flex-1" />

          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[#f8931f] text-[#f8931f] px-4 py-2 text-xs font-semibold hover:bg-[#f8931f] hover:text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Audit Log Table ── */}
      <div className="px-6 py-4">
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: '#e8ecf4' }}>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700 w-8"></th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Action</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Asset Name</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Serial #</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Summary</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">By / Device</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Date</th>
              <th className="text-right px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                  Loading...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">
                  <Eye className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No audit logs found
                </td>
              </tr>
            ) : (
              logs.map((l) => {
                const conf = ACTION_CONFIG[l.action] || { icon: Eye, accent: 'border-l-slate-400', bg: 'bg-slate-50', label: l.action };
                const Icon = conf.icon;
                const ua = parseUA(l.userAgent);
                const isExpanded = expandedRow === l.id;

                return (
                  <>
                    <tr
                      key={l.id}
                      className={`border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer ${isExpanded ? 'bg-slate-50' : ''}`}
                      onClick={() => setExpandedRow(isExpanded ? null : l.id)}
                    >
                      {/* Expand chevron */}
                      <td className="px-3 py-3">
                        {l.field && l.field !== '*' && (
                          isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </td>

                      {/* Action + Module + Severity */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${conf.bg}`}>
                            <Icon className="w-2.5 h-2.5" />
                            {conf.label}
                          </span>
                          {(l as any).module && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${(l as any).module === 'INVENTORY' ? 'bg-blue-50 text-blue-600' : (l as any).module === 'ACCOUNTABILITY' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                              {(l as any).module}
                            </span>
                          )}
                          <SeverityBadge severity={l.severity} />
                        </div>
                      </td>

                      {/* Asset Name */}
                      <td className="px-3 py-3">
                        <span className="text-sm font-semibold" style={{ color: '#012061' }}>
                          {l.assetName || <span className="text-slate-400 italic text-xs">N/A (Deleted)</span>}
                        </span>
                      </td>

                      {/* Serial Number */}
                      <td className="px-3 py-3">
                        <span className="text-xs font-mono text-slate-600">
                          {l.serialNumber || <span className="text-slate-400 italic">—</span>}
                        </span>
                      </td>

                      {/* Summary (primary), technical view hidden in expand */}
                      <td className="px-3 py-3 max-w-xs">
                        {l.summary ? (
                          <span className="text-xs text-slate-700 leading-relaxed">{l.summary}</span>
                        ) : l.field && l.field !== '*' ? (
                          <span className="text-xs text-slate-500">{l.field}: {l.oldValue || '—'} → {l.newValue || '—'}</span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* By + Device */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <DeviceIcon device={ua.device} />
                          <div>
                            <span className="text-xs font-medium text-slate-700">{(l.performedBy as any)?.username || 'system'}</span>
                            {ua.browser !== 'Unknown' && (
                              <span className="text-[10px] text-slate-400 ml-1">{ua.browser}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-3 py-3">
                        <div className="text-xs text-slate-500">{new Date(l.performedAt).toLocaleDateString()}</div>
                        <div className="text-[10px] text-slate-400">{new Date(l.performedAt).toLocaleTimeString()}</div>
                      </td>

                      {/* Revert */}
                      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <RoleGate roles={['ADMIN']}>
                          {l.field && l.field !== '*' && l.oldValue !== null && String(l.oldValue) !== String(l.newValue) && (
                            <button
                              onClick={() => handleRevert(l.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium rounded-md transition-colors"
                              style={{ color: '#f8931f' }}
                            >
                              <RotateCcw className="w-3 h-3" />
                              Revert
                            </button>
                          )}
                        </RoleGate>
                      </td>
                    </tr>

                    {/* ── Expanded Technical View ── */}
                    {isExpanded && (
                      <tr key={`${l.id}-detail`} className="bg-slate-50/50">
                        <td colSpan={8} className="px-6 py-3">
                          <div className="flex gap-6 text-xs">
                            {/* Technical details */}
                            <div className="space-y-1 min-w-0">
                              <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Technical View</span>
                              {l.field && l.field !== '*' && (
                                <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-slate-100">
                                  <span className="font-medium text-slate-600">{l.field}:</span>
                                  <span className="line-through text-red-500">{l.oldValue || '—'}</span>
                                  <span className="text-slate-400">→</span>
                                  <span className="text-emerald-600">{l.newValue || '—'}</span>
                                </div>
                              )}
                              {l.oldImageUrl && (
                                <div className="flex items-center gap-2">
                                  <a href={l.oldImageUrl} target="_blank" rel="noopener noreferrer" className="group">
                                    <img src={l.oldImageUrl} alt="Previous" className="h-12 w-12 rounded object-cover border border-slate-200 group-hover:border-[#f8931f] transition-colors" />
                                  </a>
                                  <span className="text-slate-400">Previous image</span>
                                </div>
                              )}
                            </div>

                            {/* Device & Network info */}
                            <div className="space-y-1">
                              <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Device & Network</span>
                              <div className="bg-white rounded-lg px-3 py-2 border border-slate-100 space-y-0.5">
                                <div><span className="text-slate-500">Browser:</span> <span className="font-medium">{ua.browser}</span></div>
                                <div><span className="text-slate-500">OS:</span> <span className="font-medium">{ua.os}</span></div>
                                <div><span className="text-slate-500">Device:</span> <span className="font-medium">{ua.device}</span></div>
                                {l.ipAddress && <div><span className="text-slate-500">IP:</span> <span className="font-mono font-medium">{l.ipAddress}</span></div>}
                              </div>
                            </div>

                            {/* Entity info */}
                            <div className="space-y-1">
                              <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Entity</span>
                              <div className="bg-white rounded-lg px-3 py-2 border border-slate-100 space-y-0.5">
                                <div><span className="text-slate-500">Type:</span> <span className="font-medium">{l.entityType}</span></div>
                                <div><span className="text-slate-500">ID:</span> <span className="font-mono font-medium text-[10px]">{l.entityId}</span></div>
                                <div><span className="text-slate-500">Severity:</span> <SeverityBadge severity={l.severity} /></div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 px-6 py-4 text-xs">
          <button
            disabled={meta.page <= 1}
            onClick={() => setFilters({ ...filters, page: meta.page - 1 })}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
          >
            Prev
          </button>
          <span className="text-slate-500">Page {meta.page} of {meta.totalPages}</span>
          <button
            disabled={meta.page >= meta.totalPages}
            onClick={() => setFilters({ ...filters, page: meta.page + 1 })}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}