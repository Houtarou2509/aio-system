import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  FileText, Plus, Trash2, Loader2, Check, Copy, Eye, Upload,
  X, Image as ImageIcon, Star, StarOff, AlertTriangle,
  Wand2, Search, ChevronDown,
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
  currentVersion: number;
  versions?: AgreementTemplateVersion[];
  _count?: { versions: number };
  createdAt: string;
  updatedAt: string;
}

interface AgreementTemplateVersion {
  id: string;
  templateId: string;
  versionNumber: number;
  name: string;
  title: string;
  content: string;
  headerLogo: string | null;
  defaultPropertyOfficer: string | null;
  defaultAuthorizedRep: string | null;
  changeSummary: string | null;
  createdAt: string;
}

interface PlaceholderRef {
  key: string;
  description: string;
  group?: string;
}

interface TemplatePreviewState {
  resolvedText: string;
  warnings: string[];
  unresolved: string[];
  valid: boolean;
}

type PreviewMode = 'single' | 'multiple';
type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

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

/** Simple Levenshtein distance for "did you mean" suggestions */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0),
      );
    }
  }
  return dp[m][n];
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
  const [versionHistory, setVersionHistory] = useState<AgreementTemplateVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('single');
  const [previewState, setPreviewState] = useState<TemplatePreviewState>({
    resolvedText: '',
    warnings: [],
    unresolved: [],
    valid: true,
  });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

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

  // Template search (local filter)
  const [templateSearch, setTemplateSearch] = useState('');

  // Insert variable dropdown
  const [insertDropdownOpen, setInsertDropdownOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLTextAreaElement>(null);
  const insertDropdownRef = useRef<HTMLDivElement>(null);

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

  const fetchVersionHistory = useCallback(async (templateId: string) => {
    if (!templateId || templateId === '__new__') {
      setVersionHistory([]);
      return;
    }
    try {
      setLoadingVersions(true);
      const res = await apiFetch(`/agreements/templates/${templateId}/versions`);
      setVersionHistory(res.data ?? res);
    } catch (err: any) {
      if (!err.message?.includes('Session expired')) addToast('error', err.message || 'Failed to load template versions');
    } finally {
      setLoadingVersions(false);
    }
  }, [addToast]);

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
    fetchVersionHistory(template.id);
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
      currentVersion: 1,
      createdAt: '',
      updatedAt: '',
    };
    setSelectedId('__new__');
    setVersionHistory([]);
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
        await fetchVersionHistory(created.id);
        addToast('success', 'Template created');
      } else if (selectedId) {
        const updated = await multipartRequest(
          `/agreements/templates/${selectedId}`, 'PATCH', payload, editLogoFile,
        );
        setTemplates(prev => prev.map(t => t.id === selectedId ? updated : t));
        // If we changed isDefault, refresh all to reflect changes
        if (editIsDefault) await fetchTemplates();
        populateEditor(updated, false);
        await fetchVersionHistory(updated.id);
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

  /* ─── Visual variable picker ─── */

  function insertPlaceholder(key: string) {
    const textarea = contentInputRef.current;
    const insert = key;
    if (!textarea) {
      setEditContent(prev => `${prev}${insert}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setEditContent(prev => `${prev.slice(0, start)}${insert}${prev.slice(end)}`);
    setCopiedKey(key);
    setTimeout(() => {
      textarea.focus();
      const cursor = start + insert.length;
      textarea.setSelectionRange(cursor, cursor);
    }, 0);
    setTimeout(() => setCopiedKey(null), 1200);
  }

  function placeholdersByGroup() {
    return placeholders.reduce<Record<string, PlaceholderRef[]>>((acc, ph) => {
      const group = ph.group || 'General';
      if (!acc[group]) acc[group] = [];
      acc[group].push(ph);
      return acc;
    }, {});
  }

  /* ─── Backend preview/validation — same parser as PDFs ─── */

  useEffect(() => {
    if (!editContent.trim()) {
      setPreviewState({ resolvedText: '', warnings: [], unresolved: [], valid: true });
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        setPreviewLoading(true);
        setPreviewError(null);
        const [previewRes, validationRes] = await Promise.all([
          apiFetch('/agreements/templates/preview', { method: 'POST', body: { content: editContent, mode: previewMode } }),
          apiFetch('/agreements/templates/validate', { method: 'POST', body: { content: editContent } }),
        ]);
        if (cancelled) return;
        const preview = previewRes.data ?? previewRes;
        const validation = validationRes.data ?? validationRes;
        setPreviewState({
          resolvedText: preview.resolvedText || '',
          warnings: validation.warnings || [],
          unresolved: validation.unresolved || [],
          valid: validation.valid !== false,
        });
      } catch (err: any) {
        if (cancelled) return;
        if (err.message?.includes('Session expired')) return;
        setPreviewError(err.message || 'Failed to render backend preview');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [editContent, previewMode]);

  /* ─── Selected template data ─── */

  const selected = templates.find(t => t.id === selectedId);

  useEffect(() => {
    if (selectedId && selectedId !== '__new__') fetchVersionHistory(selectedId);
    if (selectedId === '__new__') setVersionHistory([]);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Variable validation (client-side) ─── */

  const knownVariableNames = useMemo(() => placeholders.map(p => p.key), [placeholders]);

  const variableWarnings = useMemo(() => {
    const warnings: { type: 'unknown' | 'malformed'; raw: string; suggestion?: string }[] = [];
    if (!editContent.trim()) return warnings;

    // Find well-formed {{...}} patterns
    const wellFormedRegex = /\{\{([^{}]+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = wellFormedRegex.exec(editContent)) !== null) {
      const varName = match[1].trim();
      const fullMatch = match[0];
      if (!knownVariableNames.includes(fullMatch)) {
        // Also check against just the inner name (without braces)
        const isKnownInner = knownVariableNames.some(k => k === `{{${varName}}}`);
        if (!isKnownInner) {
          // Find closest match via Levenshtein
          let bestSuggestion: string | undefined;
          let bestDist = Infinity;
          for (const known of knownVariableNames) {
            const inner = known.replace(/^\{\{|\}\}$/g, '');
            const dist = levenshtein(varName, inner);
            if (dist < bestDist && dist <= 2) {
              bestDist = dist;
              bestSuggestion = known;
            }
          }
          warnings.push({ type: 'unknown', raw: fullMatch, suggestion: bestSuggestion });
        }
      }
    }

    // Find malformed patterns: find {{ without matching }}
    const openNoClose = /\{\{(?![^{}]*\}\})/g;
    while ((match = openNoClose.exec(editContent)) !== null) {
      const fragment = editContent.slice(match.index, Math.min(editContent.length, match.index + 30));
      warnings.push({ type: 'malformed', raw: fragment.split('\n')[0] + '…' });
    }

    // Deduplicate
    const seen = new Set<string>();
    return warnings.filter(w => {
      const key = w.raw;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [editContent, knownVariableNames]);

  /* ─── Unsaved changes detection ─── */

  const dirty = useMemo(() => {
    if (isNew) return true; // Always "dirty" when creating new
    if (!selected) return false;
    return (
      editName !== (selected.name || '') ||
      editTitle !== (selected.title || '') ||
      editContent !== (selected.content || '') ||
      editIsDefault !== (selected.isDefault || false) ||
      editPropertyOfficer !== (selected.defaultPropertyOfficer || '') ||
      editAuthorizedRep !== (selected.defaultAuthorizedRep || '') ||
      editLogoFile !== null
    );
  }, [isNew, selected, editName, editTitle, editContent, editIsDefault, editPropertyOfficer, editAuthorizedRep, editLogoFile]);

  // Close insert dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (insertDropdownRef.current && !insertDropdownRef.current.contains(e.target as Node)) {
        setInsertDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  /* ─── Filtered templates ─── */

  const filteredTemplates = useMemo(() => {
    if (!templateSearch.trim()) return templates;
    return templates.filter(t => t.name.toLowerCase().includes(templateSearch.toLowerCase()));
  }, [templates, templateSearch]);

  /* ─── RENDER ─── */

  return (
    <div className="h-full flex flex-col pt-14 md:pt-0 bg-[#012061] md:bg-transparent">
      {/* ═══ STICKY NAVY HEADER ═════════════════════════════ */}
      <header className="sticky top-14 md:top-0 z-30 shrink-0 bg-[#012061] px-4 md:px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f8931f]/20">
              <FileText className="h-5 w-5 text-[#f8931f]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-white tracking-tight leading-tight">Agreement Templates</h1>
              <p className="text-[11px] text-white/50 hidden sm:block truncate">Create and manage accountability agreement letter templates.</p>
            </div>
          </div>
          <button
            onClick={() => setShowPreview(true)}
            disabled={!editContent}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-[#f8931f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Eye className="h-4 w-4" />
            Preview
          </button>
        </div>
        {/* Mobile preview button */}
        <div className="sm:hidden mt-3">
          <button
            onClick={() => setShowPreview(true)}
            disabled={!editContent}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#f8931f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Eye className="h-4 w-4" />
            Preview
          </button>
        </div>
      </header>

      {/* ═══ CONTENT AREA ════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-auto bg-slate-50 dark:bg-slate-900">

      {/* ── Main split pane ── */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* ══════════════════════════════════════
            LEFT PANEL — Template list (desktop)
            ══════════════════════════════════════ */}
        <div className="hidden md:flex w-80 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-col shrink-0">
          {/* Add new + search */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-700 space-y-2">
            <button
              onClick={startNew}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm font-semibold bg-[#f8931f] text-white hover:bg-[#e68410] transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Template
            </button>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={templateSearch}
                onChange={e => setTemplateSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#f8931f]/50 focus:border-[#f8931f] transition-shadow placeholder:text-slate-400"
              />
              {templateSearch && (
                <button
                  onClick={() => setTemplateSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
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
                <p className="text-sm text-slate-500 dark:text-slate-400">No templates yet</p>
                <p className="text-xs text-slate-400 mt-1">Create your first agreement template</p>
              </div>
            ) : (
              <div className="py-1">
                {/* Show new unsaved template at top if it exists */}
                {isNew && selectedId === '__new__' && (
                  <div className="mx-2 mb-1 rounded-md border-2 border-[#f8931f] bg-orange-50 border-l-[3px] border-l-[#f8931f]">
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

                {filteredTemplates.map(t => {
                  const isSelected = t.id === selectedId;
                  return (
                    <div
                      key={t.id}
                      onClick={() => selectTemplate(t)}
                      className={`group mx-2 mb-0.5 rounded-md cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-orange-50 dark:bg-slate-700/50 border-l-[3px] border-l-[#f8931f]'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700 border-l-[3px] border-l-transparent'
                      }`}
                    >
                      <div className="px-3 py-3 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <FileText className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-[#012061] dark:text-slate-100' : 'text-slate-400'}`} />
                            <span
                              className={`text-sm font-medium truncate block ${
                                isSelected ? 'text-[#012061] dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {t.name}
                            </span>
                            {t.isDefault && (
                              <Star className="h-3 w-3 text-[#f8931f] fill-[#f8931f] shrink-0" />
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 pl-[22px]">
                            v{t.currentVersion || 1} · {t._count?.versions ?? t.currentVersion ?? 1} revision{(t._count?.versions ?? t.currentVersion ?? 1) === 1 ? '' : 's'} · {new Date(t.createdAt).toLocaleDateString('en-US', {
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
            <div className="flex flex-col min-h-full">
              {/* ── Mobile template selector (md:hidden) ── */}
              <div className="md:hidden p-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={selectedId || ''}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '__new__') {
                        startNew();
                      } else {
                        const t = templates.find(t => t.id === val);
                        if (t) selectTemplate(t);
                      }
                    }}
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#f8931f]/50 focus:border-[#f8931f]"
                  >
                    <option value="" disabled>Select template...</option>
                    <option value="__new__" className="text-[#f8931f] font-semibold">+ New Template</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.isDefault ? '⭐ ' : ''}{t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={startNew}
                    className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-md text-xs font-semibold bg-[#f8931f] text-white hover:bg-[#e0841a] transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* ── Editor sections ── */}
              <div className="flex-1 max-w-4xl mx-auto w-full px-4 md:px-6 py-6 space-y-0">

                {/* ═══ SECTION A: Template Settings ═══════════════ */}
                <div className="space-y-5 pb-6">
                  {/* Template Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                      Template Name
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="e.g., Smart Campus Standard"
                      className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-[#f8931f]/50 focus:border-[#f8931f] transition-shadow"
                    />
                  </div>

                  {/* Set as Default */}
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editIsDefault}
                      onChange={e => setEditIsDefault(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-[#f8931f] focus:ring-[#f8931f]"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Set as Default Template</span>
                      <p className="text-xs text-slate-400 mt-0.5">Used when no specific template is chosen during issuance</p>
                    </div>
                    {editIsDefault ? (
                      <Star className="h-4 w-4 text-[#f8931f] fill-[#f8931f] shrink-0" />
                    ) : (
                      <StarOff className="h-4 w-4 text-slate-300 shrink-0" />
                    )}
                  </label>

                  {/* Document Title */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                      Document Title
                    </label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      placeholder="e.g., ISSUANCE & ACCOUNTABILITY AGREEMENT"
                      className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-[#f8931f]/50 focus:border-[#f8931f] transition-shadow"
                    />
                  </div>

                  {/* Logo Upload */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                      Header Logo
                    </label>
                    <div className="flex items-start gap-4">
                      <div className="shrink-0">
                        {editLogoPreview ? (
                          <div className="relative group">
                            <img
                              src={editLogoPreview}
                              alt="Logo preview"
                              className="h-16 w-auto max-w-[120px] object-contain rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1"
                            />
                            <button
                              onClick={clearLogo}
                              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-50 dark:bg-red-900 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            className="h-16 w-[120px] border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-[#f8931f] hover:bg-orange-50 transition-colors"
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
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#012061] dark:text-slate-100 hover:text-[#f8931f] transition-colors"
                        >
                          <Upload className="h-3 w-3" />
                          {editLogoPreview ? 'Change logo' : 'Choose file'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ═══ SECTION B: Letter Content ═══════════════ */}
                <div className="flex items-center gap-3 pt-4 pb-1">
                  <div className="w-1.5 h-3.5 rounded-full bg-[#f8931f]" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Letter Content</span>
                  <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
                </div>

                <div className="pt-3 space-y-4">
                  {/* Helper text */}
                  <p className="text-xs text-slate-400">
                    Use variables like <code className="text-[11px] bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{fullName}}'}</code> and smart blocks like <code className="text-[11px] bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{assetSection}}'}</code>.
                  </p>

                  {/* Desktop: two-column layout with variable picker */}
                  <div className="hidden md:flex gap-6">
                    {/* Textarea (left) */}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Letter Body
                        </label>
                        {/* Insert variable dropdown */}
                        <div className="relative" ref={insertDropdownRef}>
                          <button
                            onClick={() => setInsertDropdownOpen(!insertDropdownOpen)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#012061] dark:text-slate-200 bg-slate-100 dark:bg-slate-700 rounded hover:bg-orange-100 dark:hover:bg-slate-600 transition-colors"
                          >
                            <Wand2 className="h-3 w-3 text-[#f8931f]" />
                            Insert variable
                            <ChevronDown className="h-3 w-3" />
                          </button>
                          {insertDropdownOpen && (
                            <div className="absolute right-0 top-full mt-1 w-64 max-h-72 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-20">
                              {Object.entries(placeholdersByGroup()).map(([group, items]) => (
                                <div key={group} className="border-b border-slate-100 dark:border-slate-700 last:border-b-0">
                                  <div className="px-3 pt-2 pb-1">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#012061] dark:text-slate-200">{group}</span>
                                  </div>
                                  {items.map(ph => (
                                    <button
                                      key={ph.key}
                                      onClick={() => { insertPlaceholder(ph.key); setInsertDropdownOpen(false); }}
                                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                    >
                                      <code className="text-[11px] font-mono font-semibold text-[#012061] dark:text-slate-200">{ph.key}</code>
                                      <span className="text-[11px] text-slate-400 truncate">{ph.description}</span>
                                    </button>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <textarea
                        ref={contentInputRef}
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        placeholder={`Dear {{fullName}}{{designationComma}},\n\nThis letter confirms that you have been issued the following asset(s):\n\n{{assetSection}}\n\nIssued on: {{date}}`}
                        rows={20}
                        className="w-full px-4 py-3 text-sm font-mono border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-[#f8931f]/50 focus:border-[#f8931f] transition-shadow resize-y leading-relaxed"
                      />
                      {/* Variable validation warnings */}
                      {variableWarnings.length > 0 && (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">Variable warnings</span>
                          </div>
                          <ul className="space-y-0.5 pl-1">
                            {variableWarnings.map((w, i) => (
                              <li key={i} className="text-[11px] text-amber-700 dark:text-amber-300">
                                {w.type === 'unknown' ? (
                                  <>
                                    Unknown variable: <code className="font-mono font-semibold">{w.raw}</code>
                                    {w.suggestion && (
                                      <span className="text-amber-600 dark:text-amber-400"> — Did you mean <code className="font-mono font-semibold">{w.suggestion}</code>?</span>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    Malformed variable: <code className="font-mono font-semibold">{w.raw}</code>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Variable Picker (right, desktop) */}
                    <div className="w-64 shrink-0">
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                        Variables
                      </label>
                      <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 max-h-[520px] overflow-y-auto">
                        {Object.entries(placeholdersByGroup()).map(([group, items]) => (
                          <div key={group}>
                            <div className="mb-1.5 flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#f8931f]" />
                              <span className="text-[10px] font-bold uppercase tracking-widest text-[#012061] dark:text-slate-100">{group}</span>
                            </div>
                            <div className="grid grid-cols-1 gap-1">
                              {items.map(ph => (
                                <button
                                  key={ph.key}
                                  onClick={() => insertPlaceholder(ph.key)}
                                  className="group/btn flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover:bg-[#012061]/5 dark:hover:bg-slate-700/40 transition-colors"
                                >
                                  <code className="text-[11px] font-mono font-semibold text-[#012061] dark:text-slate-100 bg-[#012061]/8 px-1.5 py-0.5 rounded select-none truncate max-w-[140px]">
                                    {ph.key}
                                  </code>
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex-1">{ph.description}</span>
                                  {copiedKey === ph.key ? <Check className="h-3 w-3 text-green-500 shrink-0" /> : <Copy className="h-3 w-3 text-slate-300 opacity-0 group-hover/btn:opacity-100 shrink-0 transition-opacity" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-start gap-2 p-3 rounded-md bg-[#f8931f]/5 border border-[#f8931f]/20">
                        <Wand2 className="h-4 w-4 text-[#f8931f] shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          Click a variable to insert it at the cursor. Use <code className="text-[11px] bg-slate-200 dark:bg-slate-700 px-1 rounded">{'{{assetSection}}'}</code> for automatic 1-asset paragraph vs multi-asset table rendering, or wrap custom copy in the single/multiple conditional blocks.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Mobile: textarea + collapsible variable picker */}
                  <div className="md:hidden space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Letter Body
                        </label>
                        {/* Insert variable dropdown (mobile) */}
                        <div className="relative">
                          <button
                            onClick={() => setInsertDropdownOpen(!insertDropdownOpen)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#012061] dark:text-slate-200 bg-slate-100 dark:bg-slate-700 rounded hover:bg-orange-100 dark:hover:bg-slate-600 transition-colors"
                          >
                            <Wand2 className="h-3 w-3 text-[#f8931f]" />
                            Insert
                            <ChevronDown className="h-3 w-3" />
                          </button>
                          {insertDropdownOpen && (
                            <div className="absolute right-0 top-full mt-1 w-64 max-h-72 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-20">
                              {Object.entries(placeholdersByGroup()).map(([group, items]) => (
                                <div key={group} className="border-b border-slate-100 dark:border-slate-700 last:border-b-0">
                                  <div className="px-3 pt-2 pb-1">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#012061] dark:text-slate-200">{group}</span>
                                  </div>
                                  {items.map(ph => (
                                    <button
                                      key={ph.key}
                                      onClick={() => { insertPlaceholder(ph.key); setInsertDropdownOpen(false); }}
                                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                    >
                                      <code className="text-[11px] font-mono font-semibold text-[#012061] dark:text-slate-200">{ph.key}</code>
                                      <span className="text-[11px] text-slate-400 truncate">{ph.description}</span>
                                    </button>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        placeholder={`Dear {{fullName}}{{designationComma}},\n\nThis letter confirms that you have been issued the following asset(s):\n\n{{assetSection}}\n\nIssued on: {{date}}`}
                        rows={20}
                        className="w-full px-4 py-3 text-sm font-mono border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-[#f8931f]/50 focus:border-[#f8931f] transition-shadow resize-y leading-relaxed"
                      />
                      {/* Variable validation warnings (mobile) */}
                      {variableWarnings.length > 0 && (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">Variable warnings</span>
                          </div>
                          <ul className="space-y-0.5 pl-1">
                            {variableWarnings.map((w, i) => (
                              <li key={i} className="text-[11px] text-amber-700 dark:text-amber-300">
                                {w.type === 'unknown' ? (
                                  <>
                                    Unknown: <code className="font-mono font-semibold">{w.raw}</code>
                                    {w.suggestion && (
                                      <span className="text-amber-600 dark:text-amber-400"> — Did you mean <code className="font-mono font-semibold">{w.suggestion}</code>?</span>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    Malformed: <code className="font-mono font-semibold">{w.raw}</code>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Collapsible Variable Picker (mobile) */}
                    <details className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                      <summary className="px-3 py-2 cursor-pointer text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider select-none">
                        📋 Variables & Placeholders
                      </summary>
                      <div className="px-3 pb-3 space-y-3 max-h-[400px] overflow-y-auto">
                        {Object.entries(placeholdersByGroup()).map(([group, items]) => (
                          <div key={group}>
                            <div className="mb-1.5 flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#f8931f]" />
                              <span className="text-[10px] font-bold uppercase tracking-widest text-[#012061] dark:text-slate-100">{group}</span>
                            </div>
                            <div className="space-y-0.5">
                              {items.map(ph => (
                                <button
                                  key={ph.key}
                                  onClick={() => insertPlaceholder(ph.key)}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover:bg-[#012061]/5 dark:hover:bg-slate-700/40 transition-colors"
                                >
                                  <code className="text-[11px] font-mono font-semibold text-[#012061] dark:text-slate-100 bg-[#012061]/8 px-1.5 py-0.5 rounded select-none">{ph.key}</code>
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex-1">{ph.description}</span>
                                  {copiedKey === ph.key ? <Check className="h-3 w-3 text-green-500 shrink-0" /> : <Copy className="h-3 w-3 text-slate-300 shrink-0" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>

                {/* ═══ SECTION C: Default Signatories ═══════════════ */}
                <div className="flex items-center gap-3 pt-6 pb-1">
                  <div className="w-1.5 h-3.5 rounded-full bg-[#f8931f]" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Default Signatories</span>
                  <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
                </div>

                <div className="pt-3 space-y-4">
                  <p className="text-xs text-slate-400">
                    These names will auto-fill during issuance but can be changed per document.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Property Officer</label>
                      <input
                        type="text"
                        value={editPropertyOfficer}
                        onChange={e => setEditPropertyOfficer(e.target.value)}
                        placeholder="e.g., Juan Dela Cruz"
                        className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-[#f8931f]/50 focus:border-[#f8931f] transition-shadow"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Authorized Representative</label>
                      <input
                        type="text"
                        value={editAuthorizedRep}
                        onChange={e => setEditAuthorizedRep(e.target.value)}
                        placeholder="e.g., Maria Santos"
                        className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-[#f8931f]/50 focus:border-[#f8931f] transition-shadow"
                      />
                    </div>
                  </div>
                </div>

                {/* ═══ SECTION D: Revision History ═══════════════ */}
                {!isNew && selected && (
                  <>
                    <div className="flex items-center gap-3 pt-6 pb-1">
                      <div className="w-1.5 h-3.5 rounded-full bg-[#f8931f]" />
                      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Revision History</span>
                      <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
                    </div>

                    <div className="pt-3">
                      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                        {loadingVersions ? (
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading revisions...
                          </div>
                        ) : versionHistory.length === 0 ? (
                          <p className="text-xs text-slate-400">No saved revision rows yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {versionHistory.map(version => (
                              <div key={version.id} className="flex items-start justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/50">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-[#012061] px-2 py-0.5 font-semibold text-white">v{version.versionNumber}</span>
                                    <span className="truncate font-medium text-slate-700 dark:text-slate-200">{version.name}</span>
                                  </div>
                                  <p className="mt-1 truncate text-[11px] text-slate-400">{version.changeSummary || 'Saved revision'} · {version.title}</p>
                                </div>
                                <span className="shrink-0 text-[11px] text-slate-400">{new Date(version.createdAt).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ═══ Health Summary ═══════════════ */}
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
                      {editIsDefault ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#f8931f]/10 border border-[#f8931f]/30 px-2.5 py-0.5 font-semibold text-[#f8931f]">
                          <Star className="h-3 w-3" /> Default
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 dark:border-slate-600 px-2.5 py-0.5 font-medium text-slate-400">
                          Not default
                        </span>
                      )}
                      {editLogoPreview ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
                          <ImageIcon className="h-3 w-3" /> Logo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                          <ImageIcon className="h-3 w-3" /> No logo
                        </span>
                      )}
                      {variableWarnings.length === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
                          Variables OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3" /> {variableWarnings.length} warning{variableWarnings.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      <span className="text-slate-400">
                        Last saved: {new Date(selected.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </>
                )}

                {/* Spacer for sticky footer */}
                <div className="h-20" />
              </div>

              {/* ═══ STICKY SAVE FOOTER ═════════════════════════════ */}
              <div className="sticky bottom-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 z-10 px-4 md:px-6 py-3">
                <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    {dirty ? (
                      <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                        <span className="h-2 w-2 rounded-full bg-[#f8931f] animate-pulse" />
                        Unsaved changes
                      </span>
                    ) : !isNew && selected ? (
                      <span className="text-slate-400">
                        Last updated: {new Date(selected.updatedAt).toLocaleDateString()}
                      </span>
                    ) : null}
                    {isNew && (
                      <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        New template
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
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
                      className="px-4 py-2 text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      Reset
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !editName.trim() || (!isNew && !dirty)}
                      className="inline-flex items-center gap-2 px-5 py-2 rounded-md text-sm font-semibold bg-[#012061] text-white hover:bg-[#001a4d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
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
            className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl flex flex-col max-h-[90vh] max-w-2xl w-full"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex flex-col gap-3 px-5 py-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-[#012061] dark:text-slate-100">
                    {editName || 'Untitled'} — Backend Preview
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Rendered by the same parser used for final agreement PDFs.
                  </p>
                </div>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900">
                  {(['single', 'multiple'] as PreviewMode[]).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPreviewMode(mode)}
                      className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                        previewMode === mode
                          ? 'bg-[#012061] text-white shadow-sm'
                          : 'text-slate-500 hover:bg-white hover:text-[#012061] dark:hover:bg-slate-800'
                      }`}
                    >
                      {mode === 'single' ? 'Single asset' : 'Multiple assets'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  {previewLoading ? (
                    <span className="inline-flex items-center gap-1.5 text-slate-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering...
                    </span>
                  ) : previewState.valid ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-600">
                      <Check className="h-3.5 w-3.5" /> Template syntax OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" /> Needs attention
                    </span>
                  )}
                </div>
              </div>
              {(previewError || previewState.warnings.length > 0) && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {previewError ? (
                    <p>{previewError}</p>
                  ) : (
                    <ul className="list-disc space-y-1 pl-4">
                      {previewState.warnings.map(warning => <li key={warning}>{warning}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* A4-paper preview */}
            <div className="flex-1 overflow-auto p-6 bg-slate-200 dark:bg-slate-700 flex justify-center">
              <div
                className="bg-white dark:bg-slate-800 shadow-md"
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
                    <span className="text-[9px] font-bold tracking-wider text-slate-700 dark:text-slate-300">{editTitle || 'ISSUANCE & ACCOUNTABILITY AGREEMENT'}</span>
                  </div>
                  <div className="flex-1" />
                </div>

                {/* Content with placeholders filled */}
                {previewLoading && !previewState.resolvedText ? (
                  <div className="flex items-center gap-2 text-slate-400 italic text-[11px]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering backend preview...
                  </div>
                ) : previewState.resolvedText ? (
                  <pre className="whitespace-pre-wrap font-[inherit] text-[11px]">
                    {previewState.resolvedText}
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
                      <div className="border-b border-slate-300 dark:border-slate-600 mb-1.5" />
                      <p className="text-[10px] text-slate-600 dark:text-slate-400">Juan Dela Cruz</p>
                      <p className="text-[8px] text-slate-400 uppercase tracking-wider">Recipient</p>
                    </div>
                    <div className="text-center">
                      <div className="border-b border-slate-300 dark:border-slate-600 mb-1.5" />
                      <p className="text-[10px] text-slate-600 dark:text-slate-400">{editPropertyOfficer || '_________________'}</p>
                      <p className="text-[8px] text-slate-400 uppercase tracking-wider">Property Officer</p>
                    </div>
                    <div className="text-center">
                      <div className="border-b border-slate-300 dark:border-slate-600 mb-1.5" />
                      <p className="text-[10px] text-slate-600 dark:text-slate-400">{editAuthorizedRep || '_________________'}</p>
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
            className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 min-w-0 sm:min-w-[280px] animate-[slideUp_0.3s_ease-out] ${
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
      </div>{/* close content area */}
    </div>
  );
}