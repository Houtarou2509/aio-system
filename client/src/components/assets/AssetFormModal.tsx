import { useState, FormEvent, useEffect, useRef, useCallback } from 'react';
import { Asset } from '../../lib/api';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useLookupOptions } from '@/hooks/useLookupOptions';
import { Sparkles, X, Upload, Pencil, Plus, Camera, CameraOff, Check, RotateCcw } from 'lucide-react';

const ASSET_STATUSES = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST'];

/** Resolve asset image URL — prepend base path if relative */
function getImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  // In dev: Vite proxy handles /uploads → :3001
  // In production: images served at /aio-system/uploads/xxx
  if (url.startsWith('/uploads')) {
    if (import.meta.env.DEV) return url;
    const base = import.meta.env.BASE_URL?.replace(/\/+$/, '') || '/aio-system';
    return `${base}${url}`;
  }
  return url;
}

interface Supplier {
  id: string;
  name: string;
}

interface SuggestionResult {
  type?: string;
  manufacturer?: string;
  usefulLifeYears?: number;
  warrantyYears?: number;
  confidence?: 'high' | 'medium' | 'low';
}

interface Props {
  asset?: Asset | null;
  onSubmit: (data: any) => void;
  onClose: () => void;
  onImageUpload?: (id: string, file: File) => void;
}

