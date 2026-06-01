import { useState, useEffect } from 'react';
import { guestApi } from '../../lib/labels-api';
import { RoleGate } from '../auth';

interface Props {
  assetId: string;
}

export function GuestTokenManager({ assetId }: Props) {
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<any>(null);
  const [expiresIn, setExpiresIn] = useState('7');
  const [maxAccess, setMaxAccess] = useState('10');

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const data = await guestApi.listTokens(assetId);
      setTokens(data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchTokens(); }, [assetId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const expires = new Date(Date.now() + Number(expiresIn) * 24 * 60 * 60 * 1000).toISOString();
      const data = await guestApi.createToken(assetId, expires, Number(maxAccess));
      setNewToken(data);
      fetchTokens();
    } catch (e: any) { alert(e.message); }
    setCreating(false);
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this guest link?')) return;
    try { await guestApi.revokeToken(id); fetchTokens(); } catch (e: any) { alert(e.message); }
  };

  const guestUrl = newToken ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/guest/${newToken.token}` : '';

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Guest Access</h3>

      {newToken && (
        <div className="rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3 space-y-1">
          <p className="text-xs font-medium text-green-800 dark:text-green-200">Link created!</p>
          <div className="flex gap-1">
            <input readOnly value={guestUrl} className="flex-1 rounded border border-green-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-green-800 dark:bg-slate-900 dark:text-slate-100" onClick={e => (e.target as HTMLInputElement).select()} />
            <button onClick={() => navigator.clipboard.writeText(guestUrl)} className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700">Copy</button>
          </div>
          <p className="text-xs text-green-700 dark:text-green-300">Expires: {new Date(newToken.expiresAt).toLocaleDateString()} · Max: {newToken.maxAccess} accesses</p>
        </div>
      )}

      <RoleGate roles={['ADMIN', 'STAFF_ADMIN']}>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="space-y-1">
            <label className="block text-xs text-slate-600 dark:text-slate-300">Expires in</label>
            <select value={expiresIn} onChange={e => setExpiresIn(e.target.value)} className="rounded border border-input bg-background px-2 py-1 text-xs text-slate-800 dark:text-slate-100">
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-slate-600 dark:text-slate-300">Max accesses</label>
            <input type="number" value={maxAccess} onChange={e => setMaxAccess(e.target.value)} className="w-16 rounded border border-input bg-background px-2 py-1 text-xs text-slate-800 dark:text-slate-100" />
          </div>
          <button onClick={handleCreate} disabled={creating}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#f8931f' }}
          >
            {creating ? 'Creating...' : 'Generate Link'}
          </button>
        </div>
      </RoleGate>

      {loading ? <p className="text-xs text-slate-500 dark:text-slate-400">Loading...</p> : (
        <div className="space-y-1">
          {tokens.map(t => (
            <div key={t.id} className="flex items-center justify-between rounded border border-border px-2 py-1 text-xs text-slate-700 dark:text-slate-200">
              <div>
                <span className="font-mono">{t.token.substring(0, 12)}...</span>
                <span className="ml-2 text-slate-500 dark:text-slate-400">{t.accessCount}/{t.maxAccess} uses</span>
                <span className="ml-2 text-slate-500 dark:text-slate-400">Exp: {new Date(t.expiresAt).toLocaleDateString()}</span>
              </div>
              <RoleGate roles={['ADMIN']}>
                <button onClick={() => handleRevoke(t.id)} className="text-destructive hover:underline">Revoke</button>
              </RoleGate>
            </div>
          ))}
          {tokens.length === 0 && <p className="text-xs text-slate-500 dark:text-slate-400">No guest links</p>}
        </div>
      )}
    </div>
  );
}
