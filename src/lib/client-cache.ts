// src/lib/client-cache.ts

interface CacheEntry {
  data: any;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const STALE_TIME_MS = 10 * 60 * 1000; // 10 minutes default for in-memory
const PERSISTENT_STALE_TIME_MS = 30 * 60 * 1000; // 30 minutes for settings

/**
 * Sets a value in the cache with the current timestamp.
 * @param key The cache key.
 * @param data The data to store.
 * @param persist If true, also saves to localStorage.
 */
export const setCache = (key: string, data: any, persist = false): void => {
  const entry: CacheEntry = {
    data,
    timestamp: Date.now(),
  };
  cache.set(key, entry);

  if (persist && typeof window !== 'undefined') {
    try {
      localStorage.setItem(`fixbro_cache_${key}`, JSON.stringify(entry));
    } catch (e) {
      console.warn("client-cache: Failed to persist to localStorage", e);
    }
  }
};

/**
 * Gets a value from the cache if it exists and is not stale.
 * @param key The cache key.
 * @param usePersistence If true, checks localStorage if not in memory.
 * @returns The cached data or null if not found or stale.
 */
export const getCache = <T>(key: string, usePersistence = false): T | null => {
  let entry = cache.get(key);

  if (!entry && usePersistence && typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`fixbro_cache_${key}`);
      if (stored) {
        entry = JSON.parse(stored);
      }
    } catch (e) {
      console.warn("client-cache: Failed to read from localStorage", e);
    }
  }

  if (!entry) {
    return null;
  }

  const staleTime = usePersistence ? PERSISTENT_STALE_TIME_MS : STALE_TIME_MS;
  const isStale = Date.now() - entry.timestamp > staleTime;
  
  if (isStale) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`fixbro_cache_${key}`);
    }
    cache.delete(key);
    return null;
  }

  return entry.data as T;
};

/**
 * Clears the entire cache.
 */
export const clearCache = (): void => {
  cache.clear();
  if (typeof window !== 'undefined') {
    Object.keys(localStorage)
      .filter(key => key.startsWith('fixbro_cache_'))
      .forEach(key => localStorage.removeItem(key));
  }
};
