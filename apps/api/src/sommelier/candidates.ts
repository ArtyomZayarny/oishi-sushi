import type { Meal } from '@prisma/client';
import type { CategoryWithMeals } from '../menu/menu.service';

/**
 * T6 — Candidate assembly: hard allergen filter + newest marking (spec §4 steps
 * 2–4, §5 F4/F2/F5, §7.1–7.2). The safety kernel.
 *
 * Pure functions over a request-scoped meal snapshot — NO database access here.
 * `MenuService.listPublic()` is fetched ONCE per request (§4 step 2); these
 * functions operate on that single snapshot so the same set serves both the
 * pre-generation filter (T6) and the fail-closed post-validation (T8). There is
 * no second fetch (F5 / §7.2).
 *
 * Pipeline:
 *   listPublic() → flattenSnapshot → filterByAllergens → markNewest → candidates
 *
 * Downstream consumers:
 *   - T7 serializes each {@link Candidate} into the grounded prompt — exactly
 *     `{id, name, description, priceCents, allergens, category, isNewest}` (§4
 *     step 6); names/prices come from this snapshot, so the model cannot
 *     fabricate a meal or a price.
 *   - T8 re-checks model-emitted ids against the survivors AND the
 *     `excludedIds` set returned by {@link filterByAllergens} (fail-closed even
 *     if the prompt is bypassed — F4-AC2).
 */

/**
 * A live menu meal enriched with its parent category NAME, ready for prompting.
 * `listPublic()` returns `CategoryWithMeals[]` where each `Meal` row carries
 * only `categoryId` (no nested category object), so {@link flattenSnapshot}
 * attaches `category` from the parent `Category.name`.
 */
export type SnapshotMeal = Meal & {
  /** Parent category name (e.g. "Maki"), attached during flatten. */
  category: string;
};

/**
 * The recommendable-candidate shape T7 serializes into the prompt and T8
 * re-validates. Intentionally server-internal — it never crosses the wire (the
 * wire type is `SommelierMealRef`), so it lives here in `apps/api`, not in
 * `libs/shared-types` (which carries the wire contract only, mirroring the
 * `Retriever`/`RetrievedDoc` seam rule).
 */
export interface Candidate {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  allergens: string[];
  category: string;
  /** True iff this is among the top-5 newest surviving candidates (F2-AC1). */
  isNewest: boolean;
}

/** How many newest survivors {@link markNewest} flags (§4 step 4, F2-AC1). */
const NEWEST_LIMIT = 5;

/**
 * Normalize an allergen token for exact-match comparison (§7.1): trim, collapse
 * internal whitespace runs to a single space, lowercase. Internal-whitespace
 * collapse is deliberate for a health gate — without it "tree  nuts" (double
 * space) would silently fail to match "tree nuts" and let an allergen through.
 */
