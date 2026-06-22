import type { ThrottlerOptions } from '@nestjs/throttler';

/**
 * T2 cost-guard ① — two named throttlers on `POST /api/sommelier` (route-scoped,
 * not app-wide). Both buckets are checked per request; exceeding either → 429.
 *
 * - `ip`     : default tracker → per-IP limit (`SOMMELIER_THROTTLE_LIMIT`).
 * - `global` : a custom per-throttler `getTracker` returning a CONSTANT key, so
 *              every caller shares ONE bucket — an app-wide cap across all IPs
 *              (`SOMMELIER_GLOBAL_THROTTLE_LIMIT`). A second per-IP throttler
 *              would be the wrong shape; this is the cost guard.
 *
 * `@nestjs/throttler` v6 supports a per-throttler `getTracker` on each
 * `ThrottlerOptions`, so the two trackers coexist under one `ThrottlerGuard`
 * without subclassing or per-throttler `generateKey` hacks.
 */
export const SOMMELIER_IP_THROTTLER = 'ip';
export const SOMMELIER_GLOBAL_THROTTLER = 'global';

/** One minute, in milliseconds (v6 ttl unit). */
export const SOMMELIER_THROTTLE_TTL_MS = 60_000;

/** Constant key for the app-wide bucket — identical for every request. */
export const SOMMELIER_GLOBAL_TRACKER_KEY = 'sommelier-global';

export interface SommelierThrottleLimits {
  /** Per-IP req/min. */
  ip: number;
  /** App-wide req/min across all IPs. */
  global: number;
}

export function buildSommelierThrottlers(
  limits: SommelierThrottleLimits,
): ThrottlerOptions[] {
  return [
    {
      name: SOMMELIER_IP_THROTTLER,
      ttl: SOMMELIER_THROTTLE_TTL_MS,
      limit: limits.ip,
      // No getTracker → ThrottlerGuard default keys on req.ip (per-IP bucket).
    },
    {
      name: SOMMELIER_GLOBAL_THROTTLER,
      ttl: SOMMELIER_THROTTLE_TTL_MS,
      limit: limits.global,
      // Constant key → a single shared bucket across all IPs (app-wide cap).
      getTracker: () => SOMMELIER_GLOBAL_TRACKER_KEY,
    },
  ];
}
