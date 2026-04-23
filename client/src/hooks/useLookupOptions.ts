import { useState, useEffect } from 'react';
import { LookupValue } from '@/types/lookup';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('accessToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useLookupOptions(category: string) {
  const [options, setOptions] = useState<LookupValue[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetch_() {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/lookups/${category}`,
          { headers: getAuthHeader() }
        );
        const json = await res.json();
        if (!cancelled && json.success) {
          setOptions(json.data);
        }
      } catch {
        // silently fail — dropdown will be empty
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    fetch_();
    return () => { cancelled = true; };
  }, [category]);

  return { options, isLoading };
}