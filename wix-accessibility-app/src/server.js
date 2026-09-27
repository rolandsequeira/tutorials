import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createWixClient } from './wix.js';
import { createSiteService } from './sites.js';
import { createAltTextService } from './alttext.js';
import { createDocumentService } from './documents.js';
import { publicRoutes } from './routes/public.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { webhookRoutes } from './routes/webhooks.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '..', 'public');

export function createApp({ cfg = loadConfig(), repo, wix, altClient, docFetch, log = console } = {}) {
  repo ??= openDb(cfg.dbPath);
  wix ??= createWixClient(cfg);
  const sites = createSiteService({ repo, wix, cfg, log });
  const altText = createAltTextService({ repo, cfg, log, client: altClient });
  const documents = createDocumentService({ repo, log, fetchImpl: docFetch });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback, uniquelocal');

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // Widget assets: long cache for fonts/i18n, short cache for the script so updates roll out.
  app.use('/fonts', express.static(path.join(publicDir, 'fonts'), {
    maxAge: '365d', immutable: true,
    setHeaders: (res) => res.set('Access-Control-Allow-Origin', '*'),
  }));
  app.use('/brand', express.static(path.join(publicDir, 'brand'), {
    maxAge: '7d', setHeaders: (res) => res.set('Access-Control-Allow-Origin', '*'),
  }));
  app.use('/i18n', express.static(path.join(publicDir, 'i18n'), {
    maxAge: '1d', setHeaders: (res) => res.set('Access-Control-Allow-Origin', '*'),
  }));
  app.get('/widget.js', (req, res) => {
    res.set('Cache-Control', 'public, max-age=600, stale-while-revalidate=86400');
    res.set('Access-Control-Allow-Origin', '*');
    res.type('application/javascript').sendFile(path.join(publicDir, 'widget.js'));
  });

  // Dashboard page shown in an iframe inside the Wix dashboard.
  const frameHeaders = (req, res, next) => {
    res.set('Content-Security-Policy',
      "frame-ancestors 'self' https://*.wix.com https://*.editorx.com https://*.wixapps.net");
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  };
  app.get(['/dashboard', '/dashboard/'], frameHeaders, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(publicDir, 'dashboard', 'index.html'));
  });
  app.use('/dashboard', frameHeaders, express.static(path.join(publicDir, 'dashboard'), { maxAge: '10m' }));

  // Owner preview page (sample content + the site's widget config).
  app.get('/preview', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(publicDir, 'preview.html'));
  });

  app.use('/api/widget', publicRoutes({ repo, cfg, altText, documents }));
  app.use('/api/dashboard', dashboardRoutes({ repo, cfg, wix, sites, log }));
  app.use('/webhooks', webhookRoutes({ cfg, sites, log }));

  if (cfg.devMode) {
    repo.ensureSite('dev-site-0001');
    app.get('/demo', (req, res) => res.sendFile(path.join(publicDir, 'demo.html')));
  }

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
    log.error(err);
    res.status(500).json({ error: 'internal' });
  });

  return { app, repo, sites, altText, documents };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cfg = loadConfig();
  const { app, sites, altText, documents } = createApp({ cfg });
  app.listen(cfg.port, () => console.log(`[server] ${cfg.appName} listening on :${cfg.port} (dev=${cfg.devMode})`));
  // Background jobs: alt-text queue every minute, plan resync nightly.
  setInterval(() => altText.processQueue(), 60_000).unref();
  setInterval(() => documents.processQueue(), 5 * 60_000).unref();
  if (cfg.wixAppId && cfg.wixAppSecret) {
    setInterval(() => sites.resyncPaidSites(), 24 * 3600_000).unref();
  }
}
