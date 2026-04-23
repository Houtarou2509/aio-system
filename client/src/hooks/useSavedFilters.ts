import { useState, useEffect } from 'react';

export function useSavedFilters(storageKey = 'aio-saved-filters') {
  const [savedFilters, setSavedFilters] = useState<Array<{ name: string; filters: Record<string, string> }>>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setSavedFilters(JSON.parse(stored));
    } catch {}
  }, [storageKey]);

  const saveFilter = (name: string, filters: Record<string, string>) => {
    const updated = [...savedFilters, { name, filters }];
    setSavedFilters(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const deleteFilter = (name: string) => {
    const updated = savedFilters.filter(f => f.name !== name);
    setSavedFilters(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  return { savedFilters, saveFilter, deleteFilter };
}