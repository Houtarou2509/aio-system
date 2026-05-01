import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText, Plus, Trash2, Loader2, Check, Copy, Eye, Upload,
  X, Image as ImageIcon, Star, StarOff, AlertTriangle,
  Wand2, ChevronRight,
} from 'lucide-react';
import { apiFetch, ApiError, AUTH_EXPIRED_EVENT } from '../lib/api';

/* ─── Types ─── */

interface AgreementTemplate {
  id: string;
  name: string;
  title: string;
  content: string;
  headerLogo: string | null;
  defaultLogo: string | null;
  isDefault: boolean;
  defaultPropertyOfficer: string | null;
  defaultAuthorizedRep: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PlaceholderRef {
  key: string;
  description: string;
}

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

/* ─── Sample data for preview ─── */
const SAMPLE_DATA: Record<string, string> = {
  '{{fullName}}': 'Juan Dela Cruz',
  '{{personnelName}}': 'Juan Dela Cruz',
  '{{designation}}': 'Software Engineer',
  '{{designationComma}}': ', Software Engineer',
  '{{project}}': 'AIO System',
  '{{projectText}}': ' (AIO System)',
  '{{assetName}}': 'Dell Latitude 5540',
  '{{serialNumber}}': 'SN-DL-2026-00123',
  '{{propertyNumber}}': 'PN-2026-000456',
  '{{condition}}': 'Good',
  '{{date}}': new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
};

/* ─── Helpers ─── */

function getToken() {
  return localStorage.getItem('accessToken');
}

/** Multipart fetch for template create/update with optional logo file. */
async function multipartRequest(url: string, method: string, data: Record<string, string>, file?: File | null) {
  const form = new FormData();
  Object.entries(data).forEach(([k, v]) => form.append(k, v));
  if (file) form.append('headerLogo', file);

  const token = getToken();
  const res = await fetch(`/api${url}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const json = await res.json();
  if (!json.success) throw new ApiError(json.error?.message || 'Request failed', res.status);
  return json.data;
}

/* ═══════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function AccountabilityTemplatesPage() {
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [placeholders, setPlaceholders] = useState<PlaceholderRef[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Editor state
  const [editName, setEditName] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null);
  const [editLogoPreview, setEditLogoPreview] = useState<string | null>(null);
  const [editPropertyOfficer, setEditPropertyOfficer] = useState('');
  const [editAuthorizedRep, setEditAuthorizedRep] = useState('');

  // Is this a new (unsaved) template?
  const [isNew, setIsNew] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ─── Toast helper ─── */

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  /* ─── Fetch templates + placeholders ─── */

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/agreements/templates');
      const list: AgreementTemplate[] = res.data ?? res;
      setTemplates(list);

      // Auto-select first if none selected
      if (!selectedId && list.length > 0) {
        const first = list[0];
        setSelectedId(first.id);
        populateEditor(first, false);
      }

      // Fetch placeholders once
      if (placeholders.length === 0) {
        try {
          const phRes = await apiFetch('/agreements/placeholders');
          setPlaceholders(phRes.data ?? phRes);
        } catch { /* ignore */ }
      }
    } catch (err: any) {
      if (err.message?.includes('Session expired')) return;
      addToast('error', err.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [selectedId, placeholders.length, addToast]);

  useEffect(() => {
    fetchTemplates();

    const onSessionExpired = () => { /* handled by AuthContext redirect */ };
    window.addEventListener(AUTH_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onSessionExpired);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Populate editor ─── */

  function populateEditor(template: AgreementTemplate, newFlag: boolean) {
    setEditName(template.name || '');
    setEditTitle(template.title || '');
    setEditContent(template.content || '');
    setEditIsDefault(template.isDefault || false);
    setEditLogoFile(null);
    setEditLogoPreview(template.headerLogo || null);
    setEditPropertyOfficer(template.defaultPropertyOfficer || '');
    setEditAuthorizedRep(template.defaultAuthorizedRep || '');
    setIsNew(newFlag);
  }

  /* ─── Select template ─── */

  function selectTemplate(template: AgreementTemplate) {
    setSelectedId(template.id);
    populateEditor(template, false);
  }

  function startNew() {
    const blank: AgreementTemplate = {
      id: '__new__',
      name: '',
      title: '',
      content: '',
      headerLogo: null,
      defaultLogo: null,
      isDefault: false,
      defaultPropertyOfficer: null,
      defaultAuthorizedRep: null,
      createdAt: '',
      updatedAt: '',
    };
    setSelectedId('__new__');
    populateEditor(blank, true);
  }

  /* ─── Logo handling ─── */

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditLogoFile(file);
    setEditLogoPreview(URL.createObjectURL(file));
  }

  function clearLogo() {
    setEditLogoFile(null);
    setEditLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  /* ─── Save ─── */

  async function handleSave() {
    if (!editName.trim()) {
      addToast('error', 'Template name is required');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        name: editName.trim(),
        title: editTitle,
        content: editContent,
        isDefault: String(editIsDefault),
        defaultPropertyOfficer: editPropertyOfficer,
        defaultAuthorizedRep: editAuthorizedRep,
      };

      if (isNew) {
        const created = await multipartRequest(
          '/agreements/templates', 'POST', payload, editLogoFile,
        );
        // Replace placeholder __new__ with real id
        setTemplates(prev => [created, ...prev.filter(t => t.id !== '__new__')]);
        setSelectedId(created.id);
        populateEditor(created, false);
        addToast('success', 'Template created');
      } else if (selectedId) {
        const updated = await multipartRequest(
          `/agreements/templates/${selectedId}`, 'PATCH', payload, editLogoFile,
        );
        setTemplates(prev => prev.map(t => t.id === selectedId ? updated : t));
        // If we changed isDefault, refresh all to reflect changes
        if (editIsDefault) await fetchTemplates();
        populateEditor(updated, false);
        addToast('success', 'Template updated');
      }
    } catch (err: any) {
      addToast('error', err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  /* ─── Delete ─── */

  async function handleDelete(id: string) {
    try {
      setDeleting(id);
      await apiFetch(`/agreements/templates/${id}`, { method: 'DELETE' });
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setEditName('');
        setEditContent('');
        setEditIsDefault(false);
        setIsNew(false);
      }
      addToast('success', 'Template deleted');
    } catch (err: any) {
      addToast('error', err.message || 'Failed to delete template');
    } finally {
      setDeleting(null);
    }
  }

  /* ─── Copy placeholder ─── */

  async function copyPlaceholder(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = key;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    }
  }

  /* ─── Preview helpers ─── */

  function getPreviewContent(): string {
    let result = editContent;
    if (!result) return '';
    for (const [key, value] of Object.entries(SAMPLE_DATA)) {
      result = result.split(key).join(value);
    }
    return result;
  }

  /* ─── Selected template data ─── */

  const selected = templates.find(t => t.id === selectedId);

  /* ─── RENDER ─── */

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Page header — consistent with Accountability section */}
      <header className="shrink-0 bg-[#012061] px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          <div>
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 mb-1" aria-label="Breadcrumb">
              <span className="text-[10px] text-[#f8931f]/70 font-medium">Accountability</span>
              <ChevronRight className="h-3 w-3 text-[#f8931f]/50" />
              <span className="text-[10px] text-white/80 font-semibold">Agreement Templates</span>
            </nav>
            <h1 className="text-lg font-bold text-white tracking-tight">Agreement Templates</h1>
          </div>
          <button
            onClick={() => setShowPreview(true)}
            disabled={!editContent}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-[#f8931f] text-white hover:bg-[#e68410] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Eye className="h-4 w-4" />
            Preview
          </button>
        </div>
      </header>

      {/* ── Main split pane ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ══════════════════════════════════════
            LEFT PANEL — Template list
            ══════════════════════════════════════ */}
        <div className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
          {/* Add new button */}
          <div className="p-3 border-b border-slate-100">
            <button
              onClick={startNew}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm font-semibold bg-[#f8931f] text-white hover:bg-[#e68410] transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Template
            </button>
          </div>

          {/* Template list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
              </div>
            ) : templates.length === 0 && !isNew ? (
              <div className="px-4 py-12 text-center">
                <FileText className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No templates yet</p>
                <p className="text-xs text-slate-400 mt-1">Create your first agreement template</p>
              </div>
            ) : (
              <div className="py-1">
                {/* Show new unsaved template at top if it exists */}
                {isNew && selectedId === '__new__' && (
                  <div className="mx-2 mb-1 rounded-md border-2 border-[#f8931f] bg-orange-50">
                    <div className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Plus className="h-4 w-4 text-[#f8931f]" />
                        <span className="text-sm font-semibold text-[#f8931f]">
                          {editName || 'Untitled Template'}
                        </span>
                      </div>
                      <span className="text-[10px] text-orange-400 mt-1 block">New — unsaved</span>
                    </div>
                  </div>
                )}

                {templates.map(t => {
                  const isSelected = t.id === selectedId;
                  return (
                    <div
                      key={t.id}
                      onClick={() => selectTemplate(t)}
                      className={`group mx-2 mb-0.5 rounded-md cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#012061]/10 border-l-2 border-l-[#f8931f]'
                          : 'hover:bg-slate-50 border-l-2 border-l-transparent'
                      }`}
                    >
                      <div className="px-3 py-3 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <FileText className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-[#012061]' : 'text-slate-400'}`} />
                            <span
                              className={`text-sm font-medium truncate block ${
                                isSelected ? 'text-[#012061]' : 'text-slate-700'
                              }`}
                            >
                              {t.name}
                            </span>
                            {t.isDefault && (
                              <Star className="h-3 w-3 text-[#f8931f] fill-[#f8931f] shrink-0" />
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 pl-[22px]">
                            {new Date(t.createdAt).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })}
                          </p>
                        </div>

                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleDelete(t.id);
                          }}
                          disabled={deleting === t.id}
                          className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-all disabled:opacity-50"
                          title="Delete template"
                        >
                          {deleting === t.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════
            RIGHT PANEL — Editor
            ══════════════════════════════════════ */}
        <div className="flex-1 overflow-y-auto">
          {!selectedId && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <FileText className="h-12 w-12 mb-4 text-slate-300" />
              <p className="text-sm">Select a template or create a new one</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Template Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="e.g., Smart Campus Standard"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#f8931f]/50 focus:border-[#f8931f] transition-shadow"
                />
              </div>

              {/* Set as Default */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editIsDefault}
                  onChange={e => setEditIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#f8931f] focus:ring-[#f8931f]"
                />
                <div>
                  <span className="text-sm font-medium text-slate-700">Set as Default Template</span>
                  <p className="text-xs text-slate-400 mt-0.5">Used when no specific template is chosen during issuance</p>
                </div>
                {editIsDefault ? (
                  <Star className="h-4 w-4 text-[#f8931f] fill-[#f8931f] ml-auto" />
                ) : (
                  <StarOff className="h-4 w-4 text-slate-300 ml-auto" />
                )}
              </label>

              {/* Document Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Document Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  placeholder="e.g., ISSUANCE &amp; ACCOUNTABILITY AGREEMENT"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#f8931f]/50 focus:border-[#f8931f] transition-shadow"
                />
              </div>

              {/* Logo Upload */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Header Logo
                </label>
                <div className="flex items-start gap-4">
                  <div className="shrink-0">
                    {editLogoPreview ? (
                      <div className="relative group">
                        <img
                          src={editLogoPreview}
                          alt="Logo preview"
                          className="h-16 w-auto max-w-[120px] object-contain rounded-md border border-slate-200 bg-white p-1"
                        />
                        <button
                          onClick={clearLogo}
                          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="h-16 w-[120px] border-2 border-dashed border-slate-300 rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-[#f8931f] hover:bg-orange-50 transition-colors"
                      >
                        <ImageIcon className="h-5 w-5 text-slate-400" />
                        <span className="text-[10px] text-slate-400 mt-0.5">Upload logo</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png, image/jpeg"
                      onChange={handleLogoChange}
                      className="hidden"
                    />
                    <p className="text-xs text-slate-400">
                      Upload a PNG or JPG logo (max 5 MB). The logo will appear in the header of the PDF agreement letter.
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#012061] hover:text-[#f8931f] transition-colors"
                    >
                      <Upload className="h-3 w-3" />
                      {editLogoPreview ? 'Change logo' : 'Choose file'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Letter Content */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Letter Body
                </label>
                <div className="relative">
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    placeholder={`Dear {{fullName}}{{designationComma}},\n\nThis letter serves as confirmation that you have been issued the following asset...\n\nAsset: {{assetName}}\nSerial Number: {{serialNumber}}\nProperty Number: {{propertyNumber}}\nCondition: {{condition}}\n\nIssued on: {{date}}\n\nSignature: _______________`}
                    rows={16}
                    className="w-full px-4 py-3 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#f8931f]/50 focus:border-[#f8931f] transition-shadow resize-y leading-relaxed"
                  />
                </div>
              </div>

              {/* Default Signatories */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Default Signatories
                </label>
                <p className="text-xs text-slate-400 mb-3">
                  These names will auto-fill during issuance but can be changed per document.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-600 mb-1">Property Officer</label>
                    <input
                      type="text"
                      value={editPropertyOfficer}
                      onChange={e => setEditPropertyOfficer(e.target.value)}
                      placeholder="e.g., Juan Dela Cruz"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#f8931f]/50 focus:border-[#f8931f] transition-shadow"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-600 mb-1">Authorized Representative</label>
                    <input
                      type="text"
                      value={editAuthorizedRep}
                      onChange={e => setEditAuthorizedRep(e.target.value)}
                      placeholder="e.g., Maria Santos"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#f8931f]/50 focus:border-[#f8931f] transition-shadow"
                    />
                  </div>
                </div>
              </div>

              {/* Placeholder Legend */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Available Placeholders
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {placeholders.map(ph => (
                    <button
                      key={ph.key}
                      onClick={() => copyPlaceholder(ph.key)}
                      className="group flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover:bg-[#012061]/5 transition-colors"
                    >
                      <code className="text-[11px] font-mono font-semibold text-[#012061] bg-[#012061]/8 px-1.5 py-0.5 rounded select-none">
                        {ph.key}
                      </code>
                      <span className="text-[11px] text-slate-500 truncate flex-1">{ph.description}</span>
                      {copiedKey === ph.key ? (
                        <Check className="h-3 w-3 text-green-500 shrink-0" />
                      ) : (
                        <Copy className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-start gap-2 p-3 rounded-md bg-[#f8931f]/5 border border-[#f8931f]/20">
                  <Wand2 className="h-4 w-4 text-[#f8931f] shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-600">
                    Click any placeholder to copy it to your clipboard, then paste it into the letter body above.
                    Use <code className="text-[11px] bg-slate-200 px-1 rounded">{'{{designationComma}}'}</code> to add a comma before the title when it exists (empty otherwise).
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {isNew ? (
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
                      Unsaved template
                    </span>
                  ) : selected ? (
                    <span>Last updated: {new Date(selected.updatedAt).toLocaleDateString()}</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      if (isNew && !editName && !editContent) {
                        setSelectedId(null);
                        setIsNew(false);
                        return;
                      }
                      if (selected) populateEditor(selected, false);
                      else {
                        setEditName('');
                        setEditContent('');
                        setEditIsDefault(false);
                      }
                    }}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !editName.trim()}
                    className="flex items-center gap-2 px-5 py-2 rounded-md text-sm font-semibold bg-[#012061] text-white hover:bg-[#001a4d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        {isNew ? 'Create Template' : 'Save Changes'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════
          PREVIEW MODAL
          ══════════════════════════════════════ */}
      {showPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl flex flex-col max-h-[90vh] max-w-2xl w-full"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h2 className="text-sm font-bold text-[#012061]">
                {editName || 'Untitled'} — Preview
              </h2>
              <button
                onClick={() => setShowPreview(false)}
                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* A4-paper preview */}
            <div className="flex-1 overflow-auto p-6 bg-slate-200 flex justify-center">
              <div
                className="bg-white shadow-md"
                style={{
                  width: '210mm',
                  minHeight: '297mm',
                  maxWidth: '100%',
                  padding: '12.7mm', // 0.5 inch
                  fontFamily: 'Georgia, serif',
                  fontSize: '12px',
                  lineHeight: 1.6,
                  color: '#333',
                }}
              >
                {/* Top letterhead buffer — 1" from top */}
                <div style={{ height: '0.5in' }} />

                {/* Split header: logo left, title center */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex-1">
                    {editLogoPreview && (
                      <img
                        src={editLogoPreview}
                        alt="Template logo"
                        className="h-12 object-contain"
                      />
                    )}
                  </div>
                  <div className="flex-1 text-center">
                    <span className="text-[9px] font-bold tracking-wider text-slate-700">{editTitle || 'ISSUANCE & ACCOUNTABILITY AGREEMENT'}</span>
                  </div>
                  <div className="flex-1" />
                </div>

                {/* Logo preview — redundant section removed, logo shown above */}

                {/* Content with placeholders filled */}
                {getPreviewContent() ? (
                  <pre className="whitespace-pre-wrap font-[inherit] text-[11px]">
                    {getPreviewContent()}
                  </pre>
                ) : (
                  <p className="text-slate-400 italic text-[11px]">
                    Start typing in the editor to see a preview...
                  </p>
                )}

                {/* Signatures */}
                <div className="mt-8 pt-4">
                  <div className="grid grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="border-b border-slate-300 mb-1.5" />
                      <p className="text-[10px] text-slate-600">Juan Dela Cruz</p>
                      <p className="text-[8px] text-slate-400 uppercase tracking-wider">Recipient</p>
                    </div>
                    <div className="text-center">
                      <div className="border-b border-slate-300 mb-1.5" />
                      <p className="text-[10px] text-slate-600">{editPropertyOfficer || '_________________'}</p>
                      <p className="text-[8px] text-slate-400 uppercase tracking-wider">Property Officer</p>
                    </div>
                    <div className="text-center">
                      <div className="border-b border-slate-300 mb-1.5" />
                      <p className="text-[10px] text-slate-600">{editAuthorizedRep || '_________________'}</p>
                      <p className="text-[8px] text-slate-400 uppercase tracking-wider">Authorized Rep.</p>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          TOASTS
          ══════════════════════════════════════ */}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 min-w-[280px] animate-[slideUp_0.3s_ease-out] ${
              toast.type === 'success'
                ? 'bg-emerald-600 text-white'
                : toast.type === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-[#012061] text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <Check className="h-4 w-4 shrink-0" />
            ) : toast.type === 'error' ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : null}
            <span>{toast.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="ml-auto hover:opacity-70"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
