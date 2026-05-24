import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Briefcase, Building2, FolderKanban, Search, Plus, Pencil, PowerOff, Power, Eye, EyeOff, AlertTriangle,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/* ─── Types ─── */
interface LookupItem {
  id: number;
  name: string;
  status: string;
  createdAt?: string;
}

const TABS = [
  { key: 'designations', label: 'Designations', icon: Briefcase, endpoint: '/api/lookup/accountability/designations' },
  { key: 'institutions', label: 'Institutions', icon: Building2, endpoint: '/api/lookup/accountability/institutions' },
  { key: 'projects', label: 'Projects', icon: FolderKanban, endpoint: '/api/lookup/accountability/projects' },
];

/* ─── Status Badge ─── */
function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === 'active') {
    return (
      <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200 border border-emerald-200">
        ACTIVE
      </span>
    );
  }
  if (s === 'inactive') {
    return (
      <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
        INACTIVE
      </span>
    );
  }
  if (s === 'completed') {
    return (
      <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-200 border border-blue-200">
        COMPLETED
      </span>
    );
  }
  if (s === 'archived') {
    return (
      <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-amber-50 dark:bg-amber-950 text-amber-700 border border-amber-200">
        ARCHIVED
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
      {status.toUpperCase()}
    </span>
  );
}

