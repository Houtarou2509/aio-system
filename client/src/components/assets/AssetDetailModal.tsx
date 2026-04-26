import { useState, useEffect } from 'react';
import { Asset } from '../../lib/api';
import { MaintenanceTab } from '../maintenance';
import { AuditTimeline } from '../audit';
import { GuestTokenManager } from '../guest';
import FinancialsTab from '../depreciation/FinancialsTab';
import { getWarrantyStatus, formatWarrantyDate } from '../../lib/warranty';
import { RoleGate } from '../auth';
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
  onRequest?: (assetId: string) => void;
}

/* ─── Status Badge Config ─── */
const STATUS_CONFIG: Record<string, { className: string; label: string }> = {
  AVAILABLE: { className: 'bg-[#012061]/5 text-[#012061] border-[#012061]/20', label: 'Available' },
  ASSIGNED: { className: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Assigned' },
  MAINTENANCE: { className: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Maintenance' },
  RETIRED: { className: 'bg-slate-100 text-slate-600 border-slate-200', label: 'Retired' },
  LOST: { className: 'bg-red-50 text-red-700 border-red-200', label: 'Lost' },
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
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-xs">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#f8931f]/10 text-[#f8931f]">
          <Icon className="w-3.5 h-3.5" />
        </div>
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  );
}

/* ─── Info Row ─── */
function InfoRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className={`text-xs font-medium text-right ${highlight ? 'text-[#f8931f]' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

/* ═════════════════════════════════════════════════════
   ASSET DETAIL MODAL
   ═════════════════════════════════════════════════════ */
export function AssetDetailModal({ asset, onClose, onEdit, onRequest }: Props) {
  const [tab, setTab] = useState('overview');
  const [frequentRepair, setFrequentRepair] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (tab === 'maintenance') {
      fetch(`/api/assets/${asset.id}/maintenance`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      })
        .then(r => r.json())
        .then(d => { if (d.meta?.frequentRepair) setFrequentRepair(true); })
        .catch(() => {});
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
          className="sm:max-w-4xl h-screen md:h-[700px] flex flex-col p-0 gap-0 overflow-hidden"
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
                {onRequest && asset.status === 'AVAILABLE' && (
                  <RoleGate roles={['STAFF', 'STAFF_ADMIN']}>
                    <button
                      onClick={() => onRequest(asset.id)}
                      className="rounded-lg bg-[#f8931f] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e0841a] transition-colors"
                    >
                      Request
                    </button>
                  </RoleGate>
                )}
                <button
                  onClick={() => onEdit(asset)}
                  className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-colors inline-flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg border border-white/20 bg-white/10 p-1.5 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
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
            <div className="px-6 pt-3 shrink-0 border-b border-slate-100">
              <TabsList variant="line" className="w-full justify-start gap-0">
                {[
                  { value: 'overview', label: 'Overview', icon: Info },
                  { value: 'financials', label: 'Financials', icon: DollarSign },
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
                      <div className="relative rounded-xl overflow-hidden border border-slate-100 bg-slate-50 group">
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
                      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12">
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
                        <InfoRow label="Assigned To" value={asset.assignedTo ? <span className="text-[#f8931f] font-semibold">{asset.assignedTo}</span> : <span className="text-slate-400 italic">Unassigned</span>} highlight={!!asset.assignedTo} />
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
                          const wBadge = w.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : w.status === 'expiring' ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-red-50 text-red-700 border-red-200';
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

                {/* ─── History Tab ─── */}
                {tab === 'history' && (
                  <div className="space-y-3">
                    {asset.assignedTo ? (
                      <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-4 bg-white shadow-xs">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#012061] text-white text-sm font-bold">
                          {asset.assignedTo[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#012061]">{asset.assignedTo}</p>
                          <p className="text-xs text-slate-500">Currently assigned · Since {new Date(asset.updatedAt).toLocaleDateString()}</p>
                        </div>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#012061]/5 text-[#012061] border border-[#012061]/20">Active</span>
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