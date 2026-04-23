import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';

export default function Setup2FaPage() {
  const { setup2Fa, verify2Fa, user } = useAuth();
  const navigate = useNavigate();
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user?.twoFactorEnabled) return; // already enabled
    setup2Fa()
      .then(data => {
        setOtpauthUrl(data.otpauthUrl);
        setSecret(data.secret);
      })
      .catch(e => setErr(e.message));
  }, []);

  if (user?.twoFactorEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold">2FA is already enabled</h1>
          <Button onClick={() => navigate('/')} className="mt-4">Back to Dashboard</Button>
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
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold text-green-600">2FA Enabled Successfully!</h1>
          <p className="mt-2 text-muted-foreground">Your account is now protected with two-factor authentication.</p>
          <Button onClick={() => navigate('/')} className="mt-4">Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-card p-6 shadow">
        <h1 className="text-xl font-bold text-card-foreground">Set Up Two-Factor Authentication</h1>
        <p className="text-sm text-muted-foreground">
          Scan the QR code below with your authenticator app (Google Authenticator, Authy, etc.)
        </p>

        {otpauthUrl && (
          <div className="flex justify-center">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`}
              alt="2FA QR Code"
              className="rounded border border-border"
            />
          </div>
        )}

        {secret && (
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground">Manual entry key:</p>
            <p className="mt-1 break-all font-mono text-xs">{secret}</p>
          </div>
        )}

        {err && <p className="text-sm text-destructive">{err}</p>}

        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Verification Code</label>
            <input
              type="text"
              maxLength={6}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="000000"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-widest"
              autoFocus
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading || token.length !== 6}>
            {loading ? 'Verifying...' : 'Enable 2FA'}
          </Button>
        </form>
      </div>
    </div>
  );
}