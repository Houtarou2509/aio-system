import { useState, FormEvent, useEffect } from 'react';
import { X, UserPlus, Eye, EyeOff, Info } from 'lucide-react';
import { PermissionChecklist, getDefaultPermissions } from './PermissionChecklist';

// GUEST role hidden until guest link flow is implemented
const ROLES = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'STAFF_ADMIN', label: 'Staff-Admin' },
  { value: 'STAFF', label: 'Staff' },
];

interface Props {
  onSubmit: (data: {
    fullName: string;
    username: string;
    email: string;
    password: string;
    role: string;
    permissions: string[];
  }) => Promise<void>;
  onClose: () => void;
  serverErrors?: Record<string, string>;
}

export function AddUserModal({ onSubmit, onClose, serverErrors }: Props) {
  const [form, setForm] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'STAFF',
  });
  const [permissions, setPermissions] = useState<string[]>(getDefaultPermissions('STAFF'));
  const [showPw, setShowPw] = useState(false);
  const [showCp, setShowCp] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Auto-apply default permissions when role changes
  useEffect(() => {
    setPermissions(getDefaultPermissions(form.role));
  }, [form.role]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
    setErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = 'Full name is required';

    const trimmedUsername = form.username.trim();
    if (!trimmedUsername) e.username = 'Username is required';
    else if (trimmedUsername.length < 3) e.username = 'Username must be at least 3 characters';
    else if (!/^[a-zA-Z0-9._-]+$/.test(trimmedUsername)) e.username = 'Username can only contain letters, numbers, dots, hyphens, and underscores';

    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email format';

    // Temporary password — simple requirement: min 6 chars
    if (!form.password) e.password = 'Temporary password is required';
    else if (form.password.length < 6) e.password = 'Temporary password must be at least 6 characters';

    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    if (!form.role) e.role = 'Role is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await onSubmit({
        fullName: form.fullName.trim(),
        // Normalize username to lowercase before sending
        username: form.username.trim().toLowerCase(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        permissions,
      });
    } catch {
      // handled by parent
    } finally {
      setLoading(false);
    }
  };

  const fieldError = (field: string) => errors[field] || serverErrors?.[field];

  const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#f8931f] focus:border-transparent transition";
  const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 block";

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-slate-800 shadow-xl" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="bg-[#012061] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#f8931f] text-white">
              <UserPlus className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-white">Add User</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/20 bg-white dark:bg-slate-800/10 p-1.5 text-slate-700 dark:text-white/60 hover:text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          {/* Scrollable fields */}
          <div className="flex-1 overflow-y-auto px-6">
            <div className="grid grid-cols-1 gap-4 py-4">

              {/* Full Name */}
              <div>
                <label className={labelClass}>Full Name <span className="text-red-500">*</span></label>
                <input type="text" value={form.fullName} onChange={set('fullName')} className={inputClass} placeholder="Enter full name" />
                {fieldError('fullName') && <p className="text-xs text-red-500 mt-1">{fieldError('fullName')}</p>}
              </div>

              {/* Username & Email — side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Username <span className="text-red-500">*</span></label>
                  <input type="text" value={form.username} onChange={set('username')} className={inputClass} placeholder="e.g. juan.delacruz" />
                  <p className="text-[10px] text-slate-400 mt-1">Will be saved as lowercase</p>
                  {fieldError('username') && <p className="text-xs text-red-500 mt-0.5">{fieldError('username')}</p>}
                </div>
                <div>
                  <label className={labelClass}>Email <span className="text-red-500">*</span></label>
                  <input type="email" value={form.email} onChange={set('email')} className={inputClass} placeholder="user@example.com" />
                  {fieldError('email') && <p className="text-xs text-red-500 mt-1">{fieldError('email')}</p>}
                </div>
              </div>

              {/* Temporary Password & Confirm — side by side */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <label className={`${labelClass} mb-0`}>Temporary Password <span className="text-red-500">*</span></label>
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                    <Info className="w-2.5 h-2.5" />
                    User will set their own strong password on first login
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="relative">
                      <input type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')} className={`${inputClass} pr-10`} placeholder="Min. 6 characters" />
                      <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {fieldError('password') && <p className="text-xs text-red-500 mt-1">{fieldError('password')}</p>}
                  </div>
                  <div>
                    <div className="relative">
                      <input type={showCp ? 'text' : 'password'} value={form.confirmPassword} onChange={set('confirmPassword')} className={`${inputClass} pr-10`} placeholder="Re-enter password" />
                      <button type="button" onClick={() => setShowCp(!showCp)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                        {showCp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {fieldError('confirmPassword') && <p className="text-xs text-red-500 mt-1">{fieldError('confirmPassword')}</p>}
                  </div>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className={labelClass}>Role <span className="text-red-500">*</span></label>
                <select value={form.role} onChange={set('role')} className={inputClass}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {fieldError('role') && <p className="text-xs text-red-500 mt-1">{fieldError('role')}</p>}
              </div>

              {/* Permissions */}
              <PermissionChecklist selected={permissions} onChange={setPermissions} />

            </div>
          </div>

          {/* ── Footer ── */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
            <button type="button" onClick={onClose} disabled={loading} className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-[#012061] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="rounded-lg bg-[#f8931f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e0841a] disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}