function normalizeAllergen(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Step 2 (§4) — flatten `listPublic()` output to the per-request meal snapshot,
 * attaching each meal's parent category name. Order: category order from
 * `listPublic()` (sortOrder asc), meals within each category in their listed
 * order. `categories.flatMap(c => c.meals)`, enriched.
 */
export function flattenSnapshot(
  categories: CategoryWithMeals[],
): SnapshotMeal[] {
  return categories.flatMap((category) =>
    category.meals.map((meal) => ({ ...meal, category: category.name })),
  );
}

/**
 * Step 3 (§4) / F4-AC1 — the hard allergen gate. Excludes any meal whose
 * `allergens` intersect `avoidAllergens` under {@link normalizeAllergen} exact
 * match. Runs BEFORE the model ever sees candidates.
 *
 * Returns BOTH the survivors and the excluded meal ids: T8 needs `excludedIds`
 * for its fail-closed re-check (a model-emitted id in this set is dropped even
 * if the prompt was bypassed — F4-AC2).
 *
 * Branch-coverage note (release-blocking 100% gate): `avoidAllergens` keeps its
 * `?? []` because it is genuinely optional per the DTO (`avoidAllergens?:`), so
 * both arms are reachable. `meal.allergens` does NOT get a `?? []`: the Prisma
 * schema types it `String[]` (non-null), so a nullish arm would be unreachable
 * dead code that could only be "covered" by a type-violating fixture — coverage
 * theater for a safety kernel. The flatten step's array-contract test is the
 * executable substitute. Do not "helpfully" re-add `?? []` on `meal.allergens`.
 *
 * Pure: does not mutate inputs; survivors preserve input order (a defined order
 * for the downstream newest-marking step).
 */
export function filterByAllergens(
  meals: SnapshotMeal[],
  avoidAllergens: string[] | undefined,
): { survivors: SnapshotMeal[]; excludedIds: string[] } {
  const avoid = new Set((avoidAllergens ?? []).map(normalizeAllergen));
  if (avoid.size === 0) {
    return { survivors: [...meals], excludedIds: [] };
  }

  const survivors: SnapshotMeal[] = [];
  const excludedIds: string[] = [];
  for (const meal of meals) {
    const unsafe = meal.allergens.some((a) => avoid.has(normalizeAllergen(a)));
    if (unsafe) {
      excludedIds.push(meal.id);
    } else {
      survivors.push(meal);
    }
  }
  return { survivors, excludedIds };
}

/**
 * Step 4 (§4) / F2-AC1 — flag exactly the top-5 surviving candidates by
 * `createdAt` descending (tie-break: `id` ascending) with `isNewest: true`; the
 * rest `false`. Handles <5, ==5, and >5 survivors.
 *
 * Returns {@link Candidate}s in the SAME order as the input survivors (i.e. the
 * filter's order); only the `isNewest` flag reflects the newest ranking, so the
 * prompt still presents meals in menu order while the flag marks what's new.
 *
 * Pure: does not mutate inputs (ranking is computed on a copy).
 */
export function markNewest(survivors: SnapshotMeal[]): Candidate[] {
  const newestIds = new Set(
    [...survivors]
      .sort((a, b) => {
        const byDate = b.createdAt.getTime() - a.createdAt.getTime();
        if (byDate !== 0) return byDate;
        // Tie-break by id ascending. `Meal.id` is a unique primary key, so two
        // survivors can never share an id — there is no equal-id arm to cover
        // (omitting it keeps this comparator at 100% branch coverage; adding a
        // `=== 0 ? 0` arm would be unreachable dead code, cf. the
        // `meal.allergens ?? []` decision in filterByAllergens).
        return a.id < b.id ? -1 : 1;
      })
      .slice(0, NEWEST_LIMIT)
      .map((meal) => meal.id),
  );

  return survivors.map((meal) => toCandidate(meal, newestIds.has(meal.id)));
}

/**
 * Step 2–4 orchestration (§4) — one snapshot in, candidates + excludedIds out.
 * The function takes the already-fetched snapshot as its argument: there is no
 * DB dependency to inject, structurally guaranteeing the F5 single-snapshot
 * rule (no second fetch).
 */
export function assembleCandidates(
  categories: CategoryWithMeals[],
  avoidAllergens: string[] | undefined,
): { candidates: Candidate[]; excludedIds: string[] } {
  const snapshot = flattenSnapshot(categories);
  const { survivors, excludedIds } = filterByAllergens(
    snapshot,
    avoidAllergens,
  );
  return { candidates: markNewest(survivors), excludedIds };
}

/** Project a snapshot meal to the prompt-facing {@link Candidate} shape. */
function toCandidate(meal: SnapshotMeal, isNewest: boolean): Candidate {
  return {
    id: meal.id,
    name: meal.name,
    description: meal.description,
    priceCents: meal.priceCents,
    allergens: meal.allergens,
    category: meal.category,
    isNewest,
  };
}
