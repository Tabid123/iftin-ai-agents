/**
 * Small localStorage image cache (data URLs) so logos still render when the
 * device is offline / in airplane mode.
 */
const KEY = 'img_cache_v1';
const MAX_BYTES = 200 * 1024; // per image

type CacheMap = Record<string, string>;

let memo: CacheMap | null = null;

function read(): CacheMap {
  if (memo) return memo;
  try {
    memo = JSON.parse(localStorage.getItem(KEY) || '{}') as CacheMap;
  } catch {
    memo = {};
  }
  return memo;
}

function write(map: CacheMap) {
  memo = map;
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota — drop the cache and start over */
    try {
      localStorage.removeItem(KEY);
      memo = {};
    } catch { /* ignore */ }
  }
}

export function getCachedImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  return read()[url] ?? null;
}

const inflight = new Set<string>();

/** Downloads the image once and stores it as a data URL. */
export async function cacheImage(url: string | null | undefined): Promise<string | null> {
  if (!url || url.startsWith('data:')) return url ?? null;
  const existing = getCachedImage(url);
  if (existing) return existing;
  if (inflight.has(url)) return null;
  inflight.add(url);
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > MAX_BYTES) return null;
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (!dataUrl) return null;
    write({ ...read(), [url]: dataUrl });
    return dataUrl;
  } catch {
    return null;
  } finally {
    inflight.delete(url);
  }
}

export function cacheImages(urls: (string | null | undefined)[]) {
  const unique = [...new Set(urls.filter(Boolean) as string[])];
  unique.forEach((u) => { void cacheImage(u); });
}
