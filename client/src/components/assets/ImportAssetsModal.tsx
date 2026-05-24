import { useState, useCallback } from 'react';
import { parseCsvFile, validateAssetRow, RowValidationResult, downloadAssetCsvTemplate } from '../../utils/csvTemplate';
import { CheckCircle, XCircle, AlertTriangle, Package, Download } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

type Step = 'upload' | 'preview' | 'result';

interface ParsedRow {
  rowNumber: number;
  data: Record<string, string>;
  validation: RowValidationResult;
}

interface ImportResultRow {
  row: number;
  status: 'imported' | 'skipped' | 'warning';
  assetId?: string;
  reason?: string;
  field?: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  warnings: number;
  total: number;
  results: ImportResultRow[];
}

const STATUS_STYLES: Record<string, { icon: typeof CheckCircle; bg: string; text: string; label: string }> = {
  imported: { icon: CheckCircle, bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', label: 'Imported' },
  skipped: { icon: XCircle, bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300', label: 'Skipped' },
  warning: { icon: AlertTriangle, bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', label: 'Warning' },
};

export function ImportAssetsModal({ isOpen, onClose, onImportComplete }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const validRows = rows.filter(r => r.validation.valid);
  const invalidRows = rows.filter(r => !r.validation.valid);

  const reset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setFileError(null);
    setRows([]);
    setImporting(false);
    setResult(null);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const downloadErrorReport = useCallback(() => {
    if (!result) return;
    const errorRows = result.results.filter(r => r.status === 'skipped' || r.status === 'warning');
    if (errorRows.length === 0) return;
    const headers = ['Row', 'Status', 'Field', 'Reason'];
    const csvRows = errorRows.map(r => [
      String(r.row),
      r.status,
      r.field || '',
      r.reason || '',
    ].map(cell => {
      // Escape cells containing commas, quotes, or newlines
      if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(','));
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-errors-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const handleFileSelect = async (selectedFile: File) => {
    setFileError(null);
    if (!selectedFile.name.endsWith('.csv')) {
      setFileError('Only CSV files accepted');
      return;
    }
    setFile(selectedFile);
    try {
      const parsed = await parseCsvFile(selectedFile);
      if (parsed.length === 0) {
        setRows([]);
        setStep('preview');
        return;
      }
      const mapped: ParsedRow[] = parsed.map((row, i) => ({
        rowNumber: i + 2,
        data: row,
        validation: validateAssetRow(row, i + 2),
      }));
      setRows(mapped);
      setStep('preview');
    } catch {
      setFileError('Failed to parse CSV file');
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const token = localStorage.getItem('accessToken');
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/assets/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Import failed');
      setResult(data.data);
      setStep('result');
    } catch (err: any) {
      setFileError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between bg-[#012061]">
          <div className="flex items-center gap-2.5">
            <Package className="h-4 w-4 text-[#f8931f]" />
            <h2 className="text-sm font-bold text-white tracking-tight">Import Assets from CSV</h2>
          </div>
          <button onClick={handleClose} className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors">×</button>
        </div>

        {/* Step indicators */}
        <div className="px-6 py-2 border-b border-slate-200 dark:border-slate-700 flex gap-4 text-sm bg-white dark:bg-slate-800">
          <span className={step === 'upload' ? 'font-semibold text-[#012061] dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}>1. Upload</span>
          <span className={step === 'preview' ? 'font-semibold text-[#012061] dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}>2. Preview</span>
          <span className={step === 'result' ? 'font-semibold text-[#012061] dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}>3. Result</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 bg-white dark:bg-slate-800">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Upload a CSV file with asset data. The file must include a header row with column names.</p>
              <button onClick={downloadAssetCsvTemplate} className="text-xs text-[#012061] dark:text-[#f8931f] hover:underline">
                ↓ Download CSV Template
              </button>
              <div
                className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center hover:border-[#f8931f] transition-colors cursor-pointer bg-white dark:bg-slate-800"
                onClick={() => document.getElementById('csv-file-input')?.click()}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
              >
                <div className="text-3xl mb-2">📁</div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Click or drag CSV file here</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Maximum 5MB</p>
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                />
              </div>
              {fileError && <p className="text-xs text-red-600">{fileError}</p>}
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {rows.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">Found 0 rows in the file. The CSV must have a header row and at least one data row.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="text-xs">
                      <span className="text-emerald-600 font-semibold">{validRows.length} valid</span>
                      {invalidRows.length > 0 && <span className="text-red-600 font-semibold ml-3">{invalidRows.length} with errors</span>}
                    </div>
                    <button onClick={reset} className="text-xs text-[#012061] dark:text-[#f8931f] hover:underline">Choose different file</button>
                  </div>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-auto max-h-[50vh]">
                    <table className="w-full text-xs">
                      <thead className="bg-[#012061] sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-white/70 uppercase tracking-widest text-[10px]">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-white/70 uppercase tracking-widest text-[10px]">Name</th>
                          <th className="px-3 py-2 text-left font-semibold text-white/70 uppercase tracking-widest text-[10px]">Type</th>
                          <th className="px-3 py-2 text-left font-semibold text-white/70 uppercase tracking-widest text-[10px]">Status</th>
                          <th className="px-3 py-2 text-left font-semibold text-white/70 uppercase tracking-widest text-[10px]">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {rows.map(r => (
                          <tr key={r.rowNumber} className={!r.validation.valid ? 'bg-red-50 dark:bg-red-950/30' : ''}>
                            <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{r.rowNumber}</td>
                            <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{r.data.name || '—'}</td>
                            <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{r.data.type || '—'}</td>
                            <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{r.data.status || '—'}</td>
                            <td className="px-3 py-1.5">
                              {r.validation.valid
                                ? <span className="text-emerald-600">✓ Ready</span>
                                : <span className="text-red-600">✗ {r.validation.reason}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Result */}
          {step === 'result' && result && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-[#012061] dark:text-slate-100">{result.total}</p>
                  <p className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-semibold">Total</p>
                </div>
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{result.imported}</p>
                  <p className="text-[10px] tracking-widest text-emerald-700/70 uppercase font-semibold">Imported</p>
                </div>
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{result.warnings}</p>
                  <p className="text-[10px] tracking-widest text-amber-700/70 uppercase font-semibold">Warnings</p>
                </div>
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{result.skipped}</p>
                  <p className="text-[10px] tracking-widest text-red-700/70 uppercase font-semibold">Skipped</p>
                </div>
              </div>

              {/* Per-row results */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-auto max-h-[40vh]">
                <table className="w-full text-xs">
                  <thead className="bg-[#012061] sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-white/70 uppercase tracking-widest text-[10px]">Row</th>
                      <th className="px-3 py-2 text-left font-semibold text-white/70 uppercase tracking-widest text-[10px]">Status</th>
                      <th className="px-3 py-2 text-left font-semibold text-white/70 uppercase tracking-widest text-[10px]">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {result.results.map((r, i) => {
                      const style = STATUS_STYLES[r.status] || STATUS_STYLES.skipped;
                      const Icon = style.icon;
                      return (
                        <tr key={i} className={style.bg}>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-medium">{r.row}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 ${style.text} font-semibold`}>
                              <Icon className="h-3.5 w-3.5" />
                              {style.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                            {r.reason || (r.assetId ? `ID: ${r.assetId.slice(0, 8)}…` : '—')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-white dark:bg-slate-800">
          {step === 'upload' && (
            <button onClick={handleClose} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Cancel</button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={reset} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Back</button>
              <button
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
                className="rounded-lg bg-[#012061] px-4 py-2 text-xs font-bold text-white hover:bg-[#012061]/90 disabled:opacity-50 transition-colors"
              >
                {importing ? 'Importing...' : `Import ${validRows.length} valid row${validRows.length !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
          {step === 'result' && (
            <div className="flex items-center justify-between w-full">
              {result && result.results.some(r => r.status === 'skipped' || r.status === 'warning') && (
                <button
                  onClick={downloadErrorReport}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Error Report
                </button>
              )}
              <button
                onClick={() => { handleClose(); onImportComplete(); }}
                className="rounded-lg bg-[#012061] px-4 py-2 text-xs font-bold text-white hover:bg-[#012061]/90 transition-colors"
              >
                View Imported Assets
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}