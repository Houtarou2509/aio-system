import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, apiFetchBlob, ApiError, AUTH_EXPIRED_EVENT } from '../lib/api';
import {
  Users, PlusCircle, Search, Loader2, Eye, X, UserCircle, User, Briefcase, Building2, Calendar, Mail, Phone, Package, FileText, AlertTriangle, CheckCircle2, CheckCircle, Info, ChevronDown, ChevronRight, Edit3, Trash2, ClipboardCheck, FolderOpen, Printer, PenLine,
} from 'lucide-react';
import { CameraCaptureModal } from '../components/ui/CameraCaptureModal';
import BulkIssuanceWizard from '../components/issuances/BulkIssuanceWizard';
import PDFPreviewModal from '../components/issuances/PDFPreviewModal';
import { PermissionGate } from '../components/auth/PermissionGate';
import { RoleGate } from '../components/auth/RoleGate';
import { useAgreementPreview } from '../hooks/useAgreementPreview';

/* ─── Types ─── */
interface Personnel {
  id: string;
  fullName: string;
  designation: string | null;
  projectYear: string | null;
  email: string | null;
  phone: string | null;
  hiredDate: string | null;
  employmentHistory: string | null;
  status: string;
  isReadyForIssuance: boolean;
  createdAt: string;
  activeAssignments: number;
  personnelType: string;
  contractDurationMonths: number | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  institutionId: number | null;
  projectId: number | null;
  designationId: number | null;
  photoUrl: string | null;
  institution?: { id: number; name: string } | null;
  projectLookup?: { id: number; name: string } | null;
  designationLookup?: { id: number; name: string } | null;
}

interface AssignmentWithAsset {
  id: string;
  assignedAt: string;
  returnedAt: string | null;
  condition: string | null;
  notes: string | null;
  asset: { id: string; name: string; serialNumber: string | null; propertyNumber: string | null; status: string } | null;
}

interface ProfileHistoryEntry {
  id: number;
  profileId: string;
  designation: string | null;
  institutionName: string | null;
  projectName: string | null;
  projectYear: string | null;
  hiredDate: string | null;
  loggedAt: string;
}

interface PersonnelDetail extends Personnel {
  assignments: AssignmentWithAsset[];
  historyLogs: ProfileHistoryEntry[];
  signedAgreementPath: string | null;
}

/* ─── Accountability types ─── */
interface AccountabilityData {
  personnel: {
    id: string;
    fullName: string;
    designation: string | null;
    project: string | null;
    institution: string | null;
    email: string | null;
  };
  summary: {
    totalAssetsHeld: number;
    totalAssetsReturned: number;
    totalAgreements: number;
    oldestActiveIssuanceDate: string | null;
  };
  activeAssignments: {
    id: string;
    assetId: string;
    assetName: string | null;
    serialNumber: string | null;
    propertyNumber: string | null;
    condition: string | null;
    assignedAt: string;
    agreementDocumentId: string | null;
    documentNumber: string | null;
  }[];
  returnedAssignments: {
    id: string;
    assetId: string;
    assetName: string | null;
    serialNumber: string | null;
    propertyNumber: string | null;
    condition: string | null;
    returnCondition: string | null;
    returnNote: string | null;
    assignedAt: string;
    returnedAt: string;
  }[];
  agreementDocuments: {
    id: string;
    documentNumber: string;
    status: string;
    issuedAt: string;
    assetCount: number;
    recipientSignedAt: string | null;
    signedPdfPath: string | null;
  }[];
}

function DocStatusBadge({ status }: { status: string }) {
  const badgeClass = 'inline-flex min-w-[74px] items-center justify-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold leading-none tracking-wide whitespace-nowrap';
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus === 'returned') {
    return (
      <span className={`${badgeClass} bg-emerald-50 text-emerald-700 border-emerald-200`}>
        <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
        Returned
      </span>
    );
  }

  if (normalizedStatus === 'signed') {
    return (
      <span className={`${badgeClass} bg-sky-50 text-sky-700 border-sky-200`}>
        <PenLine className="h-2.5 w-2.5 shrink-0" />
        Signed
      </span>
    );
  }

  if (normalizedStatus === 'pending_signature') {
    return (
      <span className={`${badgeClass} min-w-[104px] bg-[#f8931f]/10 text-[#f8931f] border-[#f8931f]/20`}>
        Pending Sign-off
      </span>
    );
  }

  if (normalizedStatus === 'issued') {
    return (
      <span className={`${badgeClass} bg-[#012061]/10 text-[#012061] border-[#012061]/20`}>
        Active
      </span>
    );
  }

  return (
    <span className={`${badgeClass} bg-slate-100 text-slate-500 border-slate-200`}>
      {status}
    </span>
  );
}

/* ─── Toast ─── */
type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

function ToastContainer({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div key={t.id}
          className={`flex items-start gap-2 rounded-lg px-4 py-3 shadow-lg text-sm animate-in slide-in-from-right ${
            t.type === 'error' ? 'bg-red-50 border border-red-200 text-red-800'
            : t.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-blue-50 border border-blue-200 text-blue-800'
          }`}
          role="alert"
        >
          <span className="mt-0.5 shrink-0">
            {t.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : t.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Info className="w-4 h-4" />}
          </span>
          <p className="flex-1 text-xs leading-relaxed">{t.message}</p>
          <button onClick={() => dismiss(t.id)} className="shrink-0 text-current opacity-50 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
    </div>
  );
}

let toastId = 0;

