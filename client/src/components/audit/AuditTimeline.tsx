import { useState, useEffect } from 'react';
import { auditApi, AuditLogEntry, AuditFilters } from '../../lib/api';
import { RoleGate } from '../auth';

interface Props {
  entityId?: string;
}

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

  const handleExport = () => {
    auditApi.exportCsv(filters);
  };

  const ACTION_COLORS: Record<string, string> = {
    CREATE: 'bg-green-100 text-green-800',
    UPDATE: 'bg-blue-100 text-blue-800',
    DELETE: 'bg-red-100 text-red-800',
    CHECKOUT: 'bg-purple-100 text-purple-800',
    RETURN: 'bg-yellow-100 text-yellow-800',
    REVERT: 'bg-orange-100 text-orange-800',
  };

  return (
    <div className="space-y-3">
      {!isEntityView && (
        <div className="flex flex-wrap gap-2">
          <select value={filters.entityType || ''} onChange={e => setFilters({ ...filters, entityType: e.target.value || undefined })} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
            <option value="">All types</option>
            <option value="Asset">Asset</option>
            <option value="MaintenanceLog">Maintenance</option>
            <option value="User">User</option>
          </select>
          <select value={filters.action || ''} onChange={e => setFilters({ ...filters, action: e.target.value || undefined })} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
            <option value="">All actions</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
            <option value="CHECKOUT">Checkout</option>
            <option value="RETURN">Return</option>
          </select>
          <button onClick={handleExport} className="rounded-md border border-input px-3 py-1 text-xs hover:bg-accent">Export CSV</button>
        </div>
      )}

      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
        <div className="space-y-2">
          {logs.map(l => (
            <div key={l.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[l.action] || 'bg-gray-100'}`}>
                    {l.action}
                  </span>
                  <span className="text-muted-foreground text-xs">{l.entityType}</span>
                </div>
                <span className="text-muted-foreground text-xs">{new Date(l.performedAt).toLocaleString()}</span>
              </div>
              {l.field && l.field !== '*' && (
                <div className="mt-1 text-xs">
                  <span className="text-muted-foreground">{l.field}: </span>
                  <span className="line-through text-red-600">{l.oldValue || '—'}</span>
                  <span className="text-muted-foreground"> → </span>
                  <span className="text-green-600">{l.newValue || '—'}</span>
                </div>
              )}
              <div className="mt-1 text-xs text-muted-foreground">
                By {(l.performedBy as any)?.username || 'system'} {l.ipAddress ? `· ${l.ipAddress}` : ''}
              </div>
              <RoleGate roles={['ADMIN']}>
                {l.field && l.field !== '*' && l.oldValue !== null && String(l.oldValue) !== String(l.newValue) && (
                  <button onClick={() => handleRevert(l.id)} className="text-xs text-orange-600 hover:underline mt-1">Revert this change</button>
                )}
              </RoleGate>
            </div>
          ))}
          {logs.length === 0 && <p className="text-sm text-muted-foreground">No audit logs found</p>}
        </div>
      )}

      {/* Pagination for full view */}
      {!isEntityView && meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <button disabled={meta.page <= 1} onClick={() => setFilters({ ...filters, page: meta.page - 1 })} className="rounded border border-input px-2 py-1 disabled:opacity-50">Prev</button>
          <span className="text-muted-foreground">Page {meta.page} of {meta.totalPages}</span>
          <button disabled={meta.page >= meta.totalPages} onClick={() => setFilters({ ...filters, page: meta.page + 1 })} className="rounded border border-input px-2 py-1 disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}