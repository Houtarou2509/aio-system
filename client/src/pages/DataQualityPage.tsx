import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ChevronDown, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';

/* ─── Types ──────────────────────────────────────────────── */

interface AssetExample {
  id: number;
  name: string;
  type: string | null;
  status: string | null;
  assignedTo?: string | null;
  deletedAt?: string | null;
  [key: string]: unknown;
}

interface DataQualityResponse {
  totalAssets: number;
  counts: Record<string, number>;
  examples: Record<string, AssetExample[]>;
}

interface IssueCategory {
  key: string;
  label: string;
  description: string;
}

const ISSUE_CATEGORIES: IssueCategory[] = [
  { key: 'missingPropertyNumber', label: 'Missing Property Number', description: 'Assets without a property number assigned' },
  { key: 'missingSerialNumber', label: 'Missing Serial Number', description: 'Assets without a serial number recorded' },
  { key: 'missingOwner', label: 'Missing Owner', description: 'Assets where the owner field is blank' },
  { key: 'missingLocation', label: 'Missing Location', description: 'Assets without a location specified' },
  { key: 'missingImageUrl', label: 'Missing Image', description: 'Assets without a photo uploaded' },
  { key: 'missingPurchaseDate', label: 'Missing Purchase Date', description: 'Assets with no purchase date on record' },
  { key: 'missingPurchasePrice', label: 'Missing Purchase Price', description: 'Assets with no purchase price recorded' },
  { key: 'assignedWithoutPersonnel', label: 'Assigned Without Personnel', description: 'Assets marked ASSIGNED but with no assignee name' },
  { key: 'retiredVisibilityIssue', label: 'Retired/Deleted Mismatch', description: 'Retired assets still visible, or soft-deleted assets not marked retired' },
];

/* ─── Progress Ring ───────────────────────────────────────── */

function ProgressRing({ percent, color }: { percent: number; color: string }) {
  const radius = 28;
  const stroke = 4;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <svg width={radius * 2} height={radius * 2} className="transform -rotate-90">
      <circle
        stroke="currentColor"
        className="text-slate-200 dark:text-slate-700"
        fill="transparent"
        strokeWidth={stroke}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
      <circle
        stroke={color}
        fill="transparent"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference + ' ' + circumference}
        style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.5s ease' }}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
    </svg>
  );
}

/* ─── Summary Card ────────────────────────────────────────── */

