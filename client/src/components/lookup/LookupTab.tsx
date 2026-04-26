import { useState } from 'react';
import { LookupTabProps } from '@/types/lookup';
import { Search, Plus, Pencil, PowerOff, Power, Eye, EyeOff } from 'lucide-react';

export default function LookupTab({
  category: _category,
  values,
  isLoading,
  onAdd,
  onEdit,
  onToggle
}: LookupTabProps) {

  // --- local state ---
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [editTarget, setEditTarget] = useState<{ id: number; value: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // --- filter state ---
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);

  // --- filtered values ---
  const filtered = values.filter(v => {
    const matchesSearch = !search || v.value.toLowerCase().includes(search.toLowerCase());
    const matchesActive = showInactive ? true : v.isActive;
    return matchesSearch && matchesActive;
  });

  // --- handlers ---
  function openAdd() {
    setInputValue('');
    setError('');
    setShowAddDialog(true);
  }

  function openEdit(id: number, value: string) {
    setEditTarget({ id, value });
    setInputValue(value);
    setError('');
    setShowEditDialog(true);
  }

  async function handleAdd() {
    if (!inputValue.trim()) {
      setError('Value cannot be empty.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onAdd(inputValue.trim());
      setShowAddDialog(false);
    } catch (e: any) {
      setError(e.message || 'Failed to add value.');
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!inputValue.trim()) {
      setError('Value cannot be empty.');
      return;
    }
    if (!editTarget) return;
    setSaving(true);
    setError('');
    try {
      await onEdit(editTarget.id, inputValue.trim());
      setShowEditDialog(false);
    } catch (e: any) {
      setError(e.message || 'Failed to update value.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: number, isActive: boolean) {
    try {
      await onToggle(id, !isActive);
    } catch (e: any) {
      console.error('Toggle failed:', e.message);
    }
  }

  // --- render ---
  return (
    <div className="w-full">

      {/* ═══ HORIZONTAL FILTER BAR ══════════════════════════ */}
      <div className="flex flex-row items-center gap-4 flex-wrap bg-white rounded-lg border border-slate-200 px-4 py-2.5 mb-4">
        {/* Search — expands to fill */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search values..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors"
          />
        </div>

        {/* Show Inactive toggle */}
        <button
          onClick={() => setShowInactive(!showInactive)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            showInactive
              ? 'bg-[#012061] text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          {showInactive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {showInactive ? 'Showing All' : 'Active Only'}
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Add New — Orange */}
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#f8931f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add New Value
        </button>
      </div>

      {/* ═══ TABLE ═══════════════════════════════════════════ */}
      {isLoading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f8931f]/10 mb-3">
            <Plus className="h-8 w-8 text-[#f8931f]" />
          </div>
          <p className="text-sm text-slate-500 mb-1">No values found</p>
          <p className="text-xs text-slate-400">
            {search ? 'Try adjusting your search or filters.' : 'Add one to get started.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            {/* ── Header: Navy tint ────────────────────────── */}
            <thead>
              <tr className="bg-[#012061]/5">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Value</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold tracking-widest text-slate-500 uppercase w-32">Status</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold tracking-widest text-slate-500 uppercase w-48">Actions</th>
              </tr>
            </thead>

            {/* ── Body: Sleek rows ─────────────────────────── */}
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className={`group border-b border-slate-100 cursor-default transition-colors ${
                    !item.isActive ? 'opacity-60' : 'hover:bg-slate-50 hover:border-l-2 hover:border-l-[#f8931f]'
                  }`}
                >
                  {/* Value — Bold Navy */}
                  <td className="px-4 py-2.5 font-semibold text-[#012061]">{item.value}</td>

                  {/* Status badge */}
                  <td className="px-4 py-2.5">
                    {item.isActive ? (
                      <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ACTIVE
                      </span>
                    ) : (
                      <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-slate-100 text-slate-500 border border-slate-200">
                        INACTIVE
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => openEdit(item.id, item.value)}
                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-[#012061] hover:bg-[#012061]/5 transition-colors"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                      <button
                        onClick={() => handleToggle(item.id, item.isActive)}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          item.isActive
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {item.isActive ? (
                          <><PowerOff className="h-3 w-3" /> Deactivate</>
                        ) : (
                          <><Power className="h-3 w-3" /> Activate</>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ ADD DIALOG ══════════════════════════════════════ */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Navy header bar */}
            <div className="bg-[#012061] px-5 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Add New Value</h3>
            </div>
            {/* Body with scroll */}
            <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
              <input
                type="text"
                placeholder="Enter value..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
              />
              {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            </div>
            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
              <button className="rounded-lg px-4 py-2 text-xs font-medium text-[#012061] hover:bg-[#012061]/5 transition-colors" onClick={() => setShowAddDialog(false)}>Cancel</button>
              <button className="rounded-lg bg-[#f8931f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors" onClick={handleAdd} disabled={saving}>
                {saving ? 'Saving…' : 'Add Value'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ EDIT DIALOG ═════════════════════════════════════ */}
      {showEditDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Navy header bar */}
            <div className="bg-[#012061] px-5 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Edit Value</h3>
            </div>
            {/* Body with scroll */}
            <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
              <input
                type="text"
                placeholder="Enter value..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleEdit(); }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
              />
              {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            </div>
            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
              <button className="rounded-lg px-4 py-2 text-xs font-medium text-[#012061] hover:bg-[#012061]/5 transition-colors" onClick={() => setShowEditDialog(false)}>Cancel</button>
              <button className="rounded-lg bg-[#f8931f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors" onClick={handleEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}