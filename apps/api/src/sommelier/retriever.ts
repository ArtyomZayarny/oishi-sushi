/**
 * T4 — the `Retriever` seam (§4, §6).
 *
 * Server-internal abstraction over knowledge-base retrieval. It lives in
 * `apps/api` ON PURPOSE — `libs/shared-types` carries only the wire contract
 * (`SommelierAskRequest`/`Response`); `RetrievedDoc` and `Retriever` never cross
 * the wire, so they must not leak into the shared package (§6).
 *
 * v1 is naive prompt-stuffing ({@link NaiveKbRetriever}): `retrieve(query)`
 * returns ALL non-expired KB docs and ignores the query. Phase 5 swaps in an
 * embedding/hybrid adapter behind the same {@link SOMMELIER_RETRIEVER} token
 * with ZERO controller/frontend change — that swap-without-touching-callers
 * property is the whole reason this seam exists.
 *
 * T7 (LLM orchestration) is the first real consumer: it injects the token,
 * calls `retrieve(query)`, and serializes each `RetrievedDoc` into the grounded
 * prompt — tagging KB sections with `source` so the model can cite `[n]` and the
 * response can map citations back to `SommelierSource { type: 'kb', ref, section }`.
 */

/**
 * One validated knowledge-base document, retrieval-ready. Mirrors the front-
 * matter schema (§8) plus the markdown body. `source` is the unique slug used
 * for citation/attribution; `section` and `docType` come from front-matter;
 * `body` is the markdown content below the front-matter.
 */
export interface RetrievedDoc {
  /** Front-matter `source` — unique slug; becomes `SommelierSource.ref` for KB. */
  source: string;
  /** Front-matter `section` — becomes `SommelierSource.section`. */
  section: string;
  /** Front-matter `doc_type` ∈ taste_guide | faq | policy. */
  docType: KbDocType;
  /** Markdown body below the front-matter (the groundable text). */
  body: string;
}

/** Front-matter `doc_type` enum (§8). */
export type KbDocType = 'taste_guide' | 'faq' | 'policy';

/** The valid `doc_type` values, as a runtime-checkable list. */
export const KB_DOC_TYPES: readonly KbDocType[] = [
  'taste_guide',
  'faq',
  'policy',
] as const;

/**
 * Retrieval seam. v1 may ignore `query` and return everything (prompt-stuffing).
 * Return type is sync here because the v1 adapter loads the KB once at
 * construction; the contract is intentionally permissive so a future async
 * adapter can return `Promise<RetrievedDoc[]>` — callers should `await` the
 * result to stay forward-compatible.
 */
export interface Retriever {
  retrieve(query: string): RetrievedDoc[] | Promise<RetrievedDoc[]>;
}

/**
 * DI token for the {@link Retriever} implementation. Bound to
 * {@link NaiveKbRetriever} in `SommelierModule`; Phase 5 rebinds it to the
 * embedding adapter. Consumers inject via `@Inject(SOMMELIER_RETRIEVER)`.
 */
export const SOMMELIER_RETRIEVER = Symbol('SOMMELIER_RETRIEVER');
