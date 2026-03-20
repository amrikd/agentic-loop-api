import { jsonResponse } from './cors';

// Chaos mode: set to true to make ~33% of requests fail with 500
export const CHAOS_MODE = true;

export function maybeFail(): Response | null {
  if (CHAOS_MODE && Math.random() < 0.33) {
    return jsonResponse({ error: 'Service temporarily unavailable. Please retry.' }, 500);
  }
  return null;
}
