import { useState, FormEvent } from 'react';

const ROLES = [
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
  }) => Promise<void>;
  onClose: () => void;
  serverErrors?: Record<string, string>;
}

export function EditUserModal({ user, isSelf, onSubmit, onClose, serverErrors }: Props) {
  const [form, setForm] = useState({
    fullName: user.fullName || '',
    username: user.username,
    email: user.email,
    role: user.role,
  });
  const [showPwSection, setShowPwSection] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    if (showPwSection) {
      if (!newPassword) e.newPassword = 'New password is required';
      else if (newPassword.length < 8) e.newPassword = 'Minimum 8 characters';
      if (newPassword !== confirmPassword) e.confirmPassword = 'Passwords do not match';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const payload: any = {
        fullName: form.fullName.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        role: form.role,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Edit User</h2>
        </div>

        {/* Body — scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Full Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.fullName} onChange={set('fullName')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            {fieldError('fullName') && <p className="text-xs text-red-500 mt-1">{fieldError('fullName')}</p>}
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium mb-1">Username <span className="text-red-500">*</span></label>
            <input type="text" value={form.username} onChange={set('username')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <p className="text-xs text-amber-600 mt-1">Changing the username will require the user to log in again.</p>
            {fieldError('username') && <p className="text-xs text-red-500 mt-1">{fieldError('username')}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium mb-1">Email <span className="text-red-500">*</span></label>
            <input type="email" value={form.email} onChange={set('email')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            {fieldError('email') && <p className="text-xs text-red-500 mt-1">{fieldError('email')}</p>}
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium mb-1">Role <span className="text-red-500">*</span></label>
            <select value={form.role} onChange={set('role')} disabled={isSelf} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {isSelf && <p className="text-xs text-amber-600 mt-1">You cannot change your own role.</p>}
          </div>

          {/* Password Reset Section */}
          <div className="border-t pt-4">
            {!showPwSection ? (
              <button type="button" onClick={() => setShowPwSection(true)} className="text-sm text-primary hover:underline">
                Reset Password
              </button>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Password Reset</span>
                  <button type="button" onClick={() => { setShowPwSection(false); setNewPassword(''); setConfirmPassword(''); }} className="text-xs text-gray-500 hover:text-gray-700">Cancel reset</button>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">New Password <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} value={newPassword} onChange={e => { setNewPassword(e.target.value); setErrors(prev => { const next = { ...prev }; delete next.newPassword; return next; }); }} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm pr-10" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">{showPw ? '🙈' : '👁️'}</button>
                  </div>
                  {fieldError('newPassword') && <p className="text-xs text-red-500 mt-1">{fieldError('newPassword')}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Confirm Password <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input type={showCp ? 'text' : 'password'} value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setErrors(prev => { const next = { ...prev }; delete next.confirmPassword; return next; }); }} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm pr-10" />
                    <button type="button" onClick={() => setShowCp(!showCp)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">{showCp ? '🙈' : '👁️'}</button>
                  </div>
                  {fieldError('confirmPassword') && <p className="text-xs text-red-500 mt-1">{fieldError('confirmPassword')}</p>}
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Footer — fixed */}
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={loading} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none">
            Cancel
          </button>
          <button onClick={() => handleSubmit({ preventDefault: () => {} } as FormEvent)} disabled={loading} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none">
            {loading ? 'Updating...' : 'Update User'}
          </button>
        </div>
      </div>
    </div>
  );
}