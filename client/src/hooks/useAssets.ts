import { useState, useEffect, useCallback } from 'react';
import { assetsApi, AssetFilters, Asset } from '../lib/api';

export function useAssets(initialFilters: AssetFilters = {}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number; totalPages: number } | null>(null);
  const [filters, setFilters] = useState<AssetFilters>(initialFilters);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await assetsApi.list(filters);
      setAssets(res.data);
      setMeta(res.meta);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  return { assets, loading, error, meta, filters, setFilters, refetch: fetchAssets };
}