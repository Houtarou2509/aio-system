import { useState, FormEvent, useEffect, useRef } from 'react';
import { Asset } from '../../lib/api';

const ASSET_TYPES = ['DESKTOP', 'LAPTOP', 'FURNITURE', 'EQUIPMENT', 'PERIPHERAL', 'OTHER'];
const ASSET_STATUSES = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST'];

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
    type: asset?.type || 'DESKTOP',
    manufacturer: asset?.manufacturer || '',
    serialNumber: asset?.serialNumber || '',
    purchasePrice: asset?.purchasePrice != null ? String(asset.purchasePrice) : '',
    purchaseDate: asset?.purchaseDate ? new Date(asset.purchaseDate).toISOString().split('T')[0] : '',
    assignedTo: asset?.assignedTo || '',
    propertyNumber: (asset as any)?.propertyNumber || '',
    status: asset?.status || 'AVAILABLE',
    location: asset?.location || '',
    remarks: (asset as any)?.remarks || '',
    warrantyExpiry: (asset as any)?.warrantyExpiry ? new Date((asset as any).warrantyExpiry).toISOString().split('T')[0] : '',
    warrantyNotes: (asset as any)?.warrantyNotes || '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(asset?.imageUrl || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate preview when image selected
  useEffect(() => {
    if (!imageFile) {
      if (isEdit && asset?.imageUrl) setImagePreview(asset.imageUrl);
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
      // Build data object — clean empty values
      const data: any = { ...form };
      if (data.purchasePrice !== '') {
        data.purchasePrice = Number(data.purchasePrice);
      } else {
        delete data.purchasePrice;
      }
      // Convert empty date to undefined, valid date to ISO string
      if (data.purchaseDate) {
        data.purchaseDate = new Date(data.purchaseDate).toISOString();
      } else {
        delete data.purchaseDate;
      }
      // Remove empty optional strings
      if (!data.assignedTo) delete data.assignedTo;
      if (!data.propertyNumber) delete data.propertyNumber;
      if (!data.remarks) delete data.remarks;
      for (const k of ['manufacturer', 'serialNumber', 'location']) {
        if (!data[k]) delete data[k];
      }
      // Warranty fields: empty string → null, valid date → ISO string
      data.warrantyExpiry = data.warrantyExpiry ? new Date(data.warrantyExpiry).toISOString() : null;
      data.warrantyNotes = data.warrantyNotes || null;
      if (data.warrantyNotes === '') data.warrantyNotes = null;

      if (imageFile) {
        // Send multipart form data with image
        const fd = new FormData();
        fd.append('image', imageFile);
        fd.append('data', new Blob([JSON.stringify(data)], { type: 'application/json' }));
        await onSubmit(fd);
      } else {
        // No image — send plain JSON
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

  return (
    <div 
  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
  onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-lg border border-border bg-card shadow-lg" onClick={e => e.stopPropagation()}>
        {/* Fixed header */}
        <h2 className="text-lg font-bold text-card-foreground px-6 pt-6 pb-2 shrink-0">{isEdit ? 'Edit Asset' : 'Add Asset'}</h2>

        {/* Form wrapping scrollable body + fixed footer */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          {/* Scrollable fields */}
          <div className="flex-1 overflow-y-auto px-6">
            <div className="grid grid-cols-2 gap-3 py-2">

              {/* 1. Image */}
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Image</label>
                <div className="flex items-center gap-3 mt-1">
                  {imagePreview && (
                    <img src={imagePreview} alt="Preview" className="h-16 w-16 rounded-md object-cover border border-input" />
                  )}
                  <div className="flex flex-col gap-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={e => setImageFile(e.target.files?.[0] || null)}
                      className="w-full text-sm"
                    />
                    {isEdit && asset?.imageUrl && !imageFile && (
                      <span className="text-xs text-muted-foreground">Current image — select a file to replace</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Name */}
              <div className="col-span-2 flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground">Name *</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)} required className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
                </div>
                <button type="button" onClick={handleSuggest} disabled={suggesting || !form.name.trim()} title="AI suggest type & manufacturer" className="mt-4 rounded-md border border-input px-2 py-1.5 text-sm hover:bg-accent disabled:opacity-50">{suggesting ? '⏳' : '✨'}</button>
              </div>

              {/* 3. Type */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Type *</label>
                <select value={form.type} onChange={e => set('type', e.target.value)} required className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                  {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* 4. Manufacturer */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Manufacturer</label>
                <input value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>

              {/* 5. Serial Number */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Serial Number</label>
                <input value={form.serialNumber} onChange={e => set('serialNumber', e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>

              {/* 6. Price */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Price *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">₱</span>
                  <input type="number" step="0.01" value={form.purchasePrice} onChange={e => set('purchasePrice', e.target.value)} required className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm" />
                </div>
              </div>

              {/* 7. Purchase Date */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Purchase Date{isEdit ? '' : ' *'}</label>
                <input type="date" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} {...(isEdit ? {} : { required: true })} className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>

              {/* 8. Assigned To */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Assigned To</label>
                <input value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)} placeholder="Enter employee name" className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>

              {/* 9. Property # */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Property #</label>
                <input value={form.propertyNumber} onChange={e => set('propertyNumber', e.target.value)} placeholder="e.g. PROP-00123" className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>

              {/* 10. Location */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Location</label>
                <input value={form.location} onChange={e => set('location', e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>

              {/* 11. Status */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Status *</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} required className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                  {ASSET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* 12. Remarks */}
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Remarks</label>
                <textarea rows={3} value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Any additional notes..." className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm resize-none" />
              </div>

              {/* 13. Warranty Section */}
              <div className="col-span-2">
                <div className="border-t border-border my-2" />
                <label className="text-xs font-medium text-muted-foreground">Warranty (Optional)</label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div>
                    <input type="date" value={form.warrantyExpiry} onChange={e => set('warrantyExpiry', e.target.value)} placeholder="Select expiry date" className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
                    <span className="text-[10px] text-muted-foreground">Expiry date</span>
                  </div>
                  <div>
                    <input type="text" value={form.warrantyNotes} onChange={e => set('warrantyNotes', e.target.value)} placeholder="e.g. 3-year on-site, ref# 12345" className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
                    <span className="text-[10px] text-muted-foreground">Notes</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Fixed footer — inside the form so submit works */}
          {error && (
            <div className="px-6 pt-2 shrink-0">
              <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
            </div>
          )}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
            <button type="button" onClick={onClose} className="rounded-md border border-input px-4 py-1.5 text-sm hover:bg-accent">Cancel</button>
            <button type="submit" disabled={loading || !form.name} className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {loading ? (isEdit ? 'Updating...' : 'Saving...') : isEdit ? 'Update' : 'Add Asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
