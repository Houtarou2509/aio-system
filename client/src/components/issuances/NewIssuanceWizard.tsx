import { useState, useEffect } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { useDebounce } from '../../hooks/useDebounce';
import {
  FileSignature, Search, X, ChevronRight, Package, Users, FileText, Loader2, ArrowRightLeft,
} from 'lucide-react';

/* ─── Shared Types ─── */

export interface AssetOption {
  id: string;
  name: string;
  serialNumber: string | null;
  propertyNumber: string | null;
  type: string;
  manufacturer: string | null;
}

export interface PersonnelOption {
  id: string;
  fullName: string;
  designation: string | null;
  project: string | null;
  department: string | null;
  designationLookup?: { name: string } | null;
  projectLookup?: { name: string } | null;
  institution?: { name: string } | null;
}

interface TemplateOption {
  id: string;
  name: string;
  content: string;
  headerLogo: string | null;
  isDefault: boolean;
  defaultPropertyOfficer?: string | null;
  defaultAuthorizedRep?: string | null;
  signatoryMode?: 'recipientOnly' | 'recipientPropertyOfficer' | 'recipientPropertyOfficerAuthorizedRep';
}

/* ─── Component ─── */

interface NewIssuanceWizardProps {
  onClose: () => void;
  onSave: () => void;
  onPreviewPdf: (params: Record<string, any>) => void;
}

export default function NewIssuanceWizard({ onClose, onSave, onPreviewPdf }: NewIssuanceWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedAsset, setSelectedAsset] = useState<AssetOption | null>(null);
  const [selectedPersonnel, setSelectedPersonnel] = useState<PersonnelOption | null>(null);
  const [condition, setCondition] = useState('Good');
  const [agreement, setAgreement] = useState('');
  const [saving, setSaving] = useState(false);

  // Debounced search fields
  const [assetSearch, setAssetSearch] = useState('');
  const [personnelSearch, setPersonnelSearch] = useState('');
  const debouncedAssetSearch = useDebounce(assetSearch, 300);
  const debouncedPersonnelSearch = useDebounce(personnelSearch, 300);

  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [personnel, setPersonnel] = useState<PersonnelOption[]>([]);

  // Template selector
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // Signatory names
  const [propertyOfficerName, setPropertyOfficerName] = useState('');
  const [authorizedRepName, setAuthorizedRepName] = useState('');
  const [signatoryMode, setSignatoryMode] = useState<'recipientOnly' | 'recipientPropertyOfficer' | 'recipientPropertyOfficerAuthorizedRep'>('recipientPropertyOfficerAuthorizedRep');

  // Debounced asset search
  useEffect(() => {
    apiFetch(`/issuances/assets/available${debouncedAssetSearch ? `?search=${debouncedAssetSearch}` : ''}`)
      .then(res => setAssets(res.data || []))
      .catch(() => {});
  }, [debouncedAssetSearch]);

  // Debounced personnel search
  useEffect(() => {
    apiFetch(`/issuances/personnel/active${debouncedPersonnelSearch ? `?search=${debouncedPersonnelSearch}` : ''}`)
      .then(res => setPersonnel(res.data || []))
      .catch(() => {});
  }, [debouncedPersonnelSearch]);

  // Fetch templates when wizard opens
  useEffect(() => {
    async function loadTemplates() {
      setTemplatesLoading(true);
      try {
        const res = await apiFetch('/agreements/templates');
        const list: TemplateOption[] = res.data ?? res;
        setTemplates(list);
        const def = list.find(t => t.isDefault) ?? list[0] ?? null;
        if (def) {
          setSelectedTemplateId(def.id);
          setPropertyOfficerName(def.defaultPropertyOfficer || '');
          setAuthorizedRepName(def.defaultAuthorizedRep || '');
          setSignatoryMode(def.signatoryMode || 'recipientPropertyOfficerAuthorizedRep');
        }
      } catch { /* non-critical */ }
      finally { setTemplatesLoading(false); }
    }
    loadTemplates();
  }, []);

  // Resolve agreement when asset + personnel are selected
  useEffect(() => {
    if (!selectedAsset || !selectedPersonnel) return;

    const resolveServerTemplate = async () => {
      try {
        const res = await apiFetch('/issuances/resolve-template', {
          method: 'POST',
          body: {
            personnelId: selectedPersonnel.id,
            assetId: selectedAsset.id,
            condition,
            templateId: selectedTemplateId || undefined,
          },
        });
        const data = res.data;
        if (data.templateId && !selectedTemplateId) setSelectedTemplateId(data.templateId);
        if (data.defaultPropertyOfficer && !propertyOfficerName) setPropertyOfficerName(data.defaultPropertyOfficer);
        if (data.defaultAuthorizedRep && !authorizedRepName) setAuthorizedRepName(data.defaultAuthorizedRep);
        if (data.signatoryMode) setSignatoryMode(data.signatoryMode);
        setAgreement(data.resolvedText);
      } catch {
        // Fallback to client-side resolution
        const template = templates.find(t => t.id === selectedTemplateId);
        const designation = selectedPersonnel.designationLookup?.name || selectedPersonnel.designation || '';
        const project = selectedPersonnel.projectLookup?.name || selectedPersonnel.project || '';
        const institution = selectedPersonnel.institution?.name || '';
        if (!template?.content) {
          const fallback = `ISSUANCE AND ACCOUNTABILITY AGREEMENT\n\nDate: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n\nThis certifies that ${selectedPersonnel.fullName}${designation ? `, ${designation}` : ''}${institution ? ` of ${institution}` : ''}${project ? ` (${project})` : ''} has been issued the following asset for official use:\n\nAsset: ${selectedAsset.name}${selectedAsset.serialNumber ? `\nSerial Number: ${selectedAsset.serialNumber}` : ''}${selectedAsset.propertyNumber ? `\nProperty Number: ${selectedAsset.propertyNumber}` : ''}\n\nTerms and Conditions:\n1. The issued asset shall be used solely for official business purposes.\n2. The recipient shall exercise due diligence in the care and protection of the asset.\n3. The asset shall not be transferred to another individual without proper documentation.\n4. Any damage, loss, or theft must be reported immediately to the Property Officer.\n5. The asset shall be returned upon resignation, transfer, or upon request by management.\n6. The recipient assumes full accountability for the asset during the period of possession.\n\n________________________________________\n${selectedPersonnel.fullName} (Recipient)\n\n________________________________________\nProperty Officer\n\n________________________________________\nAuthorized Representative`;
          setAgreement(fallback);
          return;
        }
        const placeholderMap: Record<string, string> = {
          '{{date}}': new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          '{{fullName}}': selectedPersonnel.fullName, '{{personnelName}}': selectedPersonnel.fullName,
          '{{designation}}': designation, '{{position}}': designation,
          '{{designationComma}}': designation ? `, ${designation}` : '', '{{positionComma}}': designation ? `, ${designation}` : '',
          '{{department}}': '', '{{departmentText}}': '',
          '{{institution}}': institution, '{{institutionText}}': institution ? ` of ${institution}` : '',
          '{{project}}': project, '{{projectText}}': project ? ` (${project})` : '',
          '{{assetName}}': selectedAsset.name,
          '{{serialNumber}}': selectedAsset.serialNumber || 'N/A',
          '{{propertyNumber}}': selectedAsset.propertyNumber || 'N/A',
          '{{condition}}': condition,
        };
        const filled = template.content.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) =>
          placeholderMap[`{{${key}}}`] !== undefined ? placeholderMap[`{{${key}}}`] : `{{${key}}}`
        );
        setAgreement(filled);
      }
    };

    resolveServerTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAsset, selectedPersonnel, selectedTemplateId, condition, templates.length]);

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
          agreementId: selectedTemplateId || undefined,
          propertyOfficerName: (signatoryMode === 'recipientPropertyOfficer' || signatoryMode === 'recipientPropertyOfficerAuthorizedRep') ? propertyOfficerName || undefined : undefined,
          authorizedRepName: signatoryMode === 'recipientPropertyOfficerAuthorizedRep' ? authorizedRepName || undefined : undefined,
          signatoryMode,
        },
      });
      onSave();
      onClose();
    } catch (e: any) {
      alert(e instanceof ApiError ? e.message : 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-8 overflow-y-auto" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl mb-10" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b rounded-t-xl" style={{ background: '#012061' }}>
          <div className="flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-[#f8931f]" />
            <h2 className="text-sm font-bold text-white">New Issuance</h2>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-1 px-5 py-3 bg-slate-50 dark:bg-slate-900 border-b">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-1">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${step >= s ? 'bg-[#f8931f] text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>{s}</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">{s === 1 ? 'Asset' : s === 2 ? 'Personnel' : 'Agreement'}</span>
              {s < 3 && <ChevronRight className="w-3 h-3 text-slate-300" />}
            </div>
          ))}
        </div>

        <div className="p-5">
          {/* Step 1: Select Asset */}
          {step === 1 && (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Select Available Asset</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={assetSearch} onChange={e => setAssetSearch(e.target.value)}
                  placeholder="Search assets by name, serial, property #..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
              </div>
              <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
                {assets.length === 0 ? <p className="p-4 text-xs text-slate-400 text-center">No available assets</p> : assets.map(a => (
                  <button key={a.id} onClick={() => { setSelectedAsset(a); setStep(2); }}
                    className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${selectedAsset?.id === a.id ? 'bg-[#f8931f]/5 border-l-2 border-[#f8931f]' : ''}`}>
                    <p className="text-sm font-semibold" style={{ color: '#012061' }}>{a.name}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{a.type} • {a.manufacturer || '—'} • S/N: {a.serialNumber || '—'}</p>
                  </button>
                ))}
              </div>
              {selectedAsset && (
                <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950 px-3 py-2 rounded-lg">
                  <Package className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-700">Selected: {selectedAsset.name}</span>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Select Personnel */}
          {step === 2 && (
            <div className="space-y-3">
              <button onClick={() => setStep(1)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 mb-1">← Back to Asset</button>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Select Personnel</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={personnelSearch} onChange={e => setPersonnelSearch(e.target.value)}
                  placeholder="Search by name, position, project..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
              </div>
              <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
                {personnel.length === 0 ? <p className="p-4 text-xs text-slate-400 text-center">No active personnel</p> : personnel.map(p => (
                  <button key={p.id} onClick={() => { setSelectedPersonnel(p); setStep(3); }}
                    className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${selectedPersonnel?.id === p.id ? 'bg-[#f8931f]/5 border-l-2 border-[#f8931f]' : ''}`}>
                    <p className="text-sm font-semibold" style={{ color: '#012061' }}>{p.fullName}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{p.designationLookup?.name || p.designation || '—'} • {p.institution?.name || '—'} • {p.projectLookup?.name || p.project || '—'}</p>
                  </button>
                ))}
              </div>
              {selectedPersonnel && (
                <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950 px-3 py-2 rounded-lg">
                  <Users className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-700">Selected: {selectedPersonnel.fullName}</span>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Agreement */}
          {step === 3 && (
            <div className="flex flex-col" style={{ minHeight: '60vh' }}>
              <button onClick={() => setStep(2)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 mb-4">← Back to Personnel</button>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 flex-1">
                {/* Left Column — Summary Cards */}
                <div className="space-y-3">
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Asset</p>
                    <p className="text-sm font-semibold" style={{ color: '#012061' }}>{selectedAsset?.name}</p>
                    {selectedAsset?.serialNumber && <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">S/N: {selectedAsset.serialNumber}</p>}
                    {selectedAsset?.propertyNumber && <p className="text-[10px] text-slate-500 dark:text-slate-400">Prop #: {selectedAsset.propertyNumber}</p>}
                    {selectedAsset?.type && <p className="text-[10px] text-slate-500 dark:text-slate-400">{selectedAsset.type}{selectedAsset.manufacturer ? ` • ${selectedAsset.manufacturer}` : ''}</p>}
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Personnel</p>
                    <p className="text-sm font-semibold" style={{ color: '#012061' }}>{selectedPersonnel?.fullName}</p>
                    {(selectedPersonnel?.designationLookup?.name || selectedPersonnel?.designation) && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{selectedPersonnel.designationLookup?.name || selectedPersonnel?.designation}</p>
                    )}
                    {selectedPersonnel?.institution?.name && <p className="text-[10px] text-slate-500 dark:text-slate-400">{selectedPersonnel.institution.name}</p>}
                    {(selectedPersonnel?.projectLookup?.name || selectedPersonnel?.project) && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{selectedPersonnel.projectLookup?.name || selectedPersonnel?.project}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Agreement Template</label>
                    <div className="relative mt-1">
                      <select
                        value={selectedTemplateId}
                        onChange={e => {
                          setSelectedTemplateId(e.target.value);
                          const tpl = templates.find(t => t.id === e.target.value);
                          setPropertyOfficerName(tpl?.defaultPropertyOfficer || '');
                          setAuthorizedRepName(tpl?.defaultAuthorizedRep || '');
                          setSignatoryMode(tpl?.signatoryMode || 'recipientPropertyOfficerAuthorizedRep');
                        }}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent appearance-none bg-white dark:bg-slate-800"
                      >
                        {templatesLoading ? <option value="">Loading templates...</option>
                          : templates.length === 0 ? <option value="">No templates available</option>
                            : templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (Default)' : ''}</option>)}
                      </select>
                      {templatesLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Condition at Issuance</label>
                    <select value={condition} onChange={e => setCondition(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-[#f8931f] focus:border-transparent">
                      <option>New</option><option>Good</option><option>Fair</option><option>Poor</option>
                    </select>
                  </div>

                  {signatoryMode !== 'recipientOnly' && (
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Signatories</label>
                      <div className="space-y-2 mt-1">
                        {(signatoryMode === 'recipientPropertyOfficer' || signatoryMode === 'recipientPropertyOfficerAuthorizedRep') && (
                          <input type="text" value={propertyOfficerName} onChange={e => setPropertyOfficerName(e.target.value)}
                            placeholder="Property Officer name"
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
                        )}
                        {signatoryMode === 'recipientPropertyOfficerAuthorizedRep' && (
                          <input type="text" value={authorizedRepName} onChange={e => setAuthorizedRepName(e.target.value)}
                            placeholder="Authorized Representative name"
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column — Agreement Text */}
                <div className="md:col-span-2 flex flex-col">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#f8931f]" />Agreement Letter
                  </label>
                  <textarea value={agreement} onChange={e => setAgreement(e.target.value)}
                    className="flex-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3 text-xs font-mono leading-relaxed focus:ring-2 focus:ring-[#f8931f] focus:border-transparent resize-y"
                    style={{ minHeight: '400px' }} />
                </div>
              </div>

              {/* Sticky Footer Action Bar */}
              <div className="sticky bottom-0 bg-white dark:bg-slate-800 border-t mt-4 pt-4 flex flex-col sm:flex-row gap-3">
                <button onClick={() => onPreviewPdf({
                  personnelName: selectedPersonnel?.fullName,
                  designation: selectedPersonnel?.designationLookup?.name || selectedPersonnel?.designation || undefined,
                  project: selectedPersonnel?.projectLookup?.name || selectedPersonnel?.project || undefined,
                  institution: selectedPersonnel?.institution?.name || undefined,
                  assetName: selectedAsset?.name,
                  serialNumber: selectedAsset?.serialNumber || undefined,
                  propertyNumber: selectedAsset?.propertyNumber || undefined,
                  condition,
                  templateId: selectedTemplateId || undefined,
                  propertyOfficerName: (signatoryMode === 'recipientPropertyOfficer' || signatoryMode === 'recipientPropertyOfficerAuthorizedRep') ? propertyOfficerName || undefined : undefined,
                  authorizedRepName: signatoryMode === 'recipientPropertyOfficerAuthorizedRep' ? authorizedRepName || undefined : undefined,
                  signatoryMode,
                  personnelId: selectedPersonnel?.id || undefined,
                })}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 border-[#012061] text-[#012061] dark:text-slate-100 hover:bg-[#012061] hover:text-white transition-colors flex items-center justify-center gap-2"
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
