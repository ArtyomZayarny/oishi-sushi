import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_DAILY_TOKEN_BUDGET = 500_000;

/**
 * T2 cost-guard ②/③ — daily token-budget kill-switch.
 *
 * Keeps a UTC-day rolling sum of model token usage. T7 calls
 * {@link recordUsage} after each Anthropic response (input + output tokens);
 * the {@link DailyTokenBudgetGuard} calls {@link isOverBudget} before the route
 * does any work and returns the pinned 503 envelope when over.
 *
 * - The sum resets automatically at UTC-midnight (keyed on the UTC date).
 * - A single warn-level log fires the first time a day's usage crosses 50% of
 *   the budget (cost-guard ③); it re-arms on the next UTC day.
 *
 * In-memory and per-process by design (MVP): a single API instance, no
 * persistence (§7.7 — nothing health-adjacent is stored). Multi-instance
 * aggregation is out of scope here.
 */
@Injectable()
export class DailyTokenBudget {
  private readonly logger = new Logger(DailyTokenBudget.name);
  private readonly budget: number;

  /** UTC date (YYYY-MM-DD) the current sum belongs to. */
  private day = DailyTokenBudget.utcDay();
  private usedToday = 0;
  private warnedHalfToday = false;

  constructor(private readonly config: ConfigService) {
    this.budget =
      this.config.get<number>(
        'SOMMELIER_DAILY_TOKEN_BUDGET',
        DEFAULT_DAILY_TOKEN_BUDGET,
      ) ?? DEFAULT_DAILY_TOKEN_BUDGET;
  }

  /** Seam T7 plugs into: record tokens consumed by one model call. */
  recordUsage(tokens: number): void {
    this.rolloverIfNeeded();
    this.usedToday += tokens;
    if (
      !this.warnedHalfToday &&
      this.budget > 0 &&
      this.usedToday > this.budget / 2
    ) {
      this.warnedHalfToday = true;
      this.logger.warn(
        `Sommelier daily token usage crossed 50% of budget ` +
          `(${this.usedToday}/${this.budget}) for ${this.day} (UTC).`,
      );
    }
  }

  /** True once the day's summed usage strictly exceeds the budget. */
  isOverBudget(): boolean {
    this.rolloverIfNeeded();
    return this.usedToday > this.budget;
  }

  /** Test-only: clear accumulated usage for the current process. */
  resetForTest(): void {
    this.day = DailyTokenBudget.utcDay();
    this.usedToday = 0;
    this.warnedHalfToday = false;
  }

  private rolloverIfNeeded(): void {
    const today = DailyTokenBudget.utcDay();
    if (today !== this.day) {
      this.day = today;
      this.usedToday = 0;
      this.warnedHalfToday = false;
    }
  }

  private static utcDay(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
