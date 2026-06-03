import { useState, useMemo, FormEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Lock, ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertTriangle, Eye, EyeOff, XCircle } from 'lucide-react';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState(false);

  // Password strength criteria
  const criteria = useMemo(() => {
    const hasLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    return { hasLength, hasUpper, hasNumber, hasSpecial };
  }, [password]);

  const metCount = Object.values(criteria).filter(Boolean).length;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  if (!token) {
    return (
      <div className="min-h-dvh w-full flex items-center justify-center bg-light-bg dark:bg-slate-900 p-6">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950 mb-6 border border-red-200">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-[#012061] dark:text-slate-100 mb-3">Invalid Reset Link</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
            This password reset link is missing or invalid. Please request a new one.
          </p>
          <Link
            to="/forgot-password"
            className="inline-flex items-center gap-2 rounded-lg bg-[#f8931f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e0841a] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Request New Link
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');

    // Strong password validation
    if (password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    if (metCount < 4) {
      setErr('Password does not meet all strength requirements.');
      return;
    }
    if (password !== confirmPassword) {
      setErr('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Reset failed');
      setSuccess(true);
    } catch (c: any) {
      setErr(c.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-dvh w-full flex items-center justify-center bg-light-bg dark:bg-slate-900 p-6">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950 mb-6 border border-emerald-200">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-[#012061] dark:text-slate-100 mb-3">Password Reset!</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
            Your password has been successfully reset. You can now sign in with your new password.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="inline-flex items-center gap-2 rounded-lg bg-[#f8931f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e0841a] transition-colors"
          >
            Sign In
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const strengthLabel = metCount <= 2 ? 'Weak' : metCount === 3 ? 'Medium' : 'Strong';
  const strengthColor = metCount <= 2 ? 'text-red-500' : metCount === 3 ? 'text-orange-500' : 'text-green-500';
  const barColor = metCount <= 2 ? 'bg-red-500' : metCount === 3 ? 'bg-orange-500' : 'bg-green-500';

  return (
    <div className="min-h-dvh w-full flex bg-light-bg dark:bg-slate-900">
      <div className="w-full flex flex-col items-center justify-center p-6 md:p-16 relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(to right, #01206106 1px, transparent 1px), linear-gradient(to bottom, #01206106 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }}
        />
        <div className="relative z-10 w-full max-w-[400px]">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-[#012061] dark:hover:text-slate-100 transition-colors mb-10"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>

          <div className="mb-10">
            <h1 className="text-3xl font-bold text-[#012061] dark:text-slate-100 mb-2">Reset Password</h1>
            <div className="w-10 h-[3px] rounded-full bg-[#f8931f]" />
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-3">Enter your new password below.</p>
          </div>

          {err && (
            <div className="mb-6 p-4 bg-[#7B1113]/5 border border-[#7B1113]/20 text-[#7B1113] text-sm rounded-lg flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {err}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">New Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#012061] dark:text-slate-100/50">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  className="w-full pl-10 pr-10 py-3 bg-white dark:!bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:!text-slate-100 placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#f8931f]/30 focus:border-[#f8931f] transition-all hover:border-slate-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#012061] dark:text-slate-100/40 hover:text-[#012061] dark:hover:text-slate-100 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Strength indicator */}
            {password.length > 0 && (
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

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Confirm Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#012061] dark:text-slate-100/50">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  className={`w-full pl-10 pr-4 py-3 bg-white dark:!bg-slate-800 border rounded-xl text-slate-900 dark:!text-slate-100 placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#f8931f]/30 focus:border-[#f8931f] transition-all hover:border-slate-300 ${
                    confirmPassword.length > 0 && !passwordsMatch
                      ? 'border-red-400 dark:border-red-500'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                />
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
              disabled={loading || metCount < 4 || !passwordsMatch}
              className="w-full py-3 px-4 bg-[#f8931f] text-white font-semibold rounded-xl shadow-lg shadow-[#f8931f]/20 hover:bg-[#e0841a] hover:shadow-xl transform transition-all active:scale-[0.98] flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Reset Password
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}