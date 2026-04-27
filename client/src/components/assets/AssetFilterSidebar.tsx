import { useState } from 'react';
import { AssetFilters } from '../../lib/api';
import { useSavedFilters } from '../../hooks/useSavedFilters';
import { useLookupOptions } from '@/hooks/useLookupOptions';

const ASSET_TYPES = ['DESKTOP', 'LAPTOP', 'FURNITURE', 'EQUIPMENT', 'PERIPHERAL', 'OTHER'];
const ASSET_STATUSES = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST'];

interface Props {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}

export function AssetFilterSidebar({ filters, onChange }: Props) {
  const { savedFilters, saveFilter, deleteFilter } = useSavedFilters();
  const [saveName, setSaveName] = useState('');
  const { options: locationOptions } = useLookupOptions('locations');

  const update = (key: keyof AssetFilters, value: string) => {
    onChange({ ...filters, [key]: value || undefined, page: 1 });
  };

  const handleSave = () => {
    if (!saveName.trim()) return;
    const active: Record<string, string> = {};
    if (filters.type) active.type = filters.type;
    if (filters.status) active.status = filters.status;
    if (filters.location) active.location = filters.location;
    saveFilter(saveName, active);
    setSaveName('');
  };

  const applySaved = (f: Record<string, string>) => {
    onChange({ ...filters, ...f, page: 1 });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Filters</h3>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Type</label>
        <select value={filters.type || ''} onChange={e => update('type', e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
          <option value="">All</option>
          {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Status</label>
        <select value={filters.status || ''} onChange={e => update('status', e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
          <option value="">All</option>
          {ASSET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Location</label>
        <select value={filters.location || ''} onChange={e => update('location', e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
          <option value="">All</option>
          {locationOptions.map((opt) => (
            <option key={opt.id} value={opt.value}>{opt.value}</option>
          ))}
        </select>
      </div>

      <button onClick={() => onChange({ page: 1 })} className="text-xs text-primary hover:underline">Clear filters</button>

      {/* Saved filters */}
      {savedFilters.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <h4 className="text-xs font-semibold text-muted-foreground">Saved Filters</h4>
          {savedFilters.map(sf => (
            <div key={sf.name} className="flex items-center gap-1">
              <button onClick={() => applySaved(sf.filters)} className="text-xs text-primary hover:underline truncate">{sf.name}</button>
              <button onClick={() => deleteFilter(sf.name)} className="text-xs text-destructive hover:underline">×</button>
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-border">
        <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Save current as..." className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs mb-1" />
        <button onClick={handleSave} disabled={!saveName.trim()} className="text-xs text-primary hover:underline disabled:opacity-50">Save Filter</button>
      </div>
    </div>
  );
}