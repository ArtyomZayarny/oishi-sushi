import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NaiveKbRetriever } from './naive-kb.retriever';
import type { RetrievedDoc } from './retriever';

/**
 * T4 — NaiveKbRetriever: the v1 prompt-stuffing retrieval adapter (§4).
 *
 * `retrieve(query)` ignores the query in v1 and returns ALL non-expired KB docs
 * as {@link RetrievedDoc}s. The DI seam (`SOMMELIER_RETRIEVER` token) lets
 * Phase 5 swap this for an embedding-backed adapter without touching the
 * controller. Expiry exclusion is delegated to the loader, so a retriever built
 * over a directory containing an expired doc never surfaces it.
 */
describe('T4 — NaiveKbRetriever.retrieve()', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kb-retriever-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeDoc(
    file: string,
    source: string,
    docType = 'faq',
    extra = '',
  ): void {
    const raw = [
      '---',
      `source: ${source}`,
      'section: General',
      `doc_type: ${docType}`,
      ...(extra ? [extra] : []),
      '---',
      `Body for ${source}.`,
      '',
    ].join('\n');
    writeFileSync(join(dir, file), raw, 'utf-8');
  }

  it('returns all non-expired docs as RetrievedDoc shape', () => {
    writeDoc('a.md', 'alpha', 'taste_guide');
    writeDoc('b.md', 'beta', 'faq');
    const retriever = new NaiveKbRetriever(dir);

    const docs: RetrievedDoc[] = retriever.retrieve('anything');

    expect(docs.map((d) => d.source).sort()).toEqual(['alpha', 'beta']);
    const alpha = docs.find((d) => d.source === 'alpha');
    expect(alpha).toBeDefined();
    expect(alpha?.section).toBe('General');
    expect(alpha?.docType).toBe('taste_guide');
    expect(alpha?.body).toContain('alpha');
  });

  it('ignores the query (v1 prompt-stuffing) — same docs regardless of input', () => {
    writeDoc('a.md', 'alpha');
    writeDoc('b.md', 'beta');
    const retriever = new NaiveKbRetriever(dir);

    const a = retriever
      .retrieve('spicy tuna')
      .map((d) => d.source)
      .sort();
    const b = retriever
      .retrieve('')
      .map((d) => d.source)
      .sort();
    const c = retriever
      .retrieve('do you have pizza?')
      .map((d) => d.source)
      .sort();

    expect(a).toEqual(['alpha', 'beta']);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('excludes expired docs from retrieval', () => {
    writeDoc('fresh.md', 'fresh', 'faq', 'expires: 2999-01-01');
    writeDoc('stale.md', 'stale', 'faq', 'expires: 2000-01-01');
    const retriever = new NaiveKbRetriever(dir);

    expect(retriever.retrieve('x').map((d) => d.source)).toEqual(['fresh']);
  });

  it('loads the KB once at construction (fail-fast surfaces at build time)', () => {
    writeDoc('a.md', 'alpha');
    writeFileSync(join(dir, 'broken.md'), 'no front matter', 'utf-8');
    // A malformed doc must blow up when the retriever is constructed, not lazily
    // on first retrieve — boot-time fail-fast.
    expect(() => new NaiveKbRetriever(dir)).toThrow();
  });
});
