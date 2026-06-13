import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KB_DOC_TYPES, type KbDocType } from './retriever';

/**
 * T4 — KB loader (§8). Turns `kb/*.md` files into validated {@link KbDoc}s.
 *
 * Design choices:
 * - **Zero new deps.** The front-matter schema is four flat scalar fields, so a
 *   heavy YAML parser (`gray-matter` etc.) would be overkill — we hand-roll a
 *   tiny `key: value` front-matter split. (`js-yaml`/`yaml` exist only as
 *   transitive deps and are not safe to import directly.)
 * - **Fail-fast at boot.** Any malformed doc, bad `doc_type`, missing required
 *   field, unparseable `expires`, empty body, or duplicate `source` THROWS — a
 *   broken KB must never reach the model silently (§8 "fails fast").
 * - **Expiry exclusion.** A doc whose `expires` is strictly before "now" is
 *   dropped from the returned set (ex-F3 mechanism, kept as KB hygiene).
 *
 * Path resolution ({@link resolveKbDir}) is what makes this survive the classic
 * works-in-dev / breaks-in-dist trap: under jest/dev the docs sit next to this
 * source file (`<dir>/kb`); after `nx build api` the webpack asset config drops
 * them at `dist/sommelier/kb`. The resolver probes both, relative to the running
 * module — never assuming a fixed source layout.
 */

/** A validated KB document (front-matter + body). */
export interface KbDoc {
  /** Front-matter `source` — unique slug. */
  source: string;
  /** Front-matter `section`. */
  section: string;
  /** Front-matter `doc_type` ∈ taste_guide | faq | policy. */
  docType: KbDocType;
  /** Optional front-matter `expires` (ISO date). Past ⇒ excluded by the loader. */
  expires?: Date;
  /** Markdown body below the front-matter. */
  body: string;
  /** Originating filename, for diagnostics and error attribution. */
  filename: string;
}

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse a single raw markdown string into a validated {@link KbDoc}. Pure: no
 * filesystem access. Throws (fail-fast) on any schema violation, naming
 * `filename` in the message so a broken doc is trivial to locate.
 */
export function parseKbDoc(raw: string, filename: string): KbDoc {
  // Strip a leading UTF-8 BOM (U+FEFF) so a BOM-prefixed file still matches the
  // front-matter delimiter at position 0.
  const match = FRONT_MATTER_RE.exec(raw.replace(/^\uFEFF/, ''));
  if (!match) {
    throw new Error(
      `KB doc "${filename}" is missing a valid YAML front-matter block ` +
        `(expected leading "---" … "---" delimiters).`,
    );
  }

  const [, frontMatterBlock, body] = match;
  const fields = parseFrontMatter(frontMatterBlock, filename);

  const source = required(fields, 'source', filename);
  const section = required(fields, 'section', filename);
  const docTypeRaw = required(fields, 'doc_type', filename);

  if (!KB_DOC_TYPES.includes(docTypeRaw as KbDocType)) {
    throw new Error(
      `KB doc "${filename}" has invalid doc_type "${docTypeRaw}"; ` +
        `expected one of: ${KB_DOC_TYPES.join(', ')}.`,
    );
  }

  const expires = parseExpires(fields.expires, filename);

  if (body.trim() === '') {
    throw new Error(`KB doc "${filename}" has an empty body.`);
  }

  return {
    source,
    section,
    docType: docTypeRaw as KbDocType,
    ...(expires ? { expires } : {}),
    body: body.trim(),
    filename,
  };
}

/**
 * Load and validate every `*.md` in `dir`. Enforces source-uniqueness across
 * files and excludes docs whose `expires` is strictly in the past. Throws on the
 * first malformed doc or any duplicate `source`.
 */
export function loadKbDocs(dir: string): KbDoc[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const now = Date.now();
  const bySource = new Map<string, string>();
  const docs: KbDoc[] = [];

  for (const file of files) {
    const raw = readFileSync(join(dir, file), 'utf-8');
    const doc = parseKbDoc(raw, file);

    const prior = bySource.get(doc.source);
    if (prior !== undefined) {
      throw new Error(
        `KB has a duplicate source slug "${doc.source}" in "${file}" ` +
          `(already defined by "${prior}"). Sources must be unique.`,
      );
    }
    bySource.set(doc.source, file);

    if (doc.expires && doc.expires.getTime() < now) {
      // Expired — excluded from retrieval (KB hygiene), but its source still
      // counts toward uniqueness so a stale dup is still caught above.
      continue;
    }
    docs.push(doc);
  }

  return docs;
}

/**
 * Resolve the directory holding the KB markdown, probing the dev/jest source
 * location AND the built-dist location relative to the running module. Returns
 * the first that exists; throws if none do (so a missing-from-dist KB fails
 * fast rather than silently retrieving nothing).
 */
export function resolveKbDir(): string {
  const candidates = [
    // dev / jest: docs sit next to this source file.
    join(__dirname, 'kb'),
    // built dist: webpack asset `./src/sommelier/kb` → `dist/sommelier/kb`,
    // and __dirname of the bundled main.js is `dist`.
    join(__dirname, 'sommelier', 'kb'),
  ];

  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }

  throw new Error(
    `Sommelier KB directory not found. Looked in:\n` +
      candidates.map((c) => `  - ${c}`).join('\n') +
      `\nEnsure kb/*.md is shipped as a webpack asset (apps/api/webpack.config.js).`,
  );
}

/**
 * Split a front-matter block into trimmed key/value scalars. Hand-rolled,
 * deliberately minimal: one `key: value` per line, `#` line-comments and blank
 * lines ignored. Rejects unrecognised/nested YAML constructs implicitly (a line
 * with no top-level colon throws) so malformed front-matter fails fast.
 */
function parseFrontMatter(
  block: string,
  filename: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = block.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const colon = line.indexOf(':');
    if (colon === -1) {
      throw new Error(
        `KB doc "${filename}" has a malformed front-matter line ` +
          `(no "key: value"): ${JSON.stringify(line)}.`,
      );
    }

    const key = line.slice(0, colon).trim();
    const value = stripQuotes(line.slice(colon + 1).trim());
    if (key === '') {
      throw new Error(
        `KB doc "${filename}" has a front-matter line with an empty key: ` +
          `${JSON.stringify(line)}.`,
      );
    }
    out[key] = value;
  }

  return out;
}

function required(
  fields: Record<string, string>,
  key: string,
  filename: string,
): string {
  const value = fields[key];
  if (value === undefined || value === '') {
    throw new Error(
      `KB doc "${filename}" is missing required front-matter field "${key}".`,
    );
  }
  return value;
}

/** Strip a single pair of wrapping single/double quotes, if present. */
function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Parse the optional `expires` front-matter field. Accepts a calendar date
 * (`YYYY-MM-DD`) or any value `Date` parses unambiguously; throws on a present-
 * but-unparseable value so a typo'd expiry never silently keeps a stale doc.
 */
function parseExpires(
  value: string | undefined,
  filename: string,
): Date | undefined {
  if (value === undefined || value === '') return undefined;

  // Require an ISO-ish leading date to reject loose strings ("not-a-date").
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) {
    throw new Error(
      `KB doc "${filename}" has an unparseable expires "${value}"; ` +
        `expected an ISO date (YYYY-MM-DD).`,
    );
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `KB doc "${filename}" has an unparseable expires "${value}"; ` +
        `expected an ISO date (YYYY-MM-DD).`,
    );
  }
  return date;
}
