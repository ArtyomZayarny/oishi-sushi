import { Logger } from '@nestjs/common';
import type { SommelierAskResponse, SommelierMealRef } from '@org/shared-types';
import type { SnapshotMeal } from './candidates';
import type { SommelierAskIntermediate } from './sommelier.service';

/**
 * T8 — fail-closed post-validation + assembly (spec §4 step 8–9, §7.4, §10 T8).
 *
 * THE ENFORCED SAFETY BACKSTOP. The spec is explicit that post-validation — not
 * the prompt — is what actually guarantees safety: a model that ignores every
 * system rule (recommends an allergen, fabricates a cuid, lies about a price,
 * leaks a discount URL, abstains-but-still-picks) must still produce a safe,
 * truthful {@link SommelierAskResponse}. This module is therefore PURE (no Nest
 * DI, no SDK, no DB) and treats `intermediate.rawOutput` as fully adversarial.
 *
 * It consumes the typed T7→T8 seam ({@link SommelierAskIntermediate}) plus the
 * request-scope snapshot map (`mealId → SnapshotMeal`) — the SAME snapshot the
 * pre-filter used (§4 step 2 / F5: one snapshot, never a second fetch). The
 * snapshot map serves two jobs: (a) the server-side display join
 * (name/priceCents/imageUrl come from the DB row, never the model — F5-AC3); and
 * (b) resolving `excludedIds` to the excluded meals' NAMES for the answer-text
 * scan (excluded meals are not candidates, so their names live only in the
 * snapshot).
 *
 * Order of checks (ticket T8, executed exactly in this sequence):
 *   1. On-menu subset (F5-AC1)        — drop any pick whose mealId is not a
 *                                       candidate offered to the model.
 *   2. Allergen re-check (F4-AC2/3)   — drop any pick whose mealId is in
 *                                       excludedIds; warn(requestId) (fail-closed
 *                                       even if the prompt was bypassed).
 *   3. Cap at 5.
 *   4. Server-side join (F5-AC3)      — build name/priceCents/imageUrl from the
 *                                       snapshot row, never from model output.
 *   5. Abstain invariant + degrade (F6-AC1) — confidence:'abstain' ⇒ recs=[];
 *                                       and if every pick dropped in 1–2 ⇒
 *                                       degrade to abstain + recs=[].
 *   6. Answer-text scan (§7.4)        — strip excluded meal names (case-insensitive),
 *                                       strip URLs, cap length ≤600.
 *   7. Citation consistency (F1-AC4)  — strip [n] markers outside 1..sources.length;
 *                                       sources is non-empty whenever recs is.
 *   8. Return with requestId.
 *
 * DESIGN — strip, do NOT reject (stated for reviewers; fail-closed rationale):
 * the answer-text scan REDACTS leaked content (excluded names, URLs) and
 * TRUNCATES length rather than rejecting the whole answer. Rejecting would force
 * an abstain even when safe, valid recommendations exist — strictly more
 * destructive. Fail-closed requires only that the unsafe thing never reaches the
 * client; stripping guarantees that while preserving the safe payload. The
 * structural safety guarantees (no excluded id in recommendations, prices/names
 * from the snapshot) are absolute regardless of the prose scan.
 */

const logger = new Logger('SommelierPostValidate');

/** Max recommendations returned (spec §4 step 8, F1-AC1 upper bound). */
const MAX_RECOMMENDATIONS = 5;

/** Hard cap on the display answer length (§7.4 / §10 T8 row). */
const ANSWER_MAX_CHARS = 600;

/** Max length of a recommendation `why` (F1-AC1: every `why` is 1–300 chars). */
const WHY_MAX_CHARS = 300;

/**
 * URL patterns to strip from the answer (§7.4 — no URLs). Three passes, in order:
 *   - scheme URLs (http://, https://) up to the next whitespace;
 *   - bare `www.` hosts (no scheme) up to the next whitespace;
 *   - BARE hosts with no scheme and no `www.` (e.g. `oishi-deals.com/promo`,
 *     `bit.ly/xyz`): one-or-more dot-separated labels ending in a common TLD,
 *     plus an optional path. Fail-closed favors over-stripping a legitimate
 *     domain over leaking a promo link the model was told never to emit.
 * The system prompt already forbids URLs/discount codes; this is the enforced
 * backstop if the model emits one anyway.
 */
