const DEFAULT_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { ts: number; data: any; ttl: number }>();

export function aggregateCacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.ts > hit.ttl) {
    cache.delete(key);
    return null;
  }
  return hit.data as T;
}

export function aggregateCacheSet(key: string, data: any, ttl = DEFAULT_TTL_MS) {
  cache.set(key, { ts: Date.now(), data, ttl });
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

export function invalidateAggregateCache(prefix = "") {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
