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
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Inventory Lookup</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage dropdown values for assets. Values can be added, edited, or deactivated.
        </p>
      </div>

      {/* Compact underline tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Full-width table content */}
      <div className="w-full mt-4">
        <LookupTabWrapper category={activeTab} />
      </div>
    </div>
  );
}
