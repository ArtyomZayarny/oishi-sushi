/**
 * F4-AC1 (free-text leg) — deterministic allergen-avoidance extractor.
 *
 * THE GAP THIS CLOSES: the hard allergen gate ({@link filterByAllergens} in
 * `candidates.ts`) only ever saw the STRUCTURED `avoidAllergens` chip. A customer
 * who instead typed the avoidance into the free-text `query` ("something light
 * without shellfish", "I'm allergic to shellfish") never reached the gate, so
 * unsafe dishes stayed in the candidate list — and the system prompt
 * (`prompt-builder.ts`) tells the model "the candidate list has already been
 * filtered to dishes that are safe for this customer", so the model trusts the
 * list and can recommend the unsafe dish. This module parses that free-text
 * intent into canonical allergen slugs so the SAME deterministic exclusion the
 * chip triggers also fires for free text — restoring the prompt's "already
 * filtered safe" claim instead of relaxing it.
 *
 * PURE module — NO Nest, NO SDK, NO DB, NO LLM (same discipline as
 * `prompt-builder.ts`). Same-request `MenuService.listPublic()` is the source of
 * `knownAllergens`, so the extractor can only ever exclude an allergen that
 * actually exists in the live menu vocabulary (the frontend derives its chips the
 * same way: `home.component.ts` flatMaps `meal.allergens`). The hard gate
 * remains the single enforcement point; this only WIDENS its input.
 *
 * DESIGN — anchor to an EXPLICIT avoidance cue, never to a bare mention (spec
 * requirement: "with X" / "I love X" / "extra X" / "what has X?" must NOT
 * exclude). Two avoidance shapes are recognized:
 *   1. PREFIX cue governing a (possibly conjoined) list of allergen terms —
 *      `no` / `without` / `avoid` / `exclude` / `skip` / `hold (the)` /
 *      `free of` / `allergic to` / `can't eat` / `don't want` …  ⇒
 *      "without fish or shellfish" → both.
 *   2. SUFFIX cue attached to a single allergen term — `X allergy` / `X-free` /
 *      `X intolerance`  ⇒ "shellfish allergy" → shellfish.
 * A single left-to-right token scan with a tiny IDLE→SEEK→LIST state machine
 * implements (1); a one-token look-ahead at each allergen term implements (2).
 * The scope ALWAYS ends at the first token that is not a joiner / filler /
 * allergen term, so a positive clause ("without shellfish but WITH soy") cannot
 * be swept in.
 *
 * SAFE-DIRECTION NOTE: this gate only ADDS exclusions. A false positive over-
 * excludes (a UX cost — a valid dish is hidden); a false negative is the unsafe
 * outcome the spec forbids. The matcher is therefore liberal on avoidance cues
 * but strict about requiring one — a bare/positive mention is never enough.
 */

/**
 * Canonical-slug → extra surface synonyms (the slug itself and its naive
 * plural/singular variants are added automatically, so list only the DISTINCT
 * words here). Keyed by the LOWERCASED canonical slug; an entry only activates
 * when that slug is present in `knownAllergens`, so the forward-compat rows
 * (gluten/sesame/…) are inert for today's `fish` / `shellfish` / `soy` menu yet
 * already know the vocabulary if the menu grows. All surface terms are single
 * words — the token scan matches token-for-token.
 */
const ALLERGEN_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  shellfish: [
    'shrimp',
    'prawn',
    'crab',
    'lobster',
    'crustacean',
    'scallop',
    'clam',
    'oyster',
    'mussel',
    'crayfish',
    'langoustine',
  ],
  soy: ['soya', 'soybean', 'soja', 'edamame'],
  fish: ['finfish'],
  // --- forward-compat (inert unless the slug appears in the live menu) ---
  gluten: ['wheat', 'barley', 'rye'],
  wheat: ['gluten'],
  sesame: ['tahini'],
  dairy: ['milk', 'lactose'],
  milk: ['dairy', 'lactose'],
  egg: ['eggs'],
  peanut: ['groundnut'],
};

/**
 * PREFIX avoidance cues — encountering one ARMS the scanner to collect the
 * allergen term(s) that follow. Apostrophes are stripped before matching, so
 * "can't" / "don't" / "won't" arrive here as `cant` / `dont` / `wont`. `free`
 * covers "free of X"; `allergic` / `allergy` cover "allergic to X" / "allergy to
 * X" (the reverse "X allergy" is a {@link SUFFIX_CUES} match).
 */
const PREFIX_CUES: ReadonlySet<string> = new Set([
  'no',
  'without',
  'avoid',
  'avoids',
  'avoiding',
  'exclude',
  'excludes',
  'excluding',
  'skip',
  'skips',
  'skipping',
  'hold',
  'sans',
  'free',
  'allergic',
  'allergy',
  'allergies',
  'intolerant',
  'intolerance',
  'cant',
  'cannot',
  'dont',
  'wont',
  'never',
]);

/**
 * SUFFIX avoidance cues — a known allergen term immediately FOLLOWED by one of
 * these is an avoidance ("shellfish allergy", "shellfish-free", "soy
 * intolerance"). Hyphens split into a token boundary, so "shellfish-free"
 * arrives as the two tokens `shellfish` `free`.
 */
const SUFFIX_CUES: ReadonlySet<string> = new Set([
  'free',
  'allergy',
  'allergies',
  'allergic',
  'intolerance',
  'intolerant',
]);

