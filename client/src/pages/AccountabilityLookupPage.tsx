import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Briefcase, Building2, FolderKanban, Search, Plus, Pencil,
  PowerOff, Power, AlertTriangle, X,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/* ═══════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════ */
interface LookupItem {
  id: number;
  name: string;
  status: string; // 'active' | 'inactive' | 'completed' | 'archived'
  createdAt?: string;
}

type StatusFilter = 'all' | 'active' | 'inactive';

/* ═══════════════════════════════════════════════════════════
   LOOKUP GROUPS
   ═══════════════════════════════════════════════════════════ */
const GROUPS = [
  { key: 'designations', label: 'Designations', icon: Briefcase, endpoint: '/api/lookup/accountability/designations' },
  { key: 'institutions', label: 'Institutions', icon: Building2, endpoint: '/api/lookup/accountability/institutions' },
  { key: 'projects', label: 'Projects', icon: FolderKanban, endpoint: '/api/lookup/accountability/projects' },
  // TODO: Add API support for these categories before enabling:
  // { key: 'personnel-types', label: 'Personnel Types', icon: Users, endpoint: '/api/lookup/accountability/personnel-types' },
  // { key: 'offices', label: 'Offices / Departments', icon: DoorOpen, endpoint: '/api/lookup/accountability/offices' },
  // { key: 'issuance-purposes', label: 'Issuance Purposes', icon: Target, endpoint: '/api/lookup/accountability/issuance-purposes' },
  // { key: 'return-reasons', label: 'Return Reasons', icon: RotateCcw, endpoint: '/api/lookup/accountability/return-reasons' },
  // { key: 'return-conditions', label: 'Return Conditions', icon: ClipboardCheck, endpoint: '/api/lookup/accountability/return-conditions' },
];

/* ═══════════════════════════════════════════════════════════
   STATUS BADGE
   ═══════════════════════════════════════════════════════════ */
