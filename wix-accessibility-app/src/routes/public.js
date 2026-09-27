import express from 'express';
import { publicWidgetConfig, getPlan } from '../plans.js';
import { hashUrl } from '../db.js';
import { isAllowedImageUrl, normalizeImageUrl } from '../alttext.js';
import { isAllowedDocUrl } from '../documents.js';
import { rateLimiter, clientIp } from '../ratelimit.js';

const INSTANCE_RE = /^[a-zA-Z0-9-]{8,64}$/;
const EVENT_RE = /^[a-zA-Z0-9_.:-]{1,48}$/;

/** Endpoints called by the widget running on visitors' browsers (any origin). */
export function publicRoutes({ repo, cfg, altText, documents }) {
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

  function loadSite(req, res) {
    const id = req.query.i || req.body?.i;
    if (typeof id !== 'string' || !INSTANCE_RE.test(id)) { res.status(400).json({ error: 'bad_instance' }); return null; }
    const site = repo.getSite(id);
    if (!site || site.removedAt) { res.status(404).json({ error: 'unknown_site' }); return null; }
    if (!siteLimit(id)) { res.status(429).json({ error: 'rate_limited' }); return null; }
    return site;
  }

  r.get('/config', (req, res) => {
    const site = loadSite(req, res);
    if (!site) return;
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    res.json(publicWidgetConfig(site, cfg.appName, cfg.landingUrl));
  });

  // Beacon payload: {i, e: {eventName: count}} sent as text/plain to avoid CORS preflight.
  r.post('/events', express.text({ type: '*/*', limit: '8kb' }), (req, res) => {
    let body;
    try { body = JSON.parse(req.body || '{}'); } catch { return res.sendStatus(400); }
    req.body = body;
    const site = loadSite(req, res);
    if (!site) return;
    const counts = {};
    let n = 0;
    for (const [k, v] of Object.entries(body.e || {})) {
      if (!EVENT_RE.test(k) || ++n > 40) continue;
      counts[k] = Math.min(50, Math.max(0, Math.floor(Number(v) || 0)));
    }
    if (Object.keys(counts).length) repo.recordEvents(site.instanceId, counts);
    res.sendStatus(204);
  });

  // {i, page, images: [url]} -> {alts: {url: alt}}. Unknown images are queued for AI captioning.
  r.post('/alt-text', express.json({ limit: '32kb' }), (req, res) => {
    const site = loadSite(req, res);
    if (!site) return;
    const plan = getPlan(site.plan);
    if (!plan.aiAltTextPerMonth || !site.settings.autoFix?.altText) return res.json({ alts: {} });

    const urls = (Array.isArray(req.body.images) ? req.body.images : [])
      .filter((u) => typeof u === 'string' && u.length < 2000)
      .slice(0, 40);
    const map = new Map(); // normalized -> [original urls]
    for (const u of urls) {
      if (!isAllowedImageUrl(u, site.siteUrl)) continue;
      const n = normalizeImageUrl(u);
      if (!map.has(n)) map.set(n, []);
      map.get(n).push(u);
    }
    const hashes = [...map.keys()].map(hashUrl);
    const known = repo.getAlts(site.instanceId, hashes);
    const alts = {};
    let queued = 0;
    const pageUrl = typeof req.body.page === 'string' ? req.body.page.slice(0, 500) : null;
    for (const [n, originals] of map) {
      const h = hashUrl(n);
      const row = known[h];
      if (row && (row.status === 'done' || row.status === 'edited') && row.alt !== null) {
        for (const o of originals) alts[o] = row.alt;
      } else if (!row) {
        if (repo.getUsage(site.instanceId, 'ai_alt') + queued >= plan.aiAltTextPerMonth) continue;
        if (repo.queueAlt(site.instanceId, h, n, pageUrl)) queued++;
      }
    }
    if (queued) {
      repo.incUsage(site.instanceId, 'ai_alt', queued);
      setImmediate(() => altText.processQueue());
    }
    res.json({ alts, queued });
  });

  // Visitor "Report a problem" form. Available on every plan.
  const feedbackLimit = rateLimiter({ capacity: 5, refillPerSec: 1 / 120 });
  r.post('/feedback', express.json({ limit: '16kb' }), (req, res) => {
    const site = loadSite(req, res);
    if (!site) return;
    if (!feedbackLimit(clientIp(req))) return res.status(429).json({ error: 'rate_limited' });
    const message = typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
    if (message.length < 3) return res.status(400).json({ error: 'message_required' });
    let email = typeof req.body.email === 'string' ? req.body.email.trim().slice(0, 200) : '';
    if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) email = '';
    let pageUrl = null;
    try {
      const u = new URL(String(req.body.page));
      if (u.protocol === 'https:' || u.protocol === 'http:') pageUrl = u.toString().slice(0, 500);
    } catch { /* optional */ }
    const meta = {
      lang: typeof req.body.lang === 'string' ? req.body.lang.slice(0, 8) : '',
      prefs: (Array.isArray(req.body.prefs) ? req.body.prefs : []).filter((p) => typeof p === 'string' && /^[a-zA-Z]{2,30}$/.test(p)).slice(0, 30),
      ua: String(req.get('user-agent') || '').slice(0, 200),
    };
    repo.addFeedback(site.instanceId, { pageUrl, message, email: email || null, meta });
    res.status(201).json({ ok: true });
  });

  // Sampled page audit from the widget. Stored at most once per path per 6h.
  r.post('/audit', express.json({ limit: '64kb' }), (req, res) => {
    const site = loadSite(req, res);
    if (!site) return;
    let path;
    try {
      const u = new URL(String(req.body.page));
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return res.sendStatus(400);
      path = u.pathname.slice(0, 300);
    } catch { return res.sendStatus(400); }
    const last = repo.lastAuditAt(site.instanceId, path);
    if (last && Date.now() - Date.parse(last) < 6 * 3600_000) return res.sendStatus(204);
    const score = Math.max(0, Math.min(100, Math.round(Number(req.body.score) || 0)));
    const issues = (Array.isArray(req.body.issues) ? req.body.issues : []).slice(0, 30).map((it) => ({
      id: String(it.id || '').slice(0, 40),
      impact: ['critical', 'serious', 'moderate', 'minor'].includes(it.impact) ? it.impact : 'minor',
      count: Math.max(0, Math.min(10000, Number(it.count) || 0)),
      wcag: String(it.wcag || '').slice(0, 20),
      samples: (Array.isArray(it.samples) ? it.samples : []).slice(0, 5).map((s) => String(s).slice(0, 200)),
      fixed: Math.max(0, Math.min(10000, Number(it.fixed) || 0)),
    }));
    repo.saveAudit(site.instanceId, path, String(req.body.page).slice(0, 500), score, issues);
    let newDocs = 0;
    for (const d of (Array.isArray(req.body.pdfs) ? req.body.pdfs : []).slice(0, 25)) {
      if (typeof d === 'string' && d.length < 1000 && isAllowedDocUrl(d, site.siteUrl) && repo.addDocument(site.instanceId, d, String(req.body.page).slice(0, 500))) newDocs++;
    }
    if (newDocs && documents) setImmediate(() => documents.processQueue());
    res.sendStatus(204);
  });

  return r;
}
