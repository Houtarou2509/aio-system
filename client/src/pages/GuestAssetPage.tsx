import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Package, MapPin, Building2, Factory, Eye, AlertTriangle, Clock, XCircle, Ban } from 'lucide-react';
import { guestApi } from '../lib/labels-api';

/* ═══════════════════════════════════════════════════════════
   STATUS BADGE — matches main app style
   ═══════════════════════════════════════════════════════════ */
const STATUS_STYLES: Record<string, string> = {
  AVAILABLE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDING_ASSIGNMENT: 'bg-amber-50 text-amber-700 border-amber-200',
  ASSIGNED: 'bg-[#012061]/10 text-[#012061] border-[#012061]/20',
  MAINTENANCE: 'bg-[#f8931f]/10 text-[#f8931f] border-[#012061]/20',
  RETIRED: 'bg-slate-100 text-slate-500 border-slate-200',
  DISPOSED: 'bg-slate-100 text-slate-500 border-slate-200',
  LOST: 'bg-red-50 text-red-600 border-red-200',
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || 'bg-slate-100 text-slate-500 border-slate-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide border ${style}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   DETAIL ROW
   ═══════════════════════════════════════════════════════════ */
function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#012061]/5">
        <Icon className="h-3.5 w-3.5 text-[#012061]/60" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-slate-800 truncate">{value}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ERROR DISPLAY — friendly messages
   ═══════════════════════════════════════════════════════════ */
function getErrorInfo(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('expired')) return { icon: Clock, title: 'Guest link expired', desc: 'This link has passed its expiration date. Contact the asset custodian for a new link.', color: 'amber' };
  if (lower.includes('not found')) return { icon: XCircle, title: 'Guest link not found', desc: 'This link does not exist or has been revoked. Verify the URL and try again.', color: 'red' };
  if (lower.includes('max access') || lower.includes('access limit') || lower.includes('limit reached')) return { icon: Ban, title: 'Access limit reached', desc: 'This link has reached its maximum number of views. Contact the asset custodian for a new link.', color: 'slate' };
  return { icon: AlertTriangle, title: 'Unable to load asset', desc: 'This link may be invalid or expired. Contact the asset custodian if you believe this is an error.', color: 'red' };
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */
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

  /* ─── Loading state ─── */
  if (loading) return (
    <div className="min-h-dvh flex flex-col bg-slate-50">
      <header className="bg-[#012061] px-5 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f8931f]/20">
            <Package className="h-4 w-4 text-[#f8931f]" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">AIO System</h1>
            <p className="text-[10px] text-white/50">Asset Viewer</p>
          </div>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-[#f8931f] mb-3" />
          <p className="text-sm text-slate-500">Loading asset…</p>
        </div>
      </div>
    </div>
  );

  /* ─── Error state ─── */
  if (err) {
    const { icon: ErrIcon, title, desc, color } = getErrorInfo(err);
    const iconColors = color === 'amber'
      ? 'bg-amber-50 text-amber-600'
      : color === 'slate'
        ? 'bg-slate-100 text-slate-500'
        : 'bg-red-50 text-red-600';
    const borderColors = color === 'amber'
      ? 'border-amber-200'
      : color === 'slate'
        ? 'border-slate-200'
        : 'border-red-200';
    const titleColors = color === 'amber'
      ? 'text-amber-700'
      : color === 'slate'
        ? 'text-slate-600'
        : 'text-red-700';
    return (
      <div className="min-h-dvh flex flex-col bg-slate-50">
        <header className="bg-[#012061] px-5 py-4">
          <div className="max-w-3xl mx-auto flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f8931f]/20">
              <Package className="h-4 w-4 text-[#f8931f]" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">AIO System</h1>
              <p className="text-[10px] text-white/50">Asset Viewer</p>
            </div>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className={`max-w-sm w-full rounded-xl border ${borderColors} bg-white p-6 text-center shadow-sm`}>
            <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${iconColors} mb-4`}>
              <ErrIcon className="h-7 w-7" />
            </div>
            <h2 className={`text-base font-bold ${titleColors} mb-1`}>{title}</h2>
            <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
          </div>
        </div>
        <footer className="px-4 py-3 text-center">
          <p className="text-[10px] text-slate-400">AIO System — Public Asset Verification</p>
        </footer>
      </div>
    );
  }

  if (!asset) return null;

  /* ─── Success state ─── */
  return (
    <div className="min-h-dvh flex flex-col bg-slate-50">
      {/* ═══ Header ═══ */}
      <header className="bg-[#012061] px-5 py-4 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f8931f]/20">
            <Package className="h-4 w-4 text-[#f8931f]" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">AIO System</h1>
            <p className="text-[10px] text-white/50">Asset Viewer</p>
          </div>
        </div>
      </header>

      {/* ═══ Content ═══ */}
      <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="max-w-3xl mx-auto">
          {/* Asset Card */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">

            {/* Image / Placeholder */}
            {asset.imageUrl ? (
              <div className="w-full bg-slate-100">
                <img
                  src={asset.imageUrl}
                  alt={asset.name}
                  className="w-full object-cover max-h-72"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center bg-[#012061] h-32 sm:h-40">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
                  <Package className="h-8 w-8 text-[#f8931f]" />
                </div>
              </div>
            )}

            {/* Card Body */}
            <div className="px-5 py-5 sm:px-6 sm:py-6">
              {/* Asset Name + Type */}
              <h2 className="text-xl font-bold text-[#012061] leading-tight">{asset.name}</h2>
              <p className="text-sm text-slate-500 mt-1">
                {asset.type}{asset.manufacturer ? ` · ${asset.manufacturer}` : ''}
              </p>

              {/* Status */}
              <div className="mt-3">
                <StatusBadge status={asset.status} />
              </div>

              {/* Divider */}
              <div className="my-4 border-t border-slate-100" />

              {/* Detail Rows */}
              <div className="divide-y divide-slate-50">
                <DetailRow icon={Building2} label="Owner" value={asset.owner} />
                <DetailRow icon={MapPin} label="Location" value={asset.location} />
                <DetailRow icon={Factory} label="Manufacturer" value={asset.manufacturer} />
              </div>

              {/* View Counter */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
                <Eye className="h-3.5 w-3.5" />
                <span>Viewed {asset._accessCount} of {asset._maxAccess} times</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Footer ═══ */}
      <footer className="px-4 py-3 text-center shrink-0">
        <p className="text-[10px] text-slate-400 tracking-wide">AIO System — Public Asset Verification</p>
      </footer>
    </div>
  );
}