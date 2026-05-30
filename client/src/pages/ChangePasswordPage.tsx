import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Lock, CheckCircle2, XCircle } from 'lucide-react';

export default function ChangePasswordPage() {
  const { refreshAuth, mustChangePassword } = useAuth();
  const navigate = useNavigate();

  const isForced = mustChangePassword;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Password strength criteria
  const criteria = useMemo(() => {
    const hasLength = newPassword.length >= 8;
    const hasUpper = /[A-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
    return { hasLength, hasUpper, hasNumber, hasSpecial };
  }, [newPassword]);

  const metCount = Object.values(criteria).filter(Boolean).length;

  const strengthLabel = metCount <= 2 ? 'Weak' : metCount === 3 ? 'Medium' : 'Strong';
  const strengthColor = metCount <= 2 ? 'text-red-500' : metCount === 3 ? 'text-orange-500' : 'text-green-500';
  const barColor = metCount <= 2 ? 'bg-red-500' : metCount === 3 ? 'bg-orange-500' : 'bg-green-500';

  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!isForced && !currentPassword) {
      setError('Current password is required.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (metCount < 4) {
      setError('Password does not meet all strength requirements.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...(isForced ? {} : { currentPassword }),
          newPassword,
          confirmPassword,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to change password');
      }

      // Immediately update auth state so ProtectedRoute doesn't redirect back
      // Do NOT rely on refreshAuth() alone — it may skip the API call if the
      // access token is still young, keeping the stale mustChangePassword=true
      // in the cached user. Instead, fetch /me directly and update state.
      try {
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const meData = await meRes.json();
        if (meData.success) {
          localStorage.setItem('cachedUser', JSON.stringify(meData.data));
        }
      } catch { /* non-critical — refreshAuth will also try */ }

      // refreshAuth will now see the updated cachedUser or will hit the API
      // to get fresh mustChangePassword=false from the backend
      await refreshAuth();
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-900 flex flex-col">
      {/* Navy header bar */}
      <div className="bg-[#012061] h-16 flex items-center px-4 sm:px-6 shadow-md">
        <span className="text-white text-lg font-bold tracking-wide">AIO System</span>
      </div>

      {/* Centered card */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-xl shadow-xl p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#012061]/10 mb-4">
              <Lock className="h-7 w-7 text-[#012061]" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 text-center">
              {isForced ? 'Change Your Password' : 'Change Password'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-2">
              {isForced
                ? 'Your administrator created a temporary password for your account. Please set your own password to continue.'
                : 'Update your account password. Choose a strong password that you haven\'t used before.'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current Password (voluntary only) */}
            {!isForced && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Current Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 pr-10 text-sm text-slate-900 dark:text-slate-100 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] outline-none transition"
                    placeholder="Enter current password"
                    required={!isForced}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 pr-10 text-sm text-slate-900 dark:text-slate-100 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] outline-none transition"
                  placeholder="Enter new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Strength indicator */}
            {newPassword.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Strength:</span>
                  <span className={`font-semibold ${strengthColor}`}>{strengthLabel}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                    style={{ width: `${(metCount / 4) * 100}%` }}
                  />
                </div>
                <ul className="space-y-1 text-xs">
                  <li className={`flex items-center gap-1.5 ${criteria.hasLength ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`}>
                    {criteria.hasLength ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    At least 8 characters
                  </li>
                  <li className={`flex items-center gap-1.5 ${criteria.hasUpper ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`}>
                    {criteria.hasUpper ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    One uppercase letter
                  </li>
                  <li className={`flex items-center gap-1.5 ${criteria.hasNumber ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`}>
                    {criteria.hasNumber ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    One number
                  </li>
                  <li className={`flex items-center gap-1.5 ${criteria.hasSpecial ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`}>
                    {criteria.hasSpecial ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    One special character
                  </li>
                </ul>
              </div>
            )}

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Confirm New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm text-slate-900 dark:text-slate-100 outline-none transition ${
                    confirmPassword.length > 0 && !passwordsMatch
                      ? 'border-red-400 dark:border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                      : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f]'
                  }`}
                  placeholder="Confirm new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
              {passwordsMatch && (
                <p className="text-xs text-green-500 mt-1">Passwords match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || metCount < 4 || !passwordsMatch || (!isForced && !currentPassword)}
              className="w-full py-2.5 px-4 rounded-lg text-white font-semibold text-sm transition-colors bg-[#f8931f] hover:bg-[#e07e0a] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Changing Password...' : 'Change Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}