const URL_SCHEME_RE = /https?:\/\/\S+/gi;
const URL_BARE_WWW_RE = /\bwww\.\S+/gi;
const URL_BARE_HOST_RE =
  /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|app|dev|me|biz|info|shop|store|link|xyz|to|ly)(?:\/\S*)?/gi;

/**
 * Apostrophe glyphs treated as interchangeable AND optional when scrubbing an
 * excluded meal name (BLOCKER 1 / F4-AC3). Seed names use U+2019 (`’`), but a
 * model may write the straight apostrophe, a modifier/prime variant, or omit it
 * entirely (`Chefs Omakase`). Covers: ' ‘ ’ ʼ ′.
 */
const APOS_CLASS = String.raw`[\u0027\u2018\u2019\u02BC\u2032]`;

/**
 * Zero-width / invisible characters a model could splice between letters to
 * evade the name scrub (Hardening #5): ZWSP U+200B, ZWNJ U+200C, ZWJ U+200D,
 * BOM/ZWNBSP U+FEFF, word-joiner U+2060, soft hyphen U+00AD. Stripped from the
 * answer BEFORE name/URL matching so the visible text is what gets scanned.
 */
const ZERO_WIDTH_CODEPOINTS = [0x200b, 0x200c, 0x200d, 0xfeff, 0x2060, 0x00ad];
const ZERO_WIDTH_RE = new RegExp(
  `[${ZERO_WIDTH_CODEPOINTS.map((c) => `\\u${c.toString(16).padStart(4, '0')}`).join('')}]`,
  'gu',
);

/**
 * Non-breaking / exotic spaces normalized to a normal space before scanning
 * (Hardening #5), so an NBSP-separated excluded name (e.g. two words split
 * by a non-breaking space) still matches the snapshot name. Covers NBSP
 * U+00A0, the U+2000-U+200A run, narrow NBSP U+202F, and U+205F.
 */
const NBSP_LIKE_RE = /[\u00A0\u2000-\u200A\u202F\u205F]/gu;

/**
 * The fail-closed post-validator. See the module doc for the full contract and
 * the strip-not-reject rationale.
 */
