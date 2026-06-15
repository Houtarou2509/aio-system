import { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

const ISSUE_TYPES = [
  { value: 'BUG', label: 'Bug' },
  { value: 'DATA_ISSUE', label: 'Data issue' },
  { value: 'UI_ISSUE', label: 'UI issue' },
  { value: 'ACCESS_PERMISSION', label: 'Access / permission issue' },
  { value: 'OTHER', label: 'Other' },
];

export default function ReportIssueModal({ open, onClose }: Props) {
  const { user } = useAuth();
  const [issueType, setIssueType] = useState('BUG');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [reportRef, setReportRef] = useState('');

  if (!open) return null;

  const resetAndClose = () => {
    setIssueType('BUG');
    setDescription('');
    setStepsToReproduce('');
    setSubmitting(false);
    setError('');
    setSuccess(false);
    setReportRef('');
    onClose();
  };

  const handleSubmit = async () => {
    setError('');
    if (description.trim().length < 5) {
      setError('Please describe the issue in at least 5 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/issues', {
        method: 'POST',
        body: {
          pageUrl: window.location.href,
          issueType,
          description: description.trim(),
          stepsToReproduce: stepsToReproduce.trim() || null,
          userAgent: navigator.userAgent,
        },
      });
      const data = res.data ?? res;
      const shortId = data.id ? data.id.slice(0, 8).toUpperCase() : '';
      setReportRef(shortId);
      setSuccess(true);
      setTimeout(resetAndClose, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit issue report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4" onMouseDown={(e) => { if (e.target === e.currentTarget) resetAndClose(); }}>
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-800">
        <div className="flex items-center justify-between bg-[#012061] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f8931f]">
              <AlertCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Report Issue</h2>
              <p className="text-xs text-white/60">Send support details to the admin team</p>
            </div>
          </div>
          <button onClick={resetAndClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {success ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              Your issue report has been sent to the admin team.{reportRef && <span className="block text-xs font-normal mt-1 text-emerald-600">Reference: #{reportRef}</span>}
            </div>
          ) : (
            <>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                Reporting as <span className="font-semibold text-[#012061] dark:text-slate-100">{user?.fullName || user?.username || user?.email}</span> from this page.
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Issue type</span>
                <select value={issueType} onChange={(e) => setIssueType(e.target.value)} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  {ISSUE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Description *</span>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="What happened?" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500" />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Steps to reproduce</span>
                <textarea value={stepsToReproduce} onChange={(e) => setStepsToReproduce(e.target.value)} rows={3} placeholder="Example: Open Assets, click Scan QR, then..." className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500" />
              </label>

              {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
            </>
          )}
        </div>

        {!success && (
          <div className="flex justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <button onClick={resetAndClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#012061] hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting} className="rounded-lg bg-[#f8931f] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#e0841a] disabled:opacity-60">
              {submitting ? 'Submitting...' : 'Submit Issue'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
