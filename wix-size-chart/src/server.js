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

  // The visitor script Wix embeds on every page.
  app.get('/guide.js', (req, res) => {
    res.set('Cache-Control', 'public, max-age=600, stale-while-revalidate=86400');
    res.set('Access-Control-Allow-Origin', '*');
    res.type('application/javascript').sendFile(path.join(publicDir, 'guide.js'));
  });

  // Chart images uploaded by site owners. Names are random and never reused, so cache for a year.
  app.get('/u/:file', (req, res) => {
    const m = /^([a-f0-9]{24})\.(png|jpg|webp|gif)$/.exec(req.params.file);
    const up = m && repo.getUpload(m[1]);
    if (!up || up.type !== m[2]) return res.sendStatus(404);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'");
    res.type(m[2] === 'jpg' ? 'image/jpeg' : `image/${m[2]}`).sendFile(path.join(cfg.uploadDir, req.params.file), (err) => {
      if (err && !res.headersSent) res.sendStatus(404);
    });
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

  app.use('/api/v1', publicRoutes({ repo, cfg, sites }));
  app.use('/api/dashboard', dashboardRoutes({ repo, cfg, wix, sites, log }));
  app.use('/webhooks', webhookRoutes({ cfg, sites, log }));

  if (cfg.devMode) {
    repo.ensureSite('dev-site-0001');
    // A fake Wix Stores product page; the slug in the URL picks the chart.
    app.get('/demo', (req, res) => res.redirect('/product-page/boxing-gloves-12oz'));
    app.get('/product-page/:slug', (req, res) => res.sendFile(path.join(publicDir, 'demo.html')));
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
