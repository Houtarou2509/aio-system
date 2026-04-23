import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAssets } from '../hooks/useAssets';
import { assetsApi, Asset } from '../lib/api';
import { RoleGate } from '../components/auth';
import { AssetTable, AssetDetailModal, AssetFormModal, ImportAssetsModal } from '../components/assets';
import QRScannerModal from '../components/assets/QRScannerModal';
import PendingRequestsModal from '../components/assets/PendingRequestsModal';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useLookupOptions } from '@/hooks/useLookupOptions';

const ASSET_STATUSES = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST'];
const BULK_STATUS_OPTIONS = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED'];

export default function AssetsPage() {
  const { assets, loading, meta, filters, setFilters, refetch } = useAssets();
  const [searchParams, setSearchParams] = useSearchParams();
  const { options: typeFilterOptions } = useLookupOptions('asset-types');

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
  const [bulkLoading, setBulkLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestAssetId, setRequestAssetId] = useState<string | null>(null);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Auto-open scanner when navigated with ?action=scan
  useEffect(() => {
    if (searchParams.get('action') === 'scan') {
      setScannerOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Close status dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdown(false);
      }
    };
    if (statusDropdown) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [statusDropdown]);

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

  // Bulk status change
  const handleBulkStatus = async (status: string) => {
    setBulkLoading(true);
    setStatusDropdown(false);
    try {
      const ids = Array.from(selectedIds);
      const res = await assetsApi.bulkStatus(ids, status);
      const count = (res as any).data?.updated ?? ids.length;
      showToast(`${count} asset(s) updated to ${status}`);
      setSelectedIds(new Set());
      refetch();
    } catch {
      showToast('Failed to update status. Please try again.');
    } finally {
      setBulkLoading(false);
    }
  };

  // Bulk delete (soft — retire)
  const handleBulkDelete = async () => {
    setBulkLoading(true);
    setConfirmDelete(false);
    try {
      const ids = Array.from(selectedIds);
      const res = await assetsApi.bulkDelete(ids);
      const count = (res as any).data?.deleted ?? ids.length;
      showToast(`${count} asset(s) retired`);
      setSelectedIds(new Set());
      refetch();
    } catch {
      showToast('Failed to delete assets. Please try again.');
    } finally {
      setBulkLoading(false);
    }
  };

  // Request asset (Staff)
  const handleRequestAsset = async (note?: string) => {
    if (!requestAssetId) return;
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/assets/request', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ assetId: requestAssetId, requestNote: note || '' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Request submitted!');
        setRequestModalOpen(false);
        setRequestAssetId(null);
      } else {
        showToast(data.error?.message || 'Failed to submit request');
      }
    } catch {
      showToast('Failed to submit request');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Top toolbar: title + filters + search + action */}
      <header className="shrink-0 border-b border-gray-200 px-6 py-3 bg-white">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Left: title */}
          <h1 className="text-lg font-bold shrink-0 text-gray-900">Assets</h1>

          {/* Center: inline filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filters.type || ''} onValueChange={(val) => val != null && setFilters({ ...filters, type: val || undefined, page: 1 })}>
              <SelectTrigger className="w-[130px] h-8 text-xs bg-white border-gray-300">
                <SelectValue placeholder="Type: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Types</SelectItem>
                {typeFilterOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.value}>{opt.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <select
              value={filters.status || ''}
              onChange={e => setFilters({ ...filters, status: e.target.value || undefined, page: 1 })}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700"
            >
              <option value="">Status: All</option>
              {ASSET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <input
              type="text"
              placeholder="Filter by location..."
              value={filters.location || ''}
              onChange={e => setFilters({ ...filters, location: e.target.value || undefined, page: 1 })}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 w-36"
            />

            {hasActiveFilters && (
              <button onClick={handleClearFilters} className="text-xs text-blue-600 hover:underline">
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
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 w-56"
            />
            <button onClick={() => setScannerOpen(true)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 shadow-sm">📷 Scan QR</button>
            <RoleGate roles={['ADMIN', 'STAFF_ADMIN']}>
              <button onClick={() => setPendingModalOpen(true)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 shadow-sm">📥 Requests</button>
            </RoleGate>
            <RoleGate roles={['ADMIN', 'STAFF_ADMIN']}>
              <button onClick={() => setIsImportModalOpen(true)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 shadow-sm">↑ Import CSV</button>
              <button onClick={() => { setEditAsset(null); setShowForm(true); }} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 shadow-sm">+ Add Asset</button>
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
            {/* Change Status dropdown */}
            <div className="relative" ref={statusDropdownRef}>
              <button
                onClick={() => setStatusDropdown(!statusDropdown)}
                disabled={bulkLoading}
                className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm"
              >
                Change Status ▾
              </button>
              {statusDropdown && (
                <div className="absolute right-0 mt-1 w-44 rounded-md border border-gray-200 bg-white shadow-lg z-50 py-1">
                  {BULK_STATUS_OPTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => handleBulkStatus(s)}
                      className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Print QR */}
            <button
              onClick={handlePrintQR}
              disabled={printLoading}
              className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm"
            >
              {printLoading ? 'Generating...' : 'Print QR'}
            </button>

            {/* Export CSV (selected only) */}
            <button
              onClick={handleExportCSV}
              disabled={exportLoading}
              className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm"
            >
              {exportLoading ? 'Exporting...' : 'Export CSV'}
            </button>

            {/* Delete Selected */}
            <RoleGate roles={['ADMIN']}>
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={bulkLoading}
                className="rounded-md bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50 shadow-sm"
              >
                Delete Selected
              </button>
            </RoleGate>

            <button
              onClick={deselectAll}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 shadow-sm"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg border border-gray-200 shadow-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-2 text-gray-900">Confirm Delete</h3>
            <p className="text-sm text-gray-500 mb-4">
              You are about to retire <strong className="text-gray-900">{selectedIds.size}</strong> asset{selectedIds.size !== 1 ? 's' : ''}. 
              This will set their status to RETIRED. This action can be undone by changing status back.
            </p>
            <div className="flex justify-end gap-2">
              <button className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="rounded-md bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700" onClick={handleBulkDelete} disabled={bulkLoading}>
                {bulkLoading ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
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
      <div className="flex-1 overflow-auto p-6 bg-white">
        {loading && assets.length === 0 ? (
          <p className="text-gray-500">Loading assets...</p>
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
        <div className="flex items-center justify-center gap-2 border-t border-gray-200 px-6 py-2 shrink-0 bg-white">
          <button className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50" disabled={meta.page <= 1} onClick={() => setFilters({ ...filters, page: meta.page - 1 })}>Prev</button>
          <span className="text-sm text-gray-500">Page {meta.page} of {meta.totalPages}</span>
          <button className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50" disabled={meta.page >= meta.totalPages} onClick={() => setFilters({ ...filters, page: meta.page + 1 })}>Next</button>
        </div>
      )}

      {/* Modals */}
      {showDetail && selectedAsset && (
        <AssetDetailModal asset={selectedAsset} onClose={() => setShowDetail(false)} onEdit={handleEdit} onRequest={(id) => { setRequestAssetId(id); setRequestModalOpen(true); }} />
      )}
      {showForm && (
        <AssetFormModal asset={editAsset} onSubmit={editAsset ? handleUpdate : handleCreate} onClose={() => { setShowForm(false); setEditAsset(null); }} onImageUpload={assetsApi.uploadImage} />
      )}
      <ImportAssetsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={handleImportComplete}
      />
      <QRScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} />

      {/* Request Asset modal */}
      {requestModalOpen && requestAssetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-lg border border-gray-200 shadow-xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-sm font-semibold mb-3 text-gray-900">Request Asset</h3>
            <textarea
              id="request-note"
              placeholder="Why do you need this asset? (optional)"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 mb-3 min-h-[80px] resize-none"
            />
            <div className="flex justify-end gap-2">
              <button className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50" onClick={() => { setRequestModalOpen(false); setRequestAssetId(null); }}>Cancel</button>
              <button className="rounded-md bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700" onClick={() => {
                const note = (document.getElementById('request-note') as HTMLTextAreaElement)?.value;
                handleRequestAsset(note);
              }}>Submit Request</button>
            </div>
          </div>
        </div>
      )}

      <PendingRequestsModal open={pendingModalOpen} onClose={() => setPendingModalOpen(false)} onAction={refetch} />
    </div>
  );
}