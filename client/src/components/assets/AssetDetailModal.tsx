import { useState, useEffect } from 'react';
import { assetsApi, Asset, Assignment } from '../../lib/api';
import { MaintenanceTab } from '../maintenance';
import { AuditTimeline } from '../audit';
import { GuestTokenManager } from '../guest';
import { getWarrantyStatus, formatWarrantyDate } from '../../lib/warranty';

interface Props {
  asset: Asset;
  onClose: () => void;
  onEdit: (asset: Asset) => void;
}

type Tab = 'overview' | 'history' | 'maintenance' | 'audit';

export function AssetDetailModal({ asset, onClose, onEdit }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [history, setHistory] = useState<Assignment[]>([]);
  const [frequentRepair, setFrequentRepair] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tab === 'history') {
      setLoading(true);
      assetsApi.history(asset.id).then(res => setHistory(res.data)).catch(() => {}).finally(() => setLoading(false));
    }
    if (tab === 'maintenance') {
      fetch(`/api/assets/${asset.id}/maintenance`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      })
        .then(r => r.json())
        .then(d => { if (d.meta?.frequentRepair) setFrequentRepair(true); })
        .catch(() => {});
    }
  }, [tab, asset.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-card-foreground">{asset.name}</h2>
            <p className="text-sm text-muted-foreground">{asset.type} · {asset.manufacturer || 'No manufacturer'}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onEdit(asset)} className="rounded-md border border-input px-3 py-1 text-xs hover:bg-accent">Edit</button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">×</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-4">
          {(['overview', 'history', 'maintenance', 'audit'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-sm capitalize ${tab === t ? 'border-b-2 border-primary font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{t}</button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Serial:</span> {asset.serialNumber || '—'}</div>
              <div><span className="text-muted-foreground">Status:</span> <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                asset.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
                asset.status === 'ASSIGNED' ? 'bg-blue-100 text-blue-800' :
                asset.status === 'MAINTENANCE' ? 'bg-yellow-100 text-yellow-800' :
                asset.status === 'RETIRED' ? 'bg-gray-100 text-gray-800' :
                'bg-red-100 text-red-800'
              }`}>{asset.status}</span></div>
              <div><span className="text-muted-foreground">Location:</span> {asset.location || '—'}</div>
              <div><span className="text-muted-foreground">Assigned To:</span> {asset.assignedTo ? <span className="font-medium">{asset.assignedTo}</span> : <span className="italic text-muted-foreground">Unassigned</span>}</div>
              <div><span className="text-muted-foreground">Purchase Price:</span> {asset.purchasePrice != null ? `₱${Number(asset.purchasePrice).toLocaleString()}` : '—'}</div>
              <div><span className="text-muted-foreground">Purchase Date:</span> {asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString() : '—'}</div>
              <div><span className="text-muted-foreground">Property #:</span> {(asset as any).propertyNumber || '—'}</div>
              <div><span className="text-muted-foreground">Remarks:</span> {(asset as any).remarks || '—'}</div>
              <div><span className="text-muted-foreground">Created:</span> {new Date(asset.createdAt).toLocaleDateString()}</div>
              <div><span className="text-muted-foreground">Updated:</span> {new Date(asset.updatedAt).toLocaleDateString()}</div>
            </div>

            {/* Warranty section */}
            {(!((asset as any).warrantyExpiry == null && !(asset as any).warrantyNotes)) ? (() => {
              const w = getWarrantyStatus((asset as any).warrantyExpiry);
              const badgeClass = w.status === 'active' ? 'bg-green-100 text-green-800'
                : w.status === 'expiring' ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800';
              const badgeLabel = w.status === 'active' ? 'Active'
                : w.status === 'expiring' ? 'Expiring Soon'
                : 'Expired';
              return (
                <>
                  <div className="border-t border-border my-2" />
                  <div className="text-xs font-medium text-muted-foreground mb-1">Warranty</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Expiry:</span> {formatWarrantyDate((asset as any).warrantyExpiry)} <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badgeClass}`}>{badgeLabel}</span></div>
                    {(asset as any).warrantyNotes && <div><span className="text-muted-foreground">Notes:</span> {(asset as any).warrantyNotes}</div>}
                  </div>
                </>
              );
            })() : (
              <div className="border-t border-border my-2" />
            )}
            {((asset as any).warrantyExpiry == null && !(asset as any).warrantyNotes) && (
              <p className="text-sm italic text-gray-400">No warranty information</p>
            )}

            {asset.imageUrl && <img src={asset.imageUrl} alt={asset.name} className="max-h-48 rounded border border-border" />}
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-2">
            {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {history.map(a => (
              <div key={a.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{(a as any).assignedTo || a.user?.username || 'Unknown'}</span>
                  <span className="text-muted-foreground">{new Date(a.assignedAt).toLocaleDateString()}</span>
                </div>
                <div className="text-muted-foreground text-xs">
                  Returned: {a.returnedAt ? new Date(a.returnedAt).toLocaleDateString() : 'Active'} · Condition: {a.condition || '—'}
                </div>
                {a.notes && <div className="text-muted-foreground mt-1 text-xs">Notes: {a.notes}</div>}
              </div>
            ))}
            {history.length === 0 && !loading && <p className="text-sm text-muted-foreground">No assignment history</p>}
          </div>
        )}

        {tab === 'maintenance' && <MaintenanceTab assetId={asset.id} frequentRepair={frequentRepair} />}
        {tab === 'audit' && <AuditTimeline entityId={asset.id} />}
        {tab === 'overview' && <GuestTokenManager assetId={asset.id} />}
      </div>
    </div>
  );
}