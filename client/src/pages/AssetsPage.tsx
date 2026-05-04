import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAssets } from '../hooks/useAssets';
import { assetsApi, Asset } from '../lib/api';
import { RoleGate } from '../components/auth';
import { AssetTable, AssetDetailModal, AssetFormModal, ImportAssetsModal, BulkActionModal } from '../components/assets';
import QRScannerModal from '../components/assets/QRScannerModal';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useLookupOptions } from '@/hooks/useLookupOptions';
import {
  Package, Search, ScanLine, Plus,
  CheckCircle, Wrench, PackageOpen, X, Calendar
} from 'lucide-react';
import {
  setFocusSearchCallback,
  setNewAssetCallback,
} from '../hooks/useKeyboardShortcuts';

const ASSET_STATUSES = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST'];
const BULK_STATUS_OPTIONS = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED'];

/* ── KPI data type ───────────────────────────────────────── */

interface AssetKpiData {
  totalAssets: number;
  availableCount: number;
  maintenanceCount: number;
}

/* ── Empty state component ───────────────────────────────── */

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#f8931f]/10 mb-4">
        <PackageOpen className="h-10 w-10 text-[#f8931f]" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">No assets yet</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-xs">
        Start building your inventory by adding your first asset to the system.
      </p>
      <RoleGate roles={['ADMIN', 'STAFF_ADMIN']}>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-[#f8931f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" /> Add First Asset
        </button>
      </RoleGate>
    </div>
  );
}

/* ── Page component ──────────────────────────────────────── */

