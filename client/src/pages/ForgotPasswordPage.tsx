import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Something went wrong');
      setSent(true);
    } catch (c: any) {
      setErr(c.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

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
          {/* Back to login */}
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-[#012061] dark:hover:text-slate-100 transition-colors mb-10"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>

          {sent ? (
            /* ── Success state ── */
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950 mb-6 border border-emerald-200">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h1 className="text-2xl font-bold text-[#012061] dark:text-slate-100 mb-3">Check Your Email</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
                If an account with <strong className="text-[#012061] dark:text-slate-100">{email}</strong> exists, we've sent a password reset link. Check your inbox and spam folder.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#f8931f] hover:text-[#e0841a] transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Return to login
              </Link>
            </div>
          ) : (
            /* ── Form ── */
            <>
              <div className="mb-10">
                <h1 className="text-3xl font-bold text-[#012061] dark:text-slate-100 mb-2">Forgot Password</h1>
                <div className="w-10 h-[3px] rounded-full bg-[#f8931f]" />
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-3">
                  Enter your email address and we'll send you a link to reset your password.
                </p>
              </div>

              {err && (
                <div className="mb-6 p-4 bg-[#7B1113]/5 border border-[#7B1113]/20 text-[#7B1113] text-sm rounded-lg flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {err}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#012061] dark:text-slate-100/50">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@institution.edu"
                      required
                      className="w-full pl-10 pr-4 py-3 bg-white dark:!bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:!text-slate-100 placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#f8931f]/30 focus:border-[#f8931f] transition-all hover:border-slate-300"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full py-3 px-4 bg-[#f8931f] text-white font-semibold rounded-xl shadow-lg shadow-[#f8931f]/20 hover:bg-[#e0841a] hover:shadow-xl transform transition-all active:scale-[0.98] flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Send Reset Link
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
