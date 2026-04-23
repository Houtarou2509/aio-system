import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RoleGate } from '../components/auth';
import { Button } from '../components/ui/button';

interface BackupLog {
  id: string;
  status: string;
  destination: string;
  filePath?: string;
  encryptedSize?: number;
  createdAt: string;
}

export default function SettingsPage() {
  const [backups, setBackups] = useState<BackupLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');

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
        setMsg('Backup completed!');
        fetchBackups();
      } else {
        setMsg(d.error?.message || 'Backup failed');
      }
    } catch (e: any) { setMsg(e.message); }
    setRunning(false);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'COMPLETED': return 'text-green-600';
      case 'IN_PROGRESS': return 'text-yellow-600';
      case 'FAILED': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-lg font-bold">Settings</h1>

      {/* Account Info */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h2 className="text-base font-semibold">Account</h2>
        <p className="text-sm text-muted-foreground">Manage your account and security settings.</p>
        <div className="flex gap-3">
          <Link to="/setup-2fa" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 inline-block">
            Setup 2FA
          </Link>
        </div>
      </div>

      {/* Backup Section */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h2 className="text-base font-semibold">Cloud Backups</h2>
        <p className="text-sm text-muted-foreground">
          Automated daily backups at 02:00 SGT. Backups are AES-256-GCM encrypted.
          Local retention: 7 days. Cloud retention: 30 days.
        </p>

        <div className="flex gap-3 items-center">
          <RoleGate roles={['ADMIN']}>
            <Button onClick={handleRunBackup} disabled={running} size="sm">
              {running ? 'Running backup...' : 'Run Backup Now'}
            </Button>
          </RoleGate>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>

        <div className="space-y-1">
          <h3 className="text-sm font-medium">Backup History</h3>
          {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {backups.map(b => (
                <div key={b.id} className="flex items-center justify-between text-xs border-b border-border py-1">
                  <span className={statusColor(b.status)}>{b.status}</span>
                  <span className="text-muted-foreground">{b.destination}</span>
                  <span className="text-muted-foreground">{b.encryptedSize ? `${(b.encryptedSize / 1024).toFixed(1)}KB` : '—'}</span>
                  <span className="text-muted-foreground">{new Date(b.createdAt).toLocaleString()}</span>
                </div>
              ))}
              {backups.length === 0 && <p className="text-xs text-muted-foreground">No backups yet</p>}
            </div>
          )}
        </div>

        {/* Config info */}
        <div className="pt-3 border-t border-border">
          <h3 className="text-xs font-medium text-muted-foreground mb-2">Configuration</h3>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>S3 Bucket: <span className="text-orange-500">Configure via .env</span></div>
            <div>S3 Region: <span className="text-orange-500">Configure via .env</span></div>
            <div>Google Drive: <span className="text-orange-500">Configure via .env</span></div>
            <div>Encryption: AES-256-GCM</div>
          </div>
        </div>
      </div>
    </div>
  );
}