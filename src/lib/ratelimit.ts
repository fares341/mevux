// Simple in-memory sliding window limiter (single server deployment)
const hits = new Map<string, number[]>();
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 10000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return true;
}
/** True when `key` already used up `limit` hits in the window (does not record a hit). */
export function isLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  return (hits.get(key) || []).filter((t) => now - t < windowMs).length >= limit;
}