export function postValidate(
  intermediate: SommelierAskIntermediate,
  snapshotById: Map<string, SnapshotMeal>,
): SommelierAskResponse {
  const { rawOutput, candidates, excludedIds, sources, requestId } =
    intermediate;

  const candidateIds = new Set(candidates.map((c) => c.id));
  const excludedIdSet = new Set(excludedIds);

  // ---- 1–2. Subset + allergen re-check, building recommendations as we go.
  // Within the loop the allergen re-check (2) is evaluated before the subset
  // check (1): an excluded id is never a candidate, so gating the allergen warn
  // behind the subset check would silently suppress it. Both still drop the pick;
  // the spec-level outcome (excluded ⇒ dropped, fabricated ⇒ dropped) is intact. ----
  let droppedAnyPick = false;
  let emittedExcludedId = false;
  const recommendations: SommelierMealRef[] = [];

  for (const pick of rawOutput.picks) {
    // (2) Allergen re-check (F4-AC2/3, fail-closed) — evaluated FIRST so the
    // allergen-leak signal is never masked by the subset check. excludedIds and
    // candidateIds are disjoint by construction (a meal is either a survivor or
    // excluded), so an excluded id is ALSO not a candidate; if the warn were
    // gated behind the subset check below it could never fire. We therefore
    // detect-and-warn on an emitted excluded id directly. This is the backstop
    // that fires even when the prompt was bypassed. Logged with requestId only
    // (§7.7 privacy: never the raw query text).
    if (excludedIdSet.has(pick.mealId)) {
      emittedExcludedId = true;
      droppedAnyPick = true;
      continue;
    }

    // (1) On-menu subset (F5-AC1): the pick must be a candidate the model was
    // actually offered. A fabricated cuid — or any snapshot meal that was never
    // a candidate — is dropped here.
    if (!candidateIds.has(pick.mealId)) {
      droppedAnyPick = true;
      continue;
    }

    // (4a) `why` length gate (F1-AC1: every `why` is 1–300 chars). T8 is the
    // last step — the json_schema cannot enforce length, so the clamp lives
    // here. Trim, then cap at 300. An empty/whitespace `why` violates the 1-char
    // lower bound ⇒ DROP the pick (a recommendation with no justification is not
    // a valid recommendation). Dropping counts toward the degrade rule below.
    const why = pick.why.trim().slice(0, WHY_MAX_CHARS);
    if (why.length === 0) {
      droppedAnyPick = true;
      continue;
    }

    // (4b) Server-side join (F5-AC3): name/priceCents/imageUrl come from the
    // authoritative snapshot row, NEVER from the model. A candidate is by
    // construction in the snapshot, but guard defensively.
    const meal = snapshotById.get(pick.mealId);
    if (meal === undefined) {
      droppedAnyPick = true;
      continue;
    }

    recommendations.push({
      mealId: meal.id,
      name: meal.name,
      priceCents: meal.priceCents,
      imageUrl: meal.imageUrl ?? null,
      why,
    });

    // (3) Cap at 5 — stop once we have five valid recommendations.
    if (recommendations.length >= MAX_RECOMMENDATIONS) {
      break;
    }
  }

  if (emittedExcludedId) {
    logger.warn(
      `sommelier ${requestId}: model emitted an excluded (allergen-unsafe) ` +
        `mealId; dropped by post-validation (fail-closed allergen re-check).`,
    );
  }

  // ---- 5. Abstain invariant + degrade (F6-AC1). ----
  // abstain ⇒ recommendations:[] (drop any picks emitted alongside abstain).
  // degrade ⇒ if the model intended to recommend (some picks) but every one was
  // dropped in the loop above (subset / allergen re-check / empty-`why`), there
  // is no honest recommendation left ⇒ abstain.
  let confidence = rawOutput.confidence;
  let finalRecommendations = recommendations;
  if (confidence === 'abstain') {
    finalRecommendations = [];
  } else if (recommendations.length === 0 && droppedAnyPick) {
    confidence = 'abstain';
    finalRecommendations = [];
  }

  // ---- 6. Answer-text scan (§7.4). Runs on every path (an abstain answer can
  // still leak a URL or an excluded name). REDACT excluded names + URLs; the
  // length cap is applied LAST (after step 7) so truncation can never sever a
  // citation marker. ----
  const excludedNames = collectExcludedNames(excludedIds, snapshotById);
  let answer = scrubAnswer(rawOutput.answer, excludedNames);

  // ---- 7. Citation consistency (F1-AC4): strip [n] markers outside the valid
  // 1..sources.length range. `sources` is the prebuilt, candidate-indexed list —
  // it is returned UNCHANGED and never renumbered (T7 invariant), so dropping a
  // pick does not shift citation numbers. ----
  answer = stripOutOfRangeCitations(answer, sources.length);

  // ---- 8. Length cap LAST (§7.4 / §10 T8). After name/URL redaction AND
  // citation stripping, so a truncation boundary can never bisect a surviving
  // `[n]` into a dangling `[1`. ----
  answer = capLength(answer);

  return {
    answer,
    recommendations: finalRecommendations,
    sources,
    confidence,
    requestId,
  };
}

/**
 * Resolve `excludedIds` to the excluded meals' display names via the snapshot.
 * Excluded meals are not candidates, so their names live only in the snapshot
 * map. Empty/whitespace names are skipped (a blank name can't be scrubbed and a
 * `''` replace would corrupt the answer).
 */
function collectExcludedNames(
  excludedIds: string[],
  snapshotById: Map<string, SnapshotMeal>,
): string[] {
  const names: string[] = [];
  for (const id of excludedIds) {
    const meal = snapshotById.get(id);
    if (meal !== undefined && meal.name.trim().length > 0) {
      names.push(meal.name);
    }
  }
  return names;
}

