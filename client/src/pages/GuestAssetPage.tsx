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

  if (loading) return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-3" />
        <p className="text-sm text-muted-foreground">Loading asset...</p>
      </div>
    </div>
  );

  if (err) return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full rounded-lg border border-border bg-card p-6 text-center">
        <span className="text-3xl">⚠️</span>
        <p className="mt-3 text-sm text-destructive font-medium">{err}</p>
        <p className="mt-1 text-xs text-muted-foreground">This link may be invalid or expired.</p>
      </div>
    </div>
  );

  if (!asset) return null;

  return (
    <div className="min-h-dvh bg-background px-4 py-6 sm:px-6 sm:py-8">
      <div className="max-w-md mx-auto space-y-4">
        {/* Asset Card */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          {/* Image */}
          {asset.imageUrl && (
            <div className="mb-4 -mx-1">
              <img
                src={asset.imageUrl}
                alt={asset.name}
                className="w-full rounded-lg border border-border object-cover max-h-56"
              />
            </div>
          )}

          {/* Title */}
          <h1 className="text-xl font-bold leading-tight">{asset.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {asset.type}{asset.manufacturer ? ` · ${asset.manufacturer}` : ''}
          </p>

          {/* Status badge */}
          <div className="mt-3">
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold
              ${asset.status === 'AVAILABLE' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                asset.status === 'ASSIGNED' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                asset.status === 'MAINTENANCE' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'}`}>
              {asset.status}
            </span>
          </div>

          {/* Details */}
          <div className="mt-4 space-y-3 text-sm">
            <DetailRow label="Location" value={asset.location} />
            <DetailRow label="Manufacturer" value={asset.manufacturer} />
          </div>

          {/* Access counter */}
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Viewed {asset._accessCount} of {asset._maxAccess} times</span>
            <span className="text-[10px] uppercase tracking-wider opacity-60">AIO System</span>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/60">
          AIO System — Asset Viewer
        </p>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right truncate">{value || '—'}</span>
    </div>
  );
}