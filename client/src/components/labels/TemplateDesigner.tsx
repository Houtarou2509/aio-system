import { useState, useEffect } from 'react';
import { labelsApi } from '../../lib/labels-api';
import { RoleGate } from '../auth';

interface Template {
  id: string;
  name: string;
  format: string;
  config: string;
  createdAt: string;
}

export function TemplateDesigner() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState('');
  const [format, setFormat] = useState('DYMO_99012');
  const [barcodeType, setBarcodeType] = useState('CODE128');
  const [selectedFields, setSelectedFields] = useState<string[]>(['name', 'type']);
  const [loading, setLoading] = useState(false);

  const FORMATS = ['DYMO_99017', 'DYMO_99012', 'BROTHER_62', 'BROTHER_38', 'BROTHER_29', 'AVERY_L7160'];
  const BARCODES = ['CODE128', 'QR', 'DATAMATRIX'];
  const FIELDS = ['name', 'type', 'serialNumber', 'location', 'status'];

  const fetchTemplates = async () => {
    try {
      const data = await labelsApi.listTemplates();
      setTemplates(data);
    } catch {}
  };

  useEffect(() => { fetchTemplates(); }, []);

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await labelsApi.createTemplate({ name, format, barcodeType, fields: selectedFields });
      setName('');
      fetchTemplates();
    } catch (e: any) { alert(e.message); }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    try { await labelsApi.deleteTemplate(id); fetchTemplates(); } catch (e: any) { alert(e.message); }
  };

  const toggleField = (f: string) => {
    setSelectedFields(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold">Label Templates</h2>

      {/* Create form */}
      <div className="rounded-md border border-border p-4 space-y-3">
        <h3 className="text-sm font-medium">New Template</h3>
        <div className="grid grid-cols-2 gap-3">
          <input placeholder="Template name" value={name} onChange={e => setName(e.target.value)} className="rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
          <select value={format} onChange={e => setFormat(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
            {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={barcodeType} onChange={e => setBarcodeType(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
            {BARCODES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <div className="flex flex-wrap gap-2">
            {FIELDS.map(f => (
              <label key={f} className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={selectedFields.includes(f)} onChange={() => toggleField(f)} className="rounded" />
                {f}
              </label>
            ))}
          </div>
        </div>
        <RoleGate roles={['ADMIN', 'STAFF_ADMIN']}>
          <button onClick={handleSave} disabled={loading || !name.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {loading ? 'Saving...' : 'Save Template'}
          </button>
        </RoleGate>
      </div>

      {/* Template list */}
      <div className="space-y-2">
        {templates.map(t => {
          const config = JSON.parse(t.config || '{}');
          return (
            <div key={t.id} className="rounded-md border border-border p-3 text-sm flex justify-between items-center">
              <div>
                <span className="font-medium">{t.name}</span>
                <span className="text-muted-foreground ml-2">{t.format} · {config.barcodeType || '—'}</span>
                <span className="text-muted-foreground ml-2">Fields: {(config.fields || []).join(', ')}</span>
              </div>
              <RoleGate roles={['ADMIN']}>
                <button onClick={() => handleDelete(t.id)} className="text-xs text-destructive hover:underline">Delete</button>
              </RoleGate>
            </div>
          );
        })}
        {templates.length === 0 && <p className="text-sm text-muted-foreground">No templates yet</p>}
      </div>
    </div>
  );
}