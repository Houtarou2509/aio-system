import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiError, AUTH_EXPIRED_EVENT } from '../lib/api';
import {
  Users, PlusCircle, Search, Loader2, Eye, X, UserCircle, Briefcase, Building2, Calendar, Mail, Phone, Package, FileText, AlertTriangle, CheckCircle2, Info, ChevronDown,
} from 'lucide-react';

/* ─── Types ─── */
interface Personnel {
  id: string;
  fullName: string;
  designation: string | null;
  projectYear: string | null;
  email: string | null;
  phone: string | null;
  hiredDate: string | null;
  employmentHistory: string | null;
  status: string;
  createdAt: string;
  activeAssignments: number;
  institutionId: number | null;
  projectId: number | null;
  designationId: number | null;
  institution?: { id: number; name: string } | null;
  projectLookup?: { id: number; name: string } | null;
  designationLookup?: { id: number; name: string } | null;
}

interface AssignmentWithAsset {
  id: string;
  assignedAt: string;
  returnedAt: string | null;
  condition: string | null;
  notes: string | null;
  asset: { id: string; name: string; serialNumber: string | null; propertyNumber: string | null; status: string } | null;
}

interface ProfileHistoryEntry {
  id: number;
  profileId: string;
  designation: string | null;
  institutionName: string | null;
  projectName: string | null;
  projectYear: string | null;
  hiredDate: string | null;
  loggedAt: string;
}

interface PersonnelDetail extends Personnel {
  assignments: AssignmentWithAsset[];
  historyLogs: ProfileHistoryEntry[];
}

/* ─── Toast ─── */
type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

function ToastContainer({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div key={t.id}
          className={`flex items-start gap-2 rounded-lg px-4 py-3 shadow-lg text-sm animate-in slide-in-from-right ${
            t.type === 'error' ? 'bg-red-50 border border-red-200 text-red-800'
            : t.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-blue-50 border border-blue-200 text-blue-800'
          }`}
          role="alert"
        >
          <span className="mt-0.5 shrink-0">
            {t.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : t.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Info className="w-4 h-4" />}
          </span>
          <p className="flex-1 text-xs leading-relaxed">{t.message}</p>
          <button onClick={() => dismiss(t.id)} className="shrink-0 text-current opacity-50 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
    </div>
  );
}

let toastId = 0;