/**
 * Filler words allowed BETWEEN an armed cue and the allergen term without
 * breaking the scope — determiners/quantifiers ("the/any/all/some/more …"),
 * the linking "of"/"to" ("free OF shellfish", "allergic TO shellfish"), and the
 * verbs that ride a negated cue ("can't EAT shellfish", "don't WANT soy"). These
 * are consulted ONLY while the scanner is armed, so the same word in a plain
 * sentence ("I WANT soy") is inert.
 */
const FILLER: ReadonlySet<string> = new Set([
  'the',
  'a',
  'an',
  'any',
  'all',
  'some',
  'my',
  'of',
  'to',
  'more',
  'eat',
  'eats',
  'eating',
  'have',
  'has',
  'had',
  'having',
  'want',
  'wants',
  'wanting',
  'order',
  'orders',
  'ordering',
  'get',
]);

/**
 * List joiners — while one cue governs a conjoined list, these connect the next
 * allergen term ("no oysters OR mussels", "without fish, shellfish"). `,` is a
 * joiner here, not a breaker.
 */
const JOINERS: ReadonlySet<string> = new Set(['or', 'and', 'nor', 'plus', ',']);

/**
 * Hard scope breakers — end any armed avoidance scope. A contrastive clause
 * ("without shellfish BUT with soy") must not let `soy` ride the earlier `no`.
 */
const BREAKERS: ReadonlySet<string> = new Set([
  'but',
  'however',
  'though',
  'although',
  'yet',
  '.',
  ';',
  '!',
  '?',
]);

/** Lowercase, trim, collapse internal whitespace — mirrors `normalizeAllergen`. */
function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Build the lowercased-surface-term → verbatim-canonical-slug lookup. Output
 * uses the slug EXACTLY as it appears in `knownAllergens` (menu casing) so the
 * union with the chip and the downstream filter both match. Naive plural/
 * singular variants are added for every surface term so "no oysters" and "no
 * oyster" both resolve. First known slug wins on a synonym collision
 * (deterministic; the live `fish`/`shellfish`/`soy` vocab never collides).
 */
function buildSurfaceMap(knownAllergens: string[]): Map<string, string> {
  const surfaceToSlug = new Map<string, string>();
  const add = (surface: string, slug: string): void => {
    for (const variant of inflect(surface)) {
      if (!surfaceToSlug.has(variant)) surfaceToSlug.set(variant, slug);
    }
  };
  for (const known of knownAllergens) {
    const slugLower = normalize(known);
    if (!slugLower) continue;
    add(slugLower, known);
    for (const synonym of ALLERGEN_SYNONYMS[slugLower] ?? []) {
      add(synonym, known);
    }
  }
  return surfaceToSlug;
}

/** A surface term plus its naive plural/singular variants (all lowercase). */
function inflect(term: string): string[] {
  const variants = new Set<string>([term, `${term}s`, `${term}es`]);
  if (term.endsWith('es')) variants.add(term.slice(0, -2));
  if (term.endsWith('s')) variants.add(term.slice(0, -1));
  return [...variants];
}

/**
 * Tokenize for the scan: lowercase, drop apostrophes (so "can't" → `cant`),
 * treat `/` and `&` as the word "or", split on every non-alphanumeric run (so
 * "shellfish-free" → `shellfish` `free`), and keep `, . ; ! ?` as their own
 * single-character tokens (joiner / breakers).
 */
function tokenize(query: string): string[] {
  return (
    query
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[/&]/g, ' or ')
      .match(/[a-z0-9]+|[.,;!?]/g) ?? []
  );
}

/** Scanner state: idle, armed-and-seeking-a-term, or mid-list after ≥1 hit. */
type ScanState = 'idle' | 'seek' | 'list';

/**
 * Parse `query` for allergen-AVOIDANCE intent and return the matching canonical
 * slugs (verbatim from `knownAllergens`), in first-appearance order, deduped.
 * Returns `[]` when there is no explicit avoidance cue, when `query` is empty,
 * or when `knownAllergens` is empty — i.e. the chip-only path is byte-identical.
 */
export function extractAvoidedAllergens(
  query: string,
  knownAllergens: string[],
): string[] {
  if (!query) return [];
  const surfaceToSlug = buildSurfaceMap(knownAllergens);
  if (surfaceToSlug.size === 0) return [];

  const tokens = tokenize(query);
  const found: string[] = [];
  const seen = new Set<string>();
  const record = (slug: string): void => {
    if (!seen.has(slug)) {
      seen.add(slug);
      found.push(slug);
    }
  };

  let state: ScanState = 'idle';
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const slug = surfaceToSlug.get(token);

    // SUFFIX cue: a known allergen term followed by `allergy` / `free` / … is an
    // avoidance regardless of the running scope ("shellfish allergy").
    if (slug !== undefined && SUFFIX_CUES.has(tokens[i + 1])) {
      record(slug);
    }

    if (BREAKERS.has(token)) {
      state = 'idle';
      continue;
    }

    if (state === 'seek' || state === 'list') {
      if (slug !== undefined) {
        record(slug);
        state = 'list';
        continue;
      }
      if (JOINERS.has(token)) {
        // A conjunction keeps one cue governing the whole list ("no fish OR
        // shellfish"); it never resets the scope.
        state = 'seek';
        continue;
      }
      if (FILLER.has(token)) {
        // Stay armed; a determiner/linker/negated-verb bridges cue → term.
        continue;
      }
      // Anything else (incl. a positive word or an unrelated noun) ends scope.
      state = 'idle';
      // fall through so this same token can itself ARM a new scope below.
    }

    if (PREFIX_CUES.has(token)) {
      state = 'seek';
    }
  }

  return found;
}
