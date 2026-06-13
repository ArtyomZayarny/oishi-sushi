import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DailyTokenBudgetGuard } from './daily-token-budget.guard';
import { DailyTokenBudget } from './daily-token-budget.service';
import { sommelierConfig } from './sommelier.config';
import { SommelierController } from './sommelier.controller';
import { SommelierService } from './sommelier.service';
import { buildSommelierThrottlers } from './sommelier.throttle';

/**
 * T2 — sommelier walking skeleton; T3 — typed config surface.
 *
 * All seven §9 vars are read through one cohesive namespace
 * (`sommelierConfig`, registered via `ConfigModule.forFeature`). The throttler
 * factory and {@link DailyTokenBudget} now consume that typed config instead of
 * scattered `ConfigService.get('SOMMELIER_*')` calls — behaviour is unchanged
 * (same env vars, same defaults).
 *
 * `ThrottlerModule.forRoot*` configures the throttlers + storage; the
 * `ThrottlerGuard` is applied route-scoped via `@UseGuards` on the controller
 * (NOT as an `APP_GUARD`), so only `POST /api/sommelier` is rate-limited and no
 * other route gains throttling side effects.
 */
@Module({
  imports: [
    ConfigModule.forFeature(sommelierConfig),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule.forFeature(sommelierConfig)],
      inject: [sommelierConfig.KEY],
      useFactory: (config: ConfigType<typeof sommelierConfig>) =>
        buildSommelierThrottlers({
          ip: config.throttleLimit,
          global: config.globalThrottleLimit,
        }),
    }),
  ],
  controllers: [SommelierController],
  providers: [SommelierService, DailyTokenBudget, DailyTokenBudgetGuard],
  exports: [DailyTokenBudget],
})
export class SommelierModule {}
