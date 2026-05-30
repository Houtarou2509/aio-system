import { useState, useEffect, useCallback } from 'react';
import { Truck, Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SupplierFormModal } from '../components/suppliers/SupplierFormModal';
import { ResponsiveTable } from '../components/ui/ResponsiveTable';

interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { assets: number };
}

/* ── Empty state ───────────────────────────────────────────── */

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#f8931f]/10 mb-4">
        <Building2 className="h-10 w-10 text-[#f8931f]" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">No suppliers yet</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-xs">
        Add vendors and suppliers to track where your assets come from.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 rounded-lg bg-[#f8931f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors"
      >
        <Plus className="h-4 w-4" /> Add First Supplier
      </button>
    </div>
  );
}

/* ── Loading skeleton ──────────────────────────────────────── */

function Skeleton() {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700">
      <div className="animate-pulse">
        <div className="h-10 bg-[#012061] rounded-t-lg" />
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex gap-4 px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-700">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded flex-1" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Delete confirm modal ──────────────────────────────────── */

function DeleteConfirmModal({
  supplier,
  onConfirm,
  onClose,
}: {
  supplier: Supplier;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const assetCount = supplier._count?.assets ?? 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-xl shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7B1113]/10">
              <Trash2 className="h-5 w-5 text-[#7B1113]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Delete Supplier</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-1">
            Are you sure you want to delete <strong>{supplier.name}</strong>?
          </p>
          {assetCount > 0 && (
            <p className="text-xs text-[#7B1113] bg-[#7B1113]/5 border border-[#7B1113]/20 rounded-lg px-3 py-2 mt-2">
              This supplier has {assetCount} asset{assetCount !== 1 ? 's' : ''} linked. Reassign those assets before deleting.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-700">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-[#012061] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={assetCount > 0}
            className="rounded-lg bg-[#7B1113] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6a0f11] disabled:opacity-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   SUPPLIERS PAGE
   ═════════════════════════════════════════════════════════════ */

export default function SuppliersPage() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const userPerms = user?.permissions || [];

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/suppliers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setSuppliers(data.data);
    } catch (err) {
      console.error('Failed to fetch suppliers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleAdd = () => {
    setEditSupplier(null);
    setShowForm(true);
  };

  const handleEdit = (supplier: Supplier) => {
    setEditSupplier(supplier);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/suppliers/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error?.message || 'Failed to delete supplier');
        return;
      }
      setSuppliers(prev => prev.filter(s => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      alert(err.message || 'Failed to delete supplier');
    }
  };

  return (
    <div className="min-h-dvh bg-[#f1f3f5] dark:bg-slate-900">
      {/* ═══ NAVY HEADER ══════════════════════════════════ */}
      <header className="sticky top-0 z-30 bg-[#012061] shadow-[0_1px_0_#f8931f,0_4px_16px_rgba(1,32,97,0.3)]">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f8931f]/15">
              <Truck className="h-5 w-5 text-[#f8931f]" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">Suppliers</h1>
              <p className="text-[11px] text-slate-400 font-medium">Vendor & Supplier Management</p>
            </div>
          </div>
          {userPerms.includes('suppliers:create') && (
            <button
              onClick={handleAdd}
              className="inline-flex items-center gap-2 rounded-lg bg-[#f8931f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors"
            >
              <Plus className="h-4 w-4" /> Add Supplier
            </button>
          )}
        </div>
      </header>

      <div className="px-4 sm:px-6 py-4">
        {loading ? (
          <Skeleton />
        ) : suppliers.length === 0 ? (
          <EmptyState onAdd={handleAdd} />
        ) : (
          <ResponsiveTable
            columns={[
              {
                key: 'name', header: 'Name',
                render: (s) => (
                  <div>
                    <span className="font-semibold text-[#012061] dark:text-slate-100">{s.name}</span>
                    {s.website && (
                      <a href={s.website.startsWith('http') ? s.website : `https://${s.website}`} target="_blank" rel="noopener noreferrer"
                        className="block text-[11px] text-[#f8931f] hover:underline mt-0.5">{s.website}</a>
                    )}
                  </div>
                ),
              },
              {
                key: 'contact', header: 'Contact',
                render: (s) => s.contactPerson || '—',
              },
              {
                key: 'email', header: 'Email',
                render: (s) => s.email ? <a href={`mailto:${s.email}`} className="text-[#f8931f] hover:underline">{s.email}</a> : '—',
              },
              {
                key: 'phone', header: 'Phone', mobileHidden: true,
                render: (s) => s.phone || '—',
              },
              {
                key: 'assets', header: 'Assets',
                render: (s) => (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#012061]/10 dark:bg-[#012061]/30 px-2.5 py-0.5 text-xs font-semibold text-[#012061] dark:text-slate-200">
                    <Truck className="h-3 w-3" />{s._count?.assets ?? 0}
                  </span>
                ),
              },
              {
                key: 'actions', header: 'Actions',
                render: (s) => (
                  <div className="flex items-center justify-end gap-1">
                    {userPerms.includes('suppliers:edit') && <button onClick={(e) => { e.stopPropagation(); handleEdit(s); }} className="p-1.5 rounded-md text-slate-400 hover:text-[#f8931f] hover:bg-[#f8931f]/10 transition-colors" title="Edit"><Pencil className="h-4 w-4" /></button>}
                    {userPerms.includes('suppliers:delete') && <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }} className="p-1.5 rounded-md text-slate-400 hover:text-[#7B1113] hover:bg-[#7B1113]/10 transition-colors" title="Delete"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                ),
              },
            ]}
            data={suppliers}
            keyExtractor={(s) => s.id}
          />
        )}
      </div>

      {/* ── Form Modal ── */}
      {showForm && (
        <SupplierFormModal
          supplier={editSupplier}
          onClose={() => setShowForm(false)}
          onSubmit={async (data) => {
            const token = localStorage.getItem('accessToken');
            const url = editSupplier?.id
              ? `/api/suppliers/${editSupplier.id}`
              : '/api/suppliers';
            const method = editSupplier?.id ? 'PUT' : 'POST';
            const res = await fetch(url, {
              method,
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify(data),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error?.message || 'Failed to save supplier');
          }}
          onSaved={() => {
            setShowForm(false);
            fetchSuppliers();
          }}
        />
      )}

      {/* ── Delete Confirm ── */}
      {deleteTarget && (
        <DeleteConfirmModal
          supplier={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
