import { Asset } from '../../lib/api';
import { getWarrantyStatus, formatWarrantyDate } from '../../lib/warranty';
import { getMaintenanceWarning } from '../../utils/maintenanceUtils';

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-800',
  ASSIGNED: 'bg-blue-100 text-blue-800',
  MAINTENANCE: 'bg-yellow-100 text-yellow-800',
  RETIRED: 'bg-gray-100 text-gray-800',
  LOST: 'bg-red-100 text-red-800',
};

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
}

export function AssetTable({ assets, onView, onSort, sortBy, sortOrder, selectedIds, onToggleSelect, onToggleSelectAll, allSelected, someSelected }: Props) {
  const sortIcon = (field: string) => sortBy === field ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-3 py-2 w-10">
              <input
                type="checkbox"
                ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="rounded"
              />
            </th>
            <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => onSort('name')}>Name{sortIcon('name')}</th>
            <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => onSort('type')}>Type{sortIcon('type')}</th>
            <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => onSort('status')}>Status{sortIcon('status')}</th>
            <th className="px-3 py-2 font-medium">Location</th>
            <th className="px-3 py-2 font-medium">Assigned To</th>
            <th className="px-3 py-2 font-medium">Property #</th>
            <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => onSort('purchasePrice')}>Price{sortIcon('purchasePrice')}</th>
            <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => onSort('createdAt')}>Added{sortIcon('createdAt')}</th>
          </tr>
        </thead>
        <tbody>
          {assets.map(a => (
            <tr key={a.id} className={`border-b border-border hover:bg-muted/50 cursor-pointer ${selectedIds.has(a.id) ? 'bg-primary/5' : ''}`} onClick={() => onView(a)}>
              <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(a.id)}
                  onChange={() => onToggleSelect(a.id)}
                  className="rounded"
                />
              </td>
              <td className="px-3 py-2 font-medium">{a.name}{(() => {
                const w = getWarrantyStatus((a as any).warrantyExpiry);
                if (w.status === 'expiring') return <span className="ml-1 text-yellow-500" title={`Warranty expiring on ${formatWarrantyDate((a as any).warrantyExpiry)}`}>⚠</span>;
                if (w.status === 'expired') return <span className="ml-1 text-red-500" title={`Warranty expired on ${formatWarrantyDate((a as any).warrantyExpiry)}`}>⚠</span>;
                return null;
              })()}{(() => {
                const m = getMaintenanceWarning((a as any).maintenanceSchedules ?? []);
                if (m.level === 'overdue') return <span className="ml-1 text-red-500 cursor-help text-sm" title={`Maintenance overdue: ${m.title}`}>🔧</span>;
                if (m.level === 'soon') return <span className="ml-1 text-yellow-500 cursor-help text-sm" title={`Maintenance due in ${m.daysUntil} days: ${m.title}`}>🔧</span>;
                return null;
              })()}</td>
              <td className="px-3 py-2">{a.type}</td>
              <td className="px-3 py-2">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status] || 'bg-gray-100'}`}>
                  {a.status}
                </span>
              </td>
              <td className="px-3 py-2">{a.location || '—'}</td>
              <td className="px-3 py-2">{a.assignedTo || '—'}</td>
              <td className="px-3 py-2">{(a as any).propertyNumber || '—'}</td>
              <td className="px-3 py-2">{a.purchasePrice != null ? `₱${Number(a.purchasePrice).toLocaleString()}` : '—'}</td>
              <td className="px-3 py-2">{new Date(a.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
          {assets.length === 0 && (
            <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No assets found</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}