/**
 * Shared page-render bitmap cache.
 *
 * Kept in its own module so the Zustand store can import cache-clearing logic
 * without pulling in pdfjs-dist (which fails in the jsdom test environment).
 */

export const PAGE_CACHE = new Map<string, ImageBitmap>();
export const MAX_CACHE_SIZE = 20;

export function cacheSet(key: string, bitmap: ImageBitmap) {
  if (PAGE_CACHE.size >= MAX_CACHE_SIZE) {
    const oldest = PAGE_CACHE.keys().next().value;
    if (oldest !== undefined) {
      PAGE_CACHE.get(oldest)?.close();
      PAGE_CACHE.delete(oldest);
    }
  }
  PAGE_CACHE.set(key, bitmap);
}

export function clearPageCache() {
  for (const bmp of PAGE_CACHE.values()) bmp.close();
  PAGE_CACHE.clear();
}

/** Release cached bitmaps for a single document without touching other docs. */
export function clearPageCacheForDoc(fingerprint: string) {
  for (const [key, bmp] of PAGE_CACHE) {
    if (key.startsWith(`${fingerprint}:`)) {
      bmp.close();
      PAGE_CACHE.delete(key);
    }
  }
}
