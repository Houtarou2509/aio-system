import { useEffect, useState } from 'react';
import { Activity, Database, HardDrive, RefreshCw, Server, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface HealthDetails {
  overallStatus: 'healthy' | 'warning' | 'error';
  checkedAt: string;
  server: { status: string; time: string; environment: string; version: string };
  database: { status: string; message: string };
  backups: { status: string; latestCompletedAt: string | null; latestSize: number | null; destination: string | null };
  uploads: { status: string; message: string };
  warnings: string[];
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function statusClass(status: string) {
  if (status === 'healthy') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-red-200 bg-red-50 text-red-700';
}

function HealthCard({ icon: Icon, title, status, children }: { icon: any; title: string; status: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#012061]/10">
            <Icon className="h-5 w-5 text-[#012061] dark:text-[#f8931f]" />
          </div>
          <h2 className="text-sm font-bold text-[#012061] dark:text-slate-100">{title}</h2>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(status)}`}>{status}</span>
      </div>
      <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">{children}</div>
    </section>
  );
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<HealthDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchHealth = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/system/health-details');
      setHealth(res.data ?? res);
    } catch (err: any) {
      setError(err.message || 'Failed to load system health');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHealth(); }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-[#012061] pt-14 md:pt-0 md:bg-transparent">
      <header className="sticky top-[56px] z-30 bg-[#012061] px-4 py-4 md:top-0 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-[#f8931f]" />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">System Health</h1>
              <p className="hidden text-xs text-white/50 sm:block">Operational diagnostics for rollout support</p>
            </div>
          </div>
          <button onClick={fetchHealth} className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto bg-light-bg px-4 py-4 pb-24 dark:bg-slate-900 sm:px-6 md:pb-6">
        {loading && <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Checking system health...</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {health && (
          <div className="space-y-4">
            {health.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <div className="mb-2 flex items-center gap-2 font-bold"><ShieldAlert className="h-4 w-4" /> Attention</div>
                <ul className="list-inside list-disc space-y-1">
                  {health.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <HealthCard icon={Server} title="Server" status={health.server.status}>
                <p>Environment: <span className="font-semibold">{health.server.environment}</span></p>
                <p>Version: <span className="font-semibold">{health.server.version}</span></p>
                <p>Time: {formatDate(health.server.time)}</p>
              </HealthCard>
              <HealthCard icon={Database} title="Database" status={health.database.status}>
                <p>{health.database.message}</p>
              </HealthCard>
              <HealthCard icon={HardDrive} title="Backups" status={health.backups.status}>
                <p>Latest: <span className="font-semibold">{formatDate(health.backups.latestCompletedAt)}</span></p>
                <p>Destination: {health.backups.destination || 'None'}</p>
              </HealthCard>
              <HealthCard icon={HardDrive} title="Uploads" status={health.uploads.status}>
                <p>{health.uploads.message}</p>
              </HealthCard>
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-500">Last checked: {formatDate(health.checkedAt)}</p>
          </div>
        )}
      </main>
    </div>
  );
}