/**
 * §7.4 answer scan — REDACT (strip) rather than reject. Order matters:
 *   0. normalize unicode evasions FIRST — strip zero-width chars and fold
 *      NBSP-like spaces to a normal space — so the name/URL passes scan the
 *      VISIBLE text (Hardening #5; closes the same evasion class as the
 *      apostrophe tolerance below, for whitespace);
 *   1. remove every excluded meal name (case-insensitive, apostrophe-tolerant,
 *      all occurrences) — BLOCKER 1 / F4-AC3;
 *   2. remove URLs (scheme, bare www., bare host) — BLOCKER 2 / §11;
 *   3. collapse the whitespace the redactions leave behind.
 * The length cap is intentionally NOT here — it runs as the LAST step in
 * {@link postValidate} (after citation stripping) via {@link capLength}, so
 * truncation can never sever a surviving `[n]` (Hardening #4).
 * See the module doc for why stripping (not rejecting) is the fail-closed choice.
 */
function scrubAnswer(answer: string, excludedNames: string[]): string {
  // (0) Unicode normalization (Hardening #5): drop zero-width/invisible chars,
  // fold NBSP-like spaces to a normal space. Do this before any matching so an
  // attacker cannot splice U+200B between letters of an excluded name or use an
  // NBSP to break the word boundary.
  let out = answer.replace(ZERO_WIDTH_RE, '').replace(NBSP_LIKE_RE, ' ');

  // (1) Strip excluded meal names, case-insensitive + apostrophe-tolerant. Sort
  // longest-first so a name that is a superstring of another is removed before
  // its substring.
  const sortedNames = [...excludedNames].sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    out = out.replace(buildExcludedNameRegex(name), ' ');
  }

  // (2) Strip URLs: scheme → bare www. → bare host (the third pass catches
  // `oishi-deals.com/promo`, `bit.ly/xyz`). Scheme first so `https://x.com/...`
  // is consumed whole before the bare-host pass could nibble its host.
  out = out
    .replace(URL_SCHEME_RE, ' ')
    .replace(URL_BARE_WWW_RE, ' ')
    .replace(URL_BARE_HOST_RE, ' ');

  // (3) Collapse whitespace runs the redactions created; tidy stray space before
  // punctuation; trim.
  out = out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;!?])/g, '$1')
    .trim();

  return out;
}

/**
 * Length cap (§7.4 / §10 T8) — the LAST transform in {@link postValidate}.
 * Truncate to {@link ANSWER_MAX_CHARS}, then strip a trailing dangling citation
 * fragment (`[`, `[1`, `[12` with no closing `]`) that truncation may have left
 * at the very end, so the answer never ends mid-marker (Hardening #4).
 */
function capLength(answer: string): string {
  if (answer.length <= ANSWER_MAX_CHARS) {
    return answer;
  }
  return answer
    .slice(0, ANSWER_MAX_CHARS)
    .replace(/\[\d*$/, '')
    .trimEnd();
}

/**
 * Build the apostrophe-tolerant, case-insensitive RegExp that scrubs one
 * excluded meal name (BLOCKER 1 / F4-AC3). Every apostrophe glyph in the name is
 * rewritten to `(apos-class)?` so the straight (`Chef's`), curly (`Chef’s`),
 * modifier/prime, AND apostrophe-absent (`Chefs`) forms all match. The rest of
 * the name is regex-escaped.
 */
function buildExcludedNameRegex(name: string): RegExp {
  const apos = new RegExp(APOS_CLASS, 'g');
  const pattern = escapeRegExp(name).replace(apos, `${APOS_CLASS}?`);
  return new RegExp(pattern, 'gi');
}

/**
 * F1-AC4 — remove every `[n]` citation marker whose n is outside `1..max`
 * (inclusive). `[0]` and `[n>max]` are dropped; valid markers are preserved
 * verbatim. When `max === 0` (no sources) every numeric citation is stripped.
 */
function stripOutOfRangeCitations(answer: string, max: number): string {
  return answer.replace(/\[(\d+)\]/g, (match, digits: string) => {
    const n = Number(digits);
    return n >= 1 && n <= max ? match : '';
  });
}

/** Escape a string for safe use inside a `RegExp`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
