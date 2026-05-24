import { useState, useEffect } from 'react';
import { Asset } from '../../lib/api';
import { MaintenanceTab } from '../maintenance';
import { AuditTimeline } from '../audit';
import { GuestTokenManager } from '../guest';
import FinancialsTab from '../depreciation/FinancialsTab';
import { getWarrantyStatus, formatWarrantyDate } from '../../lib/warranty';
import { PermissionGate } from '../auth';
import { useAuth } from '../../context/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '../ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import {
  Info,
  Tag,
  Shield,
  DollarSign,
  User,
  Wrench,
  FileText,
  Pencil,
  X,
  MapPin,
  Clock,
  Package,
  ImageIcon,
  ZoomIn,
  Trash2,
  Activity,
} from 'lucide-react';

/** Resolve asset image URL — prepend base path if relative */
function getImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (url.startsWith('/uploads')) {
    if (import.meta.env.DEV) return url;
    const base = import.meta.env.BASE_URL?.replace(/\/+$/, '') || '/aio-system';
    return `${base}${url}`;
  }
  return url;
}

interface Props {
  asset: Asset;
  onClose: () => void;
  onEdit: (asset: Asset) => void;
  onDispose?: (asset: Asset) => void;
}

/* ─── Status Badge Config ─── */
const STATUS_CONFIG: Record<string, { className: string; label: string }> = {
  AVAILABLE: { className: 'bg-[#012061]/5 dark:bg-slate-700/40 text-[#012061] dark:text-slate-100 border-[#012061]/20', label: 'Available' },
  ASSIGNED: { className: 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-200 border-blue-200', label: 'Assigned' },
  MAINTENANCE: { className: 'bg-amber-50 dark:bg-amber-950 text-amber-700 border-amber-200', label: 'Maintenance' },
  RETIRED: { className: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700', label: 'Retired' },
  LOST: { className: 'bg-red-50 dark:bg-red-950 text-red-700 border-red-200', label: 'Lost' },
};

/* ─── Info Card ─── */
function InfoCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-xs">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#f8931f]/10 text-[#f8931f]">
          <Icon className="w-3.5 h-3.5" />
        </div>
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  );
}

/* ─── Info Row ─── */
function InfoRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500 dark:text-slate-400 text-xs">{label}</span>
      <span className={`text-xs font-medium text-right ${highlight ? 'text-[#f8931f]' : 'text-slate-900 dark:text-slate-100'}`}>{value}</span>
    </div>
  );
}

/* ═════════════════════════════════════════════════════
   ASSET DETAIL MODAL
   ═════════════════════════════════════════════════════ */
