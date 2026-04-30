import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { RoleGate } from '../components/auth';
import {
  FileSignature, PlusCircle, Search, Loader2, X, ArrowRightLeft, RotateCcw, Package, Users, FileText, QrCode, CheckCircle2, ChevronRight,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import QRReturnScanner from '../components/issuances/QRReturnScanner';
import PDFPreviewModal from '../components/issuances/PDFPreviewModal';

/* ─── Types ─── */
interface AssetOption { id: string; name: string; serialNumber: string | null; propertyNumber: string | null; type: string; manufacturer: string | null }
interface PersonnelOption { id: string; fullName: string; position: string | null; project: string | null; department: string | null }
interface Issuance {
  id: string; assetId: string; personnelId: string | null; assignedTo: string | null; assignedAt: string; returnedAt: string | null;
  condition: string | null; notes: string | null;
  asset: { id: string; name: string; serialNumber: string | null; propertyNumber: string | null; status: string } | null;
  personnel: { id: string; fullName: string; position: string | null; project: string | null; department: string | null } | null;
}

/* ─── New Issuance Wizard ─── */
function NewIssuanceWizard({ onClose, onSave, onPreviewPdf }: { onClose: () => void; onSave: () => void; onPreviewPdf: (params: Record<string, any>) => void }) {
  const [step, setStep] = useState(1);
  const [assetSearch, setAssetSearch] = useState('');
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [personnel, setPersonnel] = useState<PersonnelOption[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<AssetOption | null>(null);
  const [selectedPersonnel, setSelectedPersonnel] = useState<PersonnelOption | null>(null);
  const [condition, setCondition] = useState('Good');
  const [agreement, setAgreement] = useState('');
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<any>(null);

  // Debounced asset search
  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/issuances/assets/available${assetSearch ? `?search=${assetSearch}` : ''}`);
        setAssets(res.data || []);
      } catch {}
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [assetSearch]);

  // Debounced personnel search
  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/issuances/personnel/active${personnelSearch ? `?search=${personnelSearch}` : ''}`);
        setPersonnel(res.data || []);
      } catch {}
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [personnelSearch]);

  // Generate agreement when both selected
  useEffect(() => {
    if (selectedAsset && selectedPersonnel) {
      const text = `ISSUANCE AND ACCOUNTABILITY AGREEMENT\n\nDate: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n\nThis certifies that ${selectedPersonnel.fullName}${selectedPersonnel.position ? `, ${selectedPersonnel.position}` : ''}${selectedPersonnel.department ? ` of ${selectedPersonnel.department}` : ''}${selectedPersonnel.project ? ` (${selectedPersonnel.project})` : ''} has been issued the following asset for official use:\n\nAsset: ${selectedAsset.name}${selectedAsset.serialNumber ? `\nSerial Number: ${selectedAsset.serialNumber}` : ''}${selectedAsset.propertyNumber ? `\nProperty Number: ${selectedAsset.propertyNumber}` : ''}\n\nTerms and Conditions:\n1. The issued asset shall be used solely for official business purposes.\n2. The recipient shall exercise due diligence in the care and protection of the asset.\n3. The asset shall not be transferred to another individual without proper documentation.\n4. Any damage, loss, or theft must be reported immediately to the Property Officer.\n5. The asset shall be returned upon resignation, transfer, or upon request by management.\n6. The recipient assumes full accountability for the asset during the period of possession.\n\nBy signing below, the recipient acknowledges receipt and accepts the terms stated above.\n\n________________________________________\n${selectedPersonnel.fullName} (Recipient)\n\n________________________________________\nProperty Officer\n\n________________________________________\nAuthorized Representative`;
      setAgreement(text);
    }
  }, [selectedAsset, selectedPersonnel]);

  const handleIssue = async () => {
    if (!selectedAsset || !selectedPersonnel) return;
    setSaving(true);
    try {
      await apiFetch('/issuances', {
        method: 'POST',
        body: {
          assetId: selectedAsset.id,
          personnelId: selectedPersonnel.id,
          condition,
          agreementText: agreement,
        },
      });
      onSave();
      onClose();
    } catch (e: any) { alert(e instanceof ApiError ? e.message : 'An unexpected error occurred'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-8 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mb-10" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b rounded-t-xl" style={{ background: '#012061' }}>
          <div className="flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-[#f8931f]" />
            <h2 className="text-sm font-bold text-white">New Issuance</h2>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-1 px-5 py-3 bg-slate-50 border-b">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-1">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${step >= s ? 'bg-[#f8931f] text-white' : 'bg-slate-200 text-slate-500'}`}>{s}</span>
              <span className="text-[10px] text-slate-500">{s === 1 ? 'Asset' : s === 2 ? 'Personnel' : 'Agreement'}</span>
              {s < 3 && <ChevronRight className="w-3 h-3 text-slate-300" />}
            </div>
          ))}
        </div>

        <div className="p-5">
          {/* Step 1: Select Asset */}
          {step === 1 && (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-700">Select Available Asset</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={assetSearch} onChange={e => setAssetSearch(e.target.value)}
                  placeholder="Search assets by name, serial, property #..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
              </div>
              <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
                {assets.length === 0 ? <p className="p-4 text-xs text-slate-400 text-center">No available assets</p> : assets.map(a => (
                  <button key={a.id} onClick={() => { setSelectedAsset(a); setStep(2); }}
                    className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors ${selectedAsset?.id === a.id ? 'bg-[#f8931f]/5 border-l-2 border-[#f8931f]' : ''}`}>
                    <p className="text-sm font-semibold" style={{ color: '#012061' }}>{a.name}</p>
                    <p className="text-[10px] text-slate-500">{a.type} • {a.manufacturer || '—'} • S/N: {a.serialNumber || '—'}</p>
                  </button>
                ))}
              </div>
              {selectedAsset && (
                <div className="flex items-center gap-2 bg-emerald-50 px-3 py-2 rounded-lg">
                  <Package className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-700">Selected: {selectedAsset.name}</span>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Select Personnel */}
          {step === 2 && (
            <div className="space-y-3">
              <button onClick={() => setStep(1)} className="text-xs text-slate-500 hover:text-slate-700 mb-1">← Back to Asset</button>
              <label className="text-xs font-semibold text-slate-700">Select Personnel</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={personnelSearch} onChange={e => setPersonnelSearch(e.target.value)}
                  placeholder="Search by name, position, project..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
              </div>
              <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
                {personnel.length === 0 ? <p className="p-4 text-xs text-slate-400 text-center">No active personnel</p> : personnel.map(p => (
                  <button key={p.id} onClick={() => { setSelectedPersonnel(p); setStep(3); }}
                    className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors ${selectedPersonnel?.id === p.id ? 'bg-[#f8931f]/5 border-l-2 border-[#f8931f]' : ''}`}>
                    <p className="text-sm font-semibold" style={{ color: '#012061' }}>{p.fullName}</p>
                    <p className="text-[10px] text-slate-500">{p.position || '—'} • {p.department || '—'} • {p.project || '—'}</p>
                  </button>
                ))}
              </div>
              {selectedPersonnel && (
                <div className="flex items-center gap-2 bg-emerald-50 px-3 py-2 rounded-lg">
                  <Users className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-700">Selected: {selectedPersonnel.fullName}</span>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Agreement */}
          {step === 3 && (
            <div className="flex flex-col" style={{ minHeight: '60vh' }}>
              <button onClick={() => setStep(2)} className="text-xs text-slate-500 hover:text-slate-700 mb-4">← Back to Personnel</button>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 flex-1">
                {/* Left Column — Summary Cards */}
                <div className="space-y-3">
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Asset</p>
                    <p className="text-sm font-semibold" style={{ color: '#012061' }}>{selectedAsset?.name}</p>
                    {selectedAsset?.serialNumber && (
                      <p className="text-[10px] text-slate-500 mt-1">S/N: {selectedAsset.serialNumber}</p>
                    )}
                    {selectedAsset?.propertyNumber && (
                      <p className="text-[10px] text-slate-500">Prop #: {selectedAsset.propertyNumber}</p>
                    )}
                    {selectedAsset?.type && (
                      <p className="text-[10px] text-slate-500">{selectedAsset.type}{selectedAsset.manufacturer ? ` • ${selectedAsset.manufacturer}` : ''}</p>
                    )}
                  </div>

                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Personnel</p>
                    <p className="text-sm font-semibold" style={{ color: '#012061' }}>{selectedPersonnel?.fullName}</p>
                    {selectedPersonnel?.position && (
                      <p className="text-[10px] text-slate-500 mt-1">{selectedPersonnel.position}</p>
                    )}
                    {selectedPersonnel?.department && (
                      <p className="text-[10px] text-slate-500">{selectedPersonnel.department}</p>
                    )}
                    {selectedPersonnel?.project && (
                      <p className="text-[10px] text-slate-500">{selectedPersonnel.project}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Condition at Issuance</label>
                    <select value={condition} onChange={e => setCondition(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-[#f8931f] focus:border-transparent">
                      <option>New</option><option>Good</option><option>Fair</option><option>Poor</option>
                    </select>
                  </div>
                </div>

                {/* Right Column — Agreement Text */}
                <div className="md:col-span-2 flex flex-col">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#f8931f]" />Agreement Letter
                  </label>
                  <textarea value={agreement} onChange={e => setAgreement(e.target.value)}
                    className="flex-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-xs font-mono leading-relaxed focus:ring-2 focus:ring-[#f8931f] focus:border-transparent resize-y"
                    style={{ minHeight: '400px' }} />
                </div>
              </div>

              {/* Sticky Footer Action Bar */}
              <div className="sticky bottom-0 bg-white border-t mt-4 pt-4 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => {
                    if (!selectedAsset || !selectedPersonnel) return;
                    onPreviewPdf({
                      personnelName: selectedPersonnel.fullName,
                      position: selectedPersonnel.position || undefined,
                      department: selectedPersonnel.department || undefined,
                      project: selectedPersonnel.project || undefined,
                      assetName: selectedAsset.name,
                      serialNumber: selectedAsset.serialNumber || undefined,
                      propertyNumber: selectedAsset.propertyNumber || undefined,
                      condition,
                    });
                  }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 border-[#012061] text-[#012061] hover:bg-[#012061] hover:text-white transition-colors flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4" /> Generate &amp; Preview PDF
                </button>
                <button onClick={handleIssue} disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#f8931f] hover:bg-[#e07e0a] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                  {saving ? 'Issuing...' : 'Confirm Issuance'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Return Station ─── */
function ReturnStationModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: () => void }) {
  const [scanValue, setScanValue] = useState('');
  const [searchResults, setSearchResults] = useState<Issuance[]>([]);
  const [returning, setReturning] = useState(false);
  const [message, setMessage] = useState('');

  if (!open) return null;

  const handleSearch = async () => {
    if (!scanValue.trim()) return;
    try {
      const res = await apiFetch(`/issuances?search=${encodeURIComponent(scanValue)}&status=active&limit=10`);
      setSearchResults(res.data || []);
      setMessage('');
    } catch { setSearchResults([]); }
  };

  const handleReturn = async (id: string) => {
    setReturning(true);
    try {
      await apiFetch(`/issuances/${id}/return`, { method: 'POST', body: { condition: 'Good' } });
      setMessage('Asset returned successfully!');
      setSearchResults([]);
      setScanValue('');
      onSave();
    } catch (e: any) { setMessage(e instanceof ApiError ? e.message : 'An unexpected error occurred'); } finally { setReturning(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b rounded-t-xl" style={{ background: '#012061' }}>
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[#f8931f]" />
            <h2 className="text-sm font-bold text-white">Return Station</h2>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500">Scan QR code or enter asset name/serial/property # to find active issuances.</p>
          <div className="flex gap-2">
            <input value={scanValue} onChange={e => setScanValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Scan or type..."
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent"
              autoFocus />
            <button onClick={handleSearch} className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#012061] text-white hover:bg-[#001a4d]">Find</button>
          </div>

          {message && (
            <div className={`text-xs px-3 py-2 rounded-lg ${message.includes('success') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {message.includes('success') && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />}
              {message}
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
              {searchResults.map(iss => (
                <div key={iss.id} className="px-3 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#012061' }}>{iss.asset?.name || '—'}</p>
                    <p className="text-[10px] text-slate-500">
                      S/N: {iss.asset?.serialNumber || '—'} • Issued to: {iss.personnel?.fullName || iss.assignedTo || '—'} • {new Date(iss.assignedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button onClick={() => handleReturn(iss.id)} disabled={returning}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold border-2 border-[#f8931f] text-[#f8931f] hover:bg-[#f8931f] hover:text-white transition-colors disabled:opacity-50">
                    <RotateCcw className="w-3 h-3" /> Return
                  </button>
                </div>
              ))}
            </div>
          )}

          {searchResults.length === 0 && scanValue && !message && (
            <p className="text-xs text-slate-400 text-center">No active issuances found</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function IssuancesPage() {
  const [issuances, setIssuances] = useState<Issuance[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const preFilterPersonnel = searchParams.get('personnel');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'returned'>(preFilterPersonnel ? 'active' : 'all');
  const [showWizard, setShowWizard] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [showQRReturn, setShowQRReturn] = useState(false);

  const fetchIssuances = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('status', statusFilter);
      if (preFilterPersonnel) params.set('personnelId', preFilterPersonnel);
      params.set('limit', '50');
      const res = await apiFetch(`/issuances?${params}`);
      setIssuances(res.data || []);
      setMeta(res.meta);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchIssuances(); }, [search, statusFilter]);

  const activeCount = issuances.filter(i => !i.returnedAt).length;
  const returnedCount = issuances.filter(i => i.returnedAt).length;

  const [pdfPreview, setPdfPreview] = useState<{ blobUrl: string | null; loading: boolean; filename: string }>({ blobUrl: null, loading: false, filename: 'agreement.pdf' });

  const openAgreementPreview = useCallback(async (params: Record<string, any>) => {
    setPdfPreview({ blobUrl: null, loading: true, filename: 'agreement.pdf' });
    try {
      const token = localStorage.getItem('accessToken');
      let res = await fetch('/api/agreements/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/pdf',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(params),
      });

      // 401 → attempt token refresh and retry once
      if (res.status === 401) {
        const rt = localStorage.getItem('refreshToken');
        if (rt) {
          const refreshRes = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rt }),
          });
          const refreshData = await refreshRes.json();
          if (refreshData.success) {
            localStorage.setItem('accessToken', refreshData.data.accessToken);
            localStorage.setItem('refreshToken', refreshData.data.refreshToken);
            res = await fetch('/api/agreements/pdf', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/pdf',
                Authorization: `Bearer ${refreshData.data.accessToken}`,
              },
              body: JSON.stringify(params),
            });
          }
        }
      }

      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      // Enforce correct MIME in case server/proxy strips it
      const typedBlob = blob.type === 'application/pdf'
        ? blob
        : new Blob([blob], { type: 'application/pdf' });
      const url = URL.createObjectURL(typedBlob);
      const pName = params.personnelName || 'unknown';
      setPdfPreview({ blobUrl: url, loading: false, filename: `agreement-${pName.replace(/\s+/g, '-').toLowerCase()}.pdf` });
    } catch (e: any) {
      setPdfPreview({ blobUrl: null, loading: false, filename: 'agreement.pdf' });
      alert(e instanceof ApiError ? e.message : 'Failed to generate agreement preview');
    }
  }, []);

  const closePdfPreview = useCallback(() => {
    setPdfPreview({ blobUrl: null, loading: false, filename: 'agreement.pdf' });
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileSignature className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">Issuances</h1>
            <div className="hidden sm:flex items-center gap-2 ml-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f8931f] text-white">{activeCount} Active</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300">{returnedCount} Returned</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RoleGate roles={['ADMIN', 'STAFF_ADMIN']}>
              <button onClick={() => setShowQRReturn(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border-2 border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 transition-colors">
                <QrCode className="w-3.5 h-3.5" /> QR Return
              </button>
              <button onClick={() => setShowWizard(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#f8931f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e07e0a] transition-colors">
                <PlusCircle className="w-3.5 h-3.5" /> New Issuance
              </button>
            </RoleGate>
          </div>
        </div>
      </header>

      {/* Pre-filter banner */}
      {preFilterPersonnel && (
        <div className="bg-[#f8931f]/10 border-b border-[#f8931f]/20 px-6 py-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-[#f8931f]">Filtered by profile — showing only this person's active issuances</span>
          <a href="/issuances" className="text-xs font-semibold text-[#012061] hover:underline">Clear filter</a>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search asset, serial, personnel..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f8931f] focus:border-transparent">
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="returned">Returned</option>
          </select>
        </div>
      </div>

      {/* Issuance Table */}
      <div className="px-6 py-4">
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: '#e8ecf4' }}>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Asset</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Serial #</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Issued To</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Date</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">Status</th>
              <th className="text-right px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading...</td></tr>
            ) : issuances.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm"><FileSignature className="w-8 h-8 mx-auto mb-2 opacity-40" />No issuances found</td></tr>
            ) : issuances.map(iss => (
              <tr key={iss.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="px-3 py-3">
                  <span className="text-sm font-semibold" style={{ color: '#012061' }}>{iss.asset?.name || '—'}</span>
                </td>
                <td className="px-3 py-3"><span className="text-xs font-mono text-slate-600">{iss.asset?.serialNumber || '—'}</span></td>
                <td className="px-3 py-3">
                  <div>
                    <span className="text-sm font-medium text-slate-700">{iss.personnel?.fullName || iss.assignedTo || '—'}</span>
                    {iss.personnel?.department && <p className="text-[10px] text-slate-400">{iss.personnel.department}</p>}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="text-xs text-slate-500">{new Date(iss.assignedAt).toLocaleDateString()}</div>
                  <div className="text-[10px] text-slate-400">{new Date(iss.assignedAt).toLocaleTimeString()}</div>
                </td>
                <td className="px-3 py-3">
                  {iss.returnedAt ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      <CheckCircle2 className="w-3 h-3" /> RETURNED
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                      <ArrowRightLeft className="w-3 h-3" /> ACTIVE
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => openAgreementPreview({
                        personnelName: iss.personnel?.fullName || iss.assignedTo || 'Unknown',
                        position: iss.personnel?.position || undefined,
                        department: iss.personnel?.department || undefined,
                        project: iss.personnel?.project || undefined,
                        assetName: iss.asset?.name || 'Unknown',
                        serialNumber: iss.asset?.serialNumber || undefined,
                        propertyNumber: iss.asset?.propertyNumber || undefined,
                        condition: iss.condition || undefined,
                      })}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-lg border-2 border-[#012061] text-[#012061] px-2 py-1 hover:bg-[#012061] hover:text-white transition-colors"
                      title="View Agreement PDF"
                    >
                      📄 Agreement
                    </button>
                    <RoleGate roles={['ADMIN', 'STAFF_ADMIN']}>
                      {!iss.returnedAt && (
                        <button onClick={async () => {
                          if (!confirm('Mark this asset as returned?')) return;
                          try {
                            await apiFetch(`/issuances/${iss.id}/return`, { method: 'POST', body: { condition: 'Good' } });
                            fetchIssuances();
                          } catch (e: any) { alert(e instanceof ApiError ? e.message : 'An unexpected error occurred'); }
                        }} className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-lg border-2 border-[#f8931f] text-[#f8931f] px-2 py-1 hover:bg-[#f8931f] hover:text-white transition-colors">
                          <RotateCcw className="w-3 h-3" /> Return
                        </button>
                      )}
                    </RoleGate>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 px-6 py-4 text-xs">
          <span className="text-slate-500">Page {meta.page} of {meta.totalPages}</span>
        </div>
      )}

      {/* Modals */}
      {showWizard && <NewIssuanceWizard onClose={() => setShowWizard(false)} onSave={fetchIssuances} onPreviewPdf={openAgreementPreview} />}
      <ReturnStationModal open={showReturn} onClose={() => setShowReturn(false)} onSave={fetchIssuances} />
      <QRReturnScanner open={showQRReturn} onClose={() => setShowQRReturn(false)} onReturned={fetchIssuances} />
      <PDFPreviewModal open={!!(pdfPreview.blobUrl || pdfPreview.loading)} onClose={closePdfPreview} blobUrl={pdfPreview.blobUrl} loading={pdfPreview.loading} downloadFilename={pdfPreview.filename} />
    </div>
  );
}