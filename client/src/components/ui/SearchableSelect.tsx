import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  extraOptions?: React.ReactNode;
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Store position in a ref so the portal renders at the correct position
  // on its very first paint — no flash at position {} before useEffect fires.
  const dropdownPosRef = useRef<React.CSSProperties | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);

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

  // Compute dropdown position from trigger rect synchronously.
  // Returns null if trigger ref is not available.
  const computePosition = useCallback((): React.CSSProperties | null => {
    if (!triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    return {
      position: 'fixed' as const,
      left: rect.left,
      top: rect.bottom - 1, // overlap 1px for seamless visual connection with trigger
      width: rect.width,
      zIndex: 9999,
    };
  }, []);

  const openMenu = () => {
    if (disabled) return;
    // Compute position BEFORE opening so the first render has correct placement.
    // This avoids a flash where the portal renders at position {} then jumps.
    const pos = computePosition();
    if (pos) {
      dropdownPosRef.current = pos;
      setDropdownStyle(pos);
    }
    setIsOpen(true);
    setFilter('');
    const idx = selectedOption
      ? filtered.findIndex(o => o.value === value) + (allowNone ? 1 : 0)
      : 0;
    setHighlightIndex(idx >= 0 ? idx : 0);
  };

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setFilter('');
    setHighlightIndex(-1);
    // Keep position ref so re-opening is fast, but clear state for cleanliness
    dropdownPosRef.current = null;
    setDropdownStyle(null);
  }, []);

  const selectItem = (val: string) => {
    onChange(val);
    closeMenu();
    // Return focus to the trigger button so Tab moves to the next form field
    // instead of escaping to the page background.
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  // Use useLayoutEffect for position updates — runs synchronously after DOM mutations
  // but before the browser paints. This prevents visual flicker from position updates.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const pos = computePosition();
    if (pos) {
      dropdownPosRef.current = pos;
      setDropdownStyle(pos);
    }
  }, [isOpen, computePosition]);

  // Update position on scroll and resize while open
  useEffect(() => {
    if (!isOpen) return;
    const onScroll = () => {
      const pos = computePosition();
      if (pos) {
        dropdownPosRef.current = pos;
        setDropdownStyle(pos);
      }
    };
    const onResize = () => {
      const pos = computePosition();
      if (pos) {
        dropdownPosRef.current = pos;
        setDropdownStyle(pos);
      }
    };
    window.addEventListener('scroll', onScroll, true); // capture phase for nested scrolls
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [isOpen, computePosition]);

  // Close on outside click (check both trigger and portaled dropdown)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      closeMenu();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, closeMenu]);

  // Auto-focus search input when opening — use requestAnimationFrame to avoid
  // synchronous focus which can trigger a repaint in the same frame as the dropdown open.
  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  // Recalculate highlight when filter changes
  useEffect(() => {
    if (!isOpen) return;
    const query = filter.trim().toLowerCase();
    if (query) {
      const firstRealIdx = allItems.findIndex(item =>
        !item.isNone &&
        (item.label || item.value).toLowerCase().includes(query)
      );
      setHighlightIndex(firstRealIdx >= 0 ? firstRealIdx : 0);
    } else {
      const selectedIdx = allItems.findIndex(item => item.value === value);
      setHighlightIndex(selectedIdx >= 0 ? selectedIdx : 0);
    }
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
        // Keep focus on trigger so the user can continue tabbing
        requestAnimationFrame(() => triggerRef.current?.focus());
        break;
      case 'Tab':
        // Close dropdown on Tab so focus moves naturally to the next form field
        // instead of getting trapped or escaping to background.
        closeMenu();
        break;
    }
  };

  // ── Style classes ──
  // Closed: complete border on all 4 sides, all corners rounded, solid background
  const closedClass =
    'rounded-lg border border-slate-200 bg-white hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-slate-400';
  // Open: thicker orange border on 3 sides (top, left, right), rounded top corners.
  // border-b-0 removes the bottom border so the dropdown sits flush.
  // The ring provides a subtle focus glow; the dropdown overlaps 1px to cover
  // the bottom ring seam at the connection point.
  const openTriggerClass =
    'rounded-t-lg border-2 border-[#f8931f] border-b-0 ring-2 ring-[#f8931f]/20 bg-white dark:bg-slate-800';
  const disabledClass =
    'rounded-lg border border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-500';

  // Only render the portal when we have a valid position — prevents the flash
  // of the dropdown rendering at position {} before the position is computed.
  const showDropdown = isOpen && dropdownStyle !== null;

  return (
    <div className={className} onKeyDown={handleKeyDown}>
      {label && <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-300 mb-1">{label}</label>}
      {/* Trigger button — always carries its own complete border */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (isOpen) closeMenu(); else openMenu(); }}
        className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
          disabled ? disabledClass : isOpen ? openTriggerClass : closedClass
        }`}
      >
        <span className={selectedOption ? 'text-slate-700 dark:text-slate-100' : 'text-slate-400 dark:text-slate-400'}>
          {selectedOption ? (selectedOption.label || selectedOption.value) : placeholder}
        </span>
        {!disabled && (
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* Dropdown menu — portaled to document.body so it overlays form content
          instead of participating in layout. Only rendered when position is
          computed to prevent a flash at position {} before layout. */}
      {showDropdown && createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="overflow-hidden rounded-b-lg border-2 border-[#f8931f] border-t-0 bg-white dark:bg-slate-900 shadow-lg"
        >
          <div className="border-t border-slate-200 dark:border-slate-700">
            <input
              ref={inputRef}
              value={filter}
              onChange={e => { setFilter(e.target.value); }}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="w-full border-0 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-slate-100 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
          <div className="max-h-36 overflow-y-auto">
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
        </div>,
        document.body
      )}
    </div>
  );
}