function SummaryCard({ category, count, total, isOpen, onToggle }: {
  category: IssueCategory;
  count: number;
  total: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  const isHigh = percent >= 50;
  const isMedium = percent >= 25 && percent < 50;
  const ringColor = isHigh ? '#ef4444' : isMedium ? '#f8931f' : '#22c55e';

  return (
    <div className={`rounded-xl border transition-all duration-200 ${isOpen ? 'border-[#f8931f] shadow-md shadow-[#f8931f]/10' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className="relative flex items-center justify-center shrink-0">
          <ProgressRing percent={percent} color={ringColor} />
          <span className="absolute text-[10px] font-bold" style={{ color: ringColor }}>{percent}%</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#012061] dark:text-slate-100 truncate">{category.label}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{category.description}</p>
        </div>
        <div className="flex flex-col items-end shrink-0 gap-1">
          <span className={`text-lg font-bold ${isHigh ? 'text-red-500' : isMedium ? 'text-[#f8931f]' : 'text-emerald-500'}`}>
            {count}
          </span>
          <span className="text-[10px] text-slate-400">of {total}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

export default function DataQualityPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DataQualityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/data-quality');
      setData(res.data ?? res);
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError('Session expired. Please log in again.');
        } else if (err.status === 403) {
          setError('You do not have permission to view Data Quality.');
        } else {
          setError(err.message || 'Failed to load data quality');
        }
      } else if (err instanceof TypeError && err.message === 'Failed to fetch') {
        setError('Unable to reach the server. Please check if AIO System is running.');
      } else {
        setError(err.message || 'Failed to load data quality');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleCategory = (key: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleAssetClick = (name: string) => {
    navigate(`/assets?search=${encodeURIComponent(name)}`);
  };

  // Calculate overall quality score
  const totalIssues = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  const totalFields = data ? data.totalAssets * ISSUE_CATEGORIES.length : 0;
  const overallPercent = totalFields > 0 ? Math.round(((totalFields - totalIssues) / totalFields) * 100) : 100;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#f8931f]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col min-h-dvh pt-14 md:pt-0 bg-[#012061] md:bg-transparent">
        <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-4 sm:px-6 py-4 min-h-[56px]">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-[#f8931f]" />
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Data Quality</h1>
              <p className="text-xs text-white/50 hidden sm:block">Identify and fix missing asset data</p>
            </div>
          </div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 py-8">
          <AlertTriangle className="w-12 h-12 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400 text-center max-w-md">{error}</p>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 rounded-lg bg-[#f8931f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e07d0a] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-dvh pt-14 md:pt-0 bg-[#012061] md:bg-transparent">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-4 sm:px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-[#f8931f]" />
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Data Quality</h1>
              <p className="text-xs text-white/50 hidden sm:block">Identify and fix missing asset data</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors px-3 py-1.5 text-xs font-medium text-white"
            title="Refresh data"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-800 pb-20 md:pb-0">
        {/* Overall Score Banner */}
        <div className="bg-gradient-to-r from-[#012061] to-[#0a3078] mx-4 sm:mx-6 mt-4 rounded-xl p-5 text-white">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs font-medium text-white/70 uppercase tracking-wider">Overall Data Quality Score</p>
              <p className="text-3xl font-bold mt-1">{overallPercent}%</p>
              <p className="text-xs text-white/60 mt-1">
                {data?.totalAssets ?? 0} total assets &middot; {totalIssues} missing fields across {ISSUE_CATEGORIES.length} categories
              </p>
            </div>
            <div className="relative flex items-center justify-center">
              <ProgressRing percent={overallPercent} color="#f8931f" />
              <span className="absolute text-sm font-bold text-[#f8931f]">{overallPercent}%</span>
            </div>
          </div>
        </div>

        {/* Issue Cards */}
        <div className="px-4 sm:px-6 py-4 space-y-3">
          {ISSUE_CATEGORIES.map(cat => {
            const count = data?.counts[cat.key] ?? 0;
            const isOpen = openCategories.has(cat.key);
            const examples: AssetExample[] = data?.examples[cat.key] ?? [];

            return (
              <div key={cat.key}>
                <SummaryCard
                  category={cat}
                  count={count}
                  total={data?.totalAssets ?? 0}
                  isOpen={isOpen}
                  onToggle={() => toggleCategory(cat.key)}
                />
                {isOpen && examples.length > 0 && (
                  <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/50">
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 dark:text-slate-400">Name</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 dark:text-slate-400 hidden sm:table-cell">Type</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 dark:text-slate-400">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {examples.map(asset => (
                          <tr key={asset.id} className="border-t border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                            <td className="px-3 py-2">
                              <button
                                onClick={() => handleAssetClick(asset.name)}
                                className="text-[#012061] dark:text-[#f8931f] hover:underline font-medium"
                              >
                                {asset.name}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300 hidden sm:table-cell">
                              {asset.type || <span className="text-slate-400 italic">—</span>}
                            </td>
                            <td className="px-3 py-2">
                              {asset.status ? (
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  asset.status === 'ACTIVE'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                    : asset.status === 'DISPOSED'
                                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                }`}>
                                  {asset.status}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {count > examples.length && (
                      <div className="bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-center">
                        <span className="text-xs text-slate-400">
                          Showing {examples.length} of {count} &middot; Use the Assets page to view all
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {isOpen && examples.length === 0 && (
                  <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
                    <p className="text-xs text-slate-400">No assets found with this issue 🎉</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}