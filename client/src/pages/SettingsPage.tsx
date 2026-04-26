import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RoleGate } from '../components/auth';
import {
  Cloud,
  Play,
  Clock,
  Settings2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HardDrive,
  Globe,
  Lock,
  Terminal,
  Database,
  CloudCog,
  Shield,
} from 'lucide-react';

interface BackupLog {
  id: string;
  status: string;
  destination: string;
  filePath?: string;
  encryptedSize?: number;
  createdAt: string;
}

/* ─── Status Badge — standardized ─── */
function StatusBadge({ status }: { status: string }) {
  if (status === 'COMPLETED') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Completed
      </span>
    );
  }
  if (status === 'IN_PROGRESS') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
        <Loader2 className="w-3 h-3 animate-spin" />
        In Progress
      </span>
    );
  }
  if (status === 'FAILED') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
      {status}
    </span>
  );
}

/* ─── Destination Icon ─── */
function DestinationIcon({ destination }: { destination: string }) {
  const isCloud = destination.toLowerCase().includes('s3') || destination.toLowerCase().includes('cloud') || destination.toLowerCase().includes('google');
  return isCloud ? (
    <div className="flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold" style={{ backgroundColor: '#012061' }}>
      <Globe className="w-3.5 h-3.5" />
    </div>
  ) : (
    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">
      <HardDrive className="w-3.5 h-3.5" />
    </div>
  );
}

/* ═════════════════════════════════════════════════════
   SETTINGS PAGE
   ═════════════════════════════════════════════════════ */
