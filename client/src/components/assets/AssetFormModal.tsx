import { useState, FormEvent, useEffect, useRef } from 'react';
import { Asset } from '../../lib/api';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useLookupOptions } from '@/hooks/useLookupOptions';
import { Sparkles, X, Upload, Pencil, Plus } from 'lucide-react';

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
    assignedTo: asset?.assignedTo ?? '',
    propertyNumber: (asset as any)?.propertyNumber || '',
    status: asset?.status || 'AVAILABLE',
    location: asset?.location ?? '',
    remarks: (asset as any)?.remarks || '',
    warrantyExpiry: (asset as any)?.warrantyExpiry ? new Date((asset as any).warrantyExpiry).toISOString().split('T')[0] : '',
    warrantyNotes: (asset as any)?.warrantyNotes || '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(getImageUrl(asset?.imageUrl) || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic lookup lists via hook
  const { options: typeOptions, isLoading: typeLoading } = useLookupOptions('asset-types');
  const { options: manufacturerOptions, isLoading: manufacturerLoading } = useLookupOptions('manufacturers');
  const { options: locationOptions, isLoading: locationLoading } = useLookupOptions('locations');
  const { options: assignedToOptions, isLoading: assignedToLoading } = useLookupOptions('assigned-to');

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

  const handleSuggest = async () => {
    if (!form.name.trim()) return;
    setSuggesting(true);
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
        if (best.type) setForm(f => ({ ...f, type: best.type }));
        if (best.manufacturer) setForm(f => ({ ...f, manufacturer: best.manufacturer }));
      }
    } catch {} finally { setSuggesting(false); }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Build the data object
      const data: any = {};
      data.name = form.name;
      data.type = form.type || undefined;
      data.manufacturer = form.manufacturer || undefined;
      data.serialNumber = form.serialNumber || undefined;
      data.status = form.status;
      data.location = form.location || undefined;
      data.assignedTo = form.assignedTo || undefined;
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

      if (imageFile) {
        // Send as multipart/form-data with 'image' file + 'data' JSON string
        // This matches the backend: multer single('image') + JSON.parse(req.body.data)
        console.log('[AssetFormModal] Submitting data:', data);
        const fd = new FormData();
        fd.append('image', imageFile);
        fd.append('data', JSON.stringify(data));
        await onSubmit(fd);
      } else {
        console.log('[AssetFormModal] Submitting data (no image):', data);
        // No image — send as plain JSON
        await onSubmit(data);
      }
    } catch (err: any) {
      console.error('[AssetFormModal] Submit failed:', err);
      setError(err?.message || 'Failed to save asset. Please try again.');
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

  const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#f8931f] focus:border-transparent transition";
  const labelClass = "text-xs font-medium text-slate-700 mb-1 block";

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="bg-[#012061] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#f8931f] text-white">
              {isEdit ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </div>
            <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit Asset' : 'Add Asset'}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/20 bg-white/10 p-1.5 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          {/* Scrollable fields */}
          <div className="flex-1 overflow-y-auto px-6">
            <div className="grid grid-cols-2 gap-4 py-4">

              {/* 1. Image */}
              <div className="col-span-2">
                <label className={labelClass}>Image</label>
                <div className="flex items-center gap-4 mt-1">
                  {imagePreview && (
                    <div className="relative group">
                      <img src={imagePreview || ''} alt="Preview" className="h-20 w-20 rounded-lg object-cover border-2 border-[#012061]" />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Upload className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {imagePreview ? 'Change Image' : 'Upload Image'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={e => setImageFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    {isEdit && asset?.imageUrl && !imageFile && (
                      <span className="text-[10px] text-slate-400">Current image — click to replace</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Name + AI Suggest */}
              <div className="col-span-2 flex gap-2">
                <div className="flex-1">
                  <label className={labelClass}>Name *</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)} required className={inputClass} placeholder="Asset name" />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleSuggest}
                    disabled={suggesting || !form.name.trim()}
                    title="AI suggest type & manufacturer"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-[#f8931f] hover:bg-[#f8931f]/10 disabled:opacity-40 transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 3. Type */}
              <div>
                <label className={labelClass}>Type *</label>
                <Select value={form.type} onValueChange={(val) => val != null && set('type', val)} disabled={typeLoading}>
                  <SelectTrigger className="w-full bg-white border-slate-200 focus:ring-2 focus:ring-[#f8931f]">
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
                <label className={labelClass}>Manufacturer</label>
                <Select value={form.manufacturer || '__none__'} onValueChange={(val) => val != null && set('manufacturer', val === '__none__' ? '' : val)} disabled={manufacturerLoading}>
                  <SelectTrigger className="w-full bg-white border-slate-200 focus:ring-2 focus:ring-[#f8931f]">
                    <SelectValue placeholder={manufacturerLoading ? 'Loading...' : 'Select manufacturer'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
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
                <input value={form.serialNumber} onChange={e => set('serialNumber', e.target.value)} className={inputClass} placeholder="e.g. SN-12345" />
              </div>

              {/* 6. Price */}
              <div>
                <label className={labelClass}>Price *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">₱</span>
                  <input type="number" step="0.01" value={form.purchasePrice} onChange={e => set('purchasePrice', e.target.value)} required className={`${inputClass} pl-8`} />
                </div>
              </div>

              {/* 7. Purchase Date */}
              <div>
                <label className={labelClass}>Purchase Date{isEdit ? '' : ' *'}</label>
                <input type="date" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} {...(isEdit ? {} : { required: true })} className={inputClass} />
              </div>

              {/* 8. Assigned To */}
              <div>
                <label className={labelClass}>Assigned To</label>
                <Select value={form.assignedTo || '__none__'} onValueChange={(val) => val != null && set('assignedTo', val === '__none__' ? '' : val)} disabled={assignedToLoading}>
                  <SelectTrigger className="w-full bg-white border-slate-200 focus:ring-2 focus:ring-[#f8931f]">
                    <SelectValue placeholder={assignedToLoading ? 'Loading...' : 'Select assignee'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {mergeWithFallback(assignedToOptions, form.assignedTo).map((opt) => (
                      <SelectItem key={opt.id} value={opt.value}>
                        {opt.value}{opt.id === -1 && <span className="ml-2 text-xs text-slate-400">(inactive)</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 9. Property # */}
              <div>
                <label className={labelClass}>Property #</label>
                <input value={form.propertyNumber} onChange={e => set('propertyNumber', e.target.value)} placeholder="e.g. PROP-00123" className={inputClass} />
              </div>

              {/* 10. Location */}
              <div>
                <label className={labelClass}>Location</label>
                <Select value={form.location || '__none__'} onValueChange={(val) => val != null && set('location', val === '__none__' ? '' : val)} disabled={locationLoading}>
                  <SelectTrigger className="w-full bg-white border-slate-200 focus:ring-2 focus:ring-[#f8931f]">
                    <SelectValue placeholder={locationLoading ? 'Loading...' : 'Select location'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
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

              {/* 12. Remarks */}
              <div className="col-span-2">
                <label className={labelClass}>Remarks</label>
                <textarea rows={3} value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Any additional notes..." className={`${inputClass} resize-none`} />
              </div>

              {/* 13. Warranty Section */}
              <div className="col-span-2">
                <div className="border-t border-slate-100 my-2" />
                <label className={labelClass}>Warranty (Optional)</label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Expiry date</label>
                    <input type="date" value={form.warrantyExpiry} onChange={e => set('warrantyExpiry', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Notes</label>
                    <input type="text" value={form.warrantyNotes} onChange={e => set('warrantyNotes', e.target.value)} placeholder="e.g. 3-year on-site" className={inputClass} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="px-6 pt-2 shrink-0">
              <p className="text-sm text-[#7B1113] bg-[#7B1113]/10 border border-[#7B1113]/20 rounded-lg px-4 py-2">{error}</p>
            </div>
          )}

          {/* ── Footer ── */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 shrink-0">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-[#012061] hover:bg-slate-50 transition-colors">
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