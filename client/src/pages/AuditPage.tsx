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
} from 'lucide-react';

/* ─── Action Config ─── */
const ACTION_CONFIG: Record<string, { icon: React.ElementType; accent: string; bg: string; label: string }> = {
  CREATE: { icon: PlusCircle, accent: 'border-l-emerald-400', bg: 'bg-emerald-50', label: 'Created' },
  UPDATE: { icon: Pencil, accent: 'border-l-blue-400', bg: 'bg-blue-50', label: 'Updated' },
  DELETE: { icon: Trash2, accent: 'border-l-red-400', bg: 'bg-red-50', label: 'Deleted' },
  CHECKOUT: { icon: ArrowRightLeft, accent: 'border-l-purple-400', bg: 'bg-purple-50', label: 'Checked Out' },
  RETURN: { icon: ArrowRightLeft, accent: 'border-l-amber-400', bg: 'bg-amber-50', label: 'Returned' },
  REVERT: { icon: RotateCcw, accent: 'border-l-orange-400', bg: 'bg-orange-50', label: 'Reverted' },
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AuditFilters>({});
  const [meta, setMeta] = useState<any>(null);

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

  return (
    <div className="min-h-screen bg-white">
      {/* ── Header (matches Settings/Assets) ── */}
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
          <select
            value={filters.entityType || ''}
            onChange={(e) => setFilters({ ...filters, entityType: e.target.value || undefined, page: 1 })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
          >
            <option value="">All Types</option>
            <option value="Asset">Asset</option>
            <option value="MaintenanceLog">Maintenance</option>
            <option value="User">User</option>
          </select>
          <select
            value={filters.action || ''}
            onChange={(e) => setFilters({ ...filters, action: e.target.value || undefined, page: 1 })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
          >
            <option value="">All Actions</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
            <option value="CHECKOUT">Checkout</option>
            <option value="RETURN">Return</option>
          </select>

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

      {/* ── Audit Log Table (Premium Row) ── */}
      <div className="px-6 py-4">
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: '#e8ecf4' }}>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Action</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Asset Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Serial #</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Details</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">By</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Date</th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700"></th>
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

                return (
                  <tr
                    key={l.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    style={{ borderLeftWidth: '2px', borderLeftStyle: 'solid', borderLeftColor: 'transparent' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderLeftColor = '#f8931f'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderLeftColor = 'transparent'; }}
                  >
                    {/* Action badge */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${conf.bg}`}>
                        <Icon className="w-2.5 h-2.5" />
                        {conf.label}
                      </span>
                    </td>

                    {/* Asset Name */}
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold" style={{ color: '#012061' }}>
                        {l.assetName || <span className="text-slate-400 italic">N/A (Deleted)</span>}
                      </span>
                    </td>

                    {/* Serial Number */}
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-slate-600">
                        {l.serialNumber || <span className="text-slate-400 italic">—</span>}
                      </span>
                    </td>

                    {/* Entity Type */}
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold" style={{ color: '#012061' }}>{l.entityType}</span>
                    </td>

                    {/* Details */}
                    <td className="px-4 py-3">
                      {l.field && l.field !== '*' ? (
                        <div className="text-xs">
                          <span className="font-medium text-slate-700">{l.field}: </span>
                          <span className="line-through text-red-500">{l.oldValue || '—'}</span>
                          <span className="text-slate-400 mx-1">→</span>
                          <span className="text-emerald-600">{l.newValue || '—'}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>

                    {/* Performed By */}
                    <td className="px-4 py-3 text-sm text-slate-500">
                      <span className="font-medium text-slate-700">{(l.performedBy as any)?.username || 'system'}</span>
                      {l.ipAddress ? <span className="text-slate-400"> · {l.ipAddress}</span> : ''}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(l.performedAt).toLocaleString()}
                    </td>

                    {/* Revert */}
                    <td className="px-4 py-3 text-right">
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