export default function SettingsPage() {
  const [backups, setBackups] = useState<BackupLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/backups', { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (d.success) setBackups(d.data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchBackups(); }, []);

  const handleRunBackup = async () => {
    setRunning(true);
    setMsg('');
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/backups/now', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (d.success) {
        setMsg('Backup completed successfully!');
        setMsgType('success');
        fetchBackups();
      } else {
        setMsg(d.error?.message || 'Backup failed');
        setMsgType('error');
      }
    } catch (e: any) {
      setMsg(e.message);
      setMsgType('error');
    }
    setRunning(false);
  };

  const lastBackup = backups[0];
  const completedCount = backups.filter(b => b.status === 'COMPLETED').length;
  const failedCount = backups.filter(b => b.status === 'FAILED').length;

  return (
    <div className="min-h-screen bg-white">
      {/* ── Header (matches Assets Page) ── */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Settings2 className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">System Settings</h1>
          </div>
          {lastBackup && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-white/60 bg-white/10 rounded-lg px-3 py-2">
              <Clock className="w-3.5 h-3.5" />
              Last backup: {new Date(lastBackup.createdAt).toLocaleString()}
            </div>
          )}
        </div>
      </header>

      {/* ── Account Row ── */}
      <div>
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#012061]/10">
              <Shield className="w-5 h-5" style={{ color: '#012061' }} />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: '#012061' }}>Two-Factor Authentication</h2>
              <p className="text-xs text-slate-500">Add an extra layer of security to your account.</p>
            </div>
          </div>
          <Link
            to="/setup-2fa"
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[#f8931f] text-[#f8931f] px-4 py-2 text-xs font-semibold hover:bg-[#f8931f] hover:text-white transition-colors"
          >
            <Shield className="w-3.5 h-3.5" />
            Setup 2FA
          </Link>
        </div>
      </div>

      {/* ── Horizontal Backup Toolbar ── */}
      <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
        <div className="flex items-center gap-4 flex-wrap">
          <RoleGate roles={['ADMIN']}>
            <button
              onClick={handleRunBackup}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm hover:shadow-md transition-all disabled:opacity-50"
              style={{ backgroundColor: '#f8931f' }}
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? 'Running backup...' : 'Run Backup Now'}
            </button>
          </RoleGate>

          {msg && (
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${
              msgType === 'success'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              {msgType === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              {msg}
            </span>
          )}

          <div className="flex-1" />

          {lastBackup ? (
            <div className="flex items-center gap-2 text-xs">
              <Clock className="w-3.5 h-3.5" style={{ color: '#012061' }} />
              <span className="font-medium" style={{ color: '#012061' }}>Last Backup:</span>
              <span className="text-slate-500">{new Date(lastBackup.createdAt).toLocaleString()}</span>
              <StatusBadge status={lastBackup.status} />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              <span>No backups recorded</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
              <Cloud className="w-3 h-3" />
              AWS S3
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
              <CloudCog className="w-3 h-3" />
              Google Drive
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Lock className="w-3 h-3" />
              AES-256
              <CheckCircle2 className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* ── Security KPIs ── */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-slate-100">
          <div className="p-2 rounded-md bg-emerald-50">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Successful</p>
            <p className="text-xl font-bold text-emerald-600">{completedCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-slate-100">
          <div className="p-2 rounded-md bg-red-50">
            <AlertCircle className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Failed</p>
            <p className="text-xl font-bold text-red-600">{failedCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-slate-100">
          <div className="p-2 rounded-md bg-slate-100">
            <Lock className="w-4 h-4" style={{ color: '#012061' }} />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Encryption</p>
            <p className="text-xl font-bold" style={{ color: '#012061' }}>AES-256</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-slate-100">
          <div className="p-2 rounded-md bg-slate-100">
            <Clock className="w-4 h-4" style={{ color: '#012061' }} />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Daily Backup</p>
            <p className="text-xl font-bold" style={{ color: '#012061' }}>02:00</p>
          </div>
        </div>
      </div>

      {/* ── Backup History Table (Premium Row) ── */}
      <div className="px-6 py-4">
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: '#e8ecf4' }}>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Destination</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Size</th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-slate-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Loading...
                </td>
              </tr>
            ) : backups.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-slate-400 text-sm">
                  <Cloud className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No backups yet
                </td>
              </tr>
            ) : (
              backups.map(b => (
                <tr
                  key={b.id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  style={{ borderLeftWidth: '2px', borderLeftStyle: 'solid', borderLeftColor: 'transparent' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderLeftColor = '#f8931f'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderLeftColor = 'transparent'; }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <DestinationIcon destination={b.destination} />
                      <span className="text-sm font-semibold" style={{ color: '#012061' }}>{b.destination}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{new Date(b.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{b.encryptedSize ? `${(b.encryptedSize / 1024).toFixed(1)}KB` : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <StatusBadge status={b.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Info banner */}
        <div className="flex items-start gap-3 p-3 mt-4 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
          <Cloud className="w-4 h-4 shrink-0 mt-0.5" />
          <p>Automated daily backups at 02:00 SGT. Local retention: 7 days. Cloud retention: 30 days. Backups are AES-256-GCM encrypted.</p>
        </div>

        {/* Connectivity Matrix */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          {[
            { icon: Cloud, name: 'AWS S3', envVar: 'AWS_S3_BUCKET', configured: false },
            { icon: CloudCog, name: 'Google Drive', envVar: 'GOOGLE_DRIVE_CREDENTIALS', configured: false },
            { icon: Lock, name: 'Encryption', envVar: null, configured: true, detail: 'AES-256-GCM' },
            { icon: Database, name: 'Local Storage', envVar: null, configured: true, detail: '7-day retention' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div
                key={item.name}
                className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors"
              >
                <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
                  item.configured ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold" style={{ color: '#012061' }}>{item.name}</p>
                    {item.configured ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                        Not Configured
                      </span>
                    )}
                  </div>
                  {item.detail && (
                    <p className="text-[11px] text-slate-500 mt-0.5">{item.detail}</p>
                  )}
                  {item.envVar && (
                    <div className="flex items-center gap-1 mt-1">
                      <Terminal className="w-2.5 h-2.5 text-slate-400" />
                      <code className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                        {item.envVar}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}