import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DailyTokenBudgetGuard } from './daily-token-budget.guard';
import { DailyTokenBudget } from './daily-token-budget.service';
import { SommelierController } from './sommelier.controller';
import { SommelierService } from './sommelier.service';
import { buildSommelierThrottlers } from './sommelier.throttle';

const DEFAULT_IP_LIMIT = 5;
const DEFAULT_GLOBAL_LIMIT = 40;

/**
 * T2 — sommelier walking skeleton. Wires the throttler (per-IP +
 * app-wide named buckets, limits from config), the daily token-budget
 * kill-switch, and the canned-response controller.
 *
 * `ThrottlerModule.forRoot*` configures the throttlers + storage; the
 * `ThrottlerGuard` is applied route-scoped via `@UseGuards` on the controller
 * (NOT as an `APP_GUARD`), so only `POST /api/sommelier` is rate-limited and no
 * other route gains throttling side effects.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildSommelierThrottlers({
          ip:
            config.get<number>('SOMMELIER_THROTTLE_LIMIT', DEFAULT_IP_LIMIT) ??
            DEFAULT_IP_LIMIT,
          global:
            config.get<number>(
              'SOMMELIER_GLOBAL_THROTTLE_LIMIT',
              DEFAULT_GLOBAL_LIMIT,
            ) ?? DEFAULT_GLOBAL_LIMIT,
        }),
    }),
  ],
  controllers: [SommelierController],
  providers: [SommelierService, DailyTokenBudget, DailyTokenBudgetGuard],
  exports: [DailyTokenBudget],
})
export class SommelierModule {}
