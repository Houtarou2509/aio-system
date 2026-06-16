import { useState, useEffect, useCallback, useMemo } from 'react';
import { assetsApi, AssetFilters, Asset } from '../lib/api';
import { useDebounce } from './useDebounce';

export function useAssets(initialFilters: AssetFilters = {}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number; totalPages: number } | null>(null);
  const [filters, setFilters] = useState<AssetFilters>(initialFilters);

  // Debounce search to avoid firing on every keystroke
  const debouncedSearch = useDebounce(filters.search, 300);

  // Build the API-ready filters: use debounced search but immediate everything else
  const apiFilters = useMemo(() => ({
    ...filters,
    search: debouncedSearch,
  }), [filters, debouncedSearch]);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await assetsApi.list(apiFilters);
      setAssets(res.data);
      setMeta(res.meta);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiFilters]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  // Fetch all asset IDs matching the current filters (used for "select all matching")
  const fetchAllIds = useCallback(async () => {
    const ids: string[] = [];
    let page = 1;
    let totalPages = 1;
    const baseFilters = { ...apiFilters, limit: 100 };
    do {
      const res = await assetsApi.list({ ...baseFilters, page });
      ids.push(...res.data.map(a => a.id));
      totalPages = res.meta?.totalPages ?? 1;
      page++;
    } while (page <= totalPages);
    return ids;
  }, [apiFilters]);

  return { assets, loading, error, meta, filters, setFilters, refetch: fetchAssets, fetchAllIds };
}
