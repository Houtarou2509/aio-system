import { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface IssueReport {
  id: string;
  reporterName: string | null;
  reporterEmail: string | null;
  reporterRole: string | null;
  pageUrl: string;
  issueType: string;
  description: string;
  stepsToReproduce: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
}

const statusLabels: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  WONT_FIX: "Won't Fix",
};

const typeLabels: Record<string, string> = {
  BUG: 'Bug',
  DATA_ISSUE: 'Data issue',
  UI_ISSUE: 'UI issue',
  ACCESS_PERMISSION: 'Access / permission',
  OTHER: 'Other',
};

export default function IssueReportsPage() {
  const [items, setItems] = useState<IssueReport[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const fetchIssues = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/issues?limit=50${status ? `&status=${status}` : ''}`);
      setItems(res.data ?? res);
    } catch (err: any) {
      showToast(err.message || 'Failed to load issue reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchIssues(); }, [status]);

  const updateIssue = async (issue: IssueReport, updates: Partial<Pick<IssueReport, 'status' | 'adminNotes'>>) => {
    setSavingId(issue.id);
    try {
      const res = await apiFetch(`/issues/${issue.id}`, { method: 'PATCH', body: updates });
      const updated = res.data ?? res;
      setItems((prev) => prev.map((item) => item.id === issue.id ? updated : item));
      showToast('Issue updated');
    } catch (err: any) {
      showToast(err.message || 'Failed to update issue');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[#012061] pt-14 md:pt-0 md:bg-transparent">
      <header className="sticky top-[56px] z-30 bg-[#012061] px-4 py-4 md:top-0 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-[#f8931f]" />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Issue Reports</h1>
              <p className="hidden text-xs text-white/50 sm:block">User-submitted bugs and support requests</p>
            </div>
          </div>
          <button onClick={fetchIssues} className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto bg-light-bg px-4 py-4 pb-24 dark:bg-slate-900 sm:px-6 md:pb-6">
        <div className="mb-3 flex items-center gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#012061] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            <option value="">All statuses</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Loading issue reports...</div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">No issue reports found.</div>
        ) : (
          <div className="space-y-3">
            {items.map((issue) => (
              <article key={issue.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#012061]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#012061] dark:bg-slate-700 dark:text-slate-100">{typeLabels[issue.issueType] || issue.issueType}</span>
                      <span className="rounded-full bg-[#f8931f]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#f8931f]">{statusLabels[issue.status] || issue.status}</span>
                    </div>
                    <h2 className="mt-2 text-sm font-bold text-[#012061] dark:text-slate-100">{issue.reporterName || 'Unknown user'} <span className="font-normal text-slate-400">reported an issue</span></h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{issue.reporterEmail || 'No email'} - {issue.reporterRole || 'Unknown role'} - {new Date(issue.createdAt).toLocaleString()}</p>
                  </div>
                  <select value={issue.status} disabled={savingId === issue.id} onChange={(e) => updateIssue(issue, { status: e.target.value })} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#012061] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">{issue.description}</p>
                {issue.stepsToReproduce && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-900 dark:text-slate-300"><span className="font-bold text-[#012061] dark:text-slate-100">Steps:</span> {issue.stepsToReproduce}</p>}
                <p className="mt-2 break-all text-xs text-slate-400 dark:text-slate-500">{issue.pageUrl}</p>

                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Admin notes</span>
                  <textarea
                    defaultValue={issue.adminNotes || ''}
                    rows={2}
                    onBlur={(e) => {
                      if ((issue.adminNotes || '') !== e.target.value.trim()) updateIssue(issue, { adminNotes: e.target.value.trim() || null });
                    }}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
              </article>
            ))}
          </div>
        )}
      </main>

      {toast && <div className="fixed bottom-20 right-4 z-50 rounded-lg bg-[#012061] px-4 py-2.5 text-xs font-medium text-white shadow-lg md:bottom-4">{toast}</div>}
    </div>
  );
}
