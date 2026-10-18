import express from 'express';
import { DEFAULT_SETTINGS, enforcePlan, matchChart, needsCollections, publicWidgetConfig } from '../plans.js';
import { rateLimiter, clientIp } from '../ratelimit.js';

const INSTANCE_RE = /^[a-zA-Z0-9-]{8,64}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9._~%-]{0,199}$/i;
// The only counters the visitor script sends. Each is at most once per visitor session.
export const EVENT_NAMES = ['viewed', 'opened', 'unit'];

/** Endpoints called by the size guide script on visitors' browsers (any origin). */
export function publicRoutes({ repo, cfg, sites }) {
  const r = express.Router();
  const ipLimit = rateLimiter({ capacity: 60, refillPerSec: 1 });
  const siteLimit = rateLimiter({ capacity: 600, refillPerSec: 10 });

  r.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'content-type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (!ipLimit(clientIp(req))) return res.status(429).json({ error: 'rate_limited' });
    next();
  });

  function loadSite(id, res) {
    if (typeof id !== 'string' || !INSTANCE_RE.test(id)) { res.status(400).json({ error: 'bad_instance' }); return null; }
    const site = repo.getSite(id);
    if (!site || site.removedAt) { res.status(404).json({ error: 'unknown_site' }); return null; }
    if (!siteLimit(id)) { res.status(429).json({ error: 'rate_limited' }); return null; }
    return site;
  }

  // ?i=<instance>&p=<product slug>[&n=<product name from the page>][&pv=1 preview]
  r.get('/guide', async (req, res, next) => {
    try {
      const site = loadSite(req.query.i, res);
      if (!site) return;
      const slug = typeof req.query.p === 'string' && SLUG_RE.test(req.query.p) ? req.query.p.toLowerCase() : '';
      const pageName = typeof req.query.n === 'string' ? req.query.n.slice(0, 200) : '';
      const settings = enforcePlan({ ...DEFAULT_SETTINGS, ...site.settings }, site.plan);

      let chart = null;
      if (slug) {
        const info = needsCollections(settings.charts) ? await sites.resolveProduct(site.instanceId, slug) : null;
        chart = matchChart(settings.charts, { slug, name: info?.name || pageName, collections: info?.collections || [] });
      } else if (req.query.pv === '1') {
        // Preview link from the dashboard on a non-product page: show the first chart.
        chart = settings.charts.find((c) => c.active !== false) || null;
      }
      res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
      res.json(publicWidgetConfig(site, chart, cfg.appName, cfg.landingUrl, cfg.baseUrl));
    } catch (e) { next(e); }
  });

  // Beacon payload: {i, e: ["viewed", "opened", ...]} sent as text/plain to avoid a CORS preflight.
  r.post('/ping', express.text({ type: '*/*', limit: '2kb' }), (req, res) => {
    let body;
    try { body = JSON.parse(req.body || '{}'); } catch { return res.sendStatus(400); }
    const site = loadSite(body?.i, res);
    if (!site) return;
    const counts = {};
    for (const name of Array.isArray(body.e) ? body.e : []) {
      if (EVENT_NAMES.includes(name)) counts[name] = 1;
    }
    if (Object.keys(counts).length) repo.recordEvents(site.instanceId, counts);
    res.sendStatus(204);
  });

  return r;
}
