import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { timingSafeEqual } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Ungated health endpoint for platform health checks (Railway). Declared before
 * the staging password gate below so the probe always gets 200, not 401.
 */
app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

/**
 * Optional staging password gate. When STAGING_BASIC_AUTH="user:pass" is set,
 * every request below (the /api + /socket.io proxies, static assets, and SSR)
 * requires HTTP Basic auth — keeps the demo URL private and unindexed. Unset in
 * local/prod, so it is a no-op there.
 */
const stagingAuth = process.env['STAGING_BASIC_AUTH'];
if (stagingAuth) {
  const expected = Buffer.from(
    `Basic ${Buffer.from(stagingAuth).toString('base64')}`,
  );
  app.use((req, res, next) => {
    const got = Buffer.from(req.headers.authorization ?? '');
    // timingSafeEqual throws on unequal lengths, so length-check first.
    if (got.length === expected.length && timingSafeEqual(got, expected)) {
      next();
      return;
    }
    res.set('WWW-Authenticate', 'Basic realm="oishi-staging"');
    res.status(401).send('Authentication required.');
  });
}

/**
 * Proxy /api/* and /socket.io/* to the backend.
 * Mirrors apps/web/proxy.conf.json (which only affects `ng serve` dev-server)
 * so that the compiled SSR server behaves the same at runtime.
 *
 * Express mount at '/api' strips the prefix, so target must include '/api' to
 * land on NestJS's global prefix. socket.io uses a non-prefixed path.
 */
const apiOrigin =
  process.env['API_PROXY_TARGET']?.replace(/\/+$/, '') ||
  'http://localhost:3000';

app.use(
  '/api',
  createProxyMiddleware({
    target: `${apiOrigin}/api`,
    changeOrigin: true,
  }),
);

app.use(
  '/socket.io',
  createProxyMiddleware({
    // Express mount at '/socket.io' strips the prefix before the request
    // reaches the proxy, so the target must include '/socket.io' to land on
    // NestJS's socket.io namespace. Same fix pattern as the /api proxy above.
    target: `${apiOrigin}/socket.io`,
    changeOrigin: true,
    ws: true,
  }),
);

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use('/**', (req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