function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === 'active') {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800">
        ACTIVE
      </span>
    );
  }
  if (s === 'inactive') {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
        INACTIVE
      </span>
    );
  }
  if (s === 'completed') {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-200 border border-blue-200">
        COMPLETED
      </span>
    );
  }
  if (s === 'archived') {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-amber-50 dark:bg-amber-950 text-amber-700 border border-amber-200">
        ARCHIVED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
      {status.toUpperCase()}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   ADD / EDIT MODAL
   ═══════════════════════════════════════════════════════════ */
function AddEditModal({
  open,
  title,
  subtitle,
  initialValue,
  existingNames,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  initialValue: string;
  existingNames: string[];
  onClose: () => void;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setValue(initialValue);
    setError('');
  }, [initialValue, open]);

  if (!open) return null;

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) { setError('Name is required.'); return; }
    if (trimmed.length > 100) { setError('Name must be 100 characters or fewer.'); return; }
    // Case-insensitive duplicate check (skip self when editing)
    const normalised = trimmed.toLowerCase();
    const isEditSelf = initialValue.trim().toLowerCase() === normalised;
    if (!isEditSelf && existingNames.some(n => n.toLowerCase() === normalised)) {
      setError('This value already exists in this lookup group.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(trimmed);
      onClose();
    } catch (e: any) {
      const msg = e?.message || 'Failed to save.';
      if (msg.includes('already exists')) {
        setError('This value already exists in this lookup group.');
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#012061] px-5 py-3.5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            {subtitle && <p className="text-[11px] text-white/50 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Body */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="Enter name..."
            value={value}
            onChange={e => { setValue(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            autoFocus
            maxLength={100}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
          />
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{value.trim().length}/100 characters</p>
          {error && (
            <div className="flex items-start gap-1.5 mt-2 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/50">
          <button
            className="rounded-lg px-4 py-2 text-xs font-medium text-[#012061] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-[#f8931f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={saving || !value.trim()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */
export default function AccountabilityLookupPage() {
  const { user } = useAuth();
  const [activeGroup, setActiveGroup] = useState('designations');

  // Data state
  const [items, setItems] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Modal state
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<LookupItem | null>(null);

  // Toggle confirmation / force-deactivate
  const [confirmToggle, setConfirmToggle] = useState<LookupItem | null>(null);
  const [forceDialog, setForceDialog] = useState<{ id: number; currentStatus: string; newStatus: string; affectedCount: number } | null>(null);
  const [forceLoading, setForceLoading] = useState(false);

  // Counts per group
  const [counts, setCounts] = useState<Record<string, number>>({});

  const token = localStorage.getItem('accessToken');
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const activeGroupConfig = GROUPS.find(g => g.key === activeGroup)!;

  // Fetch items
  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(activeGroupConfig.endpoint, { headers: authHeaders });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load');
      setItems(json.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activeGroupConfig.endpoint]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Reset filters when switching groups
  useEffect(() => { setSearch(''); setStatusFilter('all'); }, [activeGroup]);

  // Refresh counts when items change
  useEffect(() => {
    GROUPS.forEach(async (g) => {
      try {
        const res = await fetch(g.endpoint, { headers: authHeaders });
        const json = await res.json();
        if (json.success) {
          setCounts(prev => ({ ...prev, [g.key]: json.data?.length ?? 0 }));
        }
      } catch { /* skip */ }
    });
  }, [items]);

  const allowed = user?.role === 'ADMIN' || user?.role === 'STAFF_ADMIN';
  if (!allowed) {
    return (
      <div className="p-6">
        <p className="text-destructive font-medium">Access denied. Admins and Staff-Admins only.</p>
      </div>
    );
  }

  // Existing names for duplicate validation
  const existingNames = items.map(i => i.name);

  // ─── Handlers ───
  const handleAdd = async (name: string) => {
    const res = await fetch(activeGroupConfig.endpoint, { method: 'POST', headers: authHeaders, body: JSON.stringify({ name }) });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Failed to add');
    await fetchItems();
  };

  const handleEdit = async (name: string) => {
    if (!editTarget) return;
    const res = await fetch(`${activeGroupConfig.endpoint}/${editTarget.id}`, {
      method: 'PATCH', headers: authHeaders, body: JSON.stringify({ name }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Failed to rename');
    setEditTarget(null);
    await fetchItems();
  };

  const handleToggle = async (item: LookupItem) => {
    const newStatus = item.status === 'active' ? 'inactive' : 'active';

    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i));

    try {
      const res = await fetch(`${activeGroupConfig.endpoint}/${item.id}`, {
        method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();

      // Handle LOOKUP_IN_USE (409)
      if (res.status === 409 && json.error?.details?.code === 'LOOKUP_IN_USE') {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: item.status } : i));
        const affectedCount = json.error.details.affectedCount || '?';
        setForceDialog({ id: item.id, currentStatus: item.status, newStatus, affectedCount });
        setConfirmToggle(null);
        return;
      }

      if (!json.success) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: item.status } : i));
        throw new Error(json.error?.message || 'Failed to update status');
      }
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: item.status } : i));
    }
    setConfirmToggle(null);
  };

  const handleForceDeactivate = async () => {
    if (!forceDialog) return;
    setForceLoading(true);
    const { id, currentStatus, newStatus } = forceDialog;
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
    try {
      const res = await fetch(`${activeGroupConfig.endpoint}/${id}`, {
        method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: newStatus, forceDeactivate: true }),
      });
      const json = await res.json();
      if (!json.success) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, status: currentStatus } : i));
        throw new Error(json.error?.message || 'Failed to force-deactivate');
      }
    } catch {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: currentStatus } : i));
    } finally {
      setForceLoading(false);
      setForceDialog(null);
    }
  };

  // ─── Filtering ───
  const activeCount = items.filter(i => i.status === 'active').length;
  const inactiveCount = items.filter(i => i.status !== 'active').length;

  const filtered = useMemo(() => {
    return items.filter(i => {
      const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
      if (statusFilter === 'active') return matchSearch && i.status === 'active';
      if (statusFilter === 'inactive') return matchSearch && i.status !== 'active';
      return matchSearch; // 'all'
    });
  }, [items, search, statusFilter]);

  return (
    <div className="flex flex-col h-screen pt-14 md:pt-0 bg-[#012061] md:bg-transparent">

      {/* ═══ STICKY NAVY HEADER ═════════════════════════════ */}
      <header className="sticky top-14 md:top-0 z-30 shrink-0 bg-[#012061] px-4 md:px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f8931f]/20">
              <Building2 className="h-5 w-5 text-[#f8931f]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-white tracking-tight leading-tight">Accountability Lookups</h1>
              <p className="text-[11px] text-white/50 hidden sm:block truncate">Manage official dropdown values used by forms and reports.</p>
            </div>
          </div>
          {allowed && (
            <button
              onClick={() => setShowAdd(true)}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-[#f8931f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Add Value
            </button>
          )}
        </div>
      </header>

      {/* ═══ CONTENT AREA ════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-auto bg-slate-50 dark:bg-slate-900">

        {/* ═══ GROUP SELECTOR ═══════════════════════════════ */}
        <section className="px-4 md:px-6 pt-4 shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {GROUPS.map(({ key, label, icon: Icon }) => {
              const isActive = activeGroup === key;
              const count = counts[key];
              return (
                <button
                  key={key}
                  onClick={() => setActiveGroup(key)}
                  className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 transition-all text-left shrink-0 ${
                    isActive
                      ? 'border-[#f8931f] bg-[#f8931f]/5 shadow-sm ring-1 ring-[#f8931f]/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
                  }`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    isActive ? 'bg-[#f8931f]/20' : 'bg-slate-100 dark:bg-slate-700'
                  }`}>
                    <Icon className={`h-4 w-4 ${isActive ? 'text-[#f8931f]' : 'text-slate-500 dark:text-slate-400'}`} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold leading-tight ${
                      isActive ? 'text-[#f8931f]' : 'text-slate-700 dark:text-slate-200'
                    }`}>
                      {label}
                    </p>
                    <p className={`text-[10px] leading-tight ${
                      isActive ? 'text-[#f8931f]/70' : 'text-slate-400 dark:text-slate-500'
                    }`}>
                      {count ?? '…'} {count === 1 ? 'value' : 'values'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ═══ FILTER BAR ════════════════════════════════════ */}
        <section className="px-4 md:px-6 pt-3 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3">
            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder={`Search ${activeGroupConfig.label.toLowerCase()}…`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-9 pr-3 py-2 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors"
              />
            </div>
            {/* Status filter pills */}
            <div className="flex items-center gap-1 shrink-0">
              {(['all', 'active', 'inactive'] as StatusFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`rounded-md px-3 py-2 text-[11px] font-medium transition-colors ${
                    statusFilter === f
                      ? 'bg-[#012061] text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Inactive'}
                </button>
              ))}
            </div>
            {/* Count text */}
            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden lg:inline shrink-0">
              {activeCount} active · {inactiveCount} inactive
            </span>
            {/* Mobile add button */}
            {allowed && (
              <button
                onClick={() => setShowAdd(true)}
                className="sm:hidden inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#f8931f] px-3 py-2 text-xs font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors shrink-0"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            )}
          </div>
        </section>

        {/* ═══ TABLE / CARDS ════════════════════════════════ */}
        <div className="flex-1 overflow-auto px-4 md:px-6 pt-4 pb-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-[#f8931f]" />
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">Loading…</p>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-4 py-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          ) : items.length === 0 && !search ? (
            /* Group has no values at all */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f8931f]/10 mb-3">
                <Briefcase className="h-7 w-7 text-[#f8931f]" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">No values yet</p>
              <p className="text-xs text-slate-400 mb-4">Add the first value for this lookup group.</p>
              {allowed && (
                <button
                  onClick={() => setShowAdd(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#f8931f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Add {activeGroupConfig.label.replace(/s$/, '')}
                </button>
              )}
            </div>
          ) : filtered.length === 0 ? (
            /* Search returned no results */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 mb-3">
                <Search className="h-7 w-7 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">No matching values</p>
              <p className="text-xs text-slate-400">Try a different search term or change the filter.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#012061]">
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase">Name</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase w-28">Status</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-semibold tracking-widest text-white/70 uppercase w-28">Created</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-semibold tracking-widest text-white/70 uppercase w-44">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(item => {
                      const isInactive = item.status !== 'active';
                      return (
                        <tr
                          key={item.id}
                          className={`group border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 cursor-default transition-colors ${
                            isInactive ? 'opacity-60 bg-slate-50/50 dark:bg-slate-800/30' : 'hover:bg-slate-50/80 dark:hover:bg-slate-700/30'
                          }`}
                        >
                          <td className="px-4 py-2.5">
                            <span className={`font-semibold whitespace-nowrap ${isInactive ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-[#012061] dark:text-slate-100'}`}>
                              {item.name}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={item.status} />
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {allowed ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => setEditTarget(item)}
                                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-[#012061] dark:text-slate-100 hover:bg-[#012061]/5 dark:hover:bg-slate-700/50 transition-colors whitespace-nowrap"
                                >
                                  <Pencil className="h-3 w-3" /> Edit
                                </button>
                                <button
                                  onClick={() => setConfirmToggle(item)}
                                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                                    item.status === 'active'
                                      ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                      : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                  }`}
                                >
                                  {item.status === 'active'
                                    ? <><PowerOff className="h-3 w-3" /> Deactivate</>
                                    : <><Power className="h-3 w-3" /> Reactivate</>
                                  }
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">View only</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {filtered.map(item => {
                  const isInactive = item.status !== 'active';
                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 ${isInactive ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold truncate ${isInactive ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-[#012061] dark:text-slate-100'}`}>
                            {item.name}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <StatusBadge status={item.status} />
                            {item.createdAt && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">{new Date(item.createdAt).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        {allowed && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => setEditTarget(item)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#012061] dark:text-slate-100 hover:bg-[#012061]/5 dark:hover:bg-slate-700/50 transition-colors"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => setConfirmToggle(item)}
                              className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                                item.status === 'active'
                                  ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                  : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                              }`}
                            >
                              {item.status === 'active' ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══ ADD MODAL ════════════════════════════════════ */}
      <AddEditModal
        open={showAdd}
        title={`Add ${activeGroupConfig.label.replace(/s$/, '')}`}
        subtitle={`Add a new value to the ${activeGroupConfig.label} lookup group.`}
        initialValue=""
        existingNames={existingNames}
        onClose={() => setShowAdd(false)}
        onSave={handleAdd}
      />

      {/* ═══ EDIT MODAL ═══════════════════════════════════ */}
      <AddEditModal
        open={editTarget !== null}
        title={`Edit ${activeGroupConfig.label.replace(/s$/, '')}`}
        subtitle={`Rename this value in the ${activeGroupConfig.label} lookup group.`}
        initialValue={editTarget?.name || ''}
        existingNames={existingNames}
        onClose={() => setEditTarget(null)}
        onSave={handleEdit}
      />

      {/* ═══ TOGGLE CONFIRMATION DIALOG ════════════════════ */}
      <Dialog open={confirmToggle !== null} onOpenChange={(open) => { if (!open) setConfirmToggle(null); }}>
        <DialogContent showCloseButton={false} className="max-w-md overflow-hidden rounded-xl border-0 bg-white p-0 shadow-2xl dark:bg-slate-900">
          <div className="flex items-center justify-between px-5 py-4" style={{ background: confirmToggle?.status === 'active' ? '#7B1113' : '#012061' }}>
            <DialogHeader className="gap-0">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-white" />
                <DialogTitle className="text-sm font-bold text-white">
                  {confirmToggle?.status === 'active' ? 'Deactivate value?' : 'Reactivate value?'}
                </DialogTitle>
              </div>
            </DialogHeader>
          </div>
          <DialogDescription className="sr-only">
            Confirm status change for a lookup value.
          </DialogDescription>
          <div className="px-5 py-4">
            {confirmToggle?.status === 'active' ? (
              <div>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-bold">&ldquo;{confirmToggle.name}&rdquo;</span> will no longer appear in new dropdowns, but existing records that use it will not be changed.
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-700 dark:text-slate-300">
                <span className="font-bold">&ldquo;{confirmToggle?.name}&rdquo;</span> will become available again in new dropdowns.
              </p>
            )}
          </div>
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/50">
            <DialogClose render={<Button variant="outline" size="sm" />} onClick={() => setConfirmToggle(null)}>
              Cancel
            </DialogClose>
            <button
              onClick={() => confirmToggle && handleToggle(confirmToggle)}
              className={`rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors ${
                confirmToggle?.status === 'active'
                  ? 'bg-[#7B1113] hover:bg-[#5e0e10]'
                  : 'bg-[#012061] hover:bg-[#001a4d]'
              }`}
            >
              {confirmToggle?.status === 'active' ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ FORCE DEACTIVATE WARNING DIALOG ═══════════════ */}
      <Dialog open={forceDialog !== null} onOpenChange={(open) => { if (!open) setForceDialog(null); }}>
        <DialogContent showCloseButton={false} className="max-w-md overflow-hidden rounded-xl border-0 bg-white p-0 shadow-2xl dark:bg-slate-900">
          <div className="flex items-center justify-between px-5 py-4" style={{ background: '#7B1113' }}>
            <DialogHeader className="gap-0">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-white" />
                <DialogTitle className="text-sm font-bold text-white">
                  This value is in use
                </DialogTitle>
              </div>
            </DialogHeader>
          </div>
          <DialogDescription className="sr-only">
            Confirm force deactivation of a lookup value that is used by active personnel profiles.
          </DialogDescription>
          <div className="px-5 py-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-bold text-[#7B1113]">{forceDialog?.affectedCount ?? '?'}</span> active profile(s) currently use this lookup value.
              Deactivating it will not remove them from existing profiles, but the value will no longer appear in new dropdowns.
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Do you want to force deactivation anyway?
            </p>
          </div>
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/50">
            <DialogClose render={<Button variant="outline" size="sm" />} onClick={() => setForceDialog(null)}>
              Cancel
            </DialogClose>
            <button
              onClick={handleForceDeactivate}
              disabled={forceLoading}
              className="rounded-lg bg-[#7B1113] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5e0e10] shadow-sm transition-colors disabled:opacity-50"
            >
              {forceLoading ? 'Deactivating…' : 'Force Deactivate'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}