import { useState, FormEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';

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

  const handleSubmit = async (ev?: FormEvent) => {
    ev?.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const payload: { fullName: string; username: string; email: string; role: string; password?: string } = {
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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full Name <span className="text-red-500">*</span></Label>
            <Input id="fullName" type="text" value={form.fullName} onChange={set('fullName')} className="bg-white" />
            {fieldError('fullName') && <p className="text-xs text-red-500">{fieldError('fullName')}</p>}
          </div>

          {/* Username */}
          <div className="space-y-1.5">
            <Label htmlFor="username">Username <span className="text-red-500">*</span></Label>
            <Input id="username" type="text" value={form.username} onChange={set('username')} className="bg-white" />
            <p className="text-xs text-amber-600">Changing the username will require the user to log in again.</p>
            {fieldError('username') && <p className="text-xs text-red-500">{fieldError('username')}</p>}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
            <Input id="email" type="email" value={form.email} onChange={set('email')} className="bg-white" />
            {fieldError('email') && <p className="text-xs text-red-500">{fieldError('email')}</p>}
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label htmlFor="role">Role <span className="text-red-500">*</span></Label>
            <select
              id="role"
              value={form.role}
              onChange={set('role')}
              disabled={isSelf}
              className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {isSelf && <p className="text-xs text-amber-600">You cannot change your own role.</p>}
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
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword">New Password <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Input id="newPassword" type={showPw ? 'text' : 'password'} value={newPassword} onChange={e => { setNewPassword(e.target.value); setErrors(prev => { const next = { ...prev }; delete next.newPassword; return next; }); }} className="bg-white pr-10" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldError('newPassword') && <p className="text-xs text-red-500">{fieldError('newPassword')}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm Password <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Input id="confirmPassword" type={showCp ? 'text' : 'password'} value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setErrors(prev => { const next = { ...prev }; delete next.confirmPassword; return next; }); }} className="bg-white pr-10" />
                    <button type="button" onClick={() => setShowCp(!showCp)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showCp ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldError('confirmPassword') && <p className="text-xs text-red-500">{fieldError('confirmPassword')}</p>}
                </div>
              </div>
            )}
          </div>
        </form>

        <DialogFooter showCloseButton={false}>
          <DialogClose render={<Button variant="outline" disabled={loading} />}>
            Cancel
          </DialogClose>
          <Button onClick={() => handleSubmit()} disabled={loading}>
            {loading ? 'Updating...' : 'Update User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}