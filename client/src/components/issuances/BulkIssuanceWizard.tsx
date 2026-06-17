import { useState, useEffect, useRef } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { useDebounce } from '../../hooks/useDebounce';
import {
  FileSignature, Search, X, ChevronRight, Users, FileText, Loader2, CheckSquare, Square,
} from 'lucide-react';

/*
  QA Signatory UI Checklist:
  1. Open Bulk Issuance Wizard.
  2. Select assets and personnel to reach the Agreement step.
  3. Choose a template with signatoryMode=recipientOnly -> only Agreement text shown; no Signatories section.
  4. Choose recipientPropertyOfficer -> Signatories section shows Property Officer input only.
  5. Choose recipientPropertyOfficerAuthorizedRep -> Signatories section shows Property Officer + Authorized Representative.
  6. Confirm the issued document snapshot only stores names required by the selected mode.
*/

/* ─── Types ─── */

interface AssetOption {
  id: string;
  name: string;
  serialNumber: string | null;
  propertyNumber: string | null;
  type: string;
  manufacturer: string | null;
}

interface PersonnelOption {
  id: string;
  fullName: string;
  designation: string | null;
  project: string | null;
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

interface BulkIssuanceWizardProps {
  onClose: () => void;
  onSave: () => void;
  onPreviewPdf: (params: Record<string, any>) => void;
  preselectedPersonnelId?: string;
}

export default function BulkIssuanceWizard({ onClose, onSave, onPreviewPdf, preselectedPersonnelId }: BulkIssuanceWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedAssets, setSelectedAssets] = useState<AssetOption[]>([]);
  const [selectedPersonnel, setSelectedPersonnel] = useState<PersonnelOption | null>(null);
  const [condition, setCondition] = useState('Good');
  const [agreement, setAgreement] = useState('');
  const [saving, setSaving] = useState(false);
  const [showChangePersonnel, setShowChangePersonnel] = useState(false);
  const [lockingAssets, setLockingAssets] = useState(false);
  const lockedAssetIdsRef = useRef<string[]>([]);
  const finalizedRef = useRef(false);

  // Debounced search
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

  useEffect(() => {
    return () => {
      if (!finalizedRef.current && lockedAssetIdsRef.current.length > 0) {
        const assetIds = lockedAssetIdsRef.current;
        lockedAssetIdsRef.current = [];
        apiFetch('/issuances/assets/release', { method: 'POST', body: { assetIds } }).catch(() => {});
      }
    };
  }, []);

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

  // Auto-select personnel if preselectedPersonnelId is provided
  useEffect(() => {
    if (!preselectedPersonnelId) return;
    const loadPersonnel = async () => {
      try {
        const res = await apiFetch(`/personnel/${preselectedPersonnelId}`);
        const p = res.data;
        setSelectedPersonnel({
          id: p.id,
          fullName: p.fullName,
          designation: p.designation,
          project: p.project,
          designationLookup: p.designationLookup,
          projectLookup: p.projectLookup,
          institution: p.institution,
        });
        setStep(1); // still need to pick assets
      } catch { /* personnel not found — skip */ }
    };
    loadPersonnel();
  }, [preselectedPersonnelId]);

  // Toggle asset selection
  const toggleAsset = (asset: AssetOption) => {
    setSelectedAssets(prev => {
      const exists = prev.find(a => a.id === asset.id);
      if (exists) return prev.filter(a => a.id !== asset.id);
      return [...prev, asset];
    });
  };

  const releaseLockedAssets = async () => {
    if (finalizedRef.current || lockedAssetIdsRef.current.length === 0) return;
    const assetIds = lockedAssetIdsRef.current;
    lockedAssetIdsRef.current = [];
    try {
      await apiFetch('/issuances/assets/release', { method: 'POST', body: { assetIds } });
    } catch { /* best effort unlock; backend also protects issue path */ }
  };

  const handleClose = async () => {
    await releaseLockedAssets();
    onClose();
  };

  const proceedAfterAssetSelection = async () => {
    if (selectedAssets.length === 0) return;
    setLockingAssets(true);
    try {
      const assetIds = selectedAssets.map(a => a.id);
      const res = await apiFetch('/issuances/assets/lock', { method: 'POST', body: { assetIds } });
      const errors = res.data?.errors || [];
      if (errors.length > 0) {
        alert(`Some assets could not be locked for issuance:\n${errors.map((e: any) => `${e.assetId}: ${e.reason}`).join('\n')}`);
      }
      lockedAssetIdsRef.current = (res.data?.locked || []).map((a: AssetOption) => a.id);
      if (lockedAssetIdsRef.current.length === 0) return;
      setSelectedAssets(prev => prev.filter(a => lockedAssetIdsRef.current.includes(a.id)));
      setStep(2);
    } catch (e: any) {
      alert(e instanceof ApiError ? e.message : 'Failed to lock selected assets');
    } finally {
      setLockingAssets(false);
    }
  };