export function AssetDetailModal({ asset, onClose, onEdit, onDispose }: Props) {
  useAuth();
  const [tab, setTab] = useState('overview');
  const [frequentRepair, setFrequentRepair] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [conditionLogs, setConditionLogs] = useState<Array<{
    id: string; event: string; condition: string; note: string | null;
    recordedByName: string | null; recordedAt: string;
  }> | null>(null);
  const [conditionLoading, setConditionLoading] = useState(false);

  useEffect(() => {
    if (tab === 'maintenance') {
      fetch(`/api/assets/${asset.id}/maintenance`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      })
        .then(r => r.json())
        .then(d => { if (d.meta?.frequentRepair) setFrequentRepair(true); })
        .catch((e) => console.error('[AssetDetailModal] Failed to check frequent repair:', e));
    }
    if (tab === 'condition') {
      setConditionLoading(true);
      fetch(`/api/assets/${asset.id}/condition-history`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      })
        .then(r => r.json())
        .then(d => { setConditionLogs(Array.isArray(d.data) ? d.data : []); })
        .catch(() => { setConditionLogs([]); })
        .finally(() => setConditionLoading(false));
    }
  }, [tab, asset.id]);

  // Reset image error state when asset changes
  useEffect(() => { setImgError(false); }, [asset.id]);

  const statusConf = STATUS_CONFIG[asset.status] || STATUS_CONFIG.AVAILABLE;
  const resolvedImgUrl = getImageUrl(asset.imageUrl);
  const hasImage = !!resolvedImgUrl && !imgError;

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent
          className="sm:max-w-6xl h-screen md:h-[700px] flex flex-col p-0 gap-0 overflow-hidden"
          showCloseButton={false}
        >
          {/* ─── Header Bar ─── */}
          <div className="bg-[#012061] px-6 py-4 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#f8931f] text-white">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-white">Asset Details</DialogTitle>
                  <p className="text-xs text-white/60">{asset.name} · {asset.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${statusConf.className}`}>
                  {statusConf.label}
                </span>
                <PermissionGate permissions={['assets:edit']}>
                  <button
                    onClick={() => onEdit(asset)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-colors inline-flex items-center gap-1"
                    style={{ backgroundColor: '#f8931f' }}
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                </PermissionGate>
                {asset.status !== 'RETIRED' && onDispose && (
                  <PermissionGate permissions={['assets:delete']}>
                  <button
                    onClick={() => { onDispose(asset); }}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-colors inline-flex items-center gap-1"
                    style={{ backgroundColor: '#7B1113' }}
                    title="Dispose this asset"
                  >
                    <Trash2 className="w-3 h-3" />
                    Dispose
                  </button>
                  </PermissionGate>
                  )}
                <button
                  onClick={onClose}
                  className="rounded-lg border border-white/20 bg-white dark:bg-slate-800/10 p-1.5 text-slate-700 dark:text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* ─── Tabs ─── */}
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="px-6 pt-3 shrink-0 border-b border-slate-100 dark:border-slate-700">
              <TabsList variant="line" className="w-full justify-start gap-0">
                {[
                  { value: 'overview', label: 'Overview', icon: Info },
                  { value: 'financials', label: 'Financials', icon: DollarSign },
                  { value: 'condition', label: 'Condition', icon: Activity },
                  { value: 'history', label: 'History', icon: User },
                  { value: 'maintenance', label: 'Maintenance', icon: Wrench },
                  { value: 'audit', label: 'Audit', icon: FileText },
                ].map(t => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium capitalize data-active:text-[#f8931f] data-active:after:bg-[#f8931f] hover:text-[#f8931f]"
                  >
                    <t.icon className="w-3.5 h-3.5" />
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* ─── Scrollable Content ─── */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-6">

                {/* ─── Overview Tab ─── */}
                {tab === 'overview' && (
                  <div className="space-y-4">

                    {/* ─── Premium Hero Image ─── */}
                    {hasImage ? (
                      <div className="relative rounded-xl overflow-hidden border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 group">
                        <img
                          src={resolvedImgUrl}
                          alt={asset.name}
                          className="w-full max-h-[350px] object-contain cursor-pointer group-hover:brightness-95 transition-all"
                          onClick={() => setShowLightbox(true)}
                          onError={() => setImgError(true)}
                        />
                        {/* Zoom overlay hint */}
                        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg bg-[#012061]/80 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <ZoomIn className="w-3.5 h-3.5" />
                          Click to expand
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 py-12">
                        <ImageIcon className="h-10 w-10 text-slate-300 mb-2" />
                        <p className="text-sm text-slate-400 font-medium">No Image Available</p>
                      </div>
                    )}

                    {/* ─── Metadata Cards ─── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* General Info */}
                      <InfoCard icon={Info} title="General Info">
                        <InfoRow label="Serial Number" value={asset.serialNumber || '—'} />
                        <InfoRow label="Property #" value={(asset as any).propertyNumber || '—'} />
                        <InfoRow label="Location" value={<span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" />{asset.location || '—'}</span>} />
                        <InfoRow label="Assigned To (legacy)" value={asset.assignedTo ? <span className="text-[#f8931f] font-semibold">{asset.assignedTo}</span> : <span className="text-slate-400 italic">Unassigned</span>} highlight={!!asset.assignedTo} />
                        <InfoRow label="Status" value={<span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusConf.className}`}>{statusConf.label}</span>} />
                      </InfoCard>

                      {/* Purchase Details */}
                      <InfoCard icon={Tag} title="Purchase Details">
                        <InfoRow label="Purchase Price" value={asset.purchasePrice != null ? <span className="text-[#f8931f]">₱{Number(asset.purchasePrice).toLocaleString()}</span> : '—'} highlight />
                        <InfoRow label="Purchase Date" value={asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString() : '—'} />
                        <InfoRow label="Remarks" value={(asset as any).remarks || '—'} />
                      </InfoCard>

                      {/* Warranty */}
                      <InfoCard icon={Shield} title="Warranty">
                        {(!((asset as any).warrantyExpiry == null && !(asset as any).warrantyNotes)) ? (() => {
                          const w = getWarrantyStatus((asset as any).warrantyExpiry);
                          const wBadge = w.status === 'active' ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200 border-emerald-200'
                            : w.status === 'expiring' ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 border-amber-200'
                            : 'bg-red-50 dark:bg-red-950 text-red-700 border-red-200';
                          const wLabel = w.status === 'active' ? 'Active'
                            : w.status === 'expiring' ? 'Expiring Soon'
                            : 'Expired';
                          return (
                            <>
                              <InfoRow label="Expiry" value={<span className="inline-flex items-center gap-1.5">{formatWarrantyDate((asset as any).warrantyExpiry)} <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${wBadge}`}>{wLabel}</span></span>} />
                              {(asset as any).warrantyNotes && <InfoRow label="Notes" value={(asset as any).warrantyNotes} />}
                            </>
                          );
                        })() : (
                          <p className="text-xs text-slate-400 italic">No warranty information</p>
                        )}
                      </InfoCard>

                      {/* Timestamps */}
                      <InfoCard icon={Clock} title="Timestamps">
                        <InfoRow label="Created" value={new Date(asset.createdAt).toLocaleDateString()} />
                        <InfoRow label="Updated" value={new Date(asset.updatedAt).toLocaleDateString()} />
                      </InfoCard>
                    </div>

                    {/* Guest Token Manager */}
                    <GuestTokenManager assetId={asset.id} />
                  </div>
                )}

                {/* ─── Financials Tab ─── */}
                {tab === 'financials' && <FinancialsTab asset={asset} />}

                {/* ─── Condition History Tab ─── */}
                {tab === 'condition' && (
                  <div className="space-y-4">
                    {conditionLoading && (
                      <div className="flex items-center justify-center py-12">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#012061] border-t-transparent" />
                        <span className="ml-3 text-sm text-slate-500">Loading condition history…</span>
                      </div>
                    )}
                    {!conditionLoading && conditionLogs !== null && conditionLogs.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                        <Activity className="w-10 h-10 mb-3 opacity-30" />
                        <p className="text-sm">No condition history recorded yet.</p>
                      </div>
                    )}
                    {!conditionLoading && conditionLogs !== null && conditionLogs.length > 0 && (
                      <div className="relative pl-6">
                        {/* Timeline connector line */}
                        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
                        {conditionLogs.map((log) => {
                          const eventConfig: Record<string, { bg: string; text: string; label: string }> = {
                            issued:       { bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800', label: 'Issued' },
                            returned:     { bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', label: 'Returned' },
                            transferred:  { bg: 'bg-orange-50 dark:bg-orange-950', text: 'text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800', label: 'Transferred' },
                            manual:       { bg: 'bg-slate-50 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700', label: 'Manual' },
                          };
                          const cfg = eventConfig[log.event] || eventConfig.manual;
                          return (
                            <div key={log.id} className="relative pb-6 last:pb-0">
                              {/* Timeline dot */}
                              <div className={`absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full ${cfg.bg} border-2 border-white dark:border-slate-900 shadow-sm`}>
                                <div className={`h-2 w-2 rounded-full ${cfg.text.replace(/border-.*/, '').replace('text-', 'bg-')}`} />
                              </div>
                              {/* Card */}
                              <div className={`rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-xs`}>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.text}`}>
                                    {cfg.label}
                                  </span>
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#012061]/5 dark:bg-slate-700/40 text-[#012061] dark:text-slate-100 border border-[#012061]/20">
                                    {log.condition}
                                  </span>
                                </div>
                                {log.note && (
                                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">{log.note}</p>
                                )}
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                                  <Clock className="w-3 h-3" />
                                  <span>{new Date(log.recordedAt).toLocaleString()}</span>
                                  {log.recordedByName && (
                                    <>
                                      <span className="mx-1">·</span>
                                      <span>{log.recordedByName}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ─── History Tab ─── */}
                {tab === 'history' && (
                  <div className="space-y-3">
                    {asset.assignedTo ? (
                      <div className="flex items-center gap-3 rounded-xl border border-slate-100 dark:border-slate-700 p-4 bg-white dark:bg-slate-800 shadow-xs">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#012061] text-white text-sm font-bold">
                          {asset.assignedTo[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#012061] dark:text-slate-100">{asset.assignedTo}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Currently assigned · Since {new Date(asset.updatedAt).toLocaleDateString()}</p>
                        </div>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#012061]/5 dark:bg-slate-700/40 text-[#012061] dark:text-slate-100 border border-[#012061]/20">Active</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                        <User className="w-10 h-10 mb-3 opacity-30" />
                        <p className="text-sm">Not assigned to anyone</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Maintenance Tab ─── */}
                {tab === 'maintenance' && <MaintenanceTab assetId={asset.id} frequentRepair={frequentRepair} />}

                {/* ─── Audit Tab ─── */}
                {tab === 'audit' && <AuditTimeline entityId={asset.id} />}

              </div>
            </ScrollArea>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ─── Lightbox Overlay ─── */}
      {showLightbox && hasImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
          onClick={() => setShowLightbox(false)}
        >
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowLightbox(false)}
              className="absolute -top-4 -right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[#012061] text-white shadow-lg hover:bg-[#012061]/80 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={resolvedImgUrl}
              alt={asset.name}
              className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
}