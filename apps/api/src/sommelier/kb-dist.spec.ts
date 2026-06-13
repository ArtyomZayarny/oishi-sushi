import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadKbDocs } from './kb-loader';

/**
 * T4 — kb-in-dist AC (§8 "Build", Risk #4): the Nx asset config must ship
 * `kb/*.md` into `nx build api` output. This is the classic
 * works-in-dev / breaks-in-dist trap: the loader resolves fine against source
 * under jest, but if the webpack `assets` config omits the kb glob, the built
 * `main.js` finds nothing at runtime and the sommelier silently has no KB.
 *
 * Asset mapping (verified against @nx/webpack normalizeAssets): the string asset
 * `'./src/sommelier/kb'` lands at `<projectRoot>/dist/sommelier/kb/**` because
 * `output = relative(sourceRoot, input)` = `sommelier/kb`.
 *
 * This spec asserts hard when a dist build is present and skips (does not fail)
 * when it is not — so `nx test api` stays green WITHOUT a build, while the
 * documented verify flow (`nx build api` then this spec) proves the asset ships.
 */
const DIST_KB_DIR = join(__dirname, '..', '..', 'dist', 'sommelier', 'kb');
const DIST_MAIN = join(__dirname, '..', '..', 'dist', 'main.js');

const hasBuild = existsSync(DIST_MAIN);
const describeIfBuilt = hasBuild ? describe : describe.skip;

describe('T4 — kb ships into nx build api output', () => {
  if (!hasBuild) {
    it.skip('skipped: no api dist build present (run `nx build api` first)', () => {
      // Intentionally skipped — see describeIfBuilt block for the real assertions.
    });
  }

  describeIfBuilt('with a dist build present', () => {
    it('dist/sommelier/kb exists and contains markdown docs', () => {
      expect(existsSync(DIST_KB_DIR)).toBe(true);
      const md = readdirSync(DIST_KB_DIR).filter((f) => f.endsWith('.md'));
      expect(md.length).toBeGreaterThanOrEqual(1);
    });

    it('the shipped kb docs are valid (loader parses the dist copy)', () => {
      const docs = loadKbDocs(DIST_KB_DIR);
      expect(docs.length).toBeGreaterThanOrEqual(1);
    });

    it('a shipped doc is byte-identical to its source counterpart', () => {
      const distFiles = readdirSync(DIST_KB_DIR).filter((f) =>
        f.endsWith('.md'),
      );
      const sourceDir = join(__dirname, 'kb');
      for (const f of distFiles) {
        const distContent = readFileSync(join(DIST_KB_DIR, f), 'utf-8');
        const srcContent = readFileSync(join(sourceDir, f), 'utf-8');
        expect(distContent).toBe(srcContent);
      }
    });
  });
});
