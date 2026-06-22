import type { CategoryWithMeals } from '../menu/menu.service';

/**
 * T7 — the `SOMMELIER_MENU` seam.
 *
 * SommelierService needs the live "safe to recommend" menu snapshot
 * (`MenuService.listPublic()`, the single authority for active + non-deleted).
 * It depends on this NARROW port rather than importing `MenuModule` directly —
 * importing MenuModule would transitively pull `AuthModule → JwtStrategy →
 * PrismaService` into SommelierModule's graph and break the DB-free
 * SommelierModule specs (which boot only SommelierModule + ConfigModule, no
 * Postgres) at module-compile time.
 *
 * In the real app graph the token is bound to {@link MenuService} (Prisma is
 * `@Global` and reachable via AppModule); DB-free specs override the token with
 * a stub. `MenuService` already satisfies this interface structurally — the
 * binding is `{ provide: SOMMELIER_MENU, useClass: MenuService }`, so overriding
 * the token replaces MenuService wholesale and its PrismaService dependency is
 * never constructed.
 *
 * `CategoryWithMeals` is a type-only import (erased at compile) — it creates no
 * DI edge, mirroring the safe pattern already used in `candidates.ts`.
 */
export interface MenuPort {
  /** The single authority for recommendable meals (active + non-deleted). */
  listPublic(): Promise<CategoryWithMeals[]>;
}

/** DI token for the {@link MenuPort}. Bound to MenuService in SommelierModule. */
export const SOMMELIER_MENU = Symbol('SOMMELIER_MENU');
