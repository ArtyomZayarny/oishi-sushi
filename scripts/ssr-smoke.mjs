#!/usr/bin/env node
// T13 — SSR post-build smoke (spec §5 F7-AC5, §13).
//
// Asserts, against the built SSR server (dist/apps/web/server/server.mjs):
//   1. GET / → 200 server-rendered HTML containing the sommelier shell.
//   2. ZERO /api/sommelier calls happen during server render (sommelier is
//      user-event-driven only; the panel renders from idle/null signals).
//
// The SSR server proxies /api/* to API_PROXY_TARGET (default localhost:3000).
// HomeComponent fetches /api/menu during render, so a backend must answer it.
//
//   • Docker-up / real api  → run with the api on :3000 (full fidelity):
//       node dist/apps/web/server/server.mjs   (PORT=4000)  +  this script
//   • Docker-down (here)    → this script starts a STUB api that serves
//       /api/menu and records every /api/* path, so the sommelier-zero-call
//       invariant + the 200-SSR-shell assertion are still proven without a DB.
//
// Run:  node scripts/ssr-smoke.mjs
//       (prereq: `nx build web` so dist/apps/web/server/server.mjs exists)
//
// Exit 0 = pass, non-zero = fail.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SSR_PORT = Number(process.env.SSR_PORT || 4000);
const STUB_PORT = Number(process.env.STUB_PORT || 3000);
const SSR_ENTRY = resolve('dist/apps/web/server/server.mjs');

// Six meals matching home.component.ts DISPLAY_ORDER so the grid renders.
const MENU = [
  cat('c1', 'Maki', [m('m-truffle', 'Toro Truffle Roll', 3800, ['Fish'])]),
  cat('c2', 'Nigiri', [m('m-otoro', 'Otoro Selection', 4800, ['Fish'])]),
  cat('c3', 'Omakase', [m('m-omakase', 'Chef’s Omakase', 12000, ['Fish'])]),
  cat('c4', 'Sashimi', [m('m-sashimi', 'Sashimi Moriawase', 5200, ['Fish'])]),
  cat('c5', 'Donburi', [m('m-ikura', 'Ikura Don', 3200, ['Soy'])]),
  cat('c6', 'Sets', [m('m-couples', 'Couple’s Set', 12800, ['Gluten'])]),
];

function m(id, name, priceCents, allergens) {
  return {
    id,
    name,
    description: `${name} description.`,
    priceCents,
    imageUrl: null,
    active: true,
    deletedAt: null,
    categoryId: 'c',
    allergens,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    options: [],
  };
}
function cat(id, name, meals) {
  return { id, name, slug: name.toLowerCase(), sortOrder: 1, meals };
}

const sommelierHits = [];

/** Stub api: answers /api/menu, records every /api/* path it sees. */
function startStubApi() {
  return new Promise((res) => {
    const server = createServer((req, response) => {
      const url = req.url || '';
      if (url.startsWith('/api/sommelier')) sommelierHits.push(url);
      if (url.startsWith('/api/menu') || url.startsWith('/api/admin/menu')) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(MENU));
        return;
      }
      // Anything else (auth probes etc.) → empty 200 so SSR never hangs.
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('[]');
    });
    server.listen(STUB_PORT, () => res(server));
  });
}

function startSsr() {
  const child = spawn('node', [SSR_ENTRY], {
    env: {
      ...process.env,
      PORT: String(SSR_PORT),
      API_PROXY_TARGET: `http://localhost:${STUB_PORT}`,
      NG_ALLOWED_HOSTS: 'localhost,127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write(`[ssr] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[ssr] ${d}`));
  return child;
}

async function waitForSsr(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://localhost:${SSR_PORT}/`);
      if (r.status) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('SSR server did not come up in time');
}

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    console.error(`  FAIL  ${name}`);
    failures += 1;
  }
}

async function main() {
  if (!existsSync(SSR_ENTRY)) {
    console.error(`Missing ${SSR_ENTRY} — run \`nx build web\` first.`);
    process.exit(2);
  }

  const stub = await startStubApi();
  const ssr = startSsr();

  try {
    await waitForSsr();

    const res = await fetch(`http://localhost:${SSR_PORT}/`);
    const html = await res.text();

    console.log('\nSSR post-build smoke (F7-AC5):');
    check('GET / returns 200', res.status === 200);
    check(
      'response is server-rendered HTML (has <app-root>)',
      /<app-root/.test(html),
    );
    // Sommelier shell present in the server-rendered markup.
    check(
      'sommelier shell rendered server-side (app-sommelier-input present)',
      /app-sommelier-input/.test(html),
    );
    check(
      'sommelier input shell present (data-kenji-input)',
      /data-kenji-input/.test(html),
    );
    check('"SOMMELIER AI" label rendered', /SOMMELIER AI/.test(html));
    // The core invariant: no sommelier call during server render.
    check(
      `ZERO /api/sommelier calls during server render (saw ${sommelierHits.length})`,
      sommelierHits.length === 0,
    );

    if (failures > 0) {
      console.error(`\n${failures} SSR smoke check(s) FAILED.`);
      process.exitCode = 1;
    } else {
      console.log('\nSSR smoke PASSED.');
      process.exitCode = 0;
    }
  } catch (err) {
    console.error('SSR smoke error:', err);
    process.exitCode = 1;
  } finally {
    ssr.kill('SIGTERM');
    stub.close();
    // Give the SSR child a beat to exit so the port frees.
    await new Promise((r) => setTimeout(r, 300));
  }
}

main();
