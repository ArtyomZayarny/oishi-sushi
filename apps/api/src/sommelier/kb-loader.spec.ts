import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadKbDocs, parseKbDoc } from './kb-loader';

/**
 * T4 — KB loader: front-matter parse + fail-fast validation + expiry exclusion.
 *
 * The loader is the single authority that turns `kb/*.md` files into validated
 * {@link KbDoc}s. It runs at boot and MUST fail fast (throw) on any malformed,
 * duplicate-`source`, or bad-enum doc so a broken KB never reaches the model
 * silently. A doc whose `expires` is in the past is excluded from the returned
 * set (ex-F3 `expires` mechanism, kept as generic KB hygiene per §8).
 *
 * `parseKbDoc(raw, filename)` is the pure unit (string in → KbDoc out / throw),
 * unit-tested without touching the filesystem. `loadKbDocs(dir)` reads a
 * directory of `*.md`, parses each, enforces source-uniqueness, and drops
 * expired docs.
 */
describe('T4 — kb-loader parseKbDoc (front-matter validation, fail-fast)', () => {
  const TODAY_REF = new Date('2026-06-13T00:00:00.000Z');

  const valid = [
    '---',
    'source: taste-guide',
    'section: Texture',
    'doc_type: taste_guide',
    '---',
    'Fatty cuts like Otoro Selection eat rich and buttery.',
    '',
  ].join('\n');

  describe('valid doc parses', () => {
    it('parses front-matter fields and body', () => {
      const doc = parseKbDoc(valid, 'taste-guide.md');
      expect(doc.source).toBe('taste-guide');
      expect(doc.section).toBe('Texture');
      expect(doc.docType).toBe('taste_guide');
      expect(doc.expires).toBeUndefined();
      expect(doc.body).toContain('Otoro Selection');
      // filename is retained for diagnostics / source attribution
      expect(doc.filename).toBe('taste-guide.md');
    });

    it('accepts each valid doc_type enum value', () => {
      for (const t of ['taste_guide', 'faq', 'policy']) {
        const raw = valid.replace('doc_type: taste_guide', `doc_type: ${t}`);
        expect(parseKbDoc(raw, `${t}.md`).docType).toBe(t);
      }
    });

    it('parses an optional ISO expires date', () => {
      const raw = valid.replace(
        'doc_type: taste_guide',
        'doc_type: taste_guide\nexpires: 2030-01-01',
      );
      const doc = parseKbDoc(raw, 'seasonal.md');
      expect(doc.expires).toBeInstanceOf(Date);
      expect(doc.expires?.toISOString().slice(0, 10)).toBe('2030-01-01');
    });

    it('trims surrounding whitespace on scalar values', () => {
      const raw = [
        '---',
        'source:   spaced-slug   ',
        'section:   Heat  ',
        'doc_type:   faq  ',
        '---',
        'body',
        '',
      ].join('\n');
      const doc = parseKbDoc(raw, 'spaced.md');
      expect(doc.source).toBe('spaced-slug');
      expect(doc.section).toBe('Heat');
      expect(doc.docType).toBe('faq');
    });
  });

  describe('malformed docs throw (fail-fast)', () => {
    it('throws when front-matter delimiters are missing entirely', () => {
      expect(() => parseKbDoc('no front matter here', 'bad.md')).toThrow(
        /front-matter/i,
      );
    });

    it('throws when the closing delimiter is missing', () => {
      const raw = ['---', 'source: x', 'section: y', 'doc_type: faq'].join(
        '\n',
      );
      expect(() => parseKbDoc(raw, 'unterminated.md')).toThrow(/front-matter/i);
    });

    it('throws on a missing required field (source)', () => {
      const raw = [
        '---',
        'section: Texture',
        'doc_type: taste_guide',
        '---',
        'body',
      ].join('\n');
      expect(() => parseKbDoc(raw, 'no-source.md')).toThrow(/source/i);
    });

    it('throws on a missing required field (section)', () => {
      const raw = [
        '---',
        'source: x',
        'doc_type: taste_guide',
        '---',
        'body',
      ].join('\n');
      expect(() => parseKbDoc(raw, 'no-section.md')).toThrow(/section/i);
    });

    it('throws on a missing required field (doc_type)', () => {
      const raw = ['---', 'source: x', 'section: y', '---', 'body'].join('\n');
      expect(() => parseKbDoc(raw, 'no-doctype.md')).toThrow(/doc_type/i);
    });

    it('throws on an invalid doc_type enum value', () => {
      const raw = valid.replace('doc_type: taste_guide', 'doc_type: offers');
      expect(() => parseKbDoc(raw, 'bad-enum.md')).toThrow(/doc_type/i);
    });

    it('throws on a non-ISO / unparseable expires value', () => {
      const raw = valid.replace(
        'doc_type: taste_guide',
        'doc_type: taste_guide\nexpires: not-a-date',
      );
      expect(() => parseKbDoc(raw, 'bad-expires.md')).toThrow(/expires/i);
    });

    it('throws on an empty body (a doc with no content is malformed)', () => {
      const raw = [
        '---',
        'source: x',
        'section: y',
        'doc_type: faq',
        '---',
        '   ',
        '',
      ].join('\n');
      expect(() => parseKbDoc(raw, 'empty-body.md')).toThrow(/body|empty/i);
    });

    it('names the offending file in the error message', () => {
      expect(() => parseKbDoc('garbage', 'culprit.md')).toThrow(/culprit\.md/);
    });
  });

  describe('expiry classification is exposed for the loader', () => {
    it('marks a doc with a past expires as expired relative to a ref date', () => {
      const raw = valid.replace(
        'doc_type: taste_guide',
        'doc_type: taste_guide\nexpires: 2020-01-01',
      );
      const doc = parseKbDoc(raw, 'old.md');
      expect(doc.expires).toBeInstanceOf(Date);
      expect(doc.expires?.getTime() ?? Infinity).toBeLessThan(
        TODAY_REF.getTime(),
      );
    });
  });
});

