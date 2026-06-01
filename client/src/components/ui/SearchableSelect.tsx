import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label?: string;
}

interface SearchableSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  extraOptions?: React.ReactNode; // for "Add supplier" style links
}

export function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select...',
  allowNone = true,
  noneLabel = 'None',
  disabled = false,
  loading = false,
  className = '',
  extraOptions,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const refEl = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find(o => o.value === value);

  // Filtered items (case-insensitive search)
  const filtered = filter
    ? options.filter(o => {
        const text = (o.label || o.value).toLowerCase();
        return text.includes(filter.toLowerCase());
      })
    : options;

  // All selectable options including None
  const noneOption = allowNone ? [{ value: '', label: noneLabel, isNone: true as const }] : [];
  const allItems = [...noneOption, ...filtered.map(o => ({ ...o, isNone: false as const }))];

  const openMenu = () => {
    if (disabled) return;
    setIsOpen(true);
    setFilter('');
    // Position highlight on current selection
    const idx = selectedOption
      ? filtered.findIndex(o => o.value === value) + (allowNone ? 1 : 0)
      : 0;
    setHighlightIndex(idx >= 0 ? idx : 0);
  };

  const closeMenu = () => {
    setIsOpen(false);
    setFilter('');
    setHighlightIndex(-1);
  };

  const selectItem = (val: string) => {
    onChange(val);
    closeMenu();
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (refEl.current && !refEl.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handler);
    }
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Auto-focus search input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Recalculate highlight when filter or menu state changes
  useEffect(() => {
    if (!isOpen) return;
    const query = filter.trim().toLowerCase();
    if (query) {
      // When searching, highlight the first real (non-None) matching option
      const firstRealIdx = allItems.findIndex(item =>
        !item.isNone &&
        (item.label || item.value).toLowerCase().includes(query)
      );
      setHighlightIndex(firstRealIdx >= 0 ? firstRealIdx : 0);
    } else {
      // No search: highlight the currently selected option, or first item
      const selectedIdx = allItems.findIndex(item => item.value === value);
      setHighlightIndex(selectedIdx >= 0 ? selectedIdx : 0);
    }
    // allItems is derived from filter+allowNone+options, reading inside effect is safe;
    // only list stable dependencies to avoid infinite re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, isOpen, allowNone, value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu();
        return;
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex(prev => Math.min(prev + 1, allItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < allItems.length) {
          const item = allItems[highlightIndex];
          selectItem(item.value);
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeMenu();
        break;
    }
  };

  return (
    <div className={`relative ${className}`} ref={refEl} onKeyDown={handleKeyDown}>
      <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-300 mb-1">{label}</label>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (isOpen) closeMenu(); else openMenu(); }}
        className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
          disabled
            ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-500'
            : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-slate-400'
        } ${isOpen ? 'border-[#f8931f] ring-2 ring-[#f8931f]/20' : ''}`}
      >
        <span className={selectedOption ? 'text-slate-700 dark:text-slate-100' : 'text-slate-400 dark:text-slate-400'}>
          {selectedOption ? (selectedOption.label || selectedOption.value) : placeholder}
        </span>
        {!disabled && (
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>
      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-[#f8931f] bg-white shadow-lg dark:bg-slate-900 dark:shadow-black/40">
          <input
            ref={inputRef}
            value={filter}
            onChange={e => { setFilter(e.target.value); }}
            placeholder={`Search ${label.toLowerCase()}...`}
            className="w-full rounded-t-lg border-0 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <div className="max-h-36 overflow-y-auto border-t border-slate-200 dark:border-slate-700">
            {allItems.map((item, idx) => (
              <button
                key={item.isNone ? '__none__' : item.value}
                type="button"
                onClick={() => selectItem(item.value)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  item.isNone
                    ? 'text-slate-400 hover:bg-slate-50 dark:text-slate-500 dark:hover:bg-slate-800'
                    : item.value === value
                      ? 'bg-[#f8931f]/10 text-[#f8931f] font-medium hover:bg-[#f8931f]/15 dark:bg-[#f8931f]/15 dark:text-[#ffb45c]'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                } ${highlightIndex === idx ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
              >
                {item.isNone ? noneLabel : (item.label || item.value)}
              </button>
            ))}
            {filtered.length === 0 && !allowNone && (
              <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">No results</p>
            )}
          </div>
          {extraOptions && (
            <div className="border-t border-slate-200 dark:border-slate-700">
              {extraOptions}
            </div>
          )}
          {loading && (
            <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">Loading...</div>
          )}
        </div>
      )}
    </div>
  );
}
