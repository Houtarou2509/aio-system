import { useState, useEffect } from 'react';

/**
 * Debounces a value by the specified delay.
 * Returns the value only after it stops changing for `delay` ms.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
