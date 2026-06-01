import { useState, useEffect, useCallback } from 'react';
import { Archive, Download, RefreshCw, Shield, HardDrive, Calendar } from 'lucide-react';
import { apiFetch } from '../lib/api';

/* ─── Types ─── */
interface BackupLog {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  destination: string;
  filePath: string | null;
  encryptedSize: number | null;
  createdAt: string;
}

interface BackupStats {
  lastBackup: string | null;
  totalBackups: number;
  totalSize: number;
}

/* ─── Helpers ─── */
function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: string | null): string {
  if (!date) return 'Never';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; border: string; label: string }> = {
    COMPLETED: { bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-200', border: 'border-emerald-200', label: 'COMPLETED' },
    IN_PROGRESS: { bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-200', border: 'border-blue-200', label: 'IN PROGRESS' },
    PENDING: { bg: 'bg-slate-50 dark:bg-slate-800', text: 'text-slate-500 dark:text-slate-400', border: 'border-slate-200', label: 'PENDING' },
    FAILED: { bg: 'bg-red-50 dark:bg-red-950', text: 'text-red-700 dark:text-red-200', border: 'border-red-200', label: 'FAILED' },
  };
  const s = map[status] || map.PENDING;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide ${s.bg} ${s.text} border ${s.border}`}>
      {s.label}
    </span>
  );
}

function backupWarning(lastBackup: string | null): string | null {
  if (!lastBackup) return 'No completed backup exists yet. Create one before rollout.';
  const ageMs = Date.now() - new Date(lastBackup).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) return 'Latest completed backup is older than 24 hours.';
  return null;
}

/* ═══════════════════════════════════════════════════════════
   BACKUP MANAGEMENT PAGE
   ═══════════════════════════════════════════════════════════ */
export default function BackupManagementPage() {
  const [backups, setBackups] = useState<BackupLog[]>([]);
  const [stats, setStats] = useState<BackupStats>({ lastBackup: null, totalBackups: 0, totalSize: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const fetchData = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const [backupsRes, statsRes] = await Promise.all([
        apiFetch(`/backups?page=${p}&limit=20`),
        apiFetch('/backups/stats'),
      ]);
      setBackups(backupsRes.data ?? backupsRes);
      const meta = (backupsRes as any).meta;
      if (meta) {
        setTotalPages(meta.totalPages);
        setTotal(meta.total);
      }
      setStats(statsRes.data ?? statsRes);
    } catch (err: any) {
      console.error('[Backups] fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const handleBackupNow = async () => {
    setBackingUp(true);
    try {
      await apiFetch('/backups/now', { method: 'POST' });
      showToast('Backup completed successfully');
      fetchData(1);
      setPage(1);
    } catch (err: any) {
      showToast('Backup failed: ' + (err.message || 'Unknown error'));
    } finally {
      setBackingUp(false);
    }
  };

  const handleDownload = (id: string) => {
    const token = localStorage.getItem('accessToken');
    const a = document.createElement('a');
    a.href = `/api/backups/${id}/download`;
    // Inject auth header via fetch then blob download
    fetch(`/api/backups/${id}/download`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `backup-${id.slice(0, 8)}.enc`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => showToast('Download failed'));
  };

  const KPI = [
    { key: 'last', label: 'LAST BACKUP', icon: Calendar, value: formatDate(stats.lastBackup), color: '#012061', isDate: true },
    { key: 'total', label: 'TOTAL BACKUPS', icon: Archive, value: stats.totalBackups.toString(), color: '#f8931f' },
    { key: 'size', label: 'TOTAL SIZE', icon: HardDrive, value: formatSize(stats.totalSize), color: '#7B1113' },
  ];
  const warning = backupWarning(stats.lastBackup);

  return (
    <div className="flex flex-col h-screen pt-14 md:pt-0 bg-[#012061] md:bg-transparent">

      {/* ═══ HEADER ═══════════════════════════════════════════ */}
      <header className="sticky top-[56px] md:top-0 z-30 shrink-0 bg-[#012061] px-4 sm:px-6 py-3 sm:py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">Backups</h1>
          </div>
          <button
            onClick={handleBackupNow}
            disabled={backingUp}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#f8931f] px-3 sm:px-4 py-2 text-xs font-bold text-white hover:bg-[#e0841a] shadow-sm transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${backingUp ? 'animate-spin' : ''}`} />
            {backingUp ? 'Backing up…' : 'Backup Now'}
          </button>
        </div>
      </header>

      {/* ═══ CONTENT ══════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-auto bg-light-bg dark:bg-slate-900">

        {/* KPI tiles */}
        <section className="px-4 sm:px-6 pt-4 shrink-0">
          {warning && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {warning}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {KPI.map(({ key, label, icon: Icon, value, color, isDate }) => (
              <div key={key} className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}15` }}>
                  <Icon className="h-5 w-5" style={{ color }} />
                </div>
                <div className="min-w-0">
                  <p className={`font-bold leading-tight ${isDate ? 'text-xs' : 'text-xl'}`} style={{ color }}>{value}</p>
                  <p className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Table */}
        <section className="flex-1 px-4 sm:px-6 pt-4 pb-6 overflow-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#f8931f] border-t-transparent" />
            </div>
          ) : backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f8931f]/10 mb-3">
                <Archive className="h-8 w-8 text-[#f8931f]" />
              </div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">No backups yet</p>
              <p className="text-xs text-slate-400">Click \"Backup Now\" to create your first backup</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#012061]">
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase">Status</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase">Destination</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase">File</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase w-24">Size</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase w-40">Date</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold tracking-widest text-white/70 uppercase w-24">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map(b => (
                    <tr key={b.id} className="border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-3 py-2.5">{statusBadge(b.status)}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400 capitalize">{b.destination}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 font-mono truncate max-w-[200px]">
                        {b.filePath ? b.filePath.split('/').pop() : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">{formatSize(b.encryptedSize)}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">{formatDate(b.createdAt)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {b.status === 'COMPLETED' && b.filePath && (
                          <button
                            onClick={() => handleDownload(b.id)}
                            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium text-[#012061] dark:text-slate-100 hover:bg-[#012061]/5 dark:hover:bg-slate-700/40 transition-colors"
                          >
                            <Download className="h-3 w-3" /> Download
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 px-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Prev</button>
                <span className="text-xs text-slate-500 dark:text-slate-400">Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next</button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-[#012061] px-4 py-2.5 text-xs font-medium text-white shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
