import { useState, useCallback } from 'react';
import { useAssets } from '../hooks/useAssets';
import { assetsApi, Asset } from '../lib/api';
import { RoleGate } from '../components/auth';
import { AssetTable, AssetDetailModal, AssetFormModal, ImportAssetsModal } from '../components/assets';
import { Button } from '../components/ui/button';

const ASSET_TYPES = ['DESKTOP', 'LAPTOP', 'FURNITURE', 'EQUIPMENT', 'PERIPHERAL', 'OTHER'];
const ASSET_STATUSES = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST'];

export default function AssetsPage() {
  const { assets, loading, meta, filters, setFilters, refetch } = useAssets();

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Action loading states
  const [printLoading, setPrintLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleImportComplete = () => {
    refetch();
  };

  const handleSort = (field: string) => {
    setFilters({
      ...filters,
      sortBy: field,
      sortOrder: filters.sortBy === field && filters.sortOrder === 'asc' ? 'desc' : 'asc',
    });
  };

  const handleView = (asset: Asset) => {
    setSelectedAsset(asset);
    setShowDetail(true);
  };

  const handleCreate = async (data: any) => {
    if (data instanceof FormData) {
      await assetsApi.createWithImage(data);
    } else {
      await assetsApi.create(data);
    }
    setShowForm(false);
    refetch();
  };

  const handleEdit = (asset: Asset) => {
    setShowDetail(false);
    setEditAsset(asset);
    setShowForm(true);
  };

  const handleUpdate = async (data: any) => {
    if (!editAsset) return;
    if (data instanceof FormData) {
      await assetsApi.updateWithImage(editAsset.id, data);
    } else {
      await assetsApi.update(editAsset.id, data);
    }
    setShowForm(false);
    setEditAsset(null);
    refetch();
  };

  // Selection handlers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === assets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(assets.map(a => a.id)));
    }
  }, [selectedIds.size, assets]);

  const deselectAll = () => setSelectedIds(new Set());

  const hasActiveFilters = filters.type || filters.status || filters.location;

  const handleClearFilters = () => {
    setFilters({ ...filters, type: undefined, status: undefined, location: undefined, page: 1 });
    setSelectedIds(new Set());
  };

  // Print QR labels for selected assets
  const handlePrintQR = async () => {
    setPrintLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch('/api/labels/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({ assetIds: ids }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('[PrintQR] Error:', res.status, errText);
        throw new Error(`Server returned ${res.status}: ${errText}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      showToast('Label opened — use browser Print to print');
    } catch (err) {
      console.error('[PrintQR] Full error:', err);
      showToast('Failed to generate labels. Please try again.');
    } finally {
      setPrintLoading(false);
    }
  };

  // Export CSV for selected assets
  const handleExportCSV = () => {
    setExportLoading(true);
    try {
      const selected = assets.filter(a => selectedIds.has(a.id));
      const headers = ['Name', 'Type', 'Status', 'Location', 'Assigned To', 'Property #', 'Price', 'Purchase Date', 'Serial Number', 'Manufacturer', 'Remarks', 'Added Date'];
      const escapeCSV = (val: string | number | null | undefined) => {
        if (val == null) return '';
        const s = String(val);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const rows = selected.map(a => [
        escapeCSV(a.name),
        escapeCSV(a.type),
        escapeCSV(a.status),
        escapeCSV(a.location),
        escapeCSV(a.assignedTo),
        escapeCSV((a as any).propertyNumber),
        escapeCSV(a.purchasePrice != null ? Number(a.purchasePrice) : ''),
        escapeCSV(a.purchaseDate ? new Date(a.purchaseDate).toISOString().split('T')[0] : ''),
        escapeCSV(a.serialNumber),
        escapeCSV(a.manufacturer),
        escapeCSV((a as any).remarks),
        escapeCSV(new Date(a.createdAt).toISOString().split('T')[0]),
      ].join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const date = new Date().toISOString().split('T')[0];
      a.download = `assets-export-${date}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('CSV exported successfully');
    } catch {
      showToast('Failed to export CSV. Please try again.');
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Top toolbar: title + filters + search + action */}
      <header className="shrink-0 border-b border-border px-6 py-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Left: title */}
          <h1 className="text-lg font-bold shrink-0">Assets</h1>

          {/* Center: inline filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filters.type || ''}
              onChange={e => setFilters({ ...filters, type: e.target.value || undefined, page: 1 })}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
            >
              <option value="">Type: All</option>
              {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <select
              value={filters.status || ''}
              onChange={e => setFilters({ ...filters, status: e.target.value || undefined, page: 1 })}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
            >
              <option value="">Status: All</option>
              {ASSET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <input
              type="text"
              placeholder="Filter by location..."
              value={filters.location || ''}
              onChange={e => setFilters({ ...filters, location: e.target.value || undefined, page: 1 })}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs w-36"
            />

            {hasActiveFilters && (
              <button onClick={handleClearFilters} className="text-xs text-primary hover:underline">
                Clear filters
              </button>
            )}
          </div>

          {/* Right: search + add */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search assets..."
              value={filters.search || ''}
              onChange={e => setFilters({ ...filters, search: e.target.value || undefined, page: 1 })}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm w-56"
            />
            <RoleGate roles={['ADMIN', 'STAFF_ADMIN']}>
              <Button variant="outline" size="sm" onClick={() => setIsImportModalOpen(true)}>↑ Import CSV</Button>
              <Button onClick={() => { setEditAsset(null); setShowForm(true); }} size="sm">+ Add Asset</Button>
            </RoleGate>
          </div>
        </div>
      </header>

      {/* Floating action toolbar — appears when assets selected */}
      {selectedIds.size > 0 && (
        <div className="shrink-0 px-6 py-2 bg-blue-50 border-b border-blue-200 flex items-center justify-between animate-fade-in">
          <span className="text-sm font-medium text-blue-800">
            ☑ {selectedIds.size} asset{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintQR}
              disabled={printLoading}
              className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {printLoading ? 'Generating...' : 'Print QR'}
            </button>
            <button
              onClick={handleExportCSV}
              disabled={exportLoading}
              className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {exportLoading ? 'Exporting...' : 'Export CSV'}
            </button>
            <button
              onClick={deselectAll}
              className="rounded-md border border-input px-3 py-1 text-xs hover:bg-accent"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="shrink-0 px-6 py-2 bg-green-50 border-b border-green-200 text-sm text-green-800 text-center animate-fade-in">
          {toast}
        </div>
      )}

      {/* Full-width table */}
      <div className="flex-1 overflow-auto p-6">
        {loading && assets.length === 0 ? (
          <p className="text-muted-foreground">Loading assets...</p>
        ) : (
          <AssetTable
            assets={assets}
            onView={handleView}
            onSort={handleSort}
            sortBy={filters.sortBy || 'createdAt'}
            sortOrder={filters.sortOrder || 'desc'}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            allSelected={assets.length > 0 && selectedIds.size === assets.length}
            someSelected={selectedIds.size > 0 && selectedIds.size < assets.length}
          />
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 border-t border-border px-6 py-2 shrink-0">
          <Button size="sm" variant="outline" disabled={meta.page <= 1} onClick={() => setFilters({ ...filters, page: meta.page - 1 })}>Prev</Button>
          <span className="text-sm text-muted-foreground">Page {meta.page} of {meta.totalPages}</span>
          <Button size="sm" variant="outline" disabled={meta.page >= meta.totalPages} onClick={() => setFilters({ ...filters, page: meta.page + 1 })}>Next</Button>
        </div>
      )}

      {/* Modals */}
      {showDetail && selectedAsset && (
        <AssetDetailModal asset={selectedAsset} onClose={() => setShowDetail(false)} onEdit={handleEdit} />
      )}
      {showForm && (
        <AssetFormModal asset={editAsset} onSubmit={editAsset ? handleUpdate : handleCreate} onClose={() => { setShowForm(false); setEditAsset(null); }} onImageUpload={assetsApi.uploadImage} />
      )}
      <ImportAssetsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
}