import { readdirSync } from 'node:fs';
import { loadKbDocs, resolveKbDir } from './kb-loader';

/**
 * T4 — committed-docs validation (§8): every doc that ships in `kb/` must pass
 * front-matter validation. This is the guard that keeps T5's authored corpus
 * honest — a malformed or duplicate-`source` doc fails CI here, not at runtime.
 *
 * It loads the *source* kb directory (the loader's resolver finds it in dev /
 * jest), so it runs inside `nx test api` with no build step. The separate
 * kb-dist spec proves the docs also ship into `nx build api` output.
 */
describe('T4 — committed kb/ docs all pass validation', () => {
  it('resolves a kb directory that exists', () => {
    const dir = resolveKbDir();
    expect(dir).toBeTruthy();
    // contains at least one markdown file (the minimal fixtures + T5 corpus)
    const mdFiles = readdirSync(dir).filter((f) => f.endsWith('.md'));
    expect(mdFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('loads all committed docs without throwing (front-matter + unique source)', () => {
    const dir = resolveKbDir();
    expect(() => loadKbDocs(dir)).not.toThrow();
  });

  it('every committed doc has the required front-matter fields and a valid doc_type', () => {
    const docs = loadKbDocs(resolveKbDir());
    const allowed = new Set(['taste_guide', 'faq', 'policy']);
    for (const doc of docs) {
      expect(doc.source).toMatch(/\S/);
      expect(doc.section).toMatch(/\S/);
      expect(allowed.has(doc.docType)).toBe(true);
      expect(doc.body).toMatch(/\S/);
    }
  });

  it('committed sources are unique (loader enforces, asserted explicitly)', () => {
    const docs = loadKbDocs(resolveKbDir());
    const sources = docs.map((d) => d.source);
    expect(new Set(sources).size).toBe(sources.length);
  });
});