/* ─── Session Expired Modal ─── */
function SessionExpiredModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  if (!open) return null;
  const goToLogin = () => {
    onClose();
    navigate('/login', { replace: true });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 dark:bg-slate-800" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 mb-1 dark:text-slate-100">Session Expired</h3>
            <p className="text-sm text-slate-500 mb-4 dark:text-slate-400">Your session has expired for security reasons. Please log in again to continue.</p>
            <button onClick={goToLogin}
              className="w-full rounded-lg bg-[#f8931f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e07e0a] transition-colors">
              Go to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Searchable Dropdown ─── */
interface LookupItem { id: number; name: string; }

function SearchableDropdown({ label, items, value, onChange, placeholder }: {
  label: string;
  items: LookupItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [refEl, setRefEl] = useState<HTMLDivElement | null>(null);
  const selectedItem = items.find(i => String(i.id) === value);

  const filtered = filter
    ? items.filter(i => i.name.toLowerCase().includes(filter.toLowerCase()))
    : items;

  // All selectable options: None + filtered items
  const allOptions: (LookupItem | null)[] = [null, ...filtered];

  const openMenu = () => {
    setIsOpen(true);
    setFilter('');
    // Compute highlighted index from the full unfiltered items list
    const selIdx = selectedItem ? items.findIndex(i => String(i.id) === value) : -1;
    setHighlightIndex(selIdx >= 0 ? selIdx + 1 : 0); // +1 because "None" is index 0
  };

  const closeMenu = () => {
    setIsOpen(false);
    setFilter('');
    setHighlightIndex(-1);
  };

  const selectItem = (item: LookupItem | null) => {
    onChange(item ? String(item.id) : '');
    closeMenu();
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (refEl && !refEl.contains(e.target as Node)) {
        closeMenu();
      }
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, refEl]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu();
        return;
      }
      return;
    }
    // Menu is open
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex(prev => Math.min(prev + 1, allOptions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < allOptions.length) {
          selectItem(allOptions[highlightIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeMenu();
        break;
    }
  };

  return (
    <div className="relative" ref={setRefEl} onKeyDown={handleKeyDown}>
      <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      {/* Trigger button — always visible */}
      <button
        type="button"
        onClick={() => { if (isOpen) closeMenu(); else openMenu(); }}
        className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-left hover:border-slate-300 transition-colors dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500"
      >
        <span className={selectedItem ? 'text-slate-700 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}>
          {selectedItem ? selectedItem.name : placeholder}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {/* Dropdown menu — absolutely positioned overlay */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 border border-[#f8931f] rounded-lg shadow-lg bg-white dark:bg-slate-900">
          <input
            autoFocus
            value={filter}
            onChange={e => { setFilter(e.target.value); setHighlightIndex(0); }}
            placeholder={`Search ${label.toLowerCase()}...`}
            className="w-full border-0 px-3 py-2 text-sm outline-none rounded-t-lg bg-white text-slate-800 placeholder:text-slate-400 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <div className="max-h-36 overflow-y-auto border-t border-slate-200 dark:border-slate-700">
            {/* None option */}
            <button
              type="button"
              onClick={() => selectItem(null)}
              className={`w-full text-left px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 dark:text-slate-500 dark:hover:bg-slate-800 ${highlightIndex === 0 ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
            >
              None
            </button>
            {filtered.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectItem(item)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[#f8931f]/10 transition-colors ${
                  String(item.id) === value ? 'bg-[#f8931f]/10 text-[#f8931f] font-medium' : 'text-slate-700 dark:text-slate-200'
                } ${highlightIndex === idx + 1 ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
              >
                {item.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-400">No results</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Form Modal ─── */
function PersonnelFormModal({ open, onClose, onSave, editing, showToast }: {
  open: boolean; onClose: () => void; onSave: () => void;
  editing: Personnel | null;
  showToast: (type: ToastType, message: string) => void;
}) {
  const [form, setForm] = useState({
    fullName: '', designation: '', designationId: '', email: '', phone: '',
    institutionId: '', projectId: '', projectYear: '', hiredDate: '',
    employmentHistory: '',
  });
  const [saving, setSaving] = useState(false);
  const [institutions, setInstitutions] = useState<LookupItem[]>([]);
  const [projects, setProjects] = useState<LookupItem[]>([]);
  const [designations, setDesignations] = useState<LookupItem[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Load lookups on modal open
  useEffect(() => {
    if (!open) return;
    const loadLookups = async () => {
      try {
        const [instRes, projRes, desigRes] = await Promise.all([
          apiFetch('/lookup/accountability/institutions?activeOnly=true'),
          apiFetch('/lookup/accountability/projects?activeOnly=true'),
          apiFetch('/lookup/accountability/designations?activeOnly=true'),
        ]);
        const instData = Array.isArray(instRes) ? instRes : (instRes.data || []);
        const projData = Array.isArray(projRes) ? projRes : (projRes.data || []);
        const desigData = Array.isArray(desigRes) ? desigRes : (desigRes.data || []);
        setInstitutions(instData);
        setProjects(projData);
        setDesignations(desigData);
      } catch {
        // Silently fail — dropdowns will just be empty
      }
    };
    loadLookups();
  }, [open]);

  useEffect(() => {
    if (editing) {
      setForm({
        fullName: editing.fullName || '',
        designation: editing.designation || '',
        designationId: editing.designationId != null ? String(editing.designationId) : '',
        email: editing.email || '',
        phone: editing.phone || '',
        institutionId: editing.institutionId != null ? String(editing.institutionId) : '',
        projectId: editing.projectId != null ? String(editing.projectId) : '',
        projectYear: editing.projectYear || '',
        hiredDate: editing.hiredDate ? editing.hiredDate.split('T')[0] : '',
        employmentHistory: editing.employmentHistory || '',
      });
      setPhotoPreview(editing.photoUrl || null);
      setPhotoFile(null);
    } else {
      setForm({
        fullName: '', designation: '', designationId: '', email: '', phone: '',
        institutionId: '', projectId: '', projectYear: '', hiredDate: '',
        employmentHistory: '',
      });
      setPhotoPreview(null);
      setPhotoFile(null);
    }
    setPhotoError('');
  }, [editing, open]);

  // Handle captured photo from CameraCaptureModal
  const handleCameraCapture = (blob: Blob) => {
    const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
    setPhotoFile(file);
    // Generate square preview from the blob
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = Math.min(img.width, img.height);
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256);
        setPhotoPreview(canvas.toDataURL('image/jpeg'));
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
    setPhotoError('');
    setCameraError('');
    setShowCamera(false);
  };

  if (!open) return null;

  const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_SIZE = 2 * 1024 * 1024; // 2MB

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setPhotoError('Only JPG, PNG, and WebP images allowed');
      return;
    }
    if (file.size > MAX_SIZE) {
      setPhotoError('Image must be under 2MB');
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handlePhotoRemove = () => {
    setPhotoPreview(null);
    setPhotoFile(null);
    setPhotoError('');
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Upload photo first if selected (need personnel ID for new records)
      let createdId: string | null = null;

      const body: Record<string, any> = {
        fullName: form.fullName,
        designation: form.designation || undefined,
        designationId: form.designationId && form.designationId !== '' ? parseInt(form.designationId, 10) : null,
        email: form.email || undefined,
        phone: form.phone || undefined,
        institutionId: form.institutionId && form.institutionId !== '' ? parseInt(form.institutionId, 10) : null,
        projectId: form.projectId && form.projectId !== '' ? parseInt(form.projectId, 10) : null,
        projectYear: form.projectYear || undefined,
        hiredDate: form.hiredDate || undefined,
      };
      // employmentHistory is create-only
      if (!editing) {
        body.projectYear = form.projectYear || undefined;
        body.employmentHistory = form.employmentHistory || undefined;
      }
      if (editing) {
        await apiFetch(`/personnel/${editing.id}`, { method: 'PATCH', body });
        createdId = editing.id;
      } else {
        const result = await apiFetch('/personnel', { method: 'POST', body });
        createdId = result.id || result.data?.id;
      }

      // Upload photo if one was selected
      if (photoFile && createdId) {
        const formData = new FormData();
        formData.append('photo', photoFile);
        const token = localStorage.getItem('accessToken');
        await fetch(`/api/personnel/${createdId}/photo`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
      }

      // If editing and photo was removed, delete it
      if (editing && editing.photoUrl && !photoPreview && !photoFile) {
        const token = localStorage.getItem('accessToken');
        await fetch(`/api/personnel/${editing.id}/photo`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      showToast('success', editing ? 'Profile updated successfully.' : 'Profile created successfully.');
      onSave();
      onClose();
    } catch (err: any) {
      if (err instanceof ApiError) {
        showToast('error', err.message);
      } else {
        showToast('error', 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 sm:mx-0 max-h-[90vh] flex flex-col dark:bg-slate-800" onClick={e => e.stopPropagation()}>
        {/* Header — pinned top */}
        <div className="flex items-center justify-between px-5 py-4 border-b rounded-t-xl shrink-0" style={{ background: '#012061' }}>
          <h2 className="text-sm font-bold text-white">{editing ? 'Edit Profile' : 'Add Profile'}</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-5 space-y-5 overflow-y-auto flex-1">

          {/* ─── Basic Info ─── */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Basic Info</p>
            {/* Photo + fullName + designation row */}
            <div className="flex gap-4 items-start">
              {/* Profile photo */}
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-slate-200 flex items-center justify-center bg-slate-100 shrink-0 dark:border-slate-700 dark:bg-slate-900">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                  ) : form.fullName ? (
                    <span className="text-xl font-bold text-[#012061] dark:text-slate-100">{getInitials(form.fullName)}</span>
                  ) : (
                    <User className="w-8 h-8 text-slate-300 dark:text-slate-500" />
                  )}
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <label className="text-[10px] font-medium text-[#f8931f] cursor-pointer hover:underline">
                    {photoPreview ? 'Replace' : 'Upload photo'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoSelect} className="hidden" />
                  </label>
                  {!photoPreview && (
                    <button type="button" onClick={() => setShowCamera(true)} className="text-[10px] font-medium text-[#f8931f] hover:underline">Take photo</button>
                  )}
                  {photoPreview && (
                    <button type="button" onClick={handlePhotoRemove} className="text-[10px] font-medium text-red-400 hover:text-red-600">Remove</button>
                  )}
                </div>
              </div>
              {/* fullName + designation */}
              <div className="flex-1 grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 mb-1">Full Name *</label>
                  <input required value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })}
                    placeholder="Full Name" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-[#f8931f] focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500" />
                </div>
                <SearchableDropdown
                  label="Designation"
                  items={designations}
                  value={form.designationId}
                  onChange={id => setForm({ ...form, designationId: id })}
                  placeholder="Select designation..."
                />
              </div>
            </div>
            {photoError && <p className="text-[10px] text-red-500 mt-1">{photoError}</p>}
            {cameraError && <p className="text-[10px] text-amber-600 mt-1">{cameraError}</p>}
            {/* Email + Phone */}
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Email</label>
                <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="Email" type="email" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-[#f8931f] focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Phone</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="Phone" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-[#f8931f] focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500" />
              </div>
            </div>
          </div>

          {/* ─── Assignment Info ─── */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Assignment Info</p>
            <div className="grid grid-cols-2 gap-4">
              <SearchableDropdown
                label="Institution"
                items={institutions}
                value={form.institutionId}
                onChange={id => setForm({ ...form, institutionId: id })}
                placeholder="Select institution..."
              />
              <SearchableDropdown
                label="Project"
                items={projects}
                value={form.projectId}
                onChange={id => setForm({ ...form, projectId: id })}
                placeholder="Select project..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Project Year</label>
                <input value={form.projectYear} onChange={e => setForm({ ...form, projectYear: e.target.value })}
                  placeholder="e.g. 2024" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-[#f8931f] focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Date Hired</label>
                <input value={form.hiredDate} onChange={e => setForm({ ...form, hiredDate: e.target.value })}
                  type="date" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-[#f8931f] focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </div>
            </div>
          </div>

          {/* ─── History ─── */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">History</p>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-1">Employment History / Previous Projects{!editing && ' (create-only)'}</label>
              <textarea value={form.employmentHistory} onChange={e => setForm({ ...form, employmentHistory: e.target.value })}
                placeholder="Employment History / Previous Projects..." rows={3}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-[#f8931f] focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500" />
            </div>
          </div>

          </div>
          {/* Footer buttons — pinned bottom */}
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 shrink-0 bg-white rounded-b-xl dark:border-slate-700 dark:bg-slate-800">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg dark:text-slate-300 dark:hover:bg-slate-700">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-[#f8931f] rounded-lg hover:bg-[#e07e0a] disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
      {/* Camera capture modal */}
      <CameraCaptureModal
        open={showCamera}
        onCapture={handleCameraCapture}
        onClose={() => { setShowCamera(false); setCameraError(null); }}
        storageKey="aio.profileCameraDeviceId"
        defaultFacingMode="user"
        captureMode="square"
        onExternalError={setCameraError}
      />
    </div>
  );
}

function UploadSignedAgreement({ personnelId }: { personnelId: string }) {
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file only.');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/personnel/${personnelId}/signed-agreement`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Upload failed');
      setDone(true);
    } catch (err: any) {
      alert(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-2 text-emerald-600 text-xs font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" /> Uploaded successfully! Close and reopen to view.
      </div>
    );
  }

  return (
    <label className="inline-flex items-center gap-1.5 rounded-lg border border-[#f8931f] px-3 py-1.5 text-xs font-semibold text-[#f8931f] cursor-pointer hover:bg-[#f8931f]/10 transition-colors">
      {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
      {uploading ? 'Uploading...' : 'Upload Signed PDF'}
      <input type="file" accept=".pdf" onChange={handleFileChange} className="hidden" disabled={uploading} />
    </label>
  );
}

/* ─── Detail Modal ─── */
function ProfileDetailModal({ personnel, onClose }: { personnel: PersonnelDetail; onClose: () => void }) {
  const navigate = useNavigate();
  const activeLoans = personnel.assignments.filter(a => !a.returnedAt);
  const pastLoans = personnel.assignments.filter(a => a.returnedAt);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-10 overflow-y-auto" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 sm:mx-0 mb-10 dark:bg-slate-800" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b rounded-t-xl" style={{ background: '#012061' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {personnel.photoUrl ? (
                <img src={personnel.photoUrl} alt={personnel.fullName} className="w-8 h-8 rounded-full object-cover border-2 border-[#f8931f]" />
              ) : (
                <UserCircle className="w-8 h-8 text-[#f8931f]" />
              )}
              <div>
                <h2 className="text-base font-bold text-white">{personnel.fullName}</h2>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-[#f8931f] tracking-widest uppercase">{personnel.status}</p>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${personnel.isReadyForIssuance ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                {personnel.isReadyForIssuance ? 'READY' : 'NOT READY'}
              </span>
            </div>
              </div>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Info cards */}
        <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {personnel.designationLookup?.name && <InfoCard icon={<Briefcase className="w-3.5 h-3.5" />} label="Designation" value={personnel.designationLookup.name} />}
          {!personnel.designationLookup?.name && personnel.designation && <InfoCard icon={<Briefcase className="w-3.5 h-3.5" />} label="Designation" value={personnel.designation} />}
          {personnel.projectLookup?.name && <InfoCard icon={<Package className="w-3.5 h-3.5" />} label="Project" value={personnel.projectLookup.name} />}
          {personnel.institution?.name && <InfoCard icon={<Building2 className="w-3.5 h-3.5" />} label="Institution" value={personnel.institution.name} />}
          {personnel.email && <InfoCard icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={personnel.email} />}
          {personnel.phone && <InfoCard icon={<Phone className="w-3.5 h-3.5" />} label="Phone" value={personnel.phone} />}
          {personnel.hiredDate && <InfoCard icon={<Calendar className="w-3.5 h-3.5" />} label="Hired" value={new Date(personnel.hiredDate).toLocaleDateString()} />}
          {personnel.projectYear && <InfoCard icon={<Calendar className="w-3.5 h-3.5" />} label="Project Year" value={personnel.projectYear} />}
        </div>

        {/* Employment History */}
        {personnel.employmentHistory && (
          <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700">
            <h3 className="text-xs font-semibold text-[#012061] mb-2 flex items-center gap-1.5 dark:text-slate-100">
              <FileText className="w-3.5 h-3.5 text-[#f8931f]" />
              Employment History / Previous Projects
            </h3>
            <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed bg-slate-50 rounded-lg p-3 dark:bg-slate-900 dark:text-slate-300">{personnel.employmentHistory}</p>
          </div>
        )}

        {/* Signed Agreement */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700">
          <h3 className="text-xs font-semibold text-[#012061] mb-2 flex items-center gap-1.5 dark:text-slate-100">
            <FileText className="w-3.5 h-3.5 text-[#f8931f]" />
            Signed Agreement
          </h3>
          {personnel.signedAgreementPath ? (
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  const token = localStorage.getItem('accessToken');
                  const res = await fetch(`/api/personnel/${personnel.id}/signed-agreement`, {
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    alert((data as any).error?.message || 'Failed to load signed agreement');
                    return;
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  window.open(url, '_blank');
                  setTimeout(() => URL.revokeObjectURL(url), 60000);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#f8931f] hover:underline"
              >
                <FileText className="w-3.5 h-3.5" /> View Signed Agreement PDF
              </button>
            </div>
          ) : personnel.assignments.filter(a => !a.returnedAt).length > 0 ? (
            <div>
              <p className="text-xs text-slate-400 italic mb-2">No signed agreement uploaded yet.</p>
              <PermissionGate permissions={['issuances:edit']}>
                <UploadSignedAgreement personnelId={personnel.id} />
              </PermissionGate>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No active possessions — no agreement needed.</p>
          )}
        </div>

        {/* Active Possessions */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-[#012061] flex items-center gap-1.5 dark:text-slate-100">
              <Package className="w-3.5 h-3.5 text-[#f8931f]" />
              Active Possessions ({activeLoans.length})
            </h3>
            {activeLoans.length > 0 && (
              <button
                onClick={() => { onClose(); navigate(`/issuances?personnel=${personnel.id}`); }}
                className="text-[10px] font-semibold text-[#f8931f] hover:underline"
              >
                View in Issuances →
              </button>
            )}
          </div>
          {activeLoans.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No active possessions</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#012061] text-left">
                    <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Asset</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Serial #</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Since</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Condition</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeLoans.map(a => (
                    <tr key={a.id} className="border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
                      <td className="px-3 py-2 font-semibold text-[#012061] dark:text-slate-100">{a.asset?.name || '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 font-mono">{a.asset?.serialNumber || '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{new Date(a.assignedAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2"><span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200">{a.condition || 'Good'}</span></td>
                      <td className="px-3 py-2"><span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-[#012061]/10 dark:bg-slate-700/50 text-[#012061] dark:text-slate-100">ACTIVE</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Past Issuances */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700">
          <h3 className="text-xs font-semibold text-[#012061] mb-2 flex items-center gap-1.5 dark:text-slate-100">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            Past Issuances ({pastLoans.length})
          </h3>
          {pastLoans.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No past issuances</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#012061] text-left">
                    <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Asset</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Serial #</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Borrowed</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Returned</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Condition</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pastLoans.map(a => (
                    <tr key={a.id} className="border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
                      <td className="px-3 py-2 font-semibold text-[#012061] dark:text-slate-100">{a.asset?.name || '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 font-mono">{a.asset?.serialNumber || '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{new Date(a.assignedAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{a.returnedAt ? new Date(a.returnedAt).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2"><span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{a.condition || 'Good'}</span></td>
                      <td className="px-3 py-2"><span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">RETURNED</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Employment History Log */}
        {personnel.historyLogs && personnel.historyLogs.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700">
            <h3 className="text-xs font-semibold text-[#012061] mb-2 flex items-center gap-1.5 dark:text-slate-100">
              <FileText className="w-3.5 h-3.5 text-[#f8931f]" />
              Employment History Log ({personnel.historyLogs.length})
            </h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b">
                  <th className="py-1 text-left">Date Logged</th>
                  <th className="py-1 text-left">Designation</th>
                  <th className="py-1 text-left">Institution</th>
                  <th className="py-1 text-left">Project</th>
                  <th className="py-1 text-left">Year</th>
                  <th className="py-1 text-left">Hired</th>
                </tr>
              </thead>
              <tbody>
                {personnel.historyLogs.map(h => (
                  <tr key={h.id} className="border-b border-slate-100">
                    <td className="py-1.5 text-slate-500">{new Date(h.loggedAt).toLocaleDateString()}</td>
                    <td className="py-1.5 font-medium text-slate-700 dark:text-slate-200">{h.designation || '—'}</td>
                    <td className="py-1.5 text-slate-500">{h.institutionName || '—'}</td>
                    <td className="py-1.5 text-slate-500">{h.projectName || '—'}</td>
                    <td className="py-1.5 text-slate-500">{h.projectYear || '—'}</td>
                    <td className="py-1.5 text-slate-500">{h.hiredDate ? new Date(h.hiredDate).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Accountability Drawer ─── */
function AccountabilityDrawer({
  personnelId,
  personnelName,
  onClose,
  onPreviewAgreement,
}: {
  personnelId: string;
  personnelName: string;
  onClose: () => void;
  onPreviewAgreement: (params: Record<string, any>) => void;
}) {
  const [data, setData] = useState<AccountabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showReturned, setShowReturned] = useState(false);

  const handlePrintSummary = () => {
    if (!data) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const date = new Date().toLocaleString();
    const activeRows = data.activeAssignments.map(a => `
      <tr>
        <td>${a.assetName || '—'}</td>
        <td>${a.serialNumber || '—'}</td>
        <td>${a.propertyNumber || '—'}</td>
        <td>${a.condition || 'Good'}</td>
        <td>${new Date(a.assignedAt).toLocaleDateString()}</td>
        <td>${a.documentNumber || (a.agreementDocumentId ? 'View' : '—')}</td>
      </tr>`).join('');

    printWindow.document.write(`<html><head><title>Accountability Summary - ${data.personnel.fullName}</title>
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #000; background: #fff; }
      h1 { color: #012061; margin-bottom: 0; font-size: 24px; }
      .subtitle { color: #f8931f; font-weight: 600; font-size: 14px; margin: 0; }
      .header-line { border-bottom: 2px solid #012061; margin: 12px 0 16px; }
      .info-row { display: flex; gap: 32px; margin: 6px 0; }
      .info-label { font-weight: 600; color: #333; min-width: 120px; }
      .info-value { color: #000; }
      h2 { color: #012061; font-size: 16px; margin-top: 24px; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th { background: #012061; color: white; padding: 8px 12px; text-align: left; font-size: 12px; }
      td { padding: 8px 12px; border-bottom: 1px solid #ddd; font-size: 13px; }
      .sig-section { margin-top: 48px; }
      .sig-line { margin: 28px 0; }
      .sig-line hr { border: none; border-top: 1px solid #333; width: 220px; margin: 0 0 4px; }
      .sig-label { font-size: 12px; color: #666; }
      .generated-date { font-size: 11px; color: #999; margin-top: 4px; }
      @media print { body { margin: 20px; } }
    </style></head><body>
    <h1>AIO System</h1>
    <p class="subtitle">Personnel Accountability Summary</p>
    <div class="header-line"></div>

    <div class="info-row"><span class="info-label">Name:</span><span class="info-value">${data.personnel.fullName}</span></div>
    ${data.personnel.designation ? `<div class="info-row"><span class="info-label">Designation:</span><span class="info-value">${data.personnel.designation}</span></div>` : ''}
    ${data.personnel.project ? `<div class="info-row"><span class="info-label">Project:</span><span class="info-value">${data.personnel.project}</span></div>` : ''}
    ${data.personnel.institution ? `<div class="info-row"><span class="info-label">Institution:</span><span class="info-value">${data.personnel.institution}</span></div>` : ''}
    ${data.personnel.email ? `<div class="info-row"><span class="info-label">Email:</span><span class="info-value">${data.personnel.email}</span></div>` : ''}

    <h2>Active Assigned Assets (${data.activeAssignments.length})</h2>
    ${data.activeAssignments.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Asset Name</th>
          <th>Serial No.</th>
          <th>Property No.</th>
          <th>Condition at Issue</th>
          <th>Issuance Date</th>
          <th>Agreement Doc #</th>
        </tr>
      </thead>
      <tbody>${activeRows}</tbody>
    </table>` : '<p style="color:#999;font-style:italic;margin-top:8px;">No active assets held.</p>'}

    <h2>Summary</h2>
    <div class="info-row"><span class="info-label">Assets Held:</span><span class="info-value">${data.summary.totalAssetsHeld}</span></div>
    <div class="info-row"><span class="info-label">Assets Returned:</span><span class="info-value">${data.summary.totalAssetsReturned}</span></div>
    <div class="info-row"><span class="info-label">Agreements:</span><span class="info-value">${data.summary.totalAgreements}</span></div>

    <div class="sig-section">
      <div class="sig-line"><hr><div class="sig-label">Acknowledged by</div></div>
      <div class="sig-line"><hr><div class="sig-label">Received by</div></div>
      <div class="sig-line"><hr><div class="sig-label">Date</div></div>
    </div>

    <p class="generated-date">Generated: ${date}</p>
    </body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 300);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiFetch(`/personnel/${personnelId}/accountability`)
      .then(res => { if (!cancelled) setData(res.data); })
      .catch(err => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load accountability data'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [personnelId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 no-print" onClick={onClose} />

      {/* Drawer panel */}
      <div className="relative z-10 w-full max-w-3xl h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 dark:bg-slate-900">
        {/* Header */}
        <div className="px-5 py-4 border-b shrink-0" style={{ background: '#012061' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="w-5 h-5 text-[#f8931f]" />
              <div>
                <h2 className="text-sm font-bold text-white">Accountability Summary</h2>
                <p className="text-[10px] text-white/60">{personnelName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 no-print">
              <RoleGate roles={['ADMIN', 'STAFF_ADMIN']}>
                <button onClick={handlePrintSummary} className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-xs font-medium transition-colors border border-white/30 rounded px-2 py-1 hover:border-white/60">
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
              </RoleGate>
              <button onClick={onClose} className="text-white/70 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-[#f8931f] animate-spin" /></div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : data ? (
            <div className="p-5 space-y-5">
              {/* ─── Info Row ─── */}
              <div className="flex flex-wrap gap-3">
                {data.personnel.designation && (
                  <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-3 py-1.5 dark:bg-slate-800">
                    <Briefcase className="w-3 h-3 text-slate-400" />
                    <span className="text-xs text-slate-700 dark:text-slate-200">{data.personnel.designation}</span>
                  </div>
                )}
                {data.personnel.project && (
                  <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-3 py-1.5 dark:bg-slate-800">
                    <Package className="w-3 h-3 text-slate-400" />
                    <span className="text-xs text-slate-700 dark:text-slate-200">{data.personnel.project}</span>
                  </div>
                )}
                {data.personnel.institution && (
                  <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-3 py-1.5 dark:bg-slate-800">
                    <Building2 className="w-3 h-3 text-slate-400" />
                    <span className="text-xs text-slate-700 dark:text-slate-200">{data.personnel.institution}</span>
                  </div>
                )}
                {data.personnel.email && (
                  <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-3 py-1.5 dark:bg-slate-800">
                    <Mail className="w-3 h-3 text-slate-400" />
                    <span className="text-xs text-slate-700 dark:text-slate-200">{data.personnel.email}</span>
                  </div>
                )}
              </div>

              {/* ─── Summary Bar ─── */}
              <div className="grid grid-cols-4 gap-2 rounded-lg overflow-hidden">
                <div className="bg-[#012061] px-3 py-3 text-center">
                  <p className="text-2xl font-bold text-[#f8931f]">{data.summary.totalAssetsHeld}</p>
                  <p className="text-[10px] text-white/70 uppercase tracking-widest font-semibold mt-0.5">Held</p>
                </div>
                <div className="bg-[#012061] px-3 py-3 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{data.summary.totalAssetsReturned}</p>
                  <p className="text-[10px] text-white/70 uppercase tracking-widest font-semibold mt-0.5">Returned</p>
                </div>
                <div className="bg-[#012061] px-3 py-3 text-center">
                  <p className="text-2xl font-bold text-white">{data.summary.totalAgreements}</p>
                  <p className="text-[10px] text-white/70 uppercase tracking-widest font-semibold mt-0.5">Agreements</p>
                </div>
                <div className="bg-[#012061] px-3 py-3 text-center">
                  <p className="text-sm font-bold text-white">
                    {data.summary.oldestActiveIssuanceDate
                      ? new Date(data.summary.oldestActiveIssuanceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </p>
                  <p className="text-[10px] text-white/70 uppercase tracking-widest font-semibold mt-0.5">Oldest Active</p>
                </div>
              </div>

              {/* ─── Active Assets ─── */}
              <div>
                <h3 className="text-xs font-semibold text-[#012061] flex items-center gap-1.5 mb-2 dark:text-slate-100">
                  <Package className="w-3.5 h-3.5 text-[#f8931f]" />
                  Active Assets ({data.activeAssignments.length})
                </h3>
                {data.activeAssignments.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">No active assets held.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#012061] text-left">
                          <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Asset</th>
                          <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Serial #</th>
                          <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Property No.</th>
                          <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Condition</th>
                          <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Issued</th>
                          <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Agreement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.activeAssignments.map(a => (
                          <tr key={a.id} className="border-b border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800">
                            <td className="px-3 py-2 font-semibold text-[#012061] dark:text-slate-100">{a.assetName || '—'}</td>
                            <td className="px-3 py-2 text-xs text-slate-600 font-mono dark:text-slate-300">{a.serialNumber || '—'}</td>
                            <td className="px-3 py-2 text-xs text-slate-600 font-mono dark:text-slate-300">{a.propertyNumber || '—'}</td>
                            <td className="px-3 py-2">
                              <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-emerald-50 text-emerald-700">{a.condition || 'Good'}</span>
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{new Date(a.assignedAt).toLocaleDateString()}</td>
                            <td className="px-3 py-2">
                              {a.agreementDocumentId ? (
                                <button
                                  onClick={() => onPreviewAgreement({ agreementDocumentId: a.agreementDocumentId, personnelId: data.personnel.id, personnelName: data.personnel.fullName })}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#f8931f] hover:underline"
                                >
                                  <FileText className="w-3 h-3" />
                                  {a.documentNumber || 'View'}
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ─── Returned Assets (collapsed by default) ─── */}
              <div>
                <button
                  onClick={() => setShowReturned(!showReturned)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#012061] hover:text-[#f8931f] transition-colors mb-2 dark:text-slate-100 dark:hover:text-[#f8931f]"
                >
                  {showReturned ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  Returned Assets ({data.returnedAssignments.length})
                </button>
                {showReturned && (
                  data.returnedAssignments.length === 0 ? (
                    <p className="text-xs text-slate-400 italic pl-5">No returned assets yet.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-200 ml-5 dark:border-slate-700">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[#012061] text-left">
                            <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Asset</th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Serial #</th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Issued Cond.</th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Return Cond.</th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Note</th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Returned</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.returnedAssignments.map(a => (
                            <tr key={a.id} className="border-b border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800">
                              <td className="px-3 py-2 font-semibold text-[#012061] dark:text-slate-100">{a.assetName || '—'}</td>
                              <td className="px-3 py-2 text-xs text-slate-600 font-mono dark:text-slate-300">{a.serialNumber || '—'}</td>
                              <td className="px-3 py-2"><span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-emerald-50 text-emerald-700">{a.condition || 'Good'}</span></td>
                              <td className="px-3 py-2"><span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide bg-slate-100 text-slate-600">{a.returnCondition || a.condition || '—'}</span></td>
                              <td className="px-3 py-2 text-xs text-slate-500 max-w-[120px] truncate dark:text-slate-400">{a.returnNote || '—'}</td>
                              <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{new Date(a.returnedAt).toLocaleDateString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>

              {/* ─── Agreement Documents ─── */}
              <div>
                <h3 className="text-xs font-semibold text-[#012061] flex items-center gap-1.5 mb-2 dark:text-slate-100">
                  <FolderOpen className="w-3.5 h-3.5 text-[#f8931f]" />
                  Agreement Documents ({data.agreementDocuments.length})
                </h3>
                {data.agreementDocuments.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No agreement documents.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#012061] text-left">
                          <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Doc #</th>
                          <th className="w-[108px] px-3 py-2.5 text-center text-[10px] font-semibold tracking-widest text-white/70 uppercase">Status</th>
                          <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Issued</th>
                          <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Assets</th>
                          <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Signed At</th>
                          <th className="px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.agreementDocuments.map(doc => (
                          <tr key={doc.id} className="border-b border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800">
                            <td className="px-3 py-2 font-semibold text-[#012061] text-xs dark:text-slate-100">{doc.documentNumber}</td>
                            <td className="w-[108px] px-3 py-2 text-center align-middle"><DocStatusBadge status={doc.status} /></td>
                            <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{new Date(doc.issuedAt).toLocaleDateString()}</td>
                            <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{doc.assetCount}</td>
                            <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                              {doc.recipientSignedAt ? new Date(doc.recipientSignedAt).toLocaleDateString() : '—'}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => onPreviewAgreement({ agreementDocumentId: doc.id, personnelId: data.personnel.id, personnelName: data.personnel.fullName })}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#f8931f] hover:underline"
                              >
                                <FileText className="w-3 h-3" /> View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2 dark:bg-slate-800">
      <span className="text-slate-400 mt-0.5">{icon}</span>
      <div><p className="text-[10px] text-slate-500 dark:text-slate-400">{label}</p><p className="text-xs font-medium text-slate-700 dark:text-slate-100">{value}</p></div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function ProfilesPage() {
  const navigate = useNavigate();
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Personnel | null>(null);
  const [detail, setDetail] = useState<PersonnelDetail | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [showBulkWizard, setShowBulkWizard] = useState(false);
  const [bulkWizardPersonnelId, setBulkWizardPersonnelId] = useState<string | undefined>(undefined);
  const [pdfPreview, setPdfPreview] = useState<{
    blobUrl: string | null;
    loading: boolean;
    filename: string;
    personnelId?: string;
    personnelName?: string;
  }>({ blobUrl: null, loading: false, filename: 'agreement.pdf' });
  const [accountabilityId, setAccountabilityId] = useState<string | null>(null);
  const [accountabilityName, setAccountabilityName] = useState<string>('');

  // Shared agreement preview hook for the accountability drawer
  const { preview: agreementPreview, openPreview: openAgreementPreview, closePreview: closeAgreementPreview } = useAgreementPreview();

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Listen for forced session-expiry from API interceptor
  useEffect(() => {
    const handler = () => setSessionExpired(true);
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, []);

  // Close photo lightbox on Escape
  useEffect(() => {
    if (!expandedImage) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedImage(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expandedImage]);

  const fetchPersonnel = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('limit', '50');
      const res = await apiFetch(`/personnel?${params}`);
      setPersonnel(res.data);
      setMeta(res.meta);
    } catch (err: any) {
      if (err instanceof ApiError && err.status !== 401) {
        showToast('error', err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPersonnel();
  }, [search]);

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this profile?')) return;
    try {
      await apiFetch(`/personnel/${id}`, { method: 'DELETE' });
      showToast('success', 'Profile deactivated.');
      fetchPersonnel();
    } catch (err: any) {
      if (err instanceof ApiError) {
        showToast('error', err.message);
      } else {
        showToast('error', 'Failed to deactivate profile.');
      }
    }
  };

  const handleToggleReadiness = async (p: Personnel) => {
    const nextReady = !p.isReadyForIssuance;
    try {
      await apiFetch(`/personnel/${p.id}/readiness`, {
        method: 'PATCH',
        body: { isReady: nextReady },
      });
      setPersonnel(prev => prev.map(item => item.id === p.id ? { ...item, isReadyForIssuance: nextReady } : item));
      setDetail(prev => prev && prev.id === p.id ? { ...prev, isReadyForIssuance: nextReady } : prev);
      showToast('success', `${p.fullName} marked ${nextReady ? 'ready' : 'not ready'} for issuance.`);
    } catch (err: any) {
      if (err instanceof ApiError) {
        showToast('error', err.message);
      } else {
        showToast('error', 'Failed to update readiness.');
      }
    }
  };

  const handleBulkPreviewPdf = useCallback(async (params: Record<string, any>) => {
    setPdfPreview({
      blobUrl: null,
      loading: true,
      filename: 'agreement.pdf',
      personnelId: params.personnelId as string | undefined,
      personnelName: params.personnelName as string | undefined,
    });
    try {
      const blob = await apiFetchBlob('/agreements/pdf', { method: 'POST', body: params });
      const url = URL.createObjectURL(blob);
      setPdfPreview(prev => ({
        ...prev,
        blobUrl: url,
        loading: false,
        filename: `agreement-${Date.now()}.pdf`,
      }));
    } catch (e: any) {
      alert(e instanceof ApiError ? e.message : 'Failed to generate PDF');
      setPdfPreview(prev => ({ ...prev, blobUrl: null, loading: false }));
    }
  }, []);

  const openDetail = async (p: Personnel) => {
    try {
      const res = await apiFetch(`/personnel/${p.id}`);
      setDetail(res.data);
    } catch (err: any) {
      if (err instanceof ApiError) {
        showToast('error', err.message);
      } else {
        showToast('error', 'Failed to load profile details.');
      }
    }
  };

  return (
    <div className="flex flex-col h-screen pt-14 md:pt-0 bg-[#012061] md:bg-transparent">
      <header className="sticky top-[56px] md:top-0 z-30 shrink-0 bg-[#012061] px-4 sm:px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">Profiles</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditing(null); setShowForm(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#f8931f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors">
              <PlusCircle className="w-3.5 h-3.5" /> Add Profile
            </button>
          </div>
        </div>
      </header>

      {/* ═══ CONTENT AREA ════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-auto bg-light-bg dark:bg-slate-900">

      {/* ═══ KPI TILES ═══════════════════════════════════════ */}
      <section className="px-4 sm:px-6 pt-4 shrink-0">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="flex flex-col items-center text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 sm:p-4">
            <div className="flex items-center justify-center gap-2 mb-1.5 sm:mb-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f8931f]/10">
                <Users className="h-5 w-5 text-[#f8931f]" />
              </div>
              <p className="text-xl sm:text-2xl font-bold leading-tight text-[#f8931f]">{personnel.length}</p>
            </div>
            <p className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase">TOTAL PROFILES</p>
          </div>
          <div className="flex flex-col items-center text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 sm:p-4">
            <div className="flex items-center justify-center gap-2 mb-1.5 sm:mb-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f8931f]/10">
                <CheckCircle className="h-5 w-5 text-[#f8931f]" />
              </div>
              <p className="text-xl sm:text-2xl font-bold leading-tight text-[#f8931f]">{personnel.filter(p => p.status === 'active').length}</p>
            </div>
            <p className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase">ACTIVE</p>
          </div>
          <div className="flex flex-col items-center text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 sm:p-4">
            <div className="flex items-center justify-center gap-2 mb-1.5 sm:mb-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f8931f]/10">
                <Package className="h-5 w-5 text-[#f8931f]" />
              </div>
              <p className="text-xl sm:text-2xl font-bold leading-tight text-[#f8931f]">{personnel.reduce((sum, p) => sum + p.activeAssignments, 0)}</p>
            </div>
            <p className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase">ACTIVE ITEMS</p>
          </div>
        </div>
      </section>

      {/* ═══ FILTER BAR ══════════════════════════════════════ */}
      <section className="px-4 sm:px-6 pt-3 pb-2 shrink-0">
        <div className="flex flex-row items-center gap-2 sm:gap-4 flex-wrap sm:flex-nowrap bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name..."
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-9 pr-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors" />
          </div>
        </div>
      </section>

      {/* Toast */}
      {toasts.length > 0 && (
        <div className="shrink-0 px-4 sm:px-6 py-2 bg-[#f8931f]/10 border-b border-[#f8931f]/20 text-sm text-[#012061] dark:text-slate-100 text-center font-medium">
          {toasts[toasts.length - 1]?.message}
        </div>
      )}

      {/* ═══ TABLE ══════════════════════════════════════════ */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 py-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 text-slate-400 animate-spin" /></div>
        ) : personnel.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#f8931f]/10 mb-4">
              <Users className="h-10 w-10 text-[#f8931f]" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">No profiles yet</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-xs">
              Add personnel to start tracking asset accountability.
            </p>
            <button onClick={() => { setEditing(null); setShowForm(true); }}
              className="inline-flex items-center gap-2 rounded-lg bg-[#f8931f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e0841a] shadow-sm transition-colors">
              <PlusCircle className="h-4 w-4" /> Add Profile
            </button>
          </div>
        ) : (
          <>
          <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#012061] text-left">
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Name</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Type</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Designation</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Project</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Year</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Active Items</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Readiness</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase">Status</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {personnel.map(p => (
                  <tr key={p.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-all group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); if (p.photoUrl) setExpandedImage(p.photoUrl); }}
                          className="w-8 h-8 rounded-full overflow-hidden border border-slate-200 dark:border-slate-600 flex items-center justify-center shrink-0 bg-slate-100 dark:bg-slate-700 cursor-pointer hover:ring-2 hover:ring-[#f8931f]/40 hover:border-[#f8931f]/40 transition-all"
                          title={`View photo for ${p.fullName}`}
                          aria-label={`View photo for ${p.fullName}`}
                        >
                          {p.photoUrl ? (
                            <img src={p.photoUrl} alt={p.fullName} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px] font-bold text-[#012061] dark:text-slate-100">{p.fullName.trim().split(/\s+/).length === 1 ? p.fullName.slice(0, 2).toUpperCase() : (p.fullName.trim().split(/\s+/)[0][0] + p.fullName.trim().split(/\s+/).slice(-1)[0][0]).toUpperCase()}</span>
                          )}
                        </button>
                        <button onClick={() => openDetail(p)} className="text-sm font-semibold text-[#012061] hover:underline dark:text-slate-100 dark:hover:text-[#f8931f]">{p.fullName}</button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {p.personnelType === 'contractor' ? (
                        <span className="inline-flex flex-col gap-0.5">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">Contractor</span>
                          {p.contractDurationMonths && (
                            <span className="text-[10px] text-amber-600">
                              {p.contractDurationMonths} mo{p.contractDurationMonths > 1 ? 's' : ''}
                              {p.contractStartDate && p.contractEndDate && (
                                <> · {new Date(p.contractStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(p.contractEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                              )}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">Employee</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{p.designationLookup?.name || p.designation || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{p.projectLookup?.name || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{p.projectYear || '—'}</td>
                    <td className="px-4 py-3">
                      {p.activeAssignments > 0 ? (
                        <button
                          onClick={() => navigate(`/issuances?personnel=${p.id}`)}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f8931f]/10 text-[#f8931f] hover:bg-[#f8931f]/20 transition-colors cursor-pointer"
                        >
                          <Package className="w-3 h-3" />{p.activeAssignments}
                        </button>
                      ) : <span className="text-xs text-slate-400">0</span>}
                    </td>
                    <td className="px-4 py-3">
                      <PermissionGate
                        permissions={['issuances:edit']}
                        fallback={(
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide ${
                            p.isReadyForIssuance
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                              : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                          }`}>
                            {p.isReadyForIssuance ? <CheckCircle2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            {p.isReadyForIssuance ? 'READY' : 'NOT READY'}
                          </span>
                        )}
                      >
                        <button
                          onClick={() => handleToggleReadiness(p)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide transition-colors ${
                            p.isReadyForIssuance
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                              : 'border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                          title="Toggle issuance readiness"
                        >
                          {p.isReadyForIssuance ? <CheckCircle2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          {p.isReadyForIssuance ? 'READY' : 'NOT READY'}
                        </button>
                      </PermissionGate>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide ${p.status === 'active' ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200 border border-emerald-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'}`}>
                        {p.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <PermissionGate permissions={['issuances:create']}>
                          <button onClick={() => { if (p.isReadyForIssuance) { setBulkWizardPersonnelId(p.id); setShowBulkWizard(true); } }}
                            disabled={!p.isReadyForIssuance}
                            className={`p-1.5 rounded-lg transition-colors ${p.isReadyForIssuance ? 'hover:bg-[#f8931f]/10 text-slate-400 hover:text-[#f8931f]' : 'text-slate-300 cursor-not-allowed opacity-50'}`}
                            title={p.isReadyForIssuance ? 'Issue Assets' : 'Mark profile ready before issuing assets'}>
                            <Package className="w-3.5 h-3.5" />
                          </button>
                        </PermissionGate>
                        <button onClick={() => { setAccountabilityId(p.id); setAccountabilityName(p.fullName); }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-[#012061] dark:hover:text-slate-100 transition-colors" title="Accountability">
                          <ClipboardCheck className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openDetail(p)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-[#012061] dark:hover:text-slate-100 transition-colors" title="View">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setEditing(p); setShowForm(true); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-[#f8931f] transition-colors" title="Edit">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-slate-400 hover:text-[#7B1113] transition-colors" title="Deactivate">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-2">
            {personnel.map(p => (
              <div key={p.id} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                {/* Top row: avatar + name + status */}
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (p.photoUrl) setExpandedImage(p.photoUrl); }}
                    className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 dark:border-slate-600 flex items-center justify-center shrink-0 bg-slate-100 dark:bg-slate-700 cursor-pointer hover:ring-2 hover:ring-[#f8931f]/40 hover:border-[#f8931f]/40 transition-all"
                  >
                    {p.photoUrl ? (
                      <img src={p.photoUrl} alt={p.fullName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-[#012061] dark:text-slate-100">{p.fullName.trim().split(/\s+/).length === 1 ? p.fullName.slice(0, 2).toUpperCase() : (p.fullName.trim().split(/\s+/)[0][0] + p.fullName.trim().split(/\s+/).slice(-1)[0][0]).toUpperCase()}</span>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => openDetail(p)} className="text-sm font-bold text-[#012061] hover:underline dark:text-slate-100 dark:hover:text-[#f8931f] truncate">{p.fullName}</button>
                      <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${p.status === 'active' ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200 border border-emerald-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'}`}>
                        {p.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{p.designationLookup?.name || p.designation || '—'}{p.projectLookup?.name ? ` · ${p.projectLookup.name}` : ''}</div>
                  </div>
                </div>
                {/* Details row */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {p.personnelType === 'contractor' ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">Contractor</span>
                  ) : (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">Employee</span>
                  )}
                  {p.activeAssignments > 0 ? (
                    <button
                      onClick={() => navigate(`/issuances?personnel=${p.id}`)}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f8931f]/10 text-[#f8931f] hover:bg-[#f8931f]/20 transition-colors cursor-pointer"
                    >
                      <Package className="w-3 h-3" />{p.activeAssignments}
                    </button>
                  ) : <span className="text-xs text-slate-400">Items: 0</span>}
                  {p.projectYear && <span className="text-[10px] text-slate-500 dark:text-slate-400">{p.projectYear}</span>}
                </div>
                {/* Readiness toggle */}
                <div className="mt-2">
                  <PermissionGate
                    permissions={['issuances:edit']}
                    fallback={(
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide ${
                        p.isReadyForIssuance
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                          : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {p.isReadyForIssuance ? <CheckCircle2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {p.isReadyForIssuance ? 'READY' : 'NOT READY'}
                      </span>
                    )}
                  >
                    <button
                      onClick={() => handleToggleReadiness(p)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide transition-colors ${
                        p.isReadyForIssuance
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                          : 'border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                      title="Toggle issuance readiness"
                    >
                      {p.isReadyForIssuance ? <CheckCircle2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {p.isReadyForIssuance ? 'READY' : 'NOT READY'}
                    </button>
                  </PermissionGate>
                </div>
                {/* Action buttons */}
                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <button onClick={() => openDetail(p)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-[#012061] dark:hover:text-slate-100 transition-colors" title="View">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setEditing(p); setShowForm(true); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-[#f8931f] transition-colors" title="Edit">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <PermissionGate permissions={['issuances:create']}>
                    <button onClick={() => { if (p.isReadyForIssuance) { setBulkWizardPersonnelId(p.id); setShowBulkWizard(true); } }}
                      disabled={!p.isReadyForIssuance}
                      className={`p-1.5 rounded-lg transition-colors ${p.isReadyForIssuance ? 'hover:bg-[#f8931f]/10 text-slate-400 hover:text-[#f8931f]' : 'text-slate-300 cursor-not-allowed opacity-50'}`}
                      title={p.isReadyForIssuance ? 'Issue Assets' : 'Mark profile ready before issuing assets'}>
                      <Package className="w-4 h-4" />
                    </button>
                  </PermissionGate>
                  <button onClick={() => { setAccountabilityId(p.id); setAccountabilityName(p.fullName); }}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-[#012061] dark:hover:text-slate-100 transition-colors" title="Accountability">
                    <ClipboardCheck className="w-4 h-4" />
                  </button>
                  <div className="flex-1" />
                  <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-slate-400 hover:text-[#7B1113] transition-colors" title="Deactivate">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      {/* ═══ PAGINATION ════════════════════════════════════ */}
      {meta && (meta as { totalPages: number; page: number }).totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 border-t border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-2 shrink-0 bg-white dark:bg-slate-800">
          <button className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            disabled={(meta as { page: number }).page <= 1}>Prev</button>
          <span className="text-sm text-slate-500 dark:text-slate-400">Page {(meta as { page: number }).page} of {(meta as { totalPages: number }).totalPages}</span>
          <button className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            disabled={(meta as { page: number }).page >= (meta as { totalPages: number }).totalPages}>Next</button>
        </div>
      )}

      {/* Modals */}
      <PersonnelFormModal open={showForm} onClose={() => setShowForm(false)} onSave={fetchPersonnel} editing={editing} showToast={showToast} />
      {detail && <ProfileDetailModal personnel={detail} onClose={() => setDetail(null)} />}
      {showBulkWizard && (
        <BulkIssuanceWizard
          onClose={() => { setShowBulkWizard(false); setBulkWizardPersonnelId(undefined); }}
          onSave={fetchPersonnel}
          onPreviewPdf={handleBulkPreviewPdf}
          preselectedPersonnelId={bulkWizardPersonnelId}
        />
      )}
      {pdfPreview.blobUrl && (
        <PDFPreviewModal
          open={!!pdfPreview.blobUrl}
          blobUrl={pdfPreview.blobUrl}
          loading={pdfPreview.loading}
          downloadFilename={pdfPreview.filename}
          personnelId={pdfPreview.personnelId}
          personnelName={pdfPreview.personnelName}
          onClose={() => {
            if (pdfPreview.blobUrl) URL.revokeObjectURL(pdfPreview.blobUrl);
            setPdfPreview({ blobUrl: null, loading: false, filename: 'agreement.pdf' });
          }}
        />
      )}
      <SessionExpiredModal open={sessionExpired} onClose={() => setSessionExpired(false)} />

      {/* Accountability Drawer */}
      {accountabilityId && (
        <AccountabilityDrawer
          personnelId={accountabilityId}
          personnelName={accountabilityName}
          onClose={() => { setAccountabilityId(null); setAccountabilityName(''); }}
          onPreviewAgreement={openAgreementPreview}
        />
      )}

      {/* Agreement PDF Preview (from accountability drawer) */}
      {agreementPreview.blobUrl && (
        <PDFPreviewModal
          open={!!agreementPreview.blobUrl}
          blobUrl={agreementPreview.blobUrl}
          loading={agreementPreview.loading}
          downloadFilename={agreementPreview.filename}
          personnelId={agreementPreview.personnelId}
          personnelName={agreementPreview.personnelName}
          agreementDocumentId={agreementPreview.agreementDocumentId}
          signedPdfPath={agreementPreview.signedPdfPath}
          signedUploadedAt={agreementPreview.signedUploadedAt}
          onClose={closeAgreementPreview}
        />
      )}

      {/* ═══ PROFILE PHOTO LIGHTBOX ═══════════════════════════════ */}
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
              alt="Profile photo"
              className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Toast Container */}
      <ToastContainer toasts={toasts} dismiss={dismissToast} />
      </div>{/* close content area */}
    </div>
  );
}
