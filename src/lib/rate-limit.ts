const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 60;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export function checkRateLimit(teamId: string): boolean {
  const now = Date.now();
  const entry = store.get(teamId);

  if (!entry || now > entry.resetAt) {
    store.set(teamId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    return false;
  }

  return true;
}
