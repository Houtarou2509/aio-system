import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, ShieldCheck, Copy, Check, ArrowLeft, Smartphone, KeyRound } from 'lucide-react';

export default function Setup2FaPage() {
  const { setup2Fa, verify2Fa, user } = useAuth();
  const navigate = useNavigate();
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (user?.twoFactorEnabled) return;
    setup2Fa()
      .then(data => {
        setOtpauthUrl(data.otpauthUrl);
        setSecret(data.secret);
      })
      .catch(e => setErr(e.message));
  }, []);

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (user?.twoFactorEnabled) {
    return (
      <div className="flex flex-col h-screen pt-14 md:pt-0 bg-[#012061] md:bg-transparent">
        <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-4 sm:px-6 py-3 sm:py-4 min-h-[56px]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/20">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight">Two-Factor Authentication</h1>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center bg-light-bg dark:bg-slate-900 p-8">
          <div className="w-full max-w-md rounded-xl border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-800 shadow-lg p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950">
                <ShieldCheck className="h-8 w-8 text-emerald-500" />
              </div>
            </div>
            <h2 className="text-lg font-bold text-emerald-700 dark:text-emerald-300 mb-2">2FA is Already Enabled</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Your account is already protected with two-factor authentication.</p>
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 rounded-lg bg-[#f8931f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e0841a] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await verify2Fa(token);
      setSuccess(true);
    } catch (c: any) {
      setErr(c.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col h-screen pt-14 md:pt-0 bg-[#012061] md:bg-transparent">
        <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-4 sm:px-6 py-3 sm:py-4 min-h-[56px]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/20">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight">Two-Factor Authentication</h1>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center bg-light-bg dark:bg-slate-900 p-8">
          <div className="w-full max-w-md rounded-xl border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-800 shadow-lg p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950">
                <ShieldCheck className="h-8 w-8 text-emerald-500" />
              </div>
            </div>
            <h2 className="text-lg font-bold text-emerald-700 dark:text-emerald-300 mb-2">2FA Enabled Successfully!</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Your account is now protected with two-factor authentication.</p>
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 rounded-lg bg-[#f8931f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e0841a] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen pt-14 md:pt-0 bg-[#012061] md:bg-transparent">
      {/* ═══ NAVY HEADER ═══ */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-4 sm:px-6 py-3 sm:py-4 min-h-[56px]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#f8931f]/20">
            <Shield className="h-5 w-5 text-[#f8931f]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Two-Factor Authentication</h1>
            <p className="text-xs text-white/50 hidden sm:block">Add an extra layer of security to your account</p>
          </div>
        </div>
      </header>

      {/* ═══ CONTENT ═══ */}
      <div className="flex-1 flex items-start justify-center bg-light-bg dark:bg-slate-900 p-4 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-lg space-y-5 pt-4 sm:pt-8">

          {/* Step 1: Install App */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 bg-[#012061]/5 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#f8931f] text-white text-xs font-bold shrink-0">1</div>
              <h2 className="text-sm font-bold text-[#012061] dark:text-white">Install an Authenticator App</h2>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Download <span className="font-semibold text-slate-700 dark:text-slate-300">Google Authenticator</span> or <span className="font-semibold text-slate-700 dark:text-slate-300">Authy</span> from your device's app store.
              </p>
            </div>
          </div>

          {/* Step 2: Scan QR */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 bg-[#012061]/5 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#f8931f] text-white text-xs font-bold shrink-0">2</div>
              <h2 className="text-sm font-bold text-[#012061] dark:text-white">Scan QR Code</h2>
            </div>
            <div className="px-5 py-5 flex flex-col items-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 text-center">
                Open the authenticator app and scan this QR code
              </p>
              {otpauthUrl ? (
                <div className="rounded-xl border-2 border-[#f8931f]/30 bg-white p-3 shadow-sm">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`}
                    alt="2FA QR Code"
                    className="w-48 h-48"
                  />
                </div>
              ) : (
                <div className="w-48 h-48 rounded-xl bg-slate-100 dark:bg-slate-700 animate-pulse flex items-center justify-center">
                  <Smartphone className="h-8 w-8 text-slate-400" />
                </div>
              )}
            </div>
          </div>

          {/* Step 3: Manual Key */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 bg-[#012061]/5 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#f8931f] text-white text-xs font-bold shrink-0">
                <KeyRound className="h-3.5 w-3.5" />
              </div>
              <h2 className="text-sm font-bold text-[#012061] dark:text-white">Or Enter Key Manually</h2>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Can't scan the QR code? Enter this key manually in your authenticator app.
              </p>
              {secret && (
                <div className="relative">
                  <div className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-3 font-mono text-xs tracking-wider text-slate-800 dark:text-slate-200 break-all select-all">
                    {showSecret ? secret : secret.slice(0, 4) + '•'.repeat(Math.max(secret.length - 4, 0))}
                  </div>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <button
                      onClick={() => setShowSecret(!showSecret)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-[#f8931f] hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      title={showSecret ? 'Hide' : 'Show'}
                    >
                      {showSecret ? (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={copySecret}
                      className="p-1.5 rounded-md text-slate-400 hover:text-[#f8931f] hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      title={copied ? 'Copied!' : 'Copy'}
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step 4: Verify */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 bg-[#012061]/5 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#f8931f] text-white text-xs font-bold shrink-0">4</div>
              <h2 className="text-sm font-bold text-[#012061] dark:text-white">Verify Setup</h2>
            </div>
            <div className="px-5 py-5">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Enter the 6-digit code from your authenticator app to confirm everything is working.
              </p>
              {err && (
                <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-4 py-2.5">
                  <p className="text-xs font-medium text-red-700 dark:text-red-300">{err}</p>
                </div>
              )}
              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={token}
                    onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] text-[#012061] dark:text-white placeholder:text-slate-300 focus:border-[#f8931f] focus:ring-2 focus:ring-[#f8931f]/20 focus:outline-none transition-all"
                    autoFocus
                    inputMode="numeric"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || token.length !== 6}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#f8931f] px-5 py-3 text-sm font-bold text-white hover:bg-[#e0841a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {loading ? 'Verifying…' : 'Enable 2FA'}
                </button>
              </form>
            </div>
          </div>

          {/* Back link */}
          <div className="text-center pb-8">
            <button
              onClick={() => navigate('/settings')}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#f8931f] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Admin Hub
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
