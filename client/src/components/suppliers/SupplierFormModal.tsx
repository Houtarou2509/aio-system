import { useState } from 'react';
import { X, Truck } from 'lucide-react';

interface Supplier {
  id?: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
}

interface Props {
  supplier?: Supplier | null;
  onSubmit: (data: Partial<Supplier>) => Promise<void>;
  onSaved?: () => void;
  onClose: () => void;
}

export function SupplierFormModal({ supplier, onSubmit, onSaved, onClose }: Props) {
  const [name, setName] = useState(supplier?.name || '');
  const [contactPerson, setContactPerson] = useState(supplier?.contactPerson || '');
  const [email, setEmail] = useState(supplier?.email || '');
  const [phone, setPhone] = useState(supplier?.phone || '');
  const [website, setWebsite] = useState(supplier?.website || '');
  const [notes, setNotes] = useState(supplier?.notes || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!supplier?.id;

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Supplier name is required'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        contactPerson: contactPerson.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        website: website.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onSaved?.();
    } catch (err: any) {
      setError(err.message || 'Failed to save supplier');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-[#012061]">
            <div className="flex items-center gap-2.5">
              <Truck className="h-4 w-4 text-[#f8931f]" />
              <h2 className="text-sm font-bold text-white tracking-tight">{isEdit ? 'Edit Supplier' : 'Add Supplier'}</h2>
            </div>
            <button onClick={onClose} className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="block text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1.5">Name *</label>
              <input value={name} onChange={e => { setName(e.target.value); setError(null); }}
                placeholder="Supplier name" className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1.5">Contact Person</label>
              <input value={contactPerson} onChange={e => setContactPerson(e.target.value)}
                placeholder="Contact name" className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1.5">Email</label>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email"
                  placeholder="supplier@email.com" className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1.5">Phone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+63..." className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1.5">Website</label>
              <input value={website} onChange={e => setWebsite(e.target.value)}
                placeholder="https://..." className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1.5">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Additional notes..." className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:border-[#f8931f] focus:ring-1 focus:ring-[#f8931f] focus:outline-none transition-colors resize-none" />
            </div>

            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-[11px] font-medium text-red-600 dark:text-red-300">
                {error}
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2">
            <button onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white hover:opacity-90 transition-all duration-200 active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: '#f8931f' }}>
              <Truck className="h-3.5 w-3.5" />
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Supplier'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
