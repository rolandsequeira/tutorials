import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createWixClient } from './wix.js';
import { createSiteService } from './sites.js';
import { publicRoutes } from './routes/public.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { webhookRoutes } from './routes/webhooks.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '..', 'public');

export function createApp({ cfg = loadConfig(), repo, wix, log = console } = {}) {
  repo ??= openDb(cfg.dbPath);
  wix ??= createWixClient(cfg);
  const sites = createSiteService({ repo, wix, cfg, log });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback, uniquelocal');

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // The visitor script. The name is deliberately neutral: filter lists block
  // scripts whose URL contains words like "adblock" or "ads".
  app.get('/notice.js', (req, res) => {
    res.set('Cache-Control', 'public, max-age=600, stale-while-revalidate=86400');
    res.set('Access-Control-Allow-Origin', '*');
    res.type('application/javascript').sendFile(path.join(publicDir, 'notice.js'));
  });

  // Settings page shown in an iframe inside the Wix dashboard.
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

  app.use('/api/v1', publicRoutes({ repo, cfg }));
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

  return { app, repo, sites };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cfg = loadConfig();
  const { app, sites } = createApp({ cfg });
  app.listen(cfg.port, () => console.log(`[server] ${cfg.appName} listening on :${cfg.port} (dev=${cfg.devMode})`));
  if (cfg.wixAppId && cfg.wixAppSecret) {
    setInterval(() => sites.resyncPaidSites(), 24 * 3600_000).unref();
  }
}
