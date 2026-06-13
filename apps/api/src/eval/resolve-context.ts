import type { CategoryWithMeals } from '../menu/menu.service';
import {
  assembleCandidates,
  filterByAllergens,
  flattenSnapshot,
} from '../sommelier/candidates';
import type { EvalCase } from './case.types';
import type { ResolvedCaseContext } from './scoring';

/**
 * T9 — resolve the per-case scoring context from a live menu snapshot, using the
 * SAME production candidate logic (`flattenSnapshot` → `filterByAllergens` →
 * `assembleCandidates`) the service runs. Shared by both eval modes so the eval's
 * notion of excluded / newest / expected ids is byte-for-byte what the service
 * computed for the same request — never a re-derivation that could drift.
 *
 * `expectMealNames` is resolved to ids here (cuids are seed-generated and cannot
 * be hard-coded). Top-5-newest is taken from the real `markNewest` ranking of the
 * survivors.
 */

const NEWEST_LIMIT = 5;

export function resolveContext(
  snapshot: CategoryWithMeals[],
  evalCase: EvalCase,
): ResolvedCaseContext {
  const flat = flattenSnapshot(snapshot);
  const snapshotIds = new Set(flat.map((m) => m.id));

  const { excludedIds } = filterByAllergens(flat, evalCase.avoidAllergens);
  const excludedIdSet = new Set(excludedIds);
  const excludedNames = flat
    .filter((m) => excludedIdSet.has(m.id))
    .map((m) => m.name);

  const nameToId = new Map(flat.map((m) => [m.name, m.id]));
  const expectedIds = new Set(
    (evalCase.expectMealNames ?? [])
      .map((n) => nameToId.get(n))
      .filter((id): id is string => id !== undefined),
  );

  const { candidates } = assembleCandidates(snapshot, evalCase.avoidAllergens);
  const survivorById = new Map(flat.map((m) => [m.id, m]));
  const topNewestIds = new Set(
    candidates
      .map((c) => survivorById.get(c.id))
      .filter((m): m is NonNullable<typeof m> => m !== undefined)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, NEWEST_LIMIT)
      .map((m) => m.id),
  );

  return {
    snapshotIds,
    excludedIds: excludedIdSet,
    excludedNames,
    expectedIds,
    topNewestIds,
  };
}

/**
 * Names in `expectMealNames` that do NOT resolve against the live snapshot — a
 * drift signal (seed renamed, apostrophe glyph changed). The runner aborts on a
 * non-empty result so a silent "0% quality because nothing resolved" can't pass
 * as a real model failure.
 */
export function unresolvedExpectedNames(
  snapshot: CategoryWithMeals[],
  cases: EvalCase[],
): string[] {
  const names = new Set(flattenSnapshot(snapshot).map((m) => m.name));
  const missing = new Set<string>();
  for (const c of cases) {
    for (const n of c.expectMealNames ?? []) {
      if (!names.has(n)) missing.add(n);
    }
  }
  return [...missing];
}
