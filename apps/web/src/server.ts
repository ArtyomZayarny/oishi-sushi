import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

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
