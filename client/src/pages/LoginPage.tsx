import { useState, FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import {
  Loader2, ArrowRight, User, Lock, AlertTriangle,
  Eye, EyeOff, ArrowLeft, ShieldEllipsis,
} from 'lucide-react';
import { Checkbox } from '../components/ui/checkbox';

/* ═════════════════════════════════════════════════════
   SHARED LAYOUT SHELL — SPLIT SCREEN
   ═════════════════════════════════════════════════════ */
function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex">
      {/* ─── Left Panel — Brand (40%, hidden on mobile) ─── */}
      <div className="hidden md:flex w-[40%] relative overflow-hidden bg-[#012061] flex-col items-center justify-center p-12">
        {/* Data Mesh overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(248,147,31,0.06) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(248,147,31,0.06) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />

        {/* Node dots at intersections */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(248,147,31,0.12) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Brand content */}
        <div className="relative z-10 text-center">
          {/* Orange diamond accent */}
          <div className="mx-auto mb-8 h-3 w-3 rotate-45 rounded-[2px] bg-[#f8931f]" />

          <h1 className="text-5xl font-extrabold tracking-tight text-white mb-4">
            AIO SYSTEM
          </h1>
          <p className="text-slate-300 text-sm tracking-wide leading-relaxed max-w-[280px] mx-auto">
            Unified Asset &amp; Inventory Research Management
          </p>

          {/* Decorative line */}
          <div className="mt-8 mx-auto w-16 h-[2px] rounded-full bg-[#f8931f]" />
        </div>

        {/* Corner glows */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#f8931f]/5 rounded-full blur-3xl -mr-24 -mt-24" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/3 rounded-full blur-3xl -ml-24 -mb-24" />

        {/* Bottom tagline */}
        <div className="absolute bottom-8 left-0 right-0 text-center">
          <p className="text-[10px] text-slate-500 tracking-widest uppercase">Secured Research Gateway</p>
        </div>
      </div>

      {/* ─── Right Panel — Form (60% / 100% mobile) ─── */}
      <div className="w-full md:w-[60%] flex flex-col items-center justify-center p-6 md:p-16 bg-slate-50 relative">
        {/* Subtle background grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, #01206106 1px, transparent 1px),
              linear-gradient(to bottom, #01206106 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative z-10 w-full max-w-[400px]">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════
   LOGIN PAGE
   ═════════════════════════════════════════════════════ */
export default function LoginPage() {
  const { login, isAuthenticated, requiresTwoFactor } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await login(email, password);
      if (!requiresTwoFactor) navigate('/');
    } catch (c: any) {
      setErr(c.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  const handle2FaSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await login(email, password, twoFactorToken);
      navigate('/');
    } catch (c: any) {
      setErr(c.message || 'Invalid 2FA code');
    } finally {
      setLoading(false);
    }
  };

  /* ═════════════════════════════════════════════════════
     2FA VIEW
     ═════════════════════════════════════════════════════ */
  if (requiresTwoFactor) {
    return (
      <LayoutShell>
        {/* Mobile logo */}
        <div className="md:hidden text-center mb-8">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#f8931f] mb-3">
            <span className="text-white font-extrabold text-sm">AIO</span>
          </div>
          <h2 className="text-xl font-bold text-[#012061]">AIO SYSTEM</h2>
        </div>

        <button
          onClick={() => { /* soft reset */ }}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-[#012061] transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#f8931f]/10 mb-4 border border-[#f8931f]/20">
            <ShieldEllipsis className="w-6 h-6 text-[#f8931f]" />
          </div>
          <h1 className="text-3xl font-bold text-[#012061] mb-2">Two-Factor Authentication</h1>
          <p className="text-slate-500 text-sm">
            Enter the 6-digit code from your authenticator app
          </p>
        </div>

        {err && (
          <div className="mb-6 p-4 bg-[#7B1113]/5 border border-[#7B1113]/20 text-[#7B1113] text-sm rounded-lg flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {err}
          </div>
        )}

        <form onSubmit={handle2FaSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Authentication Code
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={twoFactorToken}
                onChange={e => setTwoFactorToken(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-center text-2xl font-semibold tracking-[0.5em] placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#f8931f]/30 focus:border-[#f8931f] transition-all"
                autoFocus
              />
            </div>
            <p className="text-xs text-slate-400 text-center">
              Code refreshes every 30 seconds
            </p>
          </div>

          <Button
            type="submit"
            disabled={loading || twoFactorToken.length !== 6}
            className="w-full py-3 px-4 bg-[#f8931f] text-white font-semibold rounded-xl shadow-lg shadow-[#f8931f]/20 hover:bg-[#e0841a] hover:shadow-xl hover:shadow-[#012061]/10 transform transition-all active:scale-[0.98] flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Verify
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </Button>
        </form>
      </LayoutShell>
    );
  }

  /* ═════════════════════════════════════════════════════
     LOGIN VIEW
     ═════════════════════════════════════════════════════ */
  return (
    <LayoutShell>
      {/* Mobile logo */}
      <div className="md:hidden text-center mb-8">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#f8931f] mb-3">
          <span className="text-white font-extrabold text-sm">AIO</span>
        </div>
        <h2 className="text-xl font-bold text-[#012061]">AIO SYSTEM</h2>
      </div>

      {/* Logos — right panel */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <img src="/aio-system/logo-uppi.png" alt="UPPI" className="h-[84px] w-[84px] object-contain" />
        <img src="/aio-system/logo-drdf.png" alt="DRDF" className="h-[84px] w-[84px] object-contain" />
      </div>

      {/* Welcome heading */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-[#012061] mb-2">Access Portal</h1>
        <div className="w-10 h-[3px] rounded-full bg-[#f8931f]" />
        <p className="text-slate-500 text-sm mt-3">
          Enter your credentials to access the dashboard
        </p>
      </div>

      {err && (
        <div className="mb-6 p-4 bg-[#7B1113]/5 border border-[#7B1113]/20 text-[#7B1113] text-sm rounded-lg flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {err}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Email
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#012061]/50">
              <User className="w-4 h-4" />
            </span>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@institution.edu"
              required
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#f8931f]/30 focus:border-[#f8931f] transition-all hover:border-slate-300"
            />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Password
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#012061]/50">
              <Lock className="w-4 h-4" />
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#f8931f]/30 focus:border-[#f8931f] transition-all hover:border-slate-300"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#012061]/40 hover:text-[#012061] transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Remember Me & Forgot Password */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Checkbox
              id="remember"
              checked={rememberMe}
              onCheckedChange={(checked: boolean) => setRememberMe(checked)}
              className="border-slate-300 data-[state=checked]:bg-[#f8931f] data-[state=checked]:border-[#f8931f]"
            />
            <label htmlFor="remember" className="text-xs text-slate-500 cursor-pointer select-none">Remember me</label>
          </div>
          <a href="#" className="text-xs text-slate-500 hover:text-[#f8931f] transition-colors" onClick={e => e.preventDefault()}>Forgot password?</a>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-[#f8931f] text-white font-semibold rounded-xl shadow-lg shadow-[#f8931f]/20 hover:bg-[#e0841a] hover:shadow-xl hover:shadow-[#012061]/10 transform transition-all active:scale-[0.98] flex items-center justify-center gap-2 group"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Sign In
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-8 text-center">
        <p className="text-slate-400 text-xs">
          &copy; {new Date().getFullYear()} Office Asset Manager
        </p>
        <a href="#" className="text-[10px] text-slate-400 hover:text-[#012061] transition-colors tracking-wide uppercase" onClick={e => e.preventDefault()}>Help &amp; Support</a>
      </div>
    </LayoutShell>
  );
}