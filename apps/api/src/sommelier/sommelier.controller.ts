import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { SommelierAskResponse } from '@org/shared-types';
import { DailyTokenBudgetGuard } from './daily-token-budget.guard';
import { SommelierAskDto } from './dto/sommelier-ask.dto';
import { SommelierService } from './sommelier.service';

@Controller('sommelier')
export class SommelierController {
  constructor(private readonly sommelier: SommelierService) {}

  /**
   * `POST /api/sommelier` (global prefix `api` set in main.ts — no second
   * prefix here). 200 on success (abstain is also a 200 in later phases).
   *
   * Guards (both run before the handler):
   *  - {@link DailyTokenBudgetGuard}: over-budget → pinned 503 before any work.
   *  - {@link ThrottlerGuard}: route-scoped per-IP + app-wide caps (the named
   *    throttlers configured in SommelierModule). Exceeding either → 429.
   *
   * The `query`/`avoidAllergens` body is validated and unknown fields stripped
   * by the global ValidationPipe (whitelist-only, no `forbidNonWhitelisted`).
   */
  @Post()
  @HttpCode(200)
  @UseGuards(DailyTokenBudgetGuard, ThrottlerGuard)
  ask(@Body() dto: SommelierAskDto): Promise<SommelierAskResponse> {
    return this.sommelier.ask(dto);
  }
}
