const buckets = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 15;

export function checkRateLimit(key) {
  // Bypass rate limit di development atau localhost agar tidak terkunci
  if (
    process.env.NODE_ENV !== 'production' ||
    key.includes('127.0.0.1') ||
    key.includes('::1') ||
    key.includes('localhost') ||
    key.includes('unknown')
  ) {
    return { allowed: true, remaining: 999 };
  }

  const now = Date.now();
  const item = buckets.get(key);
  if (!item || now - item.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }
  item.count += 1;
  return { allowed: item.count <= MAX_ATTEMPTS, remaining: Math.max(0, MAX_ATTEMPTS - item.count) };
}
