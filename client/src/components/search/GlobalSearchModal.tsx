import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Package,
  Users,
  FileSignature,
  History,
  Truck,
  X,
  Loader2,
  ChevronRight,
  FileArchive,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface SearchItem {
  id: string;
  name?: string;
  type?: string;
  status?: string;
  fullName?: string;
  designation?: string | null;
  assetName?: string;
  assignedTo?: string | null;
  assignedAt?: string;
  summary?: string | null;
  action?: string;
  performedAt?: string;
  contactPerson?: string | null;
  documentNumber?: string;
  documentType?: string;
  title?: string;
}

interface SearchResults {
  assets: SearchItem[];
  personnel: SearchItem[];
  issuances: SearchItem[];
  audit: SearchItem[];
  suppliers: SearchItem[];
  documents: SearchItem[];
}

const CATEGORIES = [
  { key: 'assets' as const, label: 'Assets', icon: Package, route: '/assets' },
  { key: 'personnel' as const, label: 'Personnel', icon: Users, route: '/profiles' },
  { key: 'issuances' as const, label: 'Issuances', icon: FileSignature, route: '/issuances' },
  { key: 'audit' as const, label: 'Audit Trail', icon: History, route: '/audit' },
  { key: 'suppliers' as const, label: 'Suppliers', icon: Truck, route: '/suppliers' },
  { key: 'documents' as const, label: 'Documents', icon: FileArchive, route: '/documents' },
];

interface GlobalSearchModalProps {
  onClose: () => void;
}

export default function GlobalSearchModal({ onClose }: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Flatten results into a navigable list for keyboard navigation
  const flatResults = useCallback(() => {
    if (!results) return [];
    const items: { item: SearchItem; category: (typeof CATEGORIES)[number] }[] = [];
    for (const cat of CATEGORIES) {
      const catResults = results[cat.key];
      for (const item of catResults) {
        items.push({ item, category: cat });
      }
    }
    return items;
  }, [results]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2) {
      setResults(null);
      setLoading(false);
      setHighlightedIndex(-1);
      return;
    }

    setLoading(true);
    setHighlightedIndex(-1);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/search?q=${encodeURIComponent(query)}`);
        setResults(res.data);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      const items = flatResults();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex(prev => (prev < items.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : items.length - 1));
      } else if (e.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < items.length) {
        e.preventDefault();
        const { category } = items[highlightedIndex];
        navigate(category.route);
        onClose();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [highlightedIndex, flatResults, onClose, navigate]);

  const getSubtitle = (item: SearchItem, catKey: string): string => {
    switch (catKey) {
      case 'assets':
        return [item.type, item.status].filter(Boolean).join(' · ');
      case 'personnel':
        return item.designation || '';
      case 'issuances':
        return item.assignedTo || '';
      case 'audit':
        return item.action || '';
      case 'suppliers':
        return item.contactPerson || '';
      case 'documents':
        return [item.documentNumber, item.documentType, item.status].filter(Boolean).join(' · ');
      default:
        return '';
    }
  };

  const getPrimaryText = (item: SearchItem, catKey: string): string => {
    switch (catKey) {
      case 'assets':
        return item.name || '';
      case 'personnel':
        return item.fullName || '';
      case 'issuances':
        return item.assetName || '';
      case 'audit':
        return item.summary || item.action || '';
      case 'suppliers':
        return item.name || '';
      case 'documents':
        return item.title || item.documentNumber || '';
      default:
        return '';
    }
  };

  const totalResults = results
    ? CATEGORIES.reduce((sum, cat) => sum + results[cat.key].length, 0)
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[15vh]"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-2xl w-full mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search assets, personnel, issuances, documents..."
            className="flex-1 bg-transparent border-none outline-none text-lg text-slate-900 dark:text-white placeholder:text-slate-400"
          />
          {loading && <Loader2 className="w-5 h-5 text-[#f8931f] animate-spin shrink-0" />}
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!query || query.length < 2 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Search className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">Type to search across all modules</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-[#f8931f] animate-spin" />
            </div>
          ) : results && totalResults === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Search className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-300">No results found</p>
              <p className="text-xs mt-1 text-slate-400">Try a different search term</p>
            </div>
          ) : results ? (
            <div className="py-2">
              {CATEGORIES.map(cat => {
                const items = results[cat.key];
                if (items.length === 0) return null;

                const CatIcon = cat.icon;
                let globalIdx = 0;
                for (const c of CATEGORIES) {
                  if (c.key === cat.key) break;
                  globalIdx += results[c.key].length;
                }

                return (
                  <div key={cat.key} className="mb-1 last:mb-0">
                    {/* Category Header */}
                    <div className="flex items-center gap-2 px-4 py-1.5">
                      <CatIcon className="w-3.5 h-3.5 text-[#f8931f]" />
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {cat.label}
                      </span>
                      <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">
                        {items.length}
                      </span>
                    </div>

                    {/* Items */}
                    {items.map((item, i) => {
                      const idx = globalIdx + i;
                      const isHighlighted = idx === highlightedIndex;
                      const primary = getPrimaryText(item, cat.key);
                      const subtitle = getSubtitle(item, cat.key);

                      return (
                        <div
                          key={`${cat.key}-${item.id}`}
                          className={`flex items-center gap-3 px-4 py-2 mx-2 rounded-lg cursor-pointer transition-colors ${
                            isHighlighted
                              ? 'bg-[#f8931f]/10 dark:bg-[#f8931f]/20'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                          }`}
                          onClick={() => {
                            navigate(cat.route);
                            onClose();
                          }}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                        >
                          <CatIcon className="w-4 h-4 text-slate-300 dark:text-slate-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-900 dark:text-white font-medium truncate">
                              {primary}
                            </p>
                            {subtitle && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {subtitle}
                              </p>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Footer hint */}
          {results && totalResults > 0 && (
            <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-4 text-[10px] text-slate-400">
                <span>
                  <kbd className="px-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-mono">↑↓</kbd> Navigate
                </span>
                <span>
                  <kbd className="px-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-mono">Enter</kbd> Select
                </span>
                <span>
                  <kbd className="px-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-mono">Esc</kbd> Close
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