export function AssetFormModal({ asset, onSubmit, onClose, onImageUpload: _onImageUpload }: Props) {
  const isEdit = !!asset;
  const [form, setForm] = useState({
    name: asset?.name || '',
    type: asset?.type ?? '',
    manufacturer: asset?.manufacturer ?? '',
    serialNumber: asset?.serialNumber || '',
    purchasePrice: asset?.purchasePrice != null ? String(asset.purchasePrice) : '',
    purchaseDate: asset?.purchaseDate ? new Date(asset.purchaseDate).toISOString().split('T')[0] : '',
    supplierId: (asset as any)?.supplierId ?? null as string | null,
    propertyNumber: (asset as any)?.propertyNumber || '',
    status: asset?.status || 'AVAILABLE',
    location: asset?.location ?? '',
    remarks: (asset as any)?.remarks || '',
    warrantyExpiry: (asset as any)?.warrantyExpiry ? new Date((asset as any).warrantyExpiry).toISOString().split('T')[0] : '',
    warrantyNotes: (asset as any)?.warrantyNotes || '',
    depreciationMethod: (asset as any)?.depreciationMethod ?? 'straight_line',
    usefulLifeYears: (asset as any)?.usefulLifeYears ?? 5,
    salvageValue: (asset as any)?.salvageValue != null ? String((asset as any).salvageValue) : '0',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(getImageUrl(asset?.imageUrl) || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serialNumberError, setSerialNumberError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  // AI suggestion review state
  const [suggestions, setSuggestions] = useState<SuggestionResult | null>(null);
  const [suggestionNotes, setSuggestionNotes] = useState<{ type?: string; manufacturer?: string }>({});

  const [aiSuggestedFields, setAiSuggestedFields] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Camera availability state
  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Supplier list
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);

  // Dynamic lookup lists via hook
  const { options: typeOptions, isLoading: typeLoading } = useLookupOptions('asset-types');
  const { options: manufacturerOptions, isLoading: manufacturerLoading } = useLookupOptions('manufacturers');
  const { options: locationOptions, isLoading: locationLoading } = useLookupOptions('locations');

  // Check camera availability on mount
  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraAvailable(false);
      return;
    }
    // Camera input support: check if the device has video input
    // We also check if the HTML capture attribute is supported
    try {
      const testEl = document.createElement('input');
      if (testEl.capture !== undefined) {
        setCameraAvailable(true);
      } else {
        setCameraAvailable(false);
      }
    } catch {
      setCameraAvailable(false);
    }
  }, []);

  // Fetch suppliers on mount
  useEffect(() => {
    setSuppliersLoading(true);
    const token = localStorage.getItem('accessToken');
    fetch('/api/suppliers', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setSuppliers(d.data); })
      .catch(() => {})
      .finally(() => setSuppliersLoading(false));
  }, []);

  // Generate preview when image selected
  useEffect(() => {
    if (!imageFile) {
      if (isEdit && asset?.imageUrl) setImagePreview(getImageUrl(asset.imageUrl));
      else setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // Handle file upload via file input
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        setError('Please select a JPG, PNG, or WebP image.');
        e.target.value = '';
        return;
      }
      setError(null);
      setImageFile(file);
    }
    // Reset input value so same file can be re-selected
    e.target.value = '';
  }, []);

  // Handle camera capture
  const handleCameraCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        setError('Camera captured an unsupported format. Please try again or use Upload instead.');
        e.target.value = '';
        return;
      }
      setError(null);
      setImageFile(file);
      setCameraError(null);
    }
    e.target.value = '';
  }, []);

  // Open camera with error handling
  const openCamera = useCallback(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera is not available on this device.');
      return;
    }
    // Try to get camera permission first
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        // Stop the stream immediately — we just needed permission
        stream.getTracks().forEach(t => t.stop());
        setCameraAvailable(true);
        setCameraError(null);
        cameraInputRef.current?.click();
      })
      .catch((err: DOMException) => {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setCameraError('Camera permission denied. You can still upload an image instead.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setCameraError('No camera found on this device. You can still upload an image instead.');
        } else {
          setCameraError('Camera is not available. You can still upload an image instead.');
        }
        setCameraAvailable(false);
      });
  }, []);

  const removeImage = useCallback(() => {
    setImageFile(null);
    if (!isEdit || !asset?.imageUrl) {
      setImagePreview(null);
    } else {
      setImagePreview(getImageUrl(asset.imageUrl));
    }
  }, [isEdit, asset?.imageUrl]);

  // ── AI Suggest ──
  const handleSuggest = async () => {
    if (!form.name.trim()) return;
    setSuggesting(true);
    setSuggestions(null);
    setSuggestionNotes({});
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assetName: form.name }),
      });
      const d = await res.json();
      if (d.success && d.data.suggestions?.length > 0) {
        const best = d.data.suggestions[0];
        const notes: { type?: string; manufacturer?: string } = {};

        // Validate type against lookup options
        if (best.type) {
          const typeMatch = typeOptions.find(o => o.value.toLowerCase() === best.type.toLowerCase());
          if (typeMatch) {
            best.type = typeMatch.value; // use exact casing from lookup
          } else {
            notes.type = 'No matching lookup value';
            delete best.type;
          }
        }

        // Validate manufacturer against lookup options
        if (best.manufacturer) {
          const mfgMatch = manufacturerOptions.find(o => o.value.toLowerCase() === best.manufacturer.toLowerCase());
          if (mfgMatch) {
            best.manufacturer = mfgMatch.value; // use exact casing from lookup
          } else {
            notes.manufacturer = 'No matching lookup value';
            delete best.manufacturer;
          }
        }

        // Check confidence
        if (best.confidence === 'low' && !best.type && !best.manufacturer && best.usefulLifeYears == null) {
          setSuggestionNotes({ type: 'No confident suggestion' });
          setSuggesting(false);
          return;
        }

        setSuggestionNotes(notes);
        setSuggestions(best);
      } else {
        setSuggestionNotes({ type: 'No confident suggestion' });
      }
    } catch {
      setSuggestionNotes({ type: 'Suggestion failed — try again' });
    } finally {
      setSuggesting(false);
    }
  };

  // Apply a single suggested field
  const applySuggestion = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setAiSuggestedFields(prev => new Set(prev).add(field));
  };

  // Apply all valid suggestions at once
  const applyAllSuggestions = () => {
    if (!suggestions) return;
    const newSuggested = new Set(aiSuggestedFields);
    if (suggestions.type != null) {
      setForm(prev => ({ ...prev, type: suggestions.type! }));
      newSuggested.add('type');
    }
    if (suggestions.manufacturer != null) {
      setForm(prev => ({ ...prev, manufacturer: suggestions.manufacturer! }));
      newSuggested.add('manufacturer');
    }
    if (suggestions.usefulLifeYears != null) {
      setForm(prev => ({ ...prev, usefulLifeYears: suggestions.usefulLifeYears! }));
      newSuggested.add('usefulLifeYears');
    }
    if (suggestions.warrantyYears != null && !form.warrantyExpiry && form.purchaseDate) {
      const purchaseDate = new Date(form.purchaseDate);
      purchaseDate.setFullYear(purchaseDate.getFullYear() + suggestions.warrantyYears);
      setForm(prev => ({ ...prev, warrantyExpiry: purchaseDate.toISOString().split('T')[0] }));
      newSuggested.add('warrantyExpiry');
    }
    setAiSuggestedFields(newSuggested);
    setSuggestions(null);
    setSuggestionNotes({});
  };

  // Dismiss suggestions
  const dismissSuggestions = () => {
    setSuggestions(null);
    setSuggestionNotes({});
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSerialNumberError(null);

    try {
      // Build the data object
      const data: any = {};
      data.name = form.name;
      data.type = form.type || undefined;
      data.manufacturer = form.manufacturer || undefined;
      data.serialNumber = form.serialNumber || undefined;
      data.status = form.status;
      data.location = form.location || undefined;
      data.propertyNumber = form.propertyNumber || undefined;
      data.remarks = form.remarks || undefined;
      if (form.purchasePrice !== '') {
        data.purchasePrice = Number(form.purchasePrice);
      }
      if (form.purchaseDate) {
        data.purchaseDate = new Date(form.purchaseDate).toISOString();
      }
      data.warrantyExpiry = form.warrantyExpiry ? new Date(form.warrantyExpiry).toISOString() : null;
      data.warrantyNotes = form.warrantyNotes || null;
      if (data.warrantyNotes === '') data.warrantyNotes = null;
      // Depreciation fields
      data.depreciationMethod = form.depreciationMethod;
      data.usefulLifeYears = Number(form.usefulLifeYears);
      data.salvageValue = form.salvageValue !== '' ? Number(form.salvageValue) : 0;
      // Supplier — explicitly null when none selected
      data.supplierId = form.supplierId || null;

      if (imageFile) {
        // Send as multipart/form-data with 'image' file + 'data' JSON string
        if (import.meta.env.DEV) console.log('[AssetFormModal] Submitting data:', data);
        const fd = new FormData();
        fd.append('image', imageFile);
        fd.append('data', JSON.stringify(data));
        await onSubmit(fd);
      } else {
        if (import.meta.env.DEV) console.log('[AssetFormModal] Submitting data (no image):', data);
        // No image — send as plain JSON
        await onSubmit(data);
      }
    } catch (err: any) {
      console.error('[AssetFormModal] Submit failed:', err);
      // Check for duplicate serial number error
      if (err?.errorData?.code === 'DUPLICATE_FIELD' && err?.errorData?.field === 'serialNumber') {
        setSerialNumberError('This serial number already exists in the system.');
      } else {
        setError(err?.message || 'Failed to save asset. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  // Merge current value into options if it's inactive/missing
  function mergeWithFallback(options: { id: number; value: string }[], currentValue: string) {
    if (!currentValue) return options;
    const exists = options.some((o) => o.value === currentValue);
    if (exists) return options;
    return [{ id: -1, value: currentValue }, ...options];
  }

  const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#f8931f] focus:border-transparent transition";
  const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 block";

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[95vw] max-w-5xl max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-slate-800 shadow-xl" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="bg-[#012061] px-6 py-4 flex items-center justify-between shrink-0 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#f8931f] text-white">
              {isEdit ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </div>
            <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit Asset' : 'Add Asset'}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/20 bg-white dark:bg-slate-800/10 p-1.5 text-slate-700 dark:text-white/60 hover:text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          {/* Scrollable fields */}
          <div className="flex-1 overflow-y-auto px-5 md:px-6 pr-3 md:pr-4 pt-5 pb-24 md:pb-28 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb:hover]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600 dark:[&::-webkit-scrollbar-thumb:hover]:bg-slate-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">

              {/* ═══ Asset Identity ═══ */}

              {/* 1. Image — Upload + Camera */}
              <div className="md:col-span-2">
                <label className={labelClass}>Image <span className="text-slate-400 font-normal">(optional)</span></label>
                <div className="flex items-center gap-4 mt-1">
                  {imagePreview && (
                    <div className="relative group">
                      <img src={imagePreview || ''} alt="Preview" className="h-20 w-20 rounded-lg object-cover border-2 border-[#012061]" />
                      <button
                        type="button"
                        onClick={removeImage}
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-[#7B1113] text-white p-0.5 shadow hover:bg-[#5a0e10] transition-colors"
                        title="Remove image"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      {/* Upload button */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {imagePreview ? 'Change Image' : 'Upload Image'}
                      </button>
                      {/* Camera button */}
                      {cameraAvailable !== false && (
                        <button
                          type="button"
                          onClick={openCamera}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          Take Photo
                        </button>
                      )}
                    </div>
                    {/* Hidden file inputs */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      capture="environment"
                      onChange={handleCameraCapture}
                      className="hidden"
                    />
                    {isEdit && asset?.imageUrl && !imageFile && (
                      <span className="text-[10px] text-slate-400">Current image — click to replace or take a new photo</span>
                    )}
                    {imageFile && (
                      <span className="text-[10px] text-slate-400">New image ready — will replace current on save</span>
                    )}
                  </div>
                </div>
                {/* Camera permission error */}
                {cameraError && (
                  <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <CameraOff className="w-3 h-3" />
                    {cameraError}
                  </p>
                )}
              </div>

              {/* 2. Name + Suggest Fields */}
              <div className="md:col-span-2 flex gap-2">
                <div className="flex-1">
                  <label className={labelClass}>Name *</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)} required className={inputClass} placeholder="Asset name" />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleSuggest}
                    disabled={suggesting || !form.name.trim()}
                    title="Suggest type, manufacturer, and useful life based on asset name"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-[#f8931f] hover:bg-[#f8931f]/10 disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {suggesting ? 'Suggesting...' : 'Suggest fields'}
                  </button>
                </div>
              </div>

              {/* Suggestion review panel */}
              {suggestions && (
                <div className="md:col-span-2 rounded-lg border border-[#f8931f]/30 bg-[#f8931f]/5 dark:bg-[#f8931f]/10 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#f8931f]">AI Suggestions</span>
                    <span className="text-[10px] text-slate-400">Review before applying</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {suggestions.type != null && (
                      <SuggestionChip
                        label="Type"
                        value={suggestions.type}
                        note={suggestionNotes.type}
                        applied={aiSuggestedFields.has('type')}
                        onApply={() => applySuggestion('type', suggestions.type!)}
                      />
                    )}
                    {suggestions.manufacturer != null && (
                      <SuggestionChip
                        label="Manufacturer"
                        value={suggestions.manufacturer}
                        note={suggestionNotes.manufacturer}
                        applied={aiSuggestedFields.has('manufacturer')}
                        onApply={() => applySuggestion('manufacturer', suggestions.manufacturer!)}
                      />
                    )}
                    {suggestions.usefulLifeYears != null && (
                      <SuggestionChip
                        label="Useful Life"
                        value={`${suggestions.usefulLifeYears} years`}
                        onApply={() => applySuggestion('usefulLifeYears', suggestions.usefulLifeYears!)}
                        applied={aiSuggestedFields.has('usefulLifeYears')}
                      />
                    )}
                    {suggestions.warrantyYears != null && form.purchaseDate && !form.warrantyExpiry && (
                      <SuggestionChip
                        label="Warranty Expiry"
                        value={`${suggestions.warrantyYears} years from purchase`}
                        onApply={() => {
                          const purchaseDate = new Date(form.purchaseDate);
                          purchaseDate.setFullYear(purchaseDate.getFullYear() + suggestions.warrantyYears!);
                          applySuggestion('warrantyExpiry', purchaseDate.toISOString().split('T')[0]);
                        }}
                        applied={aiSuggestedFields.has('warrantyExpiry')}
                      />
                    )}
                  </div>
                  {/* No matches message */}
                  {(suggestionNotes.type === 'No matching lookup value' || suggestionNotes.type === 'No confident suggestion') && (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                      {suggestionNotes.type === 'No confident suggestion'
                        ? 'No confident suggestion found for this asset name.'
                        : 'Some suggestions did not match existing lookup values and were excluded.'}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-[#f8931f]/20">
                    <button
                      type="button"
                      onClick={applyAllSuggestions}
                      className="inline-flex items-center gap-1 rounded-md bg-[#f8931f] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#e0841a] transition-colors"
                    >
                      <Check className="w-3 h-3" />
                      Apply all
                    </button>
                    <button
                      type="button"
                      onClick={dismissSuggestions}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* Standalone "no confident suggestion" banner (when suggestions object is null but notes exist) */}
              {!suggestions && suggestionNotes.type && (
                <div className="md:col-span-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 px-4 py-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                    {suggestionNotes.type}
                  </p>
                </div>
              )}

              {/* 3. Type */}
              <div>
                <label className={labelClass}>
                  Type *
                  {aiSuggestedFields.has('type') && <span className="ml-1 text-[#f8931f] text-[10px]">AI suggested</span>}
                </label>
                <Select value={form.type} onValueChange={(val) => val != null && set('type', val)} disabled={typeLoading}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-[#f8931f]">
                    <SelectValue placeholder={typeLoading ? 'Loading...' : 'Select type'} />
                  </SelectTrigger>
                  <SelectContent>
                    {mergeWithFallback(typeOptions, form.type).map((opt) => (
                      <SelectItem key={opt.id} value={opt.value}>
                        {opt.value}{opt.id === -1 && <span className="ml-2 text-xs text-slate-400">(inactive)</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 4. Manufacturer */}
              <div>
                <label className={labelClass}>
                  Manufacturer
                  {aiSuggestedFields.has('manufacturer') && <span className="ml-1 text-[#f8931f] text-[10px]">AI suggested</span>}
                </label>
                <Select value={form.manufacturer || ''} onValueChange={(val) => set('manufacturer', val ?? '')} disabled={manufacturerLoading}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-[#f8931f]">
                    <SelectValue placeholder={manufacturerLoading ? 'Loading...' : 'None'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {mergeWithFallback(manufacturerOptions, form.manufacturer).map((opt) => (
                      <SelectItem key={opt.id} value={opt.value}>
                        {opt.value}{opt.id === -1 && <span className="ml-2 text-xs text-slate-400">(inactive)</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 5. Serial Number */}
              <div>
                <label className={labelClass}>Serial Number</label>
                <input value={form.serialNumber} onChange={e => { set('serialNumber', e.target.value); if (serialNumberError) setSerialNumberError(null); }} className={`${inputClass}${serialNumberError ? ' !border-[#7B1113] !ring-[#7B1113]' : ''}`} placeholder="e.g. SN-12345" />
                {serialNumberError && <p className="mt-1 text-xs text-[#7B1113]">{serialNumberError}</p>}
              </div>

              {/* 6. Property Number */}
              <div>
                <label className={labelClass}>Property #</label>
                <input value={form.propertyNumber} onChange={e => set('propertyNumber', e.target.value)} placeholder="e.g. PROP-00123" className={inputClass} />
              </div>

              {/* ── Section: Purchase Details ── */}
              <div className="md:col-span-2 flex items-center gap-3 pt-4 pb-1">
                <div className="w-1.5 h-3.5 rounded-full bg-[#f8931f]" />
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">Purchase Details</span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              </div>

              {/* 7. Price */}
              <div>
                <label className={labelClass}>Price *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">₱</span>
                  <input type="number" step="0.01" value={form.purchasePrice} onChange={e => set('purchasePrice', e.target.value)} required className={`${inputClass} pl-8`} />
                </div>
              </div>

              {/* 8. Purchase Date */}
              <div>
                <label className={labelClass}>Purchase Date{isEdit ? '' : ' *'}</label>
                <input type="date" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} {...(isEdit ? {} : { required: true })} className={inputClass} />
              </div>

              {/* 9. Supplier */}
              <div>
                <label className={labelClass}>Supplier</label>
                <Select
                  value={form.supplierId ?? ''}
                  onValueChange={(val) => setForm(prev => ({ ...prev, supplierId: val === '' ? null : val }))}
                  disabled={suppliersLoading}
                >
                  <SelectTrigger className="w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-[#f8931f]">
                    <SelectValue placeholder={suppliersLoading ? 'Loading...' : 'None'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 10. Location */}
              <div>
                <label className={labelClass}>Location</label>
                <Select value={form.location || ''} onValueChange={(val) => set('location', val ?? '')} disabled={locationLoading}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-[#f8931f]">
                    <SelectValue placeholder={locationLoading ? 'Loading...' : 'None'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {mergeWithFallback(locationOptions, form.location).map((opt) => (
                      <SelectItem key={opt.id} value={opt.value}>
                        {opt.value}{opt.id === -1 && <span className="ml-2 text-xs text-slate-400">(inactive)</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 11. Status */}
              <div>
                <label className={labelClass}>Status *</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} required className={inputClass}>
                  {ASSET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* ── Section: Notes & Warranty ── */}
              <div className="md:col-span-2 flex items-center gap-3 pt-4 pb-1">
                <div className="w-1.5 h-3.5 rounded-full bg-[#f8931f]" />
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">Notes & Warranty</span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              </div>

              {/* 12. Remarks */}
              <div className="md:col-span-2">
                <label className={labelClass}>Remarks</label>
                <textarea rows={3} value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Any additional notes..." className={`${inputClass} resize-none`} />
              </div>

              {/* 13. Warranty Section */}
              <div className="md:col-span-2 pt-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      Warranty expiry date
                      {aiSuggestedFields.has('warrantyExpiry') && <span className="ml-1 text-[#f8931f]">AI suggested</span>}
                    </label>
                    <input type="date" value={form.warrantyExpiry} onChange={e => set('warrantyExpiry', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Warranty notes</label>
                    <input type="text" value={form.warrantyNotes} onChange={e => set('warrantyNotes', e.target.value)} placeholder="e.g. 3-year on-site" className={inputClass} />
                  </div>
                </div>
              </div>

              {/* 14. Depreciation Settings */}
              <div className="md:col-span-2 mt-1">
                <div className="flex items-center gap-3 pt-4 pb-1">
                  <div className="w-1.5 h-3.5 rounded-full bg-[#f8931f]" />
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">Depreciation Settings</span>
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                </div>
                <p className="text-[10px] text-slate-400 mb-3">These values are used to calculate the asset's book value over time.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Depreciation Method</label>
                    <select value={form.depreciationMethod} onChange={e => set('depreciationMethod', e.target.value)} className={inputClass}>
                      <option value="straight_line">Straight Line</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>
                      Useful Life (Years)
                      {aiSuggestedFields.has('usefulLifeYears') && <span className="ml-1 text-[#f8931f]">AI suggested</span>}
                    </label>
                    <input type="number" min={1} max={50} value={form.usefulLifeYears} onChange={e => setForm(prev => ({ ...prev, usefulLifeYears: Number(e.target.value) || 5 }))} className={inputClass} />
                    <p className="text-[10px] text-slate-400 mt-0.5">How many years is this asset expected to last?</p>
                  </div>
                  <div>
                    <label className={labelClass}>Salvage Value (₱)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">₱</span>
                      <input type="number" step="0.01" min={0} value={form.salvageValue} onChange={e => set('salvageValue', e.target.value)} className={`${inputClass} pl-8`} />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">Estimated resale/scrap value at end of useful life.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="px-5 md:px-6 pt-2 shrink-0">
              <p className="text-sm text-[#7B1113] bg-[#7B1113]/10 border border-[#7B1113]/20 rounded-lg px-4 py-2">{error}</p>
            </div>
          )}

          {/* ── Footer ── */}
          <div className="flex justify-end gap-2 px-5 md:px-6 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-[#012061] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || !form.name} className="rounded-lg bg-[#f8931f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e0841a] disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
              {loading ? (isEdit ? 'Updating...' : 'Saving...') : (isEdit ? 'Update Asset' : 'Add Asset')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Small chip component for individual suggestion review */
function SuggestionChip({ label, value, note, applied, onApply }: {
  label: string;
  value: string;
  note?: string;
  applied: boolean;
  onApply: () => void;
}) {
  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${applied ? 'border-[#f8931f]/40 bg-[#f8931f]/10' : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700'}`}>
      <div className="text-[10px] text-slate-400 mb-0.5">{label}</div>
      {note ? (
        <div className="text-amber-600 dark:text-amber-400 italic">{note}</div>
      ) : (
        <div className="font-medium text-slate-800 dark:text-slate-200">{value}</div>
      )}
      {!applied && !note && (
        <button
          type="button"
          onClick={onApply}
          className="mt-1 text-[10px] text-[#f8931f] hover:underline"
        >
          Apply
        </button>
      )}
      {applied && (
        <span className="mt-1 text-[10px] text-green-600 flex items-center gap-0.5">
          <Check className="w-2.5 h-2.5" /> Applied
        </span>
      )}
    </div>
  );
}