import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Settings2, Shield, Send, ChevronDown,
  Archive, History, Users, ShoppingCart, Truck,
  Bell, Lock, HardDrive,
} from 'lucide-react';
import { PermissionGate } from '../components/auth';

/* ─── Accordion Section ──────────────────────────────────── */

function AccordionSection({
  icon: Icon,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-slate-100 dark:border-slate-700">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
      >
        <div className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0 bg-[#012061]/10 dark:bg-slate-700/50">
          <Icon className="w-5 h-5" style={{ color: '#012061' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold" style={{ color: '#012061' }}>{title}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-6 pb-4 pt-1 bg-slate-50/50 dark:bg-slate-900/50">
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── Quick Stat Row ─────────────────────────────────────── */

function StatLine({ label, value, color = '#012061' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-xs font-semibold" style={{ color }}>{value}</span>
    </div>
  );
}

/* ─── Email Test (inline) ─────────────────────────────────── */

function EmailTestInline() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleTest = async () => {
    if (!email.trim()) { setResult({ ok: false, msg: 'Enter an email address' }); return; }
    setSending(true);
    setResult(null);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/settings/test-email', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const d = await res.json();
      if (d.success) setResult({ ok: true, msg: 'Test email sent!' });
      else setResult({ ok: false, msg: d.error?.message || 'Failed' });
    } catch (e: any) {
      setResult({ ok: false, msg: e.message || 'Error' });
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 w-48 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
        />
        <button
          onClick={handleTest}
          disabled={sending}
          className="inline-flex items-center gap-1 rounded-lg bg-[#f8931f] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e0841a] disabled:opacity-50 transition-colors"
        >
          <Send className="h-3 w-3" />
          {sending ? '…' : 'Test'}
        </button>
      </div>
      {result && (
        <p className={`text-xs font-medium ${result.ok ? 'text-emerald-600' : 'text-red-600'}`}>
          {result.ok ? '✓' : '✗'} {result.msg}
        </p>
      )}
    </div>
  );
}

/* ─── Quick Link Button ──────────────────────────────────── */

function QuickLink({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-lg border border-[#f8931f]/30 bg-[#f8931f]/5 px-4 py-2 text-xs font-semibold text-[#f8931f] hover:bg-[#f8931f] hover:text-white transition-colors"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

export default function SettingsPage() {
  const [backupStats, setBackupStats] = useState<{ lastBackup: string | null; totalBackups: number }>({ lastBackup: null, totalBackups: 0 });

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    fetch('/api/backups/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setBackupStats(d.data ?? d); })
      .catch(() => {});
  }, []);

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never';

  return (
    <div className="flex flex-col min-h-dvh pt-14 md:pt-0 bg-[#012061] md:bg-transparent">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-6 py-4 min-h-[56px]">
        <div className="flex items-center gap-3">
          <Settings2 className="h-6 w-6 text-[#f8931f]" />
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Admin Hub</h1>
            <p className="text-xs text-white/50 hidden sm:block">System configuration & management</p>
          </div>
        </div>
      </header>

      {/* ── Content Accordion ── */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-800 pb-20 md:pb-0">

        {/* Security */}
        <AccordionSection
          icon={Shield}
          title="Security"
          subtitle="Two-factor authentication & account protection"
        >
          <div className="flex items-center justify-between">
            <div>
              <StatLine label="2FA Status" value="Available" color="#0891b2" />
              <p className="text-[11px] text-slate-400 mt-1">Add an extra layer of security to your account.</p>
            </div>
            <QuickLink to="/setup-2fa" icon={Lock} label="Setup 2FA" />
          </div>
        </AccordionSection>

        <PermissionGate permissions={['backups:view']}>
        <AccordionSection
          icon={Archive}
          title="Backups"
          subtitle="Automated daily backups with encryption"
        >
          <div className="space-y-3">
            <StatLine label="Last Backup" value={formatDate(backupStats.lastBackup)} color="#012061" />
            <StatLine label="Total Backups" value={backupStats.totalBackups.toString()} color="#f8931f" />
            <div className="flex items-center gap-3 flex-wrap pt-1">
              <QuickLink to="/backups" icon={HardDrive} label="Manage Backups" />
            </div>
          </div>
        </AccordionSection>
        </PermissionGate>

        <PermissionGate permissions={['users:view']}>
        <AccordionSection
          icon={Users}
          title="Users & Permissions"
          subtitle="Manage system accounts and access roles"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">Create, edit, and manage user accounts. Assign roles: Admin, Staff Admin, Staff, Guest.</p>
            <QuickLink to="/users" icon={Users} label="Manage Users" />
          </div>
        </AccordionSection>
        </PermissionGate>

        <PermissionGate permissions={['audit:view']}>
        <AccordionSection
          icon={History}
          title="Audit & Compliance"
          subtitle="Activity logs, change tracking, and export history"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">Every create, update, delete, assign, and transfer is logged with timestamp and user tracking.</p>
            <QuickLink to="/audit" icon={History} label="View Audit Trail" />
          </div>
        </AccordionSection>
        </PermissionGate>

        <PermissionGate permissions={['suppliers:view']}>
        <AccordionSection
          icon={Truck}
          title="Procurement"
          subtitle="Suppliers and purchase request management"
        >
          <div className="flex items-center gap-3 flex-wrap">
            <QuickLink to="/suppliers" icon={Truck} label="Suppliers" />
            <QuickLink to="/purchase-requests" icon={ShoppingCart} label="Purchase Requests" />
          </div>
        </AccordionSection>
        </PermissionGate>

        <PermissionGate permissions={['notifications:view']}>
        <AccordionSection
          icon={Bell}
          title="Notifications & Alerts"
          subtitle="System alerts and email configuration"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold" style={{ color: '#012061' }}>In-App Notifications</p>
                <p className="text-[11px] text-slate-400">Warranty expirations, maintenance overdue alerts</p>
              </div>
              <QuickLink to="/notifications" icon={Bell} label="View All" />
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
              <p className="text-xs font-semibold mb-2" style={{ color: '#012061' }}>Email Alerts</p>
              <EmailTestInline />
            </div>
          </div>
        </AccordionSection>
        </PermissionGate>

      </div>
    </div>
  );
}