describe('T4 — kb-loader loadKbDocs (directory load, source-uniqueness, expiry exclusion)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kb-loader-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeDoc(file: string, body: string): void {
    writeFileSync(join(dir, file), body, 'utf-8');
  }

  function frontMatter(source: string, docType = 'faq', extra = ''): string {
    return [
      '---',
      `source: ${source}`,
      'section: General',
      `doc_type: ${docType}`,
      extra,
      '---',
      `Body for ${source}.`,
      '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  it('loads every valid .md doc in the directory', () => {
    writeDoc('a.md', frontMatter('alpha'));
    writeDoc('b.md', frontMatter('beta', 'taste_guide'));
    const docs = loadKbDocs(dir);
    expect(docs.map((d) => d.source).sort()).toEqual(['alpha', 'beta']);
  });

  it('ignores non-markdown files in the directory', () => {
    writeDoc('a.md', frontMatter('alpha'));
    writeDoc('README.txt', 'not a kb doc');
    writeDoc('.gitkeep', '');
    const docs = loadKbDocs(dir);
    expect(docs.map((d) => d.source)).toEqual(['alpha']);
  });

  it('throws (fail-fast) on a duplicate source slug across two files', () => {
    writeDoc('a.md', frontMatter('dup'));
    writeDoc('b.md', frontMatter('dup'));
    expect(() => loadKbDocs(dir)).toThrow(/duplicate.*source|source.*dup/i);
  });

  it('throws (fail-fast) when any single doc is malformed', () => {
    writeDoc('a.md', frontMatter('alpha'));
    writeDoc('b.md', 'no front matter');
    expect(() => loadKbDocs(dir)).toThrow();
  });

  it('excludes a doc whose expires is strictly in the past', () => {
    writeDoc('fresh.md', frontMatter('fresh', 'faq', 'expires: 2999-01-01'));
    writeDoc('stale.md', frontMatter('stale', 'faq', 'expires: 2000-01-01'));
    const docs = loadKbDocs(dir);
    expect(docs.map((d) => d.source)).toEqual(['fresh']);
  });

  it('keeps a doc whose expires is today or in the future', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    writeDoc('keep.md', frontMatter('keep', 'faq', `expires: ${future}`));
    const docs = loadKbDocs(dir);
    expect(docs.map((d) => d.source)).toEqual(['keep']);
  });

  it('returns an empty array for an empty directory', () => {
    expect(loadKbDocs(dir)).toEqual([]);
  });
});
