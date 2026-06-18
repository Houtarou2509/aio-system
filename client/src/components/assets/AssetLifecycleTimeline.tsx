import { useState, useEffect } from 'react';
import {
  PlusCircle,
  Pencil,
  FileText,
  ArrowRightLeft,
  RotateCcw,
  Wrench,
  Trash2,
  Clock,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { assetsApi, AssetLifecycleEvent } from '../../lib/api';

interface Props {
  assetId: string;
}

const ICONS: Record<AssetLifecycleEvent['type'], React.ElementType> = {
  created: PlusCircle,
  edited: Pencil,
  issued: ArrowRightLeft,
  transferred: ArrowRightLeft,
  returned: RotateCcw,
  repaired: Wrench,
  disposed: Trash2,
  audited: FileText,
};

const STYLES: Record<AssetLifecycleEvent['type'], { bg: string; text: string; border: string }> = {
  created: { bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  edited: { bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
  issued: { bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
  transferred: { bg: 'bg-indigo-50 dark:bg-indigo-950', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800' },
  returned: { bg: 'bg-teal-50 dark:bg-teal-950', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800' },
  repaired: { bg: 'bg-purple-50 dark:bg-purple-950', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
  disposed: { bg: 'bg-red-50 dark:bg-red-950', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800' },
  audited: { bg: 'bg-slate-50 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-700' },
};

const SOURCE_STYLES: Record<AssetLifecycleEvent['source'], string> = {
  asset: 'bg-[#012061]/5 dark:bg-slate-700/40 text-[#012061] dark:text-slate-100 border-[#012061]/20',
  assignment: 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  maintenance: 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  condition: 'bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  audit: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function AssetLifecycleTimeline({ assetId }: Props) {
  const [events, setEvents] = useState<AssetLifecycleEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    assetsApi.lifecycle(assetId)
      .then(res => { if (!cancelled) setEvents(res.data); })
      .catch(e => { if (!cancelled) setError(e.message || 'Failed to load lifecycle'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [assetId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-[#012061]" />
        <span className="ml-3 text-sm text-slate-500">Loading lifecycle…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <AlertCircle className="w-10 h-10 mb-3 text-red-400" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <Clock className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">No lifecycle events recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="relative pl-6">
      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
      {events.map((event, idx) => {
        const Icon = ICONS[event.type];
        const style = STYLES[event.type];
        return (
          <div key={`${event.id}-${idx}`} className="relative pb-6 last:pb-0">
            <div className={`absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full ${style.bg} border-2 border-white dark:border-slate-900 shadow-sm`}>
              <Icon className={`w-2.5 h-2.5 ${style.text}`} />
            </div>
            <div className="rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-xs">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${style.bg} ${style.text} ${style.border}`}>
                  <Icon className="w-3 h-3" />
                  {event.type.charAt(0).toUpperCase() + event.type.slice(1)}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${SOURCE_STYLES[event.source]}`}>
                  {event.source}
                </span>
                {event.severity && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    event.severity === 'HIGH' ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                    : event.severity === 'MEDIUM' ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}>
                    {event.severity}
                  </span>
                )}
              </div>
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">{event.title}</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">{event.description}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400 dark:text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatWhen(event.occurredAt)}
                </span>
                {event.actorName && (
                  <span className="inline-flex items-center gap-1">
                    <span className="font-medium text-slate-500 dark:text-slate-400">By:</span>
                    {event.actorName}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
