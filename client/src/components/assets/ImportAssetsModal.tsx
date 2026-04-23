import { useState, useCallback } from 'react';
import { parseCsvFile, validateAssetRow, RowValidationResult, downloadAssetCsvTemplate } from '../../utils/csvTemplate';

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

export function ImportAssetsModal({ isOpen, onClose, onImportComplete }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: { row: number; reason: string }[] } | null>(null);

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
    if (validRows.length === 0 || !file) return;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleClose}>
      <div className="bg-card rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Import Assets from CSV</h2>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
        </div>

        {/* Step indicators */}
        <div className="px-6 py-2 border-b flex gap-4 text-sm">
          <span className={step === 'upload' ? 'font-medium text-foreground' : 'text-muted-foreground'}>1. Upload</span>
          <span className={step === 'preview' ? 'font-medium text-foreground' : 'text-muted-foreground'}>2. Preview</span>
          <span className={step === 'result' ? 'font-medium text-foreground' : 'text-muted-foreground'}>3. Result</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Upload a CSV file with asset data. The file must include a header row with column names.</p>
              <button onClick={downloadAssetCsvTemplate} className="text-sm text-primary hover:underline">
                ↓ Download CSV Template
              </button>
              <div
                className="border-2 border-dashed border-input rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
                onClick={() => document.getElementById('csv-file-input')?.click()}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
              >
                <div className="text-3xl mb-2">📁</div>
                <p className="text-sm font-medium">Click or drag CSV file here</p>
                <p className="text-xs text-muted-foreground mt-1">Maximum 5MB</p>
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                />
              </div>
              {fileError && <p className="text-sm text-red-500">{fileError}</p>}
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Found 0 rows in the file. The CSV must have a header row and at least one data row.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="text-green-600 font-medium">{validRows.length} valid</span>
                      {invalidRows.length > 0 && <span className="text-red-600 font-medium ml-3">{invalidRows.length} with errors</span>}
                    </div>
                    <button onClick={reset} className="text-sm text-primary hover:underline">Choose different file</button>
                  </div>
                  <div className="border rounded-lg overflow-auto max-h-[50vh]">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">#</th>
                          <th className="px-3 py-2 text-left font-medium">Name</th>
                          <th className="px-3 py-2 text-left font-medium">Type</th>
                          <th className="px-3 py-2 text-left font-medium">Status</th>
                          <th className="px-3 py-2 text-left font-medium">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {rows.map(r => (
                          <tr key={r.rowNumber} className={!r.validation.valid ? 'bg-red-50' : ''}>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.rowNumber}</td>
                            <td className="px-3 py-1.5">{r.data.name || '—'}</td>
                            <td className="px-3 py-1.5">{r.data.type || '—'}</td>
                            <td className="px-3 py-1.5">{r.data.status || '—'}</td>
                            <td className="px-3 py-1.5">
                              {r.validation.valid
                                ? <span className="text-green-600">✓ Ready</span>
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
            <div className="space-y-4 text-center py-4">
              <div className="text-4xl">✅</div>
              <h3 className="text-lg font-semibold">Import Complete</h3>
              <div className="flex justify-center gap-8 text-sm">
                <div><span className="text-2xl font-bold text-green-600">{result.imported}</span><br/>imported</div>
                <div><span className="text-2xl font-bold text-red-600">{result.skipped}</span><br/>skipped</div>
              </div>
              {result.errors.length > 0 && (
                <div className="text-left border rounded-lg p-3 max-h-32 overflow-auto">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Skipped rows:</p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">Row {e.row}: {e.reason}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          {step === 'upload' && (
            <button onClick={handleClose} className="rounded-md border border-input px-4 py-1.5 text-sm hover:bg-accent">Cancel</button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={reset} className="rounded-md border border-input px-4 py-1.5 text-sm hover:bg-accent">Back</button>
              <button
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
                className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {importing ? 'Importing...' : `Import ${validRows.length} valid row${validRows.length !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
          {step === 'result' && (
            <button
              onClick={() => { handleClose(); onImportComplete(); }}
              className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
            >
              View Imported Assets
            </button>
          )}
        </div>
      </div>
    </div>
  );
}