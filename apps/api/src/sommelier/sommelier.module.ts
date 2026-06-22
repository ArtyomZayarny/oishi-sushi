import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { MenuService } from '../menu/menu.service';
import {
  ANTHROPIC_CLIENT,
  ANTHROPIC_MESSAGES,
  AnthropicClientProvider,
  createDefaultMessagesCreator,
} from './anthropic-client';
import { DailyTokenBudgetGuard } from './daily-token-budget.guard';
import { DailyTokenBudget } from './daily-token-budget.service';
import { SOMMELIER_MENU } from './menu.port';
import { NaiveKbRetriever } from './naive-kb.retriever';
import { SOMMELIER_RETRIEVER } from './retriever';
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
 *
 * T4 — the `SOMMELIER_RETRIEVER` seam (§4, §6) is bound here to
 * {@link NaiveKbRetriever}, which loads + validates the committed `kb/` corpus
 * once at boot (fail-fast on a malformed doc). Phase 5 rebinds this single token
 * to an embedding adapter with no controller/consumer change. The provider is
 * exported so T7's orchestrator (same module) can inject it. No key dependency —
 * it resolves fine without `ANTHROPIC_API_KEY`.
 *
 * T7 — LLM orchestration wires three more providers:
 *   - `ANTHROPIC_MESSAGES`: the thin SDK-wrapping {@link MessagesCreator},
 *     built from the typed config. It is `null` when no `ANTHROPIC_API_KEY` is
 *     present (boot stays fine; the 503 happens only when the route invokes the
 *     model — {@link AnthropicClientProvider} maps the null creator to 503).
 *   - `ANTHROPIC_CLIENT`: {@link AnthropicClientProvider}, what the service
 *     depends on (key handling, model-call constraints, error→503, parsing).
 *   - `SOMMELIER_MENU`: bound via `useClass: MenuService` so the service gets
 *     the live `listPublic()` snapshot WITHOUT importing `MenuModule` (which
 *     would pull `AuthModule → JwtStrategy → PrismaService` into this graph and
 *     break the DB-free SommelierModule specs at compile time). `PrismaService`
 *     is `@Global` and reachable in the AppModule graph; DB-free specs override
 *     this token with a stub, so MenuService (and its Prisma dep) is never built.
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
  providers: [
    SommelierService,
    DailyTokenBudget,
    DailyTokenBudgetGuard,
    // useFactory (not useClass): NaiveKbRetriever's constructor takes a kbDir
    // string with a resolveKbDir() default, which Nest's DI cannot introspect/
    // inject. The factory calls the no-arg constructor so the default resolver
    // runs (and specs can still pass an explicit fixture dir directly).
    { provide: SOMMELIER_RETRIEVER, useFactory: () => new NaiveKbRetriever() },
    // T7 — Menu snapshot port. useClass so overriding the token in DB-free
    // specs replaces MenuService wholesale (its PrismaService dep is never
    // constructed in a Prisma-less graph).
    { provide: SOMMELIER_MENU, useClass: MenuService },
    // T7 — Anthropic client wrapper (two-layer). The inner MessagesCreator is
    // built from config (null without a key); the outer provider owns the
    // call/error/parse contract.
    {
      provide: ANTHROPIC_MESSAGES,
      inject: [sommelierConfig.KEY],
      useFactory: (config: ConfigType<typeof sommelierConfig>) =>
        createDefaultMessagesCreator(config),
    },
    { provide: ANTHROPIC_CLIENT, useClass: AnthropicClientProvider },
  ],
  exports: [DailyTokenBudget, SOMMELIER_RETRIEVER],
})
export class SommelierModule {}
