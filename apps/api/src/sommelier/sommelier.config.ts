import { registerAs } from '@nestjs/config';

/**
 * T3 — the single typed config surface for the seven §9 sommelier vars.
 *
 * One cohesive namespace (`registerAs('sommelier', …)`) consumed by the module
 * via `ConfigModule.forFeature(sommelierConfig)` and injected as
 * `ConfigType<typeof sommelierConfig>`. Everything that needs a sommelier
 * setting — the throttler factory, the daily token-budget service, and (next)
 * the T7 LLM client — reads it from here. No raw `config.get('SOMMELIER_*')`
 * scattered across the module.
 *
 * Boot safety (§9): `ANTHROPIC_API_KEY` has no default and may be absent. The
 * app must boot fine without it; `anthropicApiKey` is then `undefined` and
 * `hasAnthropicKey` is `false`. T3 does NOT 503 on a missing key — the route
 * keeps returning T2's canned 200. T7 wires "missing key ⇒ 503 at call-time"
 * once the LLM path exists, reusing `SOMMELIER_UNAVAILABLE_ENVELOPE` from
 * `daily-token-budget.guard.ts` (not duplicated here).
 */

/** Defaults from the §9 configuration table (numeric vars only; the key has none). */
export const SOMMELIER_CONFIG_DEFAULTS = {
  model: 'claude-opus-4-8',
  timeoutMs: 25000,
  maxTokens: 1000,
  throttleLimit: 5,
  globalThrottleLimit: 40,
  dailyTokenBudget: 500000,
} as const;

/** The resolved, typed sommelier configuration. */
export interface SommelierConfig {
  /** `ANTHROPIC_API_KEY` — no default; `undefined` when unset/blank (§9). */
  anthropicApiKey: string | undefined;
  /** Convenience flag: true iff a non-blank `ANTHROPIC_API_KEY` is present. */
  hasAnthropicKey: boolean;
  /** `SOMMELIER_MODEL` — defaults to `claude-opus-4-8`. */
  model: string;
  /**
   * `SOMMELIER_TEMPERATURE` — optional sampling temperature (valid range
   * 0.0–1.0). No default: `undefined` when unset/blank, so the request body
   * OMITS `temperature` entirely (the Opus path stays byte-identical). Opus
   * 4.7/4.8 and Fable REJECT temperature with a 400 — only set this on a model
   * that accepts it (Sonnet 4.6 / Haiku 4.5).
   */
  temperature: number | undefined;
  /** `SOMMELIER_TIMEOUT_MS` — server-side Anthropic call timeout (ms). */
  timeoutMs: number;
  /** `SOMMELIER_MAX_TOKENS` — model response cap. */
  maxTokens: number;
  /** `SOMMELIER_THROTTLE_LIMIT` — per-IP req/min on the route. */
  throttleLimit: number;
  /** `SOMMELIER_GLOBAL_THROTTLE_LIMIT` — app-wide req/min cap on the route. */
  globalThrottleLimit: number;
  /** `SOMMELIER_DAILY_TOKEN_BUDGET` — daily token kill-switch ceiling. */
  dailyTokenBudget: number;
}

/**
 * Coerce an env string to a number, falling back to `fallback` for an unset,
 * blank, or non-numeric value. Keeps the defaults table the single source of
 * truth for numeric defaults.
 */
function numberFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const trimmed = value.trim();
  if (trimmed === '') return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Like {@link numberFromEnv} but with NO numeric fallback: an unset, blank, or
 * non-numeric value yields `undefined` (so the caller omits the field), while a
 * valid number string yields that number — including `0`. This is what keeps the
 * Opus default path byte-identical when `SOMMELIER_TEMPERATURE` is not set.
 */
function optionalNumberFromEnv(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Pure reader: environment → typed {@link SommelierConfig}. Unit-testable
 * without booting Nest. `sommelierConfig` (below) delegates to this over
 * `process.env`.
 */
export function loadSommelierConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): SommelierConfig {
  const rawKey = env.ANTHROPIC_API_KEY?.trim();
  const anthropicApiKey =
    rawKey === undefined || rawKey === '' ? undefined : rawKey;

  return {
    anthropicApiKey,
    hasAnthropicKey: anthropicApiKey !== undefined,
    model: env.SOMMELIER_MODEL?.trim() || SOMMELIER_CONFIG_DEFAULTS.model,
    temperature: optionalNumberFromEnv(env.SOMMELIER_TEMPERATURE),
    timeoutMs: numberFromEnv(
      env.SOMMELIER_TIMEOUT_MS,
      SOMMELIER_CONFIG_DEFAULTS.timeoutMs,
    ),
    maxTokens: numberFromEnv(
      env.SOMMELIER_MAX_TOKENS,
      SOMMELIER_CONFIG_DEFAULTS.maxTokens,
    ),
    throttleLimit: numberFromEnv(
      env.SOMMELIER_THROTTLE_LIMIT,
      SOMMELIER_CONFIG_DEFAULTS.throttleLimit,
    ),
    globalThrottleLimit: numberFromEnv(
      env.SOMMELIER_GLOBAL_THROTTLE_LIMIT,
      SOMMELIER_CONFIG_DEFAULTS.globalThrottleLimit,
    ),
    dailyTokenBudget: numberFromEnv(
      env.SOMMELIER_DAILY_TOKEN_BUDGET,
      SOMMELIER_CONFIG_DEFAULTS.dailyTokenBudget,
    ),
  };
}

/**
 * The `sommelier` config namespace. Registered with
 * `ConfigModule.forFeature(sommelierConfig)` and injected via
 * `@Inject(sommelierConfig.KEY) cfg: ConfigType<typeof sommelierConfig>`.
 */
export const sommelierConfig = registerAs(
  'sommelier',
  (): SommelierConfig => loadSommelierConfig(process.env),
);