/* ─── Session Expired Modal ─── */
function SessionExpiredModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  if (!open) return null;
  const goToLogin = () => {
    onClose();
    navigate('/login', { replace: true });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 mb-1">Session Expired</h3>
            <p className="text-sm text-slate-500 mb-4">Your session has expired for security reasons. Please log in again to continue.</p>
            <button onClick={goToLogin}
              className="w-full rounded-lg bg-[#f8931f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e07e0a] transition-colors">
              Go to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Searchable Dropdown ─── */
interface LookupItem { id: number; name: string; }

function SearchableDropdown({ label, items, value, onChange, placeholder }: {
  label: string;
  items: LookupItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [refEl, setRefEl] = useState<HTMLDivElement | null>(null);
  const selectedItem = items.find(i => String(i.id) === value);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (refEl && !refEl.contains(e.target as Node)) {
        setIsOpen(false);
        setFilter('');
      }
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, refEl]);

  const filtered = filter
    ? items.filter(i => i.name.toLowerCase().includes(filter.toLowerCase()))
    : items;

  return (
    <div className="relative" ref={setRefEl}>
      <label className="block text-[10px] font-medium text-slate-500 mb-1">{label}</label>
      {/* Trigger button — always visible */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm text-left hover:border-slate-300 transition-colors"
      >
        <span className={selectedItem ? 'text-slate-700' : 'text-slate-400'}>
          {selectedItem ? selectedItem.name : placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>
      {/* Dropdown menu — absolutely positioned overlay */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 border border-[#f8931f] rounded-lg shadow-lg bg-white">
          <input
            autoFocus
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}...`}
            className="w-full border-0 px-3 py-2 text-sm outline-none rounded-t-lg"
          />
          <div className="max-h-36 overflow-y-auto border-t">
            <button
              type="button"
              onClick={() => { onChange(''); setIsOpen(false); setFilter(''); }}
              className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:bg-slate-50"
            >
              None
            </button>
            {filtered.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => { onChange(String(item.id)); setIsOpen(false); setFilter(''); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[#f8931f]/10 transition-colors ${
                  String(item.id) === value ? 'bg-[#f8931f]/10 text-[#f8931f] font-medium' : 'text-slate-700'
                }`}
              >
                {item.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-400">No results</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Form Modal ─── */
function PersonnelFormModal({ open, onClose, onSave, editing, showToast }: {
  open: boolean; onClose: () => void; onSave: () => void;
  editing: Personnel | null;
  showToast: (type: ToastType, message: string) => void;
}) {
  const [form, setForm] = useState({
    fullName: '', designation: '', designationId: '', email: '', phone: '',
    institutionId: '', projectId: '', projectYear: '', hiredDate: '',
    employmentHistory: '',
  });
  const [saving, setSaving] = useState(false);
  const [institutions, setInstitutions] = useState<LookupItem[]>([]);
  const [projects, setProjects] = useState<LookupItem[]>([]);
  const [designations, setDesignations] = useState<LookupItem[]>([]);

  // Load lookups on modal open
  useEffect(() => {
    if (!open) return;
    const loadLookups = async () => {
      try {
        const [instRes, projRes, desigRes] = await Promise.all([
          apiFetch('/lookup/accountability/institutions?activeOnly=true'),
          apiFetch('/lookup/accountability/projects?activeOnly=true'),
          apiFetch('/lookup/accountability/designations?activeOnly=true'),
        ]);
        const instData = Array.isArray(instRes) ? instRes : (instRes.data || []);
        const projData = Array.isArray(projRes) ? projRes : (projRes.data || []);
        const desigData = Array.isArray(desigRes) ? desigRes : (desigRes.data || []);
        setInstitutions(instData);
        setProjects(projData);
        setDesignations(desigData);
      } catch {
        // Silently fail — dropdowns will just be empty
      }
    };
    loadLookups();
  }, [open]);

  useEffect(() => {
    if (editing) {
      setForm({
        fullName: editing.fullName || '',
        designation: editing.designation || '',
        designationId: editing.designationId != null ? String(editing.designationId) : '',
        email: editing.email || '',
        phone: editing.phone || '',
        institutionId: editing.institutionId != null ? String(editing.institutionId) : '',
        projectId: editing.projectId != null ? String(editing.projectId) : '',
        projectYear: editing.projectYear || '',
        hiredDate: editing.hiredDate ? editing.hiredDate.split('T')[0] : '',
        employmentHistory: editing.employmentHistory || '',
      });
    } else {
      setForm({
        fullName: '', designation: '', designationId: '', email: '', phone: '',
        institutionId: '', projectId: '', projectYear: '', hiredDate: '',
        employmentHistory: '',
      });
    }
  }, [editing, open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, any> = {
        fullName: form.fullName,
        designation: form.designation || null,
        designationId: form.designationId ? parseInt(form.designationId, 10) : null,
        email: form.email || null,
        phone: form.phone || null,
        institutionId: form.institutionId ? parseInt(form.institutionId, 10) : null,
        projectId: form.projectId ? parseInt(form.projectId, 10) : null,
        projectYear: form.projectYear || null,
        hiredDate: form.hiredDate || null,
        employmentHistory: form.employmentHistory || null,
      };
      if (editing) {
        await apiFetch(`/personnel/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiFetch('/personnel', { method: 'POST', body });
      }
      showToast('success', editing ? 'Profile updated successfully.' : 'Profile created successfully.');
      onSave();
      onClose();
    } catch (err: any) {
      if (err instanceof ApiError) {
        showToast('error', err.message);
      } else {
        showToast('error', 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header — pinned top */}
        <div className="flex items-center justify-between px-5 py-4 border-b rounded-t-xl shrink-0" style={{ background: '#012061' }}>
          <h2 className="text-sm font-bold text-white">{editing ? 'Edit Profile' : 'Add Profile'}</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Row 1: Full Name | Designation */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-1">Full Name *</label>
              <input required value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })}
                placeholder="Full Name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
            </div>
            <SearchableDropdown
              label="Designation"
              items={designations}
              value={form.designationId}
              onChange={id => setForm({ ...form, designationId: id })}
              placeholder="Select designation..."
            />
          </div>

          {/* Row 2: Email | Phone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-1">Email</label>
              <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="Email" type="email" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="Phone" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
            </div>
          </div>

          {/* Row 3: Institution | Project */}
          <div className="grid grid-cols-2 gap-4">
            <SearchableDropdown
              label="Institution"
              items={institutions}
              value={form.institutionId}
              onChange={id => setForm({ ...form, institutionId: id })}
              placeholder="Select institution..."
            />
            <SearchableDropdown
              label="Project"
              items={projects}
              value={form.projectId}
              onChange={id => setForm({ ...form, projectId: id })}
              placeholder="Select project..."
            />
          </div>

          {/* Row 4: Project Year | Date Hired */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-1">Project Year</label>
              <input value={form.projectYear} onChange={e => setForm({ ...form, projectYear: e.target.value })}
                placeholder="e.g. 2024" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-1">Date Hired</label>
              <input value={form.hiredDate} onChange={e => setForm({ ...form, hiredDate: e.target.value })}
                type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
            </div>
          </div>

          {/* Employment History */}
          <div>
            <label className="block text-[10px] font-medium text-slate-500 mb-1">Employment History / Previous Projects</label>
            <textarea value={form.employmentHistory} onChange={e => setForm({ ...form, employmentHistory: e.target.value })}
              placeholder="Employment History / Previous Projects..." rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
          </div>

          </div>
          {/* Footer buttons — pinned bottom */}
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 shrink-0 bg-white rounded-b-xl">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-[#f8931f] rounded-lg hover:bg-[#e07e0a] disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Detail Modal ─── */
function ProfileDetailModal({ personnel, onClose }: { personnel: PersonnelDetail; onClose: () => void }) {
  const navigate = useNavigate();
  const activeLoans = personnel.assignments.filter(a => !a.returnedAt);
  const pastLoans = personnel.assignments.filter(a => a.returnedAt);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-10 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mb-10" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b rounded-t-xl" style={{ background: '#012061' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UserCircle className="w-8 h-8 text-[#f8931f]" />
              <div>
                <h2 className="text-base font-bold text-white">{personnel.fullName}</h2>
                <p className="text-[10px] text-[#f8931f] tracking-widest uppercase">{personnel.status}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Info cards */}
        <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {personnel.designationLookup?.name && <InfoCard icon={<Briefcase className="w-3.5 h-3.5" />} label="Designation" value={personnel.designationLookup.name} />}
          {!personnel.designationLookup?.name && personnel.designation && <InfoCard icon={<Briefcase className="w-3.5 h-3.5" />} label="Designation" value={personnel.designation} />}
          {personnel.projectLookup?.name && <InfoCard icon={<Package className="w-3.5 h-3.5" />} label="Project" value={personnel.projectLookup.name} />}
          {personnel.institution?.name && <InfoCard icon={<Building2 className="w-3.5 h-3.5" />} label="Institution" value={personnel.institution.name} />}
          {personnel.email && <InfoCard icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={personnel.email} />}
          {personnel.phone && <InfoCard icon={<Phone className="w-3.5 h-3.5" />} label="Phone" value={personnel.phone} />}
          {personnel.hiredDate && <InfoCard icon={<Calendar className="w-3.5 h-3.5" />} label="Hired" value={new Date(personnel.hiredDate).toLocaleDateString()} />}
          {personnel.projectYear && <InfoCard icon={<Calendar className="w-3.5 h-3.5" />} label="Project Year" value={personnel.projectYear} />}
        </div>

        {/* Employment History */}
        {personnel.employmentHistory && (
          <div className="px-6 py-3 border-t">
            <h3 className="text-xs font-semibold text-[#012061] mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#f8931f]" />
              Employment History / Previous Projects
            </h3>
            <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed bg-slate-50 rounded-lg p-3">{personnel.employmentHistory}</p>
          </div>
        )}

        {/* Active Possessions */}
        <div className="px-6 py-3 border-t">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-[#012061] flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-[#f8931f]" />
              Active Possessions ({activeLoans.length})
            </h3>
            {activeLoans.length > 0 && (
              <button
                onClick={() => { onClose(); navigate(`/issuances?personnel=${personnel.id}`); }}
                className="text-[10px] font-semibold text-[#f8931f] hover:underline"
              >
                View in Issuances →
              </button>
            )}
          </div>
          {activeLoans.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No active possessions</p>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 border-b"><th className="py-1 text-left">Asset</th><th className="py-1 text-left">Serial #</th><th className="py-1 text-left">Since</th><th className="py-1 text-left">Condition</th><th className="py-1 text-left">Status</th></tr></thead>
              <tbody>
                {activeLoans.map(a => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-1.5 font-medium text-slate-700">{a.asset?.name || '—'}</td>
                    <td className="py-1.5 font-mono text-slate-500">{a.asset?.serialNumber || '—'}</td>
                    <td className="py-1.5 text-slate-500">{new Date(a.assignedAt).toLocaleDateString()}</td>
                    <td className="py-1.5"><span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[10px] font-medium">{a.condition || 'Good'}</span></td>
                    <td className="py-1.5"><span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold">ACTIVE</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Past Issuances */}
        <div className="px-6 py-3 border-t">
          <h3 className="text-xs font-semibold text-[#012061] mb-2 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            Past Issuances ({pastLoans.length})
          </h3>
          {pastLoans.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No past issuances</p>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 border-b"><th className="py-1 text-left">Asset</th><th className="py-1 text-left">Serial #</th><th className="py-1 text-left">Borrowed</th><th className="py-1 text-left">Returned</th><th className="py-1 text-left">Condition</th><th className="py-1 text-left">Status</th></tr></thead>
              <tbody>
                {pastLoans.map(a => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-1.5 font-medium text-slate-700">{a.asset?.name || '—'}</td>
                    <td className="py-1.5 font-mono text-slate-500">{a.asset?.serialNumber || '—'}</td>
                    <td className="py-1.5 text-slate-500">{new Date(a.assignedAt).toLocaleDateString()}</td>
                    <td className="py-1.5 text-slate-500">{a.returnedAt ? new Date(a.returnedAt).toLocaleDateString() : '—'}</td>
                    <td className="py-1.5"><span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-medium">{a.condition || 'Good'}</span></td>
                    <td className="py-1.5"><span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">RETURNED</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Employment History Log */}
        {personnel.historyLogs && personnel.historyLogs.length > 0 && (
          <div className="px-6 py-3 border-t">
            <h3 className="text-xs font-semibold text-[#012061] mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#f8931f]" />
              Employment History Log ({personnel.historyLogs.length})
            </h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b">
                  <th className="py-1 text-left">Date Logged</th>
                  <th className="py-1 text-left">Designation</th>
                  <th className="py-1 text-left">Institution</th>
                  <th className="py-1 text-left">Project</th>
                  <th className="py-1 text-left">Year</th>
                  <th className="py-1 text-left">Hired</th>
                </tr>
              </thead>
              <tbody>
                {personnel.historyLogs.map(h => (
                  <tr key={h.id} className="border-b border-slate-100">
                    <td className="py-1.5 text-slate-500">{new Date(h.loggedAt).toLocaleDateString()}</td>
                    <td className="py-1.5 font-medium text-slate-700">{h.designation || '—'}</td>
                    <td className="py-1.5 text-slate-500">{h.institutionName || '—'}</td>
                    <td className="py-1.5 text-slate-500">{h.projectName || '—'}</td>
                    <td className="py-1.5 text-slate-500">{h.projectYear || '—'}</td>
                    <td className="py-1.5 text-slate-500">{h.hiredDate ? new Date(h.hiredDate).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2">
      <span className="text-slate-400 mt-0.5">{icon}</span>
      <div><p className="text-[10px] text-slate-500">{label}</p><p className="text-xs font-medium text-slate-700">{value}</p></div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function ProfilesPage() {
  const navigate = useNavigate();
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Personnel | null>(null);
  const [detail, setDetail] = useState<PersonnelDetail | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sessionExpired, setSessionExpired] = useState(false);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Listen for forced session-expiry from API interceptor
  useEffect(() => {
    const handler = () => setSessionExpired(true);
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, []);

  const fetchPersonnel = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('limit', '50');
      const res = await apiFetch(`/personnel?${params}`);
      setPersonnel(res.data);
      setMeta(res.meta);
    } catch (err: any) {
      if (err instanceof ApiError && err.status !== 401) {
        showToast('error', err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPersonnel();
  }, [search]);

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this profile?')) return;
    try {
      await apiFetch(`/personnel/${id}`, { method: 'DELETE' });
      showToast('success', 'Profile deactivated.');
      fetchPersonnel();
    } catch (err: any) {
      if (err instanceof ApiError) {
        showToast('error', err.message);
      } else {
        showToast('error', 'Failed to deactivate profile.');
      }
    }
  };

  const openDetail = async (p: Personnel) => {
    try {
      const res = await apiFetch(`/personnel/${p.id}`);
      setDetail(res.data);
    } catch (err: any) {
      if (err instanceof ApiError) {
        showToast('error', err.message);
      } else {
        showToast('error', 'Failed to load profile details.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">Profiles</h1>
          </div>
          <button onClick={() => { setEditing(null); setShowForm(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#f8931f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e07e0a] transition-colors">
            <PlusCircle className="w-3.5 h-3.5" /> Add Profile
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
        </div>
      </div>

      {/* Table */}
      <div className="px-6 py-4">
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: '#e8ecf4' }}>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Name</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Designation</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Project</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Year</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Active Items</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Status</th>
              <th className="text-right px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading...</td></tr>
            ) : personnel.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm"><Users className="w-8 h-8 mx-auto mb-2 opacity-40" />No profiles yet</td></tr>
            ) : personnel.map(p => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="px-3 py-3">
                  <button onClick={() => openDetail(p)} className="text-sm font-semibold hover:underline" style={{ color: '#012061' }}>{p.fullName}</button>
                </td>
                <td className="px-3 py-3 text-sm text-slate-600">{p.designationLookup?.name || p.designation || '—'}</td>
                <td className="px-3 py-3 text-sm text-slate-600">{p.projectLookup?.name || '—'}</td>
                <td className="px-3 py-3 text-sm text-slate-600">{p.projectYear || '—'}</td>
                <td className="px-3 py-3">
                  {p.activeAssignments > 0 ? (
                    <button
                      onClick={() => navigate(`/issuances?personnel=${p.id}`)}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f8931f]/10 text-[#f8931f] hover:bg-[#f8931f]/20 transition-colors cursor-pointer"
                    >
                      <Package className="w-3 h-3" />{p.activeAssignments}
                    </button>
                  ) : <span className="text-xs text-slate-400">0</span>}
                </td>
                <td className="px-3 py-3">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${p.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                    {p.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openDetail(p)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-[#012061]" title="View"><Eye className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { setEditing(p); setShowForm(true); }} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-[#f8931f]" title="Edit">✏️</button>
                    <button onClick={() => handleDelete(p.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-[#7B1113]" title="Deactivate">🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta && (meta as { totalPages: number; page: number }).totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 px-6 py-4 text-xs">
          <span className="text-slate-500">Page {(meta as { page: number }).page} of {(meta as { totalPages: number }).totalPages}</span>
        </div>
      )}

      {/* Modals */}
      <PersonnelFormModal open={showForm} onClose={() => setShowForm(false)} onSave={fetchPersonnel} editing={editing} showToast={showToast} />
      {detail && <ProfileDetailModal personnel={detail} onClose={() => setDetail(null)} />}
      <SessionExpiredModal open={sessionExpired} onClose={() => setSessionExpired(false)} />

      {/* Toast Container */}
      <ToastContainer toasts={toasts} dismiss={dismissToast} />
    </div>
  );
}
