import { useState, useEffect, useCallback } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { FileBarChart, Search, Download, Loader2, ChevronLeft, ChevronRight, X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ─── Types ─── */

interface AccountabilityRow {
  personnelName: string | null;
  designation: string | null;
  project: string | null;
  institution: string | null;
  assetName: string | null;
  serialNumber: string | null;
  propertyNumber: string | null;
  condition: string | null;
  returnCondition: string | null;
  assignedAt: string | null;
  returnedAt: string | null;
  status: string;
  isOverdue: boolean;
  documentNumber: string | null;
}

interface PersonnelOption {
  id: string;
  fullName: string;
}

interface ProjectOption {
  id: number;
  name: string;
}

/* ─── Helpers ─── */

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      qs.set(key, String(value));
    }
  }
  return qs.toString();
}

/* ─── Component ─── */

export default function AccountabilityReportPage() {
  // Filters
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [selectedPersonnelId, setSelectedPersonnelId] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'returned'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [overdueDays, setOverdueDays] = useState('');

  // Data
  const [rows, setRows] = useState<AccountabilityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  // Dropdowns
  const [personnelOptions, setPersonnelOptions] = useState<PersonnelOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [showPersonnelDropdown, setShowPersonnelDropdown] = useState(false);

  // Fetch dropdown options on mount
  useEffect(() => {
    apiFetch('/personnel?limit=200&status=active')
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setPersonnelOptions(list);
      })
      .catch(() => {});
    apiFetch('/lookups/projects')
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setProjectOptions(list);
      })
      .catch(() => {});
  }, []);

  // Filtered personnel for search
  const filteredPersonnel = personnelOptions.filter((p) =>
    p.fullName.toLowerCase().includes(personnelSearch.toLowerCase())
  );

  // Fetch report data
  const fetchReport = useCallback(
    async (p: number = 1) => {
      setLoading(true);
      setError('');
      try {
        const qs = buildQueryString({
          personnelId: selectedPersonnelId || undefined,
          project: selectedProject || undefined,
          status: statusFilter,
          from: fromDate || undefined,
          to: toDate || undefined,
          overdueAfterDays: overdueDays ? parseInt(overdueDays, 10) : undefined,
          format: 'json',
          page: p,
          limit,
        });
        const res = await apiFetch(`/accountability/report?${qs}`);
        const rowsData = Array.isArray(res.data) ? res.data : [];
        setRows(rowsData);
        setTotal(res.meta?.total ?? 0);
        setPage(res.meta?.page ?? 1);
      } catch (err: any) {
        setError(err instanceof ApiError ? err.message : 'Failed to load report');
      } finally {
        setLoading(false);
      }
    },
    [selectedPersonnelId, selectedProject, statusFilter, fromDate, toDate, overdueDays, limit]
  );

  // Auto-fetch when filters change
  useEffect(() => {
    fetchReport(1);
  }, [fetchReport]);

  // Export CSV
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const qs = buildQueryString({
        personnelId: selectedPersonnelId || undefined,
        project: selectedProject || undefined,
        status: statusFilter,
        from: fromDate || undefined,
        to: toDate || undefined,
        overdueAfterDays: overdueDays ? parseInt(overdueDays, 10) : undefined,
        format: 'csv',
      });
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/accountability/report?${qs}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `accountability-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // Clear filters
  const clearFilters = () => {
    setSelectedPersonnelId('');
    setPersonnelSearch('');
    setSelectedProject('');
    setStatusFilter('all');
    setFromDate('');
    setToDate('');
    setOverdueDays('');
  };

  const hasActiveFilters = selectedPersonnelId || selectedProject || statusFilter !== 'all' || fromDate || toDate || overdueDays;

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#012061]/10">
            <FileBarChart className="w-5 h-5 text-[#012061]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Accountability Report</h1>
            <p className="text-sm text-slate-500">
              {total} record{total !== 1 ? 's' : ''} found
            </p>
          </div>
        </div>
        <Button
          onClick={handleExportCsv}
          disabled={exporting}
          className="flex items-center gap-2 bg-[#012061] hover:bg-[#012061]/90 text-white"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exporting ? 'Exporting...' : 'Export CSV'}
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Filters</span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* Personnel search/select */}
          <div className="relative">
            <label className="block text-xs font-medium text-slate-500 mb-1">Personnel</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#012061]/30 focus:border-[#012061]"
                placeholder="Search personnel..."
                value={selectedPersonnelId ? personnelOptions.find((p) => p.id === selectedPersonnelId)?.fullName || '' : personnelSearch}
                onChange={(e) => {
                  setPersonnelSearch(e.target.value);
                  setSelectedPersonnelId('');
                  setShowPersonnelDropdown(true);
                }}
                onFocus={() => setShowPersonnelDropdown(true)}
                onBlur={() => setTimeout(() => setShowPersonnelDropdown(false), 200)}
              />
              {selectedPersonnelId && (
                <button
                  onClick={() => { setSelectedPersonnelId(''); setPersonnelSearch(''); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {showPersonnelDropdown && !selectedPersonnelId && (
              <div className="absolute z-30 mt-1 w-full max-h-48 overflow-auto bg-white border border-slate-200 rounded-md shadow-lg">
                {filteredPersonnel.length === 0 && (
                  <div className="px-3 py-2 text-xs text-slate-400">No personnel found</div>
                )}
                {filteredPersonnel.slice(0, 20).map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 text-slate-700"
                    onClick={() => {
                      setSelectedPersonnelId(p.id);
                      setPersonnelSearch('');
                      setShowPersonnelDropdown(false);
                    }}
                  >
                    {p.fullName}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Project */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Project</label>
            <select
              className="w-full py-1.5 px-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#012061]/30 focus:border-[#012061]"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
              <option value="">All Projects</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select
              className="w-full py-1.5 px-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#012061]/30 focus:border-[#012061]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'returned')}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="returned">Returned</option>
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Issued From</label>
            <input
              type="date"
              className="w-full py-1.5 px-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#012061]/30 focus:border-[#012061]"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Issued To</label>
            <input
              type="date"
              className="w-full py-1.5 px-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#012061]/30 focus:border-[#012061]"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          {/* Overdue threshold */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Overdue &gt; N days</label>
            <input
              type="number"
              min="1"
              className="w-full py-1.5 px-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#012061]/30 focus:border-[#012061]"
              placeholder="e.g. 30"
              value={overdueDays}
              onChange={(e) => setOverdueDays(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Results table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#012061]">
                {[
                  'Personnel', 'Designation', 'Project', 'Institution', 'Asset Name',
                  'Serial No.', 'Property No.', 'Condition', 'Return Cond.', 'Issued Date',
                  'Returned Date', 'Status', 'Agreement No.',
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-left text-white/70 uppercase tracking-widest text-[10px] font-semibold whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={13} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
                    <p className="text-slate-400 mt-2 text-xs">Loading report...</p>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center py-12 text-slate-400 text-sm">
                    No records found matching your filters.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`hover:bg-slate-50 transition-colors ${
                      row.isOverdue ? 'bg-[#7B1113]/5' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                      {row.personnelName || '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.designation || '—'}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.project || '—'}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.institution || '—'}</td>
                    <td className="px-3 py-2 text-slate-800 whitespace-nowrap">{row.assetName || '—'}</td>
                    <td className="px-3 py-2 text-slate-600 font-mono text-xs whitespace-nowrap">{row.serialNumber || '—'}</td>
                    <td className="px-3 py-2 text-slate-600 font-mono text-xs whitespace-nowrap">{row.propertyNumber || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.condition ? (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          row.condition.toLowerCase() === 'good' ? 'bg-emerald-50 text-emerald-700' :
                          row.condition.toLowerCase() === 'fair' ? 'bg-amber-50 text-amber-700' :
                          row.condition.toLowerCase() === 'damaged' ? 'bg-red-50 text-red-700' :
                          'bg-slate-50 text-slate-600'
                        }`}>{row.condition}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.returnCondition ? (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          row.returnCondition.toLowerCase() === 'good' ? 'bg-emerald-50 text-emerald-700' :
                          row.returnCondition.toLowerCase() === 'fair' ? 'bg-amber-50 text-amber-700' :
                          row.returnCondition.toLowerCase() === 'damaged' ? 'bg-red-50 text-red-700' :
                          'bg-slate-50 text-slate-600'
                        }`}>{row.returnCondition}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDate(row.assignedAt)}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDate(row.returnedAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.status === 'active' ? (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                          Returned
                        </span>
                      )}
                      {row.isOverdue && (
                        <span className="ml-1 inline-flex rounded-full bg-[#7B1113] px-1.5 py-0.5 text-[9px] font-bold text-white">
                          OVERDUE
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600 font-mono text-xs whitespace-nowrap">{row.documentNumber || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <p className="text-xs text-slate-500">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchReport(page - 1)}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <span className="text-xs text-slate-500 px-2">
                Page {page} of {totalPages || 1}
              </span>
              <button
                onClick={() => fetchReport(page + 1)}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}