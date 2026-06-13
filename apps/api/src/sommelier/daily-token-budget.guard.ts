import {
  CanActivate,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DailyTokenBudget } from './daily-token-budget.service';

/**
 * The pinned 503 envelope for the sommelier (§6). A full object passed as the
 * `HttpException` response is sent verbatim as the JSON body.
 */
export const SOMMELIER_UNAVAILABLE_ENVELOPE = {
  statusCode: 503,
  error: 'SOMMELIER_UNAVAILABLE',
  message: 'The sommelier is temporarily unavailable. Please try again.',
} as const;

/**
 * T2 cost-guard ② — daily token-budget kill-switch. Runs before the route does
 * any work: when the day's usage is over budget, short-circuits with the pinned
 * 503 `SOMMELIER_UNAVAILABLE` envelope until the UTC-midnight reset.
 */
@Injectable()
export class DailyTokenBudgetGuard implements CanActivate {
  constructor(private readonly budget: DailyTokenBudget) {}

  canActivate(): boolean {
    if (this.budget.isOverBudget()) {
      throw new ServiceUnavailableException(SOMMELIER_UNAVAILABLE_ENVELOPE);
    }
    return true;
  }
}