export default function AssetsPage() {
  const { assets, loading, meta, filters, setFilters, refetch } = useAssets();
  const [searchParams, setSearchParams] = useSearchParams();
  const { options: typeFilterOptions } = useLookupOptions('asset-types');
  const { options: manufacturerOptions } = useLookupOptions('manufacturers');
  const { options: locationOptions } = useLookupOptions('locations');

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // KPI state
  const [kpiData, setKpiData] = useState<AssetKpiData | null>(null);

  // Manufacturer client-side filter
  const [manufacturerFilter, setManufacturerFilter] = useState('');

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Search ref for keyboard shortcut
  const searchRef = useRef<HTMLInputElement>(null);

  // Register keyboard shortcuts for Assets page
  useEffect(() => {
    setFocusSearchCallback(() => {
      searchRef.current?.focus();
    });
    setNewAssetCallback(() => {
      setEditAsset(null);
      setShowForm(true);
    });
    return () => {
      setFocusSearchCallback(null);
      setNewAssetCallback(null);
    };
  }, []);

  // Action loading states
  const [printLoading, setPrintLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [bulkAction, setBulkAction] = useState<'none' | 'assign' | 'update'>('none');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch KPI data
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    fetch('/api/dashboard/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setKpiData({
            totalAssets: d.data.totalAssets ?? 0,
            availableCount: d.data.available ?? 0,
            maintenanceCount: d.data.underMaintenance ?? 0,
          });
        }
      })
      .catch((e) => console.error('[AssetsPage] Failed to load KPI stats:', e));
  }, []);

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

  const handleImportComplete = () => { refetch(); };

  const handleSort = (field: string) => {
    setFilters({
      ...filters,
      sortBy: field,
      sortOrder: filters.sortBy === field && filters.sortOrder === 'asc' ? 'desc' : 'asc',
    });
  };

  const handleView = (asset: Asset) => { setSelectedAsset(asset); setShowDetail(true); };

  const handleCreate = async (data: any) => {
    if (data instanceof FormData) await assetsApi.createWithImage(data);
    else await assetsApi.create(data);
    setShowForm(false);
    refetch();
  };

  const handleEdit = (asset: Asset) => { setShowDetail(false); setEditAsset(asset); setShowForm(true); };

  const handleUpdate = async (data: any) => {
    if (!editAsset) return;
    if (data instanceof FormData) await assetsApi.updateWithImage(editAsset.id, data);
    else await assetsApi.update(editAsset.id, data);
    setShowForm(false);
    setEditAsset(null);
    refetch();
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === assets.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(assets.map(a => a.id)));
  }, [selectedIds.size, assets]);

  const deselectAll = () => setSelectedIds(new Set());

  const hasActiveFilters = filters.type || filters.status || filters.location || filters.search || manufacturerFilter || filters.purchaseDateFrom || filters.purchaseDateTo || filters.warrantyExpiryFrom || filters.warrantyExpiryTo;

  const handleClearAllFilters = () => {
    setFilters({ ...filters, type: undefined, status: undefined, location: undefined, search: undefined, purchaseDateFrom: undefined, purchaseDateTo: undefined, warrantyExpiryFrom: undefined, warrantyExpiryTo: undefined, page: 1 });
    setManufacturerFilter('');
    setSelectedIds(new Set());
  };

  // Print QR labels for selected assets
  const handlePrintQR = async () => {
    setPrintLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch('/api/labels/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        body: JSON.stringify({ assetIds: ids }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(`<iframe src="${url}" style="width:100%;height:100%;border:none"></iframe>`);
        w.document.title = 'QR Labels';
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      showToast('Label opened — use browser Print to print');
    } catch { showToast('Failed to generate labels. Please try again.'); }
    finally { setPrintLoading(false); }
  };

  // Export CSV for selected assets
  const handleExportCSV = () => {
    setExportLoading(true);
    try {
      const selected = assets.filter(a => selectedIds.has(a.id));
      const headers = ['Name', 'Type', 'Status', 'Location', 'Assigned To', 'Property #', 'Price', 'Purchase Date', 'Serial Number', 'Manufacturer', 'Remarks', 'Added Date'];
      const esc = (val: string | number | null | undefined) => {
        if (val == null) return '';
        const s = String(val);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const rows = selected.map(a => [
        esc(a.name), esc(a.type), esc(a.status), esc(a.location), esc(a.assignedTo),
        esc((a as any).propertyNumber), esc(a.purchasePrice != null ? Number(a.purchasePrice) : ''),
        esc(a.purchaseDate ? new Date(a.purchaseDate).toISOString().split('T')[0] : ''),
        esc(a.serialNumber), esc(a.manufacturer), esc((a as any).remarks),
        esc(new Date(a.createdAt).toISOString().split('T')[0]),
      ].join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `assets-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('CSV exported successfully');
    } catch { showToast('Failed to export CSV.'); }
    finally { setExportLoading(false); }
  };

  // Bulk status change
  const handleBulkStatus = async (status: string) => {
    setBulkLoading(true); setStatusDropdown(false);
    try {
      const ids = Array.from(selectedIds);
      const res = await assetsApi.bulkStatus(ids, status);
      const count = (res as any).data?.updated ?? ids.length;
      showToast(`${count} asset(s) updated to ${status}`);
      setSelectedIds(new Set()); refetch();
    } catch { showToast('Failed to update status.'); }
    finally { setBulkLoading(false); }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    setBulkLoading(true); setConfirmDelete(false);
    try {
      const ids = Array.from(selectedIds);
      const res = await assetsApi.bulkDelete(ids);
      const count = (res as any).data?.deleted ?? ids.length;
      showToast(`${count} asset(s) retired`);
      setSelectedIds(new Set()); refetch();
    } catch { showToast('Failed to delete assets.'); }
    finally { setBulkLoading(false); }
  };

  // Client-side manufacturer filter
  const displayAssets = manufacturerFilter
    ? assets.filter(a => a.manufacturer === manufacturerFilter)
    : assets;

  const KPI_CARDS = [
    { key: 'totalAssets', label: 'TOTAL ASSETS', icon: Package, value: kpiData?.totalAssets ?? 0 },
    { key: 'availableCount', label: 'AVAILABLE', icon: CheckCircle, value: kpiData?.availableCount ?? 0 },
    { key: 'maintenanceCount', label: 'MAINTENANCE', icon: Wrench, value: kpiData?.maintenanceCount ?? 0 },
  ];

  return (
    <div className="flex flex-col h-screen bg-light-bg dark:bg-slate-900">

      {/* ═══ STICKY NAVY HEADER ═════════════════════════════ */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Title */}
          <div className="flex items-center gap-3">
            <Package className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">Assets</h1>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button onClick={() => setScannerOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors">
              <ScanLine className="h-3.5 w-3.5" /> Scan QR
            </button>
            <RoleGate roles={['ADMIN', 'STAFF_ADMIN']}>
              <button onClick={() => setIsImportModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors">
                ↑ Import CSV
              </button>
              <button onClick={() => { setEditAsset(null); setShowForm(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-[#f8931f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add Asset
              </button>
            </RoleGate>
          </div>
        </div>
      </header>

      {/* ═══ KPI TILES ═══════════════════════════════════════ */}
      <section className="px-6 pt-4 shrink-0">
        <div className="grid grid-cols-3 gap-3">
          {KPI_CARDS.map(({ key, label, icon: Icon, value }) => (
            <div key={key} className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f8931f]/10">
                <Icon className="h-5 w-5 text-[#f8931f]" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold leading-tight text-[#f8931f]">{value}</p>
                <p className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ HORIZONTAL FILTER BAR ══════════════════════════ */}
      <section className="px-6 pt-3 pb-2 shrink-0">
        <div className="flex flex-row items-center gap-4 flex-wrap bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5">
          {/* Search — expands to fill available space */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search name, property #, serial, assignee, date..."
              value={filters.search || ''}
              onChange={e => setFilters({ ...filters, search: e.target.value || undefined, page: 1 })}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-9 pr-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors"
            />
          </div>

          {/* Type filter */}
          <Select value={filters.type || ''} onValueChange={(val) => val != null && setFilters({ ...filters, type: val || undefined, page: 1 })}>
            <SelectTrigger className="w-[130px] h-8 text-xs bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
              <SelectValue placeholder="Type: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Types</SelectItem>
              {typeFilterOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.value}>{opt.value}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter */}
          <select
            value={filters.status || ''}
            onChange={e => setFilters({ ...filters, status: e.target.value || undefined, page: 1 })}
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 h-8 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
          >
            <option value="">Status: All</option>
            {ASSET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Manufacturer filter */}
          <select
            value={manufacturerFilter}
            onChange={e => setManufacturerFilter(e.target.value)}
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 h-8 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none max-w-[160px]"
          >
            <option value="">Mfr: All</option>
            {manufacturerOptions.map((opt) => (
              <option key={opt.id} value={opt.value}>{opt.value}</option>
            ))}
          </select>

          {/* Location filter */}
          <select
            value={filters.location || ''}
            onChange={e => setFilters({ ...filters, location: e.target.value || undefined, page: 1 })}
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 h-8 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
          >
            <option value="">Loc: All</option>
            {locationOptions.map((opt) => (
              <option key={opt.id} value={opt.value}>{opt.value}</option>
            ))}
          </select>

          {/* Purchase date range */}
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="date"
              placeholder="Purch From"
              value={filters.purchaseDateFrom || ''}
              onChange={e => setFilters({ ...filters, purchaseDateFrom: e.target.value || undefined, page: 1 })}
              className="w-[105px] rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1.5 text-[10px] text-slate-700 dark:text-slate-300 h-8 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
            />
            <span className="text-slate-400 text-[10px]">-</span>
            <input
              type="date"
              placeholder="Purch To"
              value={filters.purchaseDateTo || ''}
              onChange={e => setFilters({ ...filters, purchaseDateTo: e.target.value || undefined, page: 1 })}
              className="w-[105px] rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1.5 text-[10px] text-slate-700 dark:text-slate-300 h-8 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
            />
          </div>

          {/* Warranty expiry date range */}
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="date"
              placeholder="Warranty From"
              value={filters.warrantyExpiryFrom || ''}
              onChange={e => setFilters({ ...filters, warrantyExpiryFrom: e.target.value || undefined, page: 1 })}
              className="w-[105px] rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1.5 text-[10px] text-slate-700 dark:text-slate-300 h-8 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
            />
            <span className="text-slate-400 text-[10px]">-</span>
            <input
              type="date"
              placeholder="Warranty To"
              value={filters.warrantyExpiryTo || ''}
              onChange={e => setFilters({ ...filters, warrantyExpiryTo: e.target.value || undefined, page: 1 })}
              className="w-[105px] rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1.5 text-[10px] text-slate-700 dark:text-slate-300 h-8 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none"
            />
          </div>

          {/* Clear All */}
          {hasActiveFilters && (
            <button onClick={handleClearAllFilters} className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#012061] dark:text-slate-100 hover:underline shrink-0">
              <X className="h-3 w-3" /> Clear All
            </button>
          )}
        </div>
      </section>

      {/* ═══ BULK ACTION TOOLBAR ════════════════════════════ */}
      {selectedIds.size > 0 && (
        <div className="shrink-0 px-6 py-2 bg-[#012061]/5 dark:bg-slate-700/40 border-b border-[#012061]/10 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#012061] dark:text-slate-100">
            ☑ {selectedIds.size} asset{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <div className="relative" ref={statusDropdownRef}>
              <button onClick={() => setStatusDropdown(!statusDropdown)} disabled={bulkLoading}
                className="rounded-lg bg-[#012061] px-3 py-1 text-xs text-white hover:bg-[#012061]/90 disabled:opacity-50">Change Status ▾</button>
              {statusDropdown && (
                <div className="absolute right-0 mt-1 w-44 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-50 py-1">
                  {BULK_STATUS_OPTIONS.map(s => (
                    <button key={s} onClick={() => handleBulkStatus(s)} className="w-full text-left px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">{s}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={handlePrintQR} disabled={printLoading}
              className="rounded-lg bg-[#012061] px-3 py-1 text-xs text-white hover:bg-[#012061]/90 disabled:opacity-50">
              {printLoading ? 'Generating...' : 'Print QR'}
            </button>
            <button onClick={() => setBulkAction('assign')} disabled={bulkLoading}
              className="rounded-lg bg-[#012061] px-3 py-1 text-xs text-white hover:bg-[#012061]/90 disabled:opacity-50">
              Bulk Assign
            </button>
            <button onClick={() => setBulkAction('update')} disabled={bulkLoading}
              className="rounded-lg bg-[#012061] px-3 py-1 text-xs text-white hover:bg-[#012061]/90 disabled:opacity-50">
              Bulk Update
            </button>
            <button onClick={handleExportCSV} disabled={exportLoading}
              className="rounded-lg bg-[#012061] px-3 py-1 text-xs text-white hover:bg-[#012061]/90 disabled:opacity-50">
              {exportLoading ? 'Exporting...' : 'Export CSV'}
            </button>
            <RoleGate roles={['ADMIN']}>
              <button onClick={() => setConfirmDelete(true)} disabled={bulkLoading}
                className="rounded-lg bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50">Delete Selected</button>
            </RoleGate>
            <button onClick={deselectAll}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">Deselect All</button>
          </div>
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-slate-100">Confirm Delete</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              You are about to retire <strong className="text-slate-900 dark:text-slate-100">{selectedIds.size}</strong> asset{selectedIds.size !== 1 ? 's' : ''}.
              This will set their status to RETIRED. This action can be undone by changing status back.
            </p>
            <div className="flex justify-end gap-2">
              <button className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700" onClick={handleBulkDelete} disabled={bulkLoading}>
                {bulkLoading ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="shrink-0 px-6 py-2 bg-[#f8931f]/10 border-b border-[#f8931f]/20 text-sm text-[#012061] dark:text-slate-100 text-center font-medium">
          {toast}
        </div>
      )}

      {/* ═══ TABLE or EMPTY STATE (full width) ══════════════ */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading && assets.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400 text-sm">Loading assets…</p>
        ) : !loading && displayAssets.length === 0 && !hasActiveFilters ? (
          <EmptyState onAdd={() => { setEditAsset(null); setShowForm(true); }} />
        ) : (
          <AssetTable
            assets={displayAssets}
            onView={handleView}
            onSort={handleSort}
            sortBy={filters.sortBy || 'createdAt'}
            sortOrder={filters.sortOrder || 'desc'}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            allSelected={displayAssets.length > 0 && selectedIds.size === displayAssets.length}
            someSelected={selectedIds.size > 0 && selectedIds.size < displayAssets.length}
            onImageClick={(url) => setExpandedImage(url)}
          />
        )}
      </div>

      {/* ═══ PAGINATION ════════════════════════════════════ */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 border-t border-slate-200 dark:border-slate-700 px-6 py-2 shrink-0 bg-white dark:bg-slate-800">
          <button className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            disabled={meta.page <= 1} onClick={() => setFilters({ ...filters, page: meta.page - 1 })}>Prev</button>
          <span className="text-sm text-slate-500 dark:text-slate-400">Page {meta.page} of {meta.totalPages}</span>
          <button className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            disabled={meta.page >= meta.totalPages} onClick={() => setFilters({ ...filters, page: meta.page + 1 })}>Next</button>
        </div>
      )}

      {/* ═══ MODALS ════════════════════════════════════════ */}
      {showDetail && selectedAsset && (
        <AssetDetailModal asset={selectedAsset} onClose={() => setShowDetail(false)} onEdit={handleEdit} />
      )}
      {showForm && (
        <AssetFormModal asset={editAsset} onSubmit={editAsset ? handleUpdate : handleCreate} onClose={() => { setShowForm(false); setEditAsset(null); }} onImageUpload={assetsApi.uploadImage} />
      )}
      <ImportAssetsModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} onImportComplete={handleImportComplete} />
      <QRScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} />

      {/* ═══ BULK OPERATION MODAL ═══════════════════════════ */}
      {bulkAction !== 'none' && (
        <BulkActionModal
          action={bulkAction}
          selectedCount={selectedIds.size}
          onClose={() => { setBulkAction('none'); }}
          onAssign={async (personnelId: string, notes?: string) => {
            setBulkLoading(true);
            try {
              const res = await assetsApi.bulkAssign(Array.from(selectedIds), personnelId, notes);
              showToast(`Assigned ${res.data.assigned} assets`);
              if (res.data.errors.length > 0) showToast(`${res.data.errors.length} failed`);
              deselectAll(); refetch();
            } catch { showToast('Bulk assign failed'); }
            finally { setBulkLoading(false); setBulkAction('none'); }
          }}
          onUpdate={async (updates: { location?: string; status?: string }) => {
            setBulkLoading(true);
            try {
              const res = await assetsApi.bulkUpdate(Array.from(selectedIds), updates);
              showToast(`Updated ${res.data.updated} assets`);
              deselectAll(); refetch();
            } catch { showToast('Bulk update failed'); }
            finally { setBulkLoading(false); setBulkAction('none'); }
          }}
          loading={bulkLoading}
        />
      )}

      {/* ═══ IMAGE LIGHTBOX ═════════════════════════════════ */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#012061] text-white hover:bg-[#012061]/80 transition-colors shadow-lg z-10"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={expandedImage}
              alt="Asset image"
              className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}