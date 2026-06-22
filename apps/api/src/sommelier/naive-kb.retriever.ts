import { Injectable } from '@nestjs/common';
import { loadKbDocs, resolveKbDir, type KbDoc } from './kb-loader';
import type { Retriever, RetrievedDoc } from './retriever';

/**
 * T4 — v1 retrieval adapter: naive prompt-stuffing (§4).
 *
 * Loads + validates the whole KB ONCE at construction (boot-time fail-fast: a
 * malformed doc throws here, taking the app down on boot rather than failing a
 * request later). `retrieve(query)` then returns every loaded (already
 * non-expired) doc, IGNORING the query — at ~3–6 docs that is cheaper and more
 * robust than any ranking, and it is exactly the behaviour Phase 5 replaces
 * behind the {@link SOMMELIER_RETRIEVER} token without touching callers.
 *
 * Bound in `SommelierModule` with `resolveKbDir()` as the default directory; the
 * directory is injectable (constructor arg) so specs can point it at a fixture.
 */
@Injectable()
export class NaiveKbRetriever implements Retriever {
  private readonly docs: KbDoc[];

  constructor(kbDir: string = resolveKbDir()) {
    // Eager load → boot-time validation. loadKbDocs already drops expired docs.
    this.docs = loadKbDocs(kbDir);
  }

  // The `Retriever` interface declares `retrieve(query)`, but v1 prompt-stuffing
  // ignores the query entirely — so the impl omits the unused parameter (a valid
  // narrowing of the interface signature) rather than carrying a dead arg.
  retrieve(): RetrievedDoc[] {
    return this.docs.map((doc) => ({
      source: doc.source,
      section: doc.section,
      docType: doc.docType,
      body: doc.body,
    }));
  }
}
