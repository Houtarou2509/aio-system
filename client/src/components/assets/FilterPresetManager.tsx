import { useState, useRef, useEffect } from 'react';
import { Bookmark, Save, X, ChevronDown } from 'lucide-react';
import type { AssetFilters } from '../../lib/api';

export interface FilterPreset {
  name: string;
  filters: AssetFilters;
  createdAt: string;
}

interface FilterPresetManagerProps {
  /** Current full filter state to save */
  filters: AssetFilters;
  /** Apply a saved preset's filter state */
  onApplyPreset: (filters: AssetFilters) => void;
  /** Storage key for localStorage (default: 'aio-filter-presets') */
  storageKey?: string;
}

function loadPresets(storageKey: string): FilterPreset[] {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePresets(storageKey: string, presets: FilterPreset[]) {
  localStorage.setItem(storageKey, JSON.stringify(presets));
}

export default function FilterPresetManager({
  filters,
  onApplyPreset,
  storageKey = 'aio-filter-presets',
}: FilterPresetManagerProps) {
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<FilterPreset[]>(() => loadPresets(storageKey));
  const [saveMode, setSaveMode] = useState(false);
  const [saveName, setSaveName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSaveMode(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus input when entering save mode
  useEffect(() => {
    if (saveMode && inputRef.current) inputRef.current.focus();
  }, [saveMode]);

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    // Remove any existing preset with the same name
    const filtered = presets.filter(p => p.name !== name);
    const preset: FilterPreset = {
      name,
      filters: { ...filters },
      createdAt: new Date().toISOString(),
    };
    const updated = [...filtered, preset];
    setPresets(updated);
    savePresets(storageKey, updated);
    setSaveName('');
    setSaveMode(false);
  };

  const handleApply = (preset: FilterPreset) => {
    onApplyPreset(preset.filters);
    setOpen(false);
  };

  const handleDelete = (name: string) => {
    const updated = presets.filter(p => p.name !== name);
    setPresets(updated);
    savePresets(storageKey, updated);
  };

  const hasActiveFilters = filters.type || filters.status || filters.location ||
    filters.search || filters.manufacturer || filters.purchaseDateFrom ||
    filters.purchaseDateTo || filters.warrantyExpiryFrom || filters.warrantyExpiryTo;

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 h-8 transition-colors"
        title="Saved filter presets"
      >
        <Bookmark className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Presets</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl z-50 p-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Filter Presets
            </h4>
            <button
              onClick={() => { setOpen(false); setSaveMode(false); }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Save mode */}
          {saveMode ? (
            <div className="space-y-2">
              <input
                ref={inputRef}
                type="text"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setSaveMode(false); setSaveName(''); } }}
                placeholder="Preset name (e.g. Office Laptops)"
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={!saveName.trim()}
                  className="inline-flex items-center gap-1 rounded-md bg-[#f8931f] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e0841a] disabled:opacity-50 transition-colors"
                >
                  <Save className="h-3 w-3" /> Save
                </button>
                <button
                  onClick={() => { setSaveMode(false); setSaveName(''); }}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Preset list */}
              {presets.length === 0 ? (
                <p className="text-xs text-slate-400 py-2 text-center">
                  No saved presets yet.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1 mb-2">
                  {presets.map(p => (
                    <div
                      key={p.name}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700/50 group"
                    >
                      <button
                        onClick={() => handleApply(p)}
                        className="flex-1 text-left text-xs text-slate-700 dark:text-slate-300 hover:text-[#f8931f] dark:hover:text-[#f8931f] transition-colors truncate"
                        title={p.name}
                      >
                        {p.name}
                      </button>
                      <button
                        onClick={() => handleDelete(p.name)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
                        title="Delete preset"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Save current button */}
              {hasActiveFilters && (
                <button
                  onClick={() => setSaveMode(true)}
                  className="w-full mt-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-[#f8931f] hover:border-[#f8931f] dark:hover:text-[#f8931f] dark:hover:border-[#f8931f] transition-colors"
                >
                  <Save className="h-3 w-3" /> Save Current Filters
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
