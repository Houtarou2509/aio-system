import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { guestApi } from '../lib/labels-api';

export default function GuestAssetPage() {
  const { token } = useParams<{ token: string }>();
  const [asset, setAsset] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!token) return;
    guestApi.getAsset(token)
      .then(data => setAsset(data))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="flex min-h-screen items-center justify-center dark:bg-gray-900"><p className="text-muted-foreground">Loading...</p></div>;
  if (err) return <div className="flex min-h-screen items-center justify-center dark:bg-gray-900"><p className="text-destructive">{err}</p></div>;
  if (!asset) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-4">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
          <h1 className="text-xl font-bold">{asset.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{asset.type} · {asset.manufacturer || '—'}</p>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Status</span>
              <span className="font-medium">{asset.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Location</span>
              <span>{asset.location || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Manufacturer</span>
              <span>{asset.manufacturer || '—'}</span>
            </div>
          </div>

          {asset.imageUrl && (
            <div className="mt-4">
              <img src={asset.imageUrl} alt={asset.name} className="w-full rounded border border-gray-200 dark:border-gray-700" />
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400">
            <p>Viewed {asset._accessCount} of {asset._maxAccess} times</p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-600">AIO System — Asset Viewer</p>
      </div>
    </div>
  );
}