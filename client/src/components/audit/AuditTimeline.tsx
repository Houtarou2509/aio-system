import { useState, useEffect } from 'react';
import { auditApi, AuditLogEntry, AuditFilters } from '../../lib/api';
import { RoleGate } from '../auth';
import {
  PlusCircle,
  Pencil,
  Trash2,
  ArrowRightLeft,
  RotateCcw,
  Eye,
  Loader2,
  Download,
  Filter,
} from 'lucide-react';

interface Props {
  entityId?: string;
}

/* ─── Action Config ─── */
const ACTION_CONFIG: Record<string, { icon: React.ElementType; accent: string; bg: string; label: string }> = {
  CREATE: { icon: PlusCircle, accent: 'border-l-emerald-400', bg: 'bg-emerald-50', label: 'Created' },
  UPDATE: { icon: Pencil, accent: 'border-l-blue-400', bg: 'bg-blue-50', label: 'Updated' },
  DELETE: { icon: Trash2, accent: 'border-l-red-400', bg: 'bg-red-50', label: 'Deleted' },
  CHECKOUT: { icon: ArrowRightLeft, accent: 'border-l-purple-400', bg: 'bg-purple-50', label: 'Checked Out' },
  RETURN: { icon: ArrowRightLeft, accent: 'border-l-amber-400', bg: 'bg-amber-50', label: 'Returned' },
  REVERT: { icon: RotateCcw, accent: 'border-l-orange-400', bg: 'bg-orange-50', label: 'Reverted' },
};

export function AuditTimeline({ entityId }: Props) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AuditFilters>({});
  const [meta, setMeta] = useState<any>(null);
  const isEntityView = !!entityId;

  const fetchLogs = async () => {
    setLoading(true);
    try {
      if (isEntityView) {
        const res = await auditApi.timeline(entityId);
        setLogs(res.data);
      } else {
        const res = await auditApi.list({ ...filters, page: filters.page || 1, limit: 20 });
        setLogs(res.data);
        setMeta(res.meta);
      }
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(); }, [entityId, filters]);

  const handleRevert = async (id: string) => {
    if (!confirm('Revert this change? This will restore the old value.')) return;
    try {
      await auditApi.revert(id);
      fetchLogs();
    } catch (e: any) { alert(e.message); }
  };

  const handleExport = () => { auditApi.exportCsv(filters); };

  return (
    <div className="space-y-4">
      {/* Filters (full view only) */}
      {!isEntityView && (
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select value={filters.entityType || ''} onChange={e => setFilters({ ...filters, entityType: e.target.value || undefined })} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400">
            <option value="">All types</option>
            <option value="Asset">Asset</option>
            <option value="MaintenanceLog">Maintenance</option>
            <option value="User">User</option>
          </select>
          <select value={filters.action || ''} onChange={e => setFilters({ ...filters, action: e.target.value || undefined })} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400">
            <option value="">All actions</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
            <option value="CHECKOUT">Checkout</option>
            <option value="RETURN">Return</option>
          </select>
          <button onClick={handleExport} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
            <Download className="w-3 h-3" />
            Export CSV
          </button>
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading...
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <Eye className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">No audit logs found</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-200" />

          <div className="space-y-3">
            {logs.map(l => {
              const conf = ACTION_CONFIG[l.action] || { icon: Eye, accent: 'border-l-slate-400', bg: 'bg-slate-50', label: l.action };
              const Icon = conf.icon;

              return (
                <div key={l.id} className="relative pl-10">
                  {/* Timeline dot */}
                  <div className={`absolute left-3 top-3 flex items-center justify-center w-5 h-5 rounded-full ${conf.bg} ring-2 ring-white`}>
                    <Icon className="w-2.5 h-2.5" />
                  </div>

                  {/* Card with left border accent */}
                  <div className={`rounded-xl border border-slate-100 border-l-[3px] ${conf.accent} bg-white p-3 shadow-xs`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${conf.bg}`}>
                          {conf.label}
                        </span>
                        <span className="text-xs text-slate-500">{l.entityType}</span>
                        {!isEntityView && l.assetName && (
                          <span className="text-xs font-semibold" style={{ color: '#012061' }}>{l.assetName}</span>
                        )}
                        {!isEntityView && l.serialNumber && (
                          <span className="text-[10px] font-mono text-slate-400">{l.serialNumber}</span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">{new Date(l.performedAt).toLocaleString()}</span>
                    </div>

                    {l.field && l.field !== '*' && (
                      <div className="mt-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 text-xs">
                        <span className="text-slate-500 font-medium">{l.field}: </span>
                        <span className="line-through text-red-500">{l.oldValue || '—'}</span>
                        <span className="text-slate-400 mx-1">→</span>
                        <span className="text-emerald-600">{l.newValue || '—'}</span>
                      </div>
                    )}

                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        By <span className="font-medium text-slate-700">{(l.performedBy as any)?.username || 'system'}</span>
                        {l.ipAddress ? <span className="text-slate-400"> · {l.ipAddress}</span> : ''}
                      </span>
                      <RoleGate roles={['ADMIN']}>
                        {l.field && l.field !== '*' && l.oldValue !== null && String(l.oldValue) !== String(l.newValue) && (
                          <button
                            onClick={() => handleRevert(l.id)}
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-50 transition-colors"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            Revert
                          </button>
                        )}
                      </RoleGate>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination (full view) */}
      {!isEntityView && meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <button disabled={meta.page <= 1} onClick={() => setFilters({ ...filters, page: meta.page - 1 })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors">Prev</button>
          <span className="text-slate-500">Page {meta.page} of {meta.totalPages}</span>
          <button disabled={meta.page >= meta.totalPages} onClick={() => setFilters({ ...filters, page: meta.page + 1 })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors">Next</button>
        </div>
      )}
    </div>
  );
}