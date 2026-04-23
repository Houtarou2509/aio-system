import { useState, useEffect } from 'react';
import { assetsApi, Asset, Assignment } from '../../lib/api';
import { MaintenanceTab } from '../maintenance';
import { AuditTimeline } from '../audit';
import { GuestTokenManager } from '../guest';
import FinancialsTab from '../depreciation/FinancialsTab';
import { getWarrantyStatus, formatWarrantyDate } from '../../lib/warranty';
import { RoleGate } from '../auth';

interface Props {
  asset: Asset;
  onClose: () => void;
  onEdit: (asset: Asset) => void;
  onRequest?: (assetId: string) => void;
}

type Tab = 'overview' | 'financials' | 'history' | 'maintenance' | 'audit';

export function AssetDetailModal({ asset, onClose, onEdit, onRequest }: Props) {
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
      <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-lg border border-gray-200 bg-white p-6 shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{asset.name}</h2>
            <p className="text-sm text-gray-500">{asset.type} · {asset.manufacturer || 'No manufacturer'}</p>
          </div>
          <div className="flex gap-2">
            {onRequest && asset.status === 'AVAILABLE' && (
              <RoleGate roles={['STAFF', 'STAFF_ADMIN']}>
                <button onClick={() => onRequest(asset.id)} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90">Request Asset</button>
              </RoleGate>
            )}
            <button onClick={() => onEdit(asset)} className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-100">Edit</button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg">×</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-4">
          {(['overview', 'financials', 'history', 'maintenance', 'audit'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-sm capitalize ${tab === t ? 'border-b-2 border-primary font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{t}</button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
              <div><span className="text-gray-500">Serial:</span> {asset.serialNumber || '—'}</div>
              <div><span className="text-gray-500">Status:</span> <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                asset.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
                asset.status === 'ASSIGNED' ? 'bg-blue-100 text-blue-800' :
                asset.status === 'MAINTENANCE' ? 'bg-yellow-100 text-yellow-800' :
                asset.status === 'RETIRED' ? 'bg-gray-100 text-gray-800' :
                'bg-red-100 text-red-800'
              }`}>{asset.status}</span></div>
              <div><span className="text-gray-500">Location:</span> {asset.location || '—'}</div>
              <div><span className="text-gray-500">Assigned To:</span> {asset.assignedTo ? <span className="font-medium text-gray-900">{asset.assignedTo}</span> : <span className="italic text-gray-400">Unassigned</span>}</div>
              <div><span className="text-gray-500">Purchase Price:</span> {asset.purchasePrice != null ? `₱${Number(asset.purchasePrice).toLocaleString()}` : '—'}</div>
              <div><span className="text-gray-500">Purchase Date:</span> {asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString() : '—'}</div>
              <div><span className="text-gray-500">Property #:</span> {(asset as any).propertyNumber || '—'}</div>
              <div><span className="text-gray-500">Remarks:</span> {(asset as any).remarks || '—'}</div>
              <div><span className="text-gray-500">Created:</span> {new Date(asset.createdAt).toLocaleDateString()}</div>
              <div><span className="text-gray-500">Updated:</span> {new Date(asset.updatedAt).toLocaleDateString()}</div>
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
                  <div className="border-t border-gray-200 my-2" />
                  <div className="text-xs font-medium text-gray-500 mb-1">Warranty</div>
                  <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
                    <div><span className="text-gray-500">Expiry:</span> {formatWarrantyDate((asset as any).warrantyExpiry)} <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badgeClass}`}>{badgeLabel}</span></div>
                    {(asset as any).warrantyNotes && <div><span className="text-gray-500">Notes:</span> {(asset as any).warrantyNotes}</div>}
                  </div>
                </>
              );
            })() : (
              <div className="border-t border-gray-200 my-2" />
            )}
            {((asset as any).warrantyExpiry == null && !(asset as any).warrantyNotes) && (
              <p className="text-sm italic text-gray-400">No warranty information</p>
            )}

            {asset.imageUrl && <img src={asset.imageUrl} alt={asset.name} className="max-h-48 rounded border border-gray-200" />}
          </div>
        )}

        {tab === 'financials' && <FinancialsTab asset={asset} />}
        {tab === 'history' && (
          <div className="space-y-2">
            {loading && <p className="text-sm text-gray-500">Loading...</p>}
            {history.map(a => (
              <div key={a.id} className="rounded-md border border-gray-200 p-3 text-sm bg-white">
                <div className="flex justify-between">
                  <span className="font-medium text-gray-900">{(a as any).assignedTo || a.user?.username || 'Unknown'}</span>
                  <span className="text-gray-500">{new Date(a.assignedAt).toLocaleDateString()}</span>
                </div>
                <div className="text-gray-500 text-xs">
                  Returned: {a.returnedAt ? new Date(a.returnedAt).toLocaleDateString() : 'Active'} · Condition: {a.condition || '—'}
                </div>
                {a.notes && <div className="text-gray-500 mt-1 text-xs">Notes: {a.notes}</div>}
              </div>
            ))}
            {history.length === 0 && !loading && <p className="text-sm text-gray-500">No assignment history</p>}
          </div>
        )}

        {tab === 'maintenance' && <MaintenanceTab assetId={asset.id} frequentRepair={frequentRepair} />}
        {tab === 'audit' && <AuditTimeline entityId={asset.id} />}
        {tab === 'overview' && <GuestTokenManager assetId={asset.id} />}
      </div>
    </div>
  );
}
