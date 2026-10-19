import express from 'express';
import { publicWidgetConfig } from '../plans.js';
import { rateLimiter, clientIp } from '../ratelimit.js';

const INSTANCE_RE = /^[a-zA-Z0-9-]{8,64}$/;
// The only counters the visitor script sends. Each is at most once per visitor session.
export const EVENT_NAMES = ['checked', 'detected', 'shown', 'dismissed', 'reload', 'recovered'];

/**
 * Endpoints called by the notice script on visitors' browsers (any origin).
 * Paths avoid words like "ad", "track" or "analytics" so filter lists don't block them.
 */
export function publicRoutes({ repo, cfg }) {
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

  r.get('/config', (req, res) => {
    const site = loadSite(req.query.i, res);
    if (!site) return;
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    res.json(publicWidgetConfig(site, cfg.appName, cfg.landingUrl));
  });

  // Beacon payload: {i, e: ["checked", "detected", ...]} sent as text/plain to avoid a CORS preflight.
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
