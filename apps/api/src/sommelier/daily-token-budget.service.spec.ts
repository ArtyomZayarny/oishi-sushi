import { Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { SOMMELIER_CONFIG_DEFAULTS, sommelierConfig } from './sommelier.config';
import { DailyTokenBudget } from './daily-token-budget.service';

// T2 cost-guard ② + ③ — daily token-budget kill-switch.
//   - recordUsage(tokens) accumulates a UTC-day rolling sum (the seam T7 calls).
//   - isOverBudget() compares the day's sum to SOMMELIER_DAILY_TOKEN_BUDGET.
//   - Crossing UTC-midnight resets the sum.
//   - A warn-level log fires once when the day's usage first crosses 50%.

// T3 — the service now takes the typed `sommelier` config (injected via
// `sommelierConfig.KEY`) rather than the raw `ConfigService`. Construct it with
// a config object whose `dailyTokenBudget` is the value under test; the other
// fields are spec defaults (unused by DailyTokenBudget).
function makeBudget(budget: number): DailyTokenBudget {
  const config: ConfigType<typeof sommelierConfig> = {
    anthropicApiKey: undefined,
    hasAnthropicKey: false,
    model: SOMMELIER_CONFIG_DEFAULTS.model,
    temperature: undefined,
    timeoutMs: SOMMELIER_CONFIG_DEFAULTS.timeoutMs,
    maxTokens: SOMMELIER_CONFIG_DEFAULTS.maxTokens,
    throttleLimit: SOMMELIER_CONFIG_DEFAULTS.throttleLimit,
    globalThrottleLimit: SOMMELIER_CONFIG_DEFAULTS.globalThrottleLimit,
    dailyTokenBudget: budget,
  };
  return new DailyTokenBudget(config);
}

describe('DailyTokenBudget (T2 cost-guard ②/③)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('isOverBudget — kill-switch threshold', () => {
    it('false when the day sum is below budget', () => {
      const b = makeBudget(1000);
      b.recordUsage(400);
      expect(b.isOverBudget()).toBe(false);
    });

    it('false exactly at budget (strictly-over semantics)', () => {
      const b = makeBudget(1000);
      b.recordUsage(1000);
      expect(b.isOverBudget()).toBe(false);
    });

    it('true once the day sum exceeds budget', () => {
      const b = makeBudget(1000);
      b.recordUsage(1001);
      expect(b.isOverBudget()).toBe(true);
    });

    it('accumulates across multiple recordUsage calls', () => {
      const b = makeBudget(1000);
      b.recordUsage(600);
      b.recordUsage(600);
      expect(b.isOverBudget()).toBe(true);
    });
  });

  describe('UTC-day reset', () => {
    it('resets the rolling sum when the UTC day changes', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T23:59:00.000Z'));
      const b = makeBudget(1000);
      b.recordUsage(900);
      expect(b.isOverBudget()).toBe(false);

      // Cross into the next UTC day.
      jest.setSystemTime(new Date('2026-06-14T00:01:00.000Z'));
      // Yesterday's 900 must no longer count.
      expect(b.isOverBudget()).toBe(false);
      b.recordUsage(900);
      expect(b.isOverBudget()).toBe(false);
      b.recordUsage(200);
      expect(b.isOverBudget()).toBe(true);
    });
  });

  describe('50%-budget warn (cost-guard ③)', () => {
    it('emits exactly one warn when usage first crosses 50% of budget', () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const b = makeBudget(1000);

      b.recordUsage(400); // 40% — no warn
      expect(warn).not.toHaveBeenCalled();

      b.recordUsage(200); // crosses to 60% — warn once
      expect(warn).toHaveBeenCalledTimes(1);

      b.recordUsage(100); // 70% — still in the day, no second warn
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('does not warn when usage stays at or below 50%', () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const b = makeBudget(1000);
      b.recordUsage(500); // exactly 50% — not over half yet
      expect(warn).not.toHaveBeenCalled();
    });

    it('warns again on a new UTC day after crossing 50% again', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T10:00:00.000Z'));
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const b = makeBudget(1000);
      b.recordUsage(600); // day 1 crosses 50% → warn
      expect(warn).toHaveBeenCalledTimes(1);

      jest.setSystemTime(new Date('2026-06-14T10:00:00.000Z'));
      b.recordUsage(600); // day 2 crosses 50% afresh → warn again
      expect(warn).toHaveBeenCalledTimes(2);
    });
  });
});
