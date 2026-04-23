import { useState, FormEvent } from 'react';

const ROLES = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'STAFF_ADMIN', label: 'Staff-Admin' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'GUEST', label: 'Guest' },
];

interface Props {
  onSubmit: (data: {
    fullName: string;
    username: string;
    email: string;
    password: string;
    role: string;
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
  const [showPw, setShowPw] = useState(false);
  const [showCp, setShowCp] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
    setErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = 'Full name is required';
    if (!form.username.trim()) e.username = 'Username is required';
    else if (!/^[a-zA-Z0-9_]{3,20}$/.test(form.username)) e.username = '3-20 chars, alphanumeric + underscore';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email format';
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 8) e.password = 'Minimum 8 characters';
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
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      });
    } catch {
      // handled by parent
    } finally {
      setLoading(false);
    }
  };

  const fieldError = (field: string) => errors[field] || serverErrors?.[field];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-lg border border-border bg-white dark:bg-card shadow-lg" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <h2 className="text-lg font-bold text-gray-900 dark:text-card-foreground px-6 pt-6 pb-2 shrink-0">Add User</h2>

        {/* Body — scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-2 space-y-4">
          {/* Full Name */}
          <div>
            <label className="text-xs font-medium text-gray-700">Full Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.fullName} onChange={set('fullName')} className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            {fieldError('fullName') && <p className="text-xs text-red-500 mt-1">{fieldError('fullName')}</p>}
          </div>

          {/* Username */}
          <div>
            <label className="text-xs font-medium text-gray-700">Username <span className="text-red-500">*</span></label>
            <input type="text" value={form.username} onChange={set('username')} className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            {fieldError('username') && <p className="text-xs text-red-500 mt-1">{fieldError('username')}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="text-xs font-medium text-gray-700">Email <span className="text-red-500">*</span></label>
            <input type="email" value={form.email} onChange={set('email')} className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            {fieldError('email') && <p className="text-xs text-red-500 mt-1">{fieldError('email')}</p>}
          </div>

          {/* Password */}
          <div>
            <label className="text-xs font-medium text-gray-700">Password <span className="text-red-500">*</span></label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')} className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm pr-10" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
            {fieldError('password') && <p className="text-xs text-red-500 mt-1">{fieldError('password')}</p>}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="text-xs font-medium text-gray-700">Confirm Password <span className="text-red-500">*</span></label>
            <div className="relative">
              <input type={showCp ? 'text' : 'password'} value={form.confirmPassword} onChange={set('confirmPassword')} className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm pr-10" />
              <button type="button" onClick={() => setShowCp(!showCp)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">
                {showCp ? '🙈' : '👁️'}
              </button>
            </div>
            {fieldError('confirmPassword') && <p className="text-xs text-red-500 mt-1">{fieldError('confirmPassword')}</p>}
          </div>

          {/* Role */}
          <div>
            <label className="text-xs font-medium text-gray-700">Role <span className="text-red-500">*</span></label>
            <select value={form.role} onChange={set('role')} className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {fieldError('role') && <p className="text-xs text-red-500 mt-1">{fieldError('role')}</p>}
          </div>
        </form>

        {/* Footer — fixed */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={loading} className="rounded-md border border-input px-4 py-1.5 text-sm hover:bg-accent">Cancel</button>
          <button type="submit" disabled={loading} className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50" onClick={(e) => { e.preventDefault(); handleSubmit(e as any); }}>
            {loading ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}