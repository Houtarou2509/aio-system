import { useState } from 'react';
import { useLookup } from '@/hooks/useLookup';
import LookupTab from '@/components/lookup/LookupTab';
import { useAuth } from '@/context/AuthContext';

const TABS = [
  { key: 'asset-types', label: 'Asset Types' },
  { key: 'manufacturers', label: 'Manufacturers' },
  { key: 'locations', label: 'Locations' },
  { key: 'assigned-to', label: 'Assigned To' },
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
    <div className="p-6">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Inventory Lookup</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage dropdown values for assets. Values can be added, edited, or deactivated.
        </p>
      </div>

      {/* Button-style tabs at top */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg border-2 transition-all shadow-sm ${
              activeTab === tab.key
                ? 'bg-primary text-primary-foreground border-primary shadow-md'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Full-width table content */}
      <div className="w-full">
        <LookupTabWrapper category={activeTab} />
      </div>
    </div>
  );
}
