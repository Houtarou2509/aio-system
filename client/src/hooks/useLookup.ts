import { useState, useEffect, useCallback } from 'react';
import { LookupValue } from '@/types/lookup';

const BASE_URL = '/api/lookups';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('accessToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useLookup(category: string) {
  const [values, setValues] = useState<LookupValue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all values including inactive
  const fetchValues = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${BASE_URL}/${category}/all`,
        { headers: getAuthHeader() }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || json.error);
      setValues(json.data);
    } catch (e: any) {
      setError(e.message || 'Failed to load values.');
    } finally {
      setIsLoading(false);
    }
  }, [category]);

  useEffect(() => {
    fetchValues();
  }, [fetchValues]);

  // Add a new value
  const addValue = useCallback(async (value: string) => {
    const res = await fetch(
      `${BASE_URL}/${category}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify({ value })
      }
    );
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || json.error);
    await fetchValues();
  }, [category, fetchValues]);

  // Edit an existing value
  const editValue = useCallback(async (id: number, value: string) => {
    const res = await fetch(
      `${BASE_URL}/${id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify({ value })
      }
    );
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || json.error);
    await fetchValues();
  }, [fetchValues]);

  // Toggle isActive
  const toggleValue = useCallback(async (id: number, isActive: boolean) => {
    const res = await fetch(
      `${BASE_URL}/${id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify({ isActive })
      }
    );
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || json.error);
    await fetchValues();
  }, [fetchValues]);

  return {
    values,
    isLoading,
    error,
    addValue,
    editValue,
    toggleValue,
    refetch: fetchValues
  };
}