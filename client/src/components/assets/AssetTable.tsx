import { Asset } from '../../lib/api';
import { getWarrantyStatus, formatWarrantyDate } from '../../lib/warranty';
import { getMaintenanceWarning } from '../../utils/maintenanceUtils';
import { Package } from 'lucide-react';

/* ── Resolve image URL ────────────────────────────────────── */

function getImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (url.startsWith('/uploads')) {
    if (import.meta.env.DEV) return url;
    const base = import.meta.env.BASE_URL?.replace(/\/+$/, '') || '/aio-system';
    return `${base}${url}`;
  }
  return url;
}

/* ── Status pill colors (Navy/Orange brand) ──────────────── */

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  ASSIGNED: 'bg-[#012061]/10 text-[#012061] border border-[#012061]/20',
  MAINTENANCE: 'bg-[#f8931f]/10 text-[#f8931f] border border-[#012061]/30',
  RETIRED: 'bg-slate-100 text-slate-500 border border-slate-200',
  LOST: 'bg-red-50 text-red-600 border border-red-200',
};

/* ── Props ───────────────────────────────────────────────── */

interface Props {
  assets: Asset[];
  onView: (asset: Asset) => void;
  onSort: (field: string) => void;
  sortBy: string;
  sortOrder: string;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  allSelected: boolean;
  someSelected: boolean;
  onImageClick?: (url: string) => void;
}

/* ── Table component ──────────────────────────────────────── */

export function AssetTable({
  assets, onView, onSort, sortBy, sortOrder,
  selectedIds, onToggleSelect, onToggleSelectAll,
  allSelected, someSelected, onImageClick,
}: Props) {
  const sortIcon = (field: string) =>
    sortBy === field ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        {/* ── Header: Navy ──────────────────────────────── */}
        <thead>
          <tr className="bg-[#012061] text-left">
            <th className="px-3 py-2.5 w-10">
              <input
                type="checkbox"
                ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="rounded border-white/30 accent-[#f8931f]"
              />
            </th>
            <th className="px-2 py-2.5 w-12" />
            <th className="cursor-pointer px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase" onClick={() => onSort('name')}>
              Name{sortIcon('name')}
            </th>
            <th className="cursor-pointer px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase" onClick={() => onSort('type')}>
              Type{sortIcon('type')}
            </th>
            <th className="cursor-pointer px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase" onClick={() => onSort('status')}>
              Status{sortIcon('status')}
            </th>
            <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Location</th>
            <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Assigned To</th>
            <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Property #</th>
            <th className="cursor-pointer px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase" onClick={() => onSort('purchasePrice')}>
              Price{sortIcon('purchasePrice')}
            </th>
            <th className="cursor-pointer px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase" onClick={() => onSort('createdAt')}>
              Added{sortIcon('createdAt')}
            </th>
          </tr>
        </thead>

        {/* ── Body: Clickable rows ────────────────────────── */}
        <tbody>
          {assets.map(a => {
            const isSelected = selectedIds.has(a.id);
            const imgUrl = getImageUrl(a.imageUrl);
            return (
              <tr
                key={a.id}
                className={`group border-b border-slate-100 cursor-pointer transition-colors
                  ${isSelected ? 'bg-[#f8931f]/5 border-l-2 border-l-[#f8931f]' : 'hover:bg-slate-50 hover:border-l-2 hover:border-l-[#f8931f]'}
                `}
                onClick={() => onView(a)}
              >
                {/* Checkbox — stop propagation so row click doesn't toggle */}
                <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(a.id)}
                    className="rounded border-slate-300 accent-[#f8931f]"
                  />
                </td>

                {/* Image thumbnail — click opens lightbox, not detail modal */}
                <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={a.name}
                      className="h-10 w-10 rounded-full object-cover border-2 border-slate-100 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => onImageClick?.(imgUrl)}
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#012061]">
                      <Package className="h-4 w-4 text-[#f8931f]" />
                    </div>
                  )}
                </td>

                {/* Name — Bold Navy */}
                <td className="px-3 py-2 font-semibold text-[#012061] whitespace-nowrap">
                  {a.name}
                  {(() => {
                    const w = getWarrantyStatus((a as any).warrantyExpiry);
                    if (w.status === 'expiring') return <span className="ml-1 text-[#f8931f]" title={`Warranty expiring on ${formatWarrantyDate((a as any).warrantyExpiry)}`}>⚠</span>;
                    if (w.status === 'expired') return <span className="ml-1 text-red-500" title={`Warranty expired on ${formatWarrantyDate((a as any).warrantyExpiry)}`}>⚠</span>;
                    return null;
                  })()}
                  {(() => {
                    const m = getMaintenanceWarning((a as any).maintenanceSchedules ?? []);
                    if (m.level === 'overdue') return <span className="ml-1 text-red-500 cursor-help text-sm" title={`Maintenance overdue: ${m.title}`}>🔧</span>;
                    if (m.level === 'soon') return <span className="ml-1 text-[#f8931f] cursor-help text-sm" title={`Maintenance due in ${m.daysUntil} days: ${m.title}`}>🔧</span>;
                    return null;
                  })()}
                </td>

                {/* Type */}
                <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{a.type}</td>

                {/* Status — Pill */}
                <td className="px-3 py-2">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide ${STATUS_COLORS[a.status] || 'bg-slate-100 text-slate-500'}`}>
                    {a.status}
                  </span>
                </td>

                {/* Location */}
                <td className="px-3 py-2 text-xs text-slate-600">{a.location || <span className="text-slate-300">—</span>}</td>

                {/* Assigned To */}
                <td className="px-3 py-2 text-xs text-slate-600">{a.assignedTo || <span className="text-slate-300">—</span>}</td>

                {/* Property # */}
                <td className="px-3 py-2 text-xs text-slate-600 font-mono">{(a as any).propertyNumber || <span className="text-slate-300">—</span>}</td>

                {/* Price */}
                <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                  {a.purchasePrice != null ? <span className="font-medium">₱{Number(a.purchasePrice).toLocaleString()}</span> : <span className="text-slate-300">—</span>}
                </td>

                {/* Added */}
                <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                  {new Date(a.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                </td>
              </tr>
            );
          })}

          {assets.length === 0 && (
            <tr>
              <td colSpan={10} className="px-3 py-12 text-center text-sm text-slate-400">
                No assets found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}