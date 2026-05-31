import { useState, useRef, useEffect, useCallback } from 'react';

export interface ADUser {
  username: string;
  displayName: string;
  email: string;
  service?: string;
  direction?: string;
}

interface UseADSearchOptions {
  debounceMs?: number;
  minChars?: number;
  endpoint?: string;
}

interface UseADSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: ADUser[];
  searching: boolean;
  error: string | null;
  clearResults: () => void;
}

export function useADSearch(token: string | null, options?: UseADSearchOptions): UseADSearchReturn {
  const { debounceMs = 400, minChars = 2, endpoint = '/api/ad/search' } = options ?? {};
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ADUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (query.length < minChars) {
      setResults([]);
      setError(null);
      return;
    }
    setSearching(true);
    setError(null);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
        setError('Erreur de recherche');
      } finally {
        setSearching(false);
      }
    }, debounceMs);
  }, [query, token, endpoint, debounceMs, minChars]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { query, setQuery, results, searching, error, clearResults };
}
