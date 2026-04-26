import { useState, useEffect } from 'react';
import { useLookup } from '@/hooks/useLookup';
import LookupTab from '@/components/lookup/LookupTab';
import { useAuth } from '@/context/AuthContext';
import {
  Package, Factory, MapPin, Users,
} from 'lucide-react';

const TABS = [
  { key: 'asset-types', label: 'Asset Types', icon: Package, category: 'asset-types' },
  { key: 'manufacturers', label: 'Manufacturers', icon: Factory, category: 'manufacturers' },
  { key: 'locations', label: 'Locations', icon: MapPin, category: 'locations' },
  { key: 'assigned-to', label: 'Assigned To', icon: Users, category: 'assigned-to' },
];

function LookupTabWrapper({ category }: { category: string }) {
  const { values, isLoading, error, addValue, editValue, toggleValue } = useLookup(category);

  if (error) {
    return <p className="text-sm text-destructive py-4">Error: {error}</p>;
  }

  return (
    <LookupTab
      category={category}
      values={values}
      isLoading={isLoading}
      onAdd={addValue}
      onEdit={editValue}
      onToggle={toggleValue}
    />
  );
}

export default function InventoryLookupPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('asset-types');

  // KPI counts
  const [counts, setCounts] = useState<Record<string, number>>({
    'asset-types': 0,
    'manufacturers': 0,
    'locations': 0,
    'assigned-to': 0,
  });

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const headers = { Authorization: `Bearer ${token}` };
    TABS.forEach(async (tab) => {
      try {
        const res = await fetch(`/api/lookups/${tab.category}/all`, { headers });
        const json = await res.json();
        if (json.success) {
          setCounts(prev => ({ ...prev, [tab.key]: json.data?.length ?? 0 }));
        }
      } catch { /* silently skip */ }
    });
  }, []);

  const allowed = user?.role === 'ADMIN' || user?.role === 'STAFF_ADMIN';

  if (!allowed) {
    return (
      <div className="p-6">
        <p className="text-destructive font-medium">
          Access denied. Admins and Staff-Admins only.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">

      {/* ═══ STICKY NAVY HEADER ═════════════════════════════ */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#012061] px-6 py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Package className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">Inventory Lookups</h1>
          </div>
          <p className="hidden sm:block text-xs text-white/60 bg-white/10 rounded-lg px-3 py-2">
            Manage dropdown values for assets
          </p>
        </div>
      </header>

      {/* ═══ KPI TILES ═══════════════════════════════════════ */}
      <section className="px-6 pt-4 shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors text-left ${
                activeTab === key
                  ? 'border-[#f8931f] bg-[#f8931f]/5'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                activeTab === key ? 'bg-[#f8931f]/20' : 'bg-[#f8931f]/10'
              }`}>
                <Icon className={`h-5 w-5 ${activeTab === key ? 'text-[#f8931f]' : 'text-[#f8931f]/70'}`} />
              </div>
              <div className="min-w-0">
                <p className={`text-xl font-bold leading-tight ${
                  activeTab === key ? 'text-[#f8931f]' : 'text-slate-900'
                }`}>
                  {counts[key] ?? 0}
                </p>
                <p className="text-[10px] tracking-widest text-slate-500 uppercase">{label}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ═══ TAB BAR ═════════════════════════════════════════ */}
      <section className="px-6 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === key
                  ? 'bg-[#f8931f] text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* ═══ TABLE CONTENT ═══════════════════════════════════ */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <LookupTabWrapper category={activeTab} />
      </div>
    </div>
  );
}