  const backToAssets = async () => {
    await releaseLockedAssets();
    setStep(1);
  };

  // Resolve agreement when assets + personnel are selected
  useEffect(() => {
    if (selectedAssets.length === 0 || !selectedPersonnel) return;

    const resolveServerTemplate = async () => {
      try {
        const res = await apiFetch('/issuances/resolve-template/bulk', {
          method: 'POST',
          body: {
            personnelId: selectedPersonnel.id,
            assetIds: selectedAssets.map(a => a.id),
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
        // Fallback
        const designation = selectedPersonnel.designationLookup?.name || selectedPersonnel.designation || '';
        const project = selectedPersonnel.projectLookup?.name || selectedPersonnel.project || '';
        const institution = selectedPersonnel.institution?.name || '';

        let assetTable = '';
        for (const a of selectedAssets) {
          assetTable += `${a.name} | S/N: ${a.serialNumber || 'N/A'} | Prop#: ${a.propertyNumber || 'N/A'}\n`;
        }

        const fallback = `ISSUANCE AND ACCOUNTABILITY AGREEMENT\n\nDate: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n\nThis certifies that ${selectedPersonnel.fullName}${designation ? `, ${designation}` : ''}${institution ? ` of ${institution}` : ''}${project ? ` (${project})` : ''} has been issued the following assets for official use:\n\n${assetTable}\nTerms and Conditions:\n1. All assets shall be used solely for official business purposes.\n2. The recipient shall exercise due diligence in the care and protection of each asset.\n3. Assets shall not be transferred to another individual without proper documentation.\n4. Any damage, loss, or theft must be reported immediately to the Property Officer.\n5. All assets shall be returned upon resignation, transfer, or upon request by management.\n6. The recipient assumes full accountability for all issued assets during the period of possession.\n\n________________________________________\n${selectedPersonnel.fullName} (Recipient)\n\n________________________________________\nProperty Officer\n\n________________________________________\nAuthorized Representative`;
        setAgreement(fallback);
      }
    };

    resolveServerTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssets, selectedPersonnel, selectedTemplateId, condition, templates.length]);

  const handleIssue = async () => {
    if (selectedAssets.length === 0 || !selectedPersonnel) return;
    setSaving(true);
    try {
      const result = await apiFetch('/issuances/bulk', {
        method: 'POST',
        body: {
          assetIds: selectedAssets.map(a => a.id),
          personnelId: selectedPersonnel.id,
          condition,
          notes: null,
          agreementTemplateId: selectedTemplateId || undefined,
          agreementText: agreement,
          propertyOfficerName: (signatoryMode === 'recipientPropertyOfficer' || signatoryMode === 'recipientPropertyOfficerAuthorizedRep') ? propertyOfficerName || undefined : undefined,
          authorizedRepName: signatoryMode === 'recipientPropertyOfficerAuthorizedRep' ? authorizedRepName || undefined : undefined,
          signatoryMode,
        },
      });
      const data = result.data;
      if (data.errors && data.errors.length > 0) {
        const errMsg = data.errors.map((e: any) => `${e.assetId}: ${e.reason}`).join('\n');
        alert(`Some assets could not be issued:\n${errMsg}`);
      }
      finalizedRef.current = true;
      lockedAssetIdsRef.current = [];
      onSave();
      onClose();
    } catch (e: any) {
      alert(e instanceof ApiError ? e.message : 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewPdf = () => {
    onPreviewPdf({
      personnelName: selectedPersonnel?.fullName,
      designation: selectedPersonnel?.designationLookup?.name || selectedPersonnel?.designation || undefined,
      project: selectedPersonnel?.projectLookup?.name || selectedPersonnel?.project || undefined,
      institution: selectedPersonnel?.institution?.name || undefined,
      assetName: selectedAssets.length === 1 ? selectedAssets[0].name : `${selectedAssets.length} assets`,
      serialNumber: selectedAssets.length === 1 ? (selectedAssets[0].serialNumber || undefined) : undefined,
      propertyNumber: selectedAssets.length === 1 ? (selectedAssets[0].propertyNumber || undefined) : undefined,
      assets: selectedAssets.map(a => ({
        name: a.name,
        serialNumber: a.serialNumber || undefined,
        propertyNumber: a.propertyNumber || undefined,
      })),
      agreementText: agreement,
      condition,
      templateId: selectedTemplateId || undefined,
      propertyOfficerName: (signatoryMode === 'recipientPropertyOfficer' || signatoryMode === 'recipientPropertyOfficerAuthorizedRep') ? propertyOfficerName || undefined : undefined,
      authorizedRepName: signatoryMode === 'recipientPropertyOfficerAuthorizedRep' ? authorizedRepName || undefined : undefined,
      signatoryMode,
      personnelId: selectedPersonnel?.id || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-8 overflow-y-auto" onMouseDown={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mb-10" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b rounded-t-xl" style={{ background: '#012061' }}>
          <div className="flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-[#f8931f]" />
            <h2 className="text-sm font-bold text-white">Unified Issuance Wizard</h2>
          </div>
          <button onClick={handleClose} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-1 px-5 py-3 bg-slate-50 border-b">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-1">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${step >= s ? 'bg-[#f8931f] text-white' : 'bg-slate-200 text-slate-500'}`}>{s}</span>
              <span className="text-[10px] text-slate-500">{s === 1 ? 'Assets' : s === 2 ? 'Personnel' : 'Agreement'}</span>
              {s < 3 && <ChevronRight className="w-3 h-3 text-slate-300" />}
            </div>
          ))}
        </div>

        <div className="p-5">
          {/* Step 1: Select Assets (multi-select) */}
          {step === 1 && (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-700">Select Assets to Issue</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={assetSearch} onChange={e => setAssetSearch(e.target.value)}
                  placeholder="Search assets by name, serial, property #..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
              </div>

              {/* Selected count */}
              {selectedAssets.length > 0 && (
                <div className="flex items-center gap-2 bg-[#f8931f]/10 px-3 py-2 rounded-lg">
                  <CheckSquare className="w-4 h-4 text-[#f8931f]" />
                  <span className="text-xs font-medium text-[#f8931f]">{selectedAssets.length} asset(s) selected</span>
                </div>
              )}

              {/* Asset list with checkboxes */}
              <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
                {assets.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400 text-center">No available assets</p>
                ) : assets.map(a => {
                  const isSelected = selectedAssets.some(s => s.id === a.id);
                  return (
                    <button key={a.id} onClick={() => toggleAsset(a)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors flex items-center gap-2 ${isSelected ? 'bg-[#f8931f]/5' : ''}`}>
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-[#f8931f] shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300 shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-semibold" style={{ color: '#012061' }}>{a.name}</p>
                        <p className="text-[10px] text-slate-500">{a.type} • {a.manufacturer || '—'} • S/N: {a.serialNumber || '—'}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedAssets.length > 0 && (
                <button onClick={proceedAfterAssetSelection} disabled={lockingAssets}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-[#f8931f] hover:bg-[#e07e0a] disabled:opacity-50 transition-colors">
                  {lockingAssets ? 'Locking assets...' : `Continue with ${selectedAssets.length} asset(s) →`}
                </button>
              )}
            </div>
          )}

          {/* Step 2: Select Personnel */}
          {step === 2 && (
            <div className="space-y-3">
              <button onClick={backToAssets} className="text-xs text-slate-500 hover:text-slate-700 mb-1">← Back to Assets</button>
              <label className="text-xs font-semibold text-slate-700">Select Personnel</label>

              {/* Pre-selected personnel confirmation card */}
              {preselectedPersonnelId && selectedPersonnel && !showChangePersonnel ? (
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                    <p className="text-[10px] text-emerald-600 uppercase tracking-wider font-semibold mb-1">Issuing assets to</p>
                    <p className="text-sm font-bold" style={{ color: '#012061' }}>{selectedPersonnel.fullName}</p>
                    {(selectedPersonnel.designationLookup?.name || selectedPersonnel.designation) && (
                      <p className="text-[10px] text-slate-500">{selectedPersonnel.designationLookup?.name || selectedPersonnel.designation}</p>
                    )}
                    {selectedPersonnel.institution?.name && <p className="text-[10px] text-slate-500">{selectedPersonnel.institution.name}</p>}
                    {(selectedPersonnel.projectLookup?.name || selectedPersonnel.project) && (
                      <p className="text-[10px] text-slate-500">{selectedPersonnel.projectLookup?.name || selectedPersonnel.project}</p>
                    )}
                  </div>
                  <button onClick={() => setStep(3)}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-[#f8931f] hover:bg-[#e07e0a] transition-colors">
                    Continue with {selectedPersonnel.fullName} →
                  </button>
                  <button onClick={() => setShowChangePersonnel(true)}
                    className="w-full py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors">
                    Change Personnel
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input value={personnelSearch} onChange={e => setPersonnelSearch(e.target.value)}
                      placeholder="Search by name, position, project..."
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
                  </div>
                  <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
                    {personnel.length === 0 ? <p className="p-4 text-xs text-slate-400 text-center">No active personnel</p> : personnel.map(pp => (
                      <button key={pp.id} onClick={() => { setSelectedPersonnel(pp); setStep(3); }}
                        className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors ${selectedPersonnel?.id === pp.id ? 'bg-[#f8931f]/5 border-l-2 border-[#f8931f]' : ''}`}>
                        <p className="text-sm font-semibold" style={{ color: '#012061' }}>{pp.fullName}</p>
                        <p className="text-[10px] text-slate-500">{pp.designationLookup?.name || pp.designation || '—'} • {pp.institution?.name || '—'} • {pp.projectLookup?.name || pp.project || '—'}</p>
                      </button>
                    ))}
                  </div>
                  {selectedPersonnel && (
                    <div className="flex items-center gap-2 bg-emerald-50 px-3 py-2 rounded-lg">
                      <Users className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-medium text-emerald-700">Selected: {selectedPersonnel.fullName}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 3: Agreement */}
          {step === 3 && (
            <div className="flex flex-col" style={{ minHeight: '60vh' }}>
              <button onClick={() => setStep(2)} className="text-xs text-slate-500 hover:text-slate-700 mb-4">← Back to Personnel</button>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 flex-1">
                {/* Left Column — Summary */}
                <div className="space-y-3">
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Assets ({selectedAssets.length})</p>
                    {selectedAssets.map(a => (
                      <div key={a.id} className="text-xs py-0.5">
                        <span className="font-semibold" style={{ color: '#012061' }}>{a.name}</span>
                        {a.serialNumber && <span className="text-slate-400 ml-1">· S/N: {a.serialNumber}</span>}
                      </div>
                    ))}
                  </div>

                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Personnel</p>
                    <p className="text-sm font-semibold" style={{ color: '#012061' }}>{selectedPersonnel?.fullName}</p>
                    {(selectedPersonnel?.designationLookup?.name || selectedPersonnel?.designation) && (
                      <p className="text-[10px] text-slate-500 mt-1">{selectedPersonnel.designationLookup?.name || selectedPersonnel?.designation}</p>
                    )}
                    {selectedPersonnel?.institution?.name && <p className="text-[10px] text-slate-500">{selectedPersonnel.institution.name}</p>}
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Agreement Template</label>
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
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#f8931f] focus:border-transparent appearance-none bg-white"
                      >
                        {templatesLoading ? <option value="">Loading templates...</option>
                          : templates.length === 0 ? <option value="">No templates available</option>
                            : templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (Default)' : ''}</option>)}
                      </select>
                      {templatesLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Condition at Issuance</label>
                    <select value={condition} onChange={e => setCondition(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-[#f8931f] focus:border-transparent">
                      <option>New</option><option>Good</option><option>Fair</option><option>Poor</option>
                    </select>
                  </div>

                  {signatoryMode !== 'recipientOnly' && (
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Signatories</label>
                      <div className="space-y-2 mt-1">
                        {(signatoryMode === 'recipientPropertyOfficer' || signatoryMode === 'recipientPropertyOfficerAuthorizedRep') && (
                          <input type="text" value={propertyOfficerName} onChange={e => setPropertyOfficerName(e.target.value)}
                            placeholder="Property Officer name"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
                        )}
                        {signatoryMode === 'recipientPropertyOfficerAuthorizedRep' && (
                          <input type="text" value={authorizedRepName} onChange={e => setAuthorizedRepName(e.target.value)}
                            placeholder="Authorized Representative name"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-[#f8931f] focus:border-transparent" />
                        )}
                      </div>
                    </div>
                  )}
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

              {/* Footer */}
              <div className="sticky bottom-0 bg-white border-t mt-4 pt-4 flex flex-col sm:flex-row gap-3">
                <button onClick={handlePreviewPdf}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 border-[#012061] text-[#012061] hover:bg-[#012061] hover:text-white transition-colors flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4" /> Generate &amp; Preview PDF
                </button>
                <button onClick={handleIssue} disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#f8931f] hover:bg-[#e07e0a] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
                  {saving ? 'Issuing...' : `Issue ${selectedAssets.length} Asset(s)`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}