/* ─── Modal ─── */
function AddEditModal({
  open,
  title,
  initialValue,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  initialValue: string;
  onClose: () => void;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setValue(initialValue); setError(''); }, [initialValue, open]);

  if (!open) return null;

  const handleSave = async () => {
    if (!value.trim()) { setError('Name cannot be empty.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(value.trim());
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-[#012061] px-5 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          <input
            type="text"
            placeholder="Enter name..."
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            autoFocus
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
          />
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/50">
          <button className="rounded-lg px-4 py-2 text-xs font-medium text-[#012061] dark:text-slate-100 hover:bg-[#012061]/5 dark:hover:bg-slate-700/40 dark:bg-slate-700/40 transition-colors" onClick={onClose}>
            Cancel
          </button>
          <button className="rounded-lg bg-[#f8931f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab Table ─── */
function LookupTable({
  endpoint,
}: {
  endpoint: string;
}) {
  const [items, setItems] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);

  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<LookupItem | null>(null);

  // Force-deactivate warning dialog
  const [forceDialog, setForceDialog] = useState<{ id: number; currentStatus: string; newStatus: string; affectedCount: number } | null>(null);
  const [forceLoading, setForceLoading] = useState(false);

  const token = localStorage.getItem('accessToken');
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(endpoint, { headers: authHeaders });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load');
      setItems(json.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleAdd = async (name: string) => {
    const res = await fetch(endpoint, { method: 'POST', headers: authHeaders, body: JSON.stringify({ name }) });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Failed to add');
    // Optimistic append — insert and re-sort
    setItems(prev => {
      const next = [...prev, json.data];
      next.sort((a, b) => a.name.localeCompare(b.name));
      return next;
    });
  };

  const handleToggle = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    // Optimistic update before API call
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, status: newStatus } : item))
    );
    try {
      const res = await fetch(`${endpoint}/${id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();

      // Handle LOOKUP_IN_USE (409) — referenced by active personnel
      if (res.status === 409 && json.error?.details?.code === 'LOOKUP_IN_USE') {
        // Revert optimistic update and show warning dialog instead
        setItems(prev =>
          prev.map(item => (item.id === id ? { ...item, status: currentStatus } : item))
        );
        const affectedCount = json.error.details.affectedCount || '?';
        setForceDialog({ id, currentStatus, newStatus, affectedCount });
        return;
      }

      if (!json.success) {
        // Revert on failure
        setItems(prev =>
          prev.map(item => (item.id === id ? { ...item, status: currentStatus } : item))
        );
        throw new Error(json.error?.message || 'Failed to update status');
      }
    } catch (e: any) {
      // Already reverted above for API errors; re-throw for other failures
      if (!e.message?.includes('Failed to update status')) {
        setItems(prev =>
          prev.map(item => (item.id === id ? { ...item, status: currentStatus } : item))
        );
      }
      throw e;
    }
  };

  const handleForceDeactivate = async () => {
    if (!forceDialog) return;
    setForceLoading(true);
    const { id, currentStatus, newStatus } = forceDialog;
    // Optimistic update
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, status: newStatus } : item))
    );
    try {
      const res = await fetch(`${endpoint}/${id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ status: newStatus, forceDeactivate: true }),
      });
      const json = await res.json();
      if (!json.success) {
        // Revert
        setItems(prev =>
          prev.map(item => (item.id === id ? { ...item, status: currentStatus } : item))
        );
        throw new Error(json.error?.message || 'Failed to force-deactivate');
      }
    } catch (e: any) {
      setItems(prev =>
        prev.map(item => (item.id === id ? { ...item, status: currentStatus } : item))
      );
    } finally {
      setForceLoading(false);
      setForceDialog(null);
    }
  };

  const filtered = items.filter(i => {
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
    const matchActive = showInactive ? true : i.status === 'active';
    return matchSearch && matchActive;
  });

  return (
    <div className="w-full">
      {/* Filter bar */}
      <div className="flex flex-row items-center gap-4 flex-wrap bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-9 pr-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors"
          />
        </div>
        <button
          onClick={() => setShowInactive(!showInactive)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            showInactive ? 'bg-[#012061] text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          {showInactive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {showInactive ? 'Showing All' : 'Active Only'}
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#f8931f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add New Value
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-500 py-4">Error: {error}</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f8931f]/10 mb-3">
            <Plus className="h-8 w-8 text-[#f8931f]" />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">No values found</p>
          <p className="text-xs text-slate-400">{search ? 'Try adjusting your search.' : 'Add one to get started.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#012061]">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase">Name</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase w-32">Status</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold tracking-widest text-white/70 uppercase w-48">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr
                  key={item.id}
                  className={`group border-b border-slate-100 dark:border-slate-700 cursor-default transition-colors ${
                    item.status !== 'active' ? 'opacity-60' : 'hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-l-2 hover:border-l-[#f8931f]'
                  }`}
                >
                  <td className="px-4 py-2.5 font-semibold text-[#012061] dark:text-slate-100">{item.name}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={item.status} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => setEditTarget(item)}
                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-[#012061] dark:text-slate-100 hover:bg-[#012061]/5 dark:hover:bg-slate-700/40 dark:bg-slate-700/40 transition-colors"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                      <button
                        onClick={() => handleToggle(item.id, item.status)}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          item.status === 'active' ? 'text-red-600 hover:bg-red-50 dark:bg-red-950 dark:hover:bg-red-950' : 'text-emerald-600 hover:bg-emerald-50 dark:bg-emerald-950 dark:hover:bg-emerald-950'
                        }`}
                      >
                        {item.status === 'active' ? <><PowerOff className="h-3 w-3" /> Deactivate</> : <><Power className="h-3 w-3" /> Activate</>}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      <AddEditModal
        open={showAdd}
        title="Add New Value"
        initialValue=""
        onClose={() => setShowAdd(false)}
        onSave={handleAdd}
      />

      {/* Edit Modal */}
      <AddEditModal
        open={editTarget !== null}
        title="Edit Value"
        initialValue={editTarget?.name || ''}
        onClose={() => setEditTarget(null)}
        onSave={async (name: string) => {
          if (!editTarget) return;
          // PATCH now supports { name } for renaming
          const res = await fetch(`${endpoint}/${editTarget.id}`, {
            method: 'PATCH', headers: authHeaders, body: JSON.stringify({ name }),
          });
          const json = await res.json();
          if (json.success) {
            // Update local state with the renamed item
            setItems(prev => prev.map(item => item.id === editTarget.id ? { ...item, name } : item));
          } else {
            throw new Error(json.error?.message || 'Failed to rename');
          }
          setEditTarget(null);
        }}
      />

      {/* Force Deactivate Warning Dialog */}
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
              Deactivating it will not remove them from existing profiles, but the value will no longer appear in dropdowns for new or edited profiles.
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Do you want to force deactivation anyway?
            </p>
          </div>
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/50">
            <DialogClose
              render={<Button variant="outline" size="sm" />}
              onClick={() => setForceDialog(null)}
            >
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

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */
export default function AccountabilityLookupPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('designations');

  const [counts, setCounts] = useState<Record<string, number>>({
    designations: 0,
    institutions: 0,
    projects: 0,
  });

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const headers = { Authorization: `Bearer ${token}` };
    TABS.forEach(async tab => {
      try {
        const res = await fetch(tab.endpoint, { headers });
        const json = await res.json();
        if (json.success) {
          setCounts(prev => ({ ...prev, [tab.key]: json.data?.length ?? 0 }));
        }
      } catch { /* skip */ }
    });
  }, []);

  const allowed = user?.role === 'ADMIN' || user?.role === 'STAFF_ADMIN';
  if (!allowed) {
    return (
      <div className="p-6">
        <p className="text-destructive font-medium">Access denied. Admins and Staff-Admins only.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen pt-14 md:pt-0 bg-[#012061] md:bg-transparent">
      {/* Header */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">Accountability Lookups</h1>
          </div>
          <p className="hidden sm:block text-xs text-slate-700 dark:text-white/60 bg-white dark:bg-slate-800/10 rounded-lg px-3 py-2">
            Manage designations, institutions & projects
          </p>
        </div>
      </header>

      {/* ═══ CONTENT AREA ════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-auto bg-light-bg dark:bg-slate-900">

      {/* KPI Cards */}
      <section className="px-6 pt-4 shrink-0">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors text-left ${
                activeTab === key ? 'border-[#f8931f] bg-[#f8931f]/5' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
              }`}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                activeTab === key ? 'bg-[#f8931f]/20' : 'bg-[#f8931f]/10'
              }`}>
                <Icon className={`h-5 w-5 ${activeTab === key ? 'text-[#f8931f]' : 'text-[#f8931f]/70'}`} />
              </div>
              <div className="min-w-0">
                <p className={`text-xl font-bold leading-tight ${activeTab === key ? 'text-[#f8931f]' : 'text-slate-900 dark:text-slate-100'}`}>{counts[key] ?? 0}</p>
                <p className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase">Total {label}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Tab Bar */}
      <section className="px-6 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === key
                  ? 'bg-[#f8931f] text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <LookupTable endpoint={TABS.find(t => t.key === activeTab)!.endpoint} />
      </div>
      </div>{/* close content area */}
    </div>
  );
}