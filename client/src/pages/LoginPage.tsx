import { useState, FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';

export default function LoginPage() {
  const { login, isAuthenticated, requiresTwoFactor } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await login(email, password, requiresTwoFactor ? twoFactorToken : undefined);
      if (!requiresTwoFactor) navigate('/');
    } catch (c: any) {
      setErr(c.message || 'Login failed');
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

  if (requiresTwoFactor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <form onSubmit={handle2FaSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow">
          <h1 className="text-xl font-bold text-card-foreground">Two-Factor Authentication</h1>
          <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <input
            type="text"
            maxLength={6}
            value={twoFactorToken}
            onChange={e => setTwoFactorToken(e.target.value)}
            placeholder="000000"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-widest"
            autoFocus
          />
          <Button type="submit" className="w-full" disabled={loading || twoFactorToken.length !== 6}>
            {loading ? 'Verifying...' : 'Verify'}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow">
        <h1 className="text-xl font-bold text-card-foreground">Sign in to AIO</h1>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            required
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}