import { useState, useRef, FormEvent, useEffect } from 'react';
import { X, UserCog, Eye, EyeOff } from 'lucide-react';
import { PermissionChecklist, getDefaultPermissions } from './PermissionChecklist';

const ALL_ROLES = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'STAFF_ADMIN', label: 'Staff-Admin' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'GUEST', label: 'Guest' },
];

interface User {
  id: string;
  username: string;
  fullName: string | null;
  email: string;
  role: string;
  status: string;
  permissions: string[];
  lastLogin: string | null;
  createdAt: string;
}

interface Props {
  user: User;
  isSelf: boolean;
  onSubmit: (data: {
    fullName: string;
    username: string;
    email: string;
    role: string;
    password?: string;
    permissions: string[];
  }) => Promise<void>;
  onClose: () => void;
  serverErrors?: Record<string, string>;
}

export function EditUserModal({ user, isSelf, onSubmit, onClose, serverErrors }: Props) {
  const availableRoles = ALL_ROLES;
  const [form, setForm] = useState({
    fullName: user.fullName || '',
    username: user.username,
    email: user.email,
    role: user.role,
  });
  const [permissions, setPermissions] = useState<string[]>(
    user.permissions || getDefaultPermissions(user.role)
  );
  const [showPwSection, setShowPwSection] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showCp, setShowCp] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const prevRoleRef = useRef(form.role);

  console.log('EditUserModal received permissions:', user.permissions);

  // Auto-apply default permissions when role changes (unless self-editing)
  useEffect(() => {
    if (form.role !== prevRoleRef.current) {
      prevRoleRef.current = form.role;
      if (!isSelf) {
        setPermissions(getDefaultPermissions(form.role));
      }
    }
  }, [form.role, isSelf]);

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
    if (showPwSection) {
      if (!newPassword) e.newPassword = 'New password is required';
      else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/.test(newPassword)) e.newPassword = 'Password must be 8+ chars with uppercase, number, and special character';
      if (newPassword !== confirmPassword) e.confirmPassword = 'Passwords do not match';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev?: FormEvent) => {
    ev?.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const payload: { fullName: string; username: string; email: string; role: string; password?: string; permissions: string[] } = {
        fullName: form.fullName.trim(),
        username: form.username.trim().toLowerCase(),
        email: form.email.trim(),
        role: form.role,
        permissions,
      };
      if (showPwSection) payload.password = newPassword;
      await onSubmit(payload);
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
              <UserCog className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-white">Edit User</h2>
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
                  <input type="text" value={form.username} onChange={set('username')} className={inputClass} placeholder="Username" />
                  <p className="text-[10px] text-amber-600 mt-1">Changing username will require re-login.</p>
                  {fieldError('username') && <p className="text-xs text-red-500 mt-0.5">{fieldError('username')}</p>}
                </div>
                <div>
                  <label className={labelClass}>Email <span className="text-red-500">*</span></label>
                  <input type="email" value={form.email} onChange={set('email')} className={inputClass} placeholder="user@example.com" />
                  {fieldError('email') && <p className="text-xs text-red-500 mt-1">{fieldError('email')}</p>}
                </div>
              </div>

              {/* Role */}
              <div>
                <label className={labelClass}>Role <span className="text-red-500">*</span></label>
                <select
                  value={form.role}
                  onChange={set('role')}
                  disabled={isSelf}
                  className={`${inputClass} ${isSelf ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {isSelf && <p className="text-[10px] text-amber-600 mt-1">You cannot change your own role.</p>}
                {fieldError('role') && <p className="text-xs text-red-500 mt-1">{fieldError('role')}</p>}
              </div>

              {/* Permissions */}
              <PermissionChecklist selected={permissions} onChange={setPermissions} />

              {/* Password Reset Section */}
              <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                {!showPwSection ? (
                  <button type="button" onClick={() => setShowPwSection(true)} className="text-sm font-medium text-[#f8931f] hover:underline inline-flex items-center gap-1">
                    Reset Password
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Password Reset</span>
                      <button type="button" onClick={() => { setShowPwSection(false); setNewPassword(''); setConfirmPassword(''); }} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                        Cancel reset
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>New Password <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <input type={showPw ? 'text' : 'password'} value={newPassword} onChange={e => { setNewPassword(e.target.value); setErrors(prev => { const next = { ...prev }; delete next.newPassword; return next; }); }} className={`${inputClass} pr-10`} placeholder="Min. 8 characters" />
                          <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {fieldError('newPassword') && <p className="text-xs text-red-500 mt-1">{fieldError('newPassword')}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Confirm Password <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <input type={showCp ? 'text' : 'password'} value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setErrors(prev => { const next = { ...prev }; delete next.confirmPassword; return next; }); }} className={`${inputClass} pr-10`} placeholder="Re-enter password" />
                          <button type="button" onClick={() => setShowCp(!showCp)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                            {showCp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {fieldError('confirmPassword') && <p className="text-xs text-red-500 mt-1">{fieldError('confirmPassword')}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* ── Footer ── */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
            <button type="button" onClick={onClose} disabled={loading} className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-[#012061] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="rounded-lg bg-[#f8931f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e0841a] disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
              {loading ? 'Updating...' : 'Update User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}