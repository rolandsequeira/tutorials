import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { verifySignedInstance } from '../wix.js';
import { getPlan, PLANS, sanitizeSettings, enforcePlan, planFromVendorProduct, MAX_COLUMNS, MAX_ROWS } from '../plans.js';
import { TEMPLATES } from '../templates.js';
import { dayKey } from '../db.js';
import { EVENT_NAMES } from './public.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGES_PER_SITE = 100;

/** Detect the image type from its first bytes; the browser's content type is not trusted. SVG is refused (it can carry scripts). */
export function sniffImage(buf) {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.length > 6 && /^GIF8[79]a$/.test(buf.toString('ascii', 0, 6))) return 'gif';
  return null;
}

/** API used by the settings page that Wix shows inside the site owner's dashboard. */
export function dashboardRoutes({ repo, cfg, wix, sites, log = console }) {
  const r = express.Router();

  // Authenticate every call with the signed instance Wix gave the iframe.
  r.use((req, res, next) => {
    const signed = req.get('x-wix-instance');
    let payload = verifySignedInstance(signed, cfg.wixAppSecret);
    if (!payload && cfg.devMode && req.get('x-dev-instance')) {
      payload = { instanceId: req.get('x-dev-instance'), vendorProductId: req.get('x-dev-plan') || null };
    }
    if (!payload) return res.status(401).json({ error: 'unauthorized' });
    let site = repo.getSite(payload.instanceId) || repo.ensureSite(payload.instanceId);
    // The signed instance carries the current plan; apply it immediately.
    const signedPlan = planFromVendorProduct(payload.vendorProductId, cfg.wixPlanMap);
    if (payload.vendorProductId !== undefined && signedPlan !== site.plan) {
      repo.updatePlan(site.instanceId, { plan: signedPlan, product: payload.vendorProductId || null });
      site = repo.getSite(site.instanceId);
    }
    req.site = site;
    next();
  });

  r.get('/site', async (req, res) => {
    let site = req.site;
    if (!cfg.devMode && cfg.wixAppId) {
      // Best effort: refresh URL/plan and make sure the script is embedded.
      try { site = await sites.syncFromWix(site.instanceId); } catch (e) { log.warn('[dashboard] sync', e.message); }
      if (!site.scriptEmbedded) {
        try { await wix.embedScript(site.instanceId); repo.markEmbedded(site.instanceId, true); site.scriptEmbedded = true; }
        catch (e) { log.warn('[dashboard] embed', e.message); }
      }
    }
    const plan = getPlan(site.plan);
    res.json({
      instanceId: site.instanceId,
      siteUrl: site.siteUrl,
      siteName: site.siteName,
      plan: site.plan,
      planName: plan.name,
      limits: plan,
      plans: PLANS,
      settings: enforcePlan(site.settings, site.plan),
      templates: TEMPLATES,
      maxColumns: MAX_COLUMNS,
      maxRows: MAX_ROWS,
      scriptEmbedded: site.scriptEmbedded || cfg.devMode,
      upgradeUrl: cfg.wixAppId ? wix.upgradeUrl(site.instanceId) : null,
      appName: cfg.appName,
      landingUrl: cfg.landingUrl,
      baseUrl: cfg.baseUrl,
    });
  });

  r.put('/settings', express.json({ limit: '512kb' }), (req, res) => {
    const next = sanitizeSettings(req.body, req.site.settings, req.site.plan);
    // Store without the computed "active" flag.
    next.charts = next.charts.map(({ active, ...c }) => c);
    repo.updateSettings(req.site.instanceId, next);
    // Assignments may have changed, so product lookups start fresh.
    repo.clearProducts(req.site.instanceId);
    res.json({ settings: enforcePlan(next, req.site.plan) });
  });

  // Collections (Catalog V1) or categories (V3) of the site's store, for assigning charts.
  r.get('/collections', async (req, res) => {
    if (cfg.devMode && !cfg.wixAppId) {
      return res.json({ collections: [
        { id: '00000000-0000-0000-0000-000000000001', name: 'Shoes' },
        { id: '00000000-0000-0000-0000-000000000002', name: 'Gloves' },
        { id: '00000000-0000-0000-0000-000000000003', name: 'T-shirts' },
      ] });
    }
    try {
      res.json({ collections: await wix.listCollections(req.site.instanceId) });
    } catch (e) {
      log.warn('[dashboard] collections', e.message);
      res.json({ collections: [], error: 'Could not load your store categories. Check that Wix Stores is installed.' });
    }
  });

  r.post('/images', express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }), (req, res) => {
    if (!getPlan(req.site.plan).images) return res.status(402).json({ error: 'pro_required' });
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const type = sniffImage(buf);
    if (!type) return res.status(415).json({ error: 'Use a PNG, JPG, WebP or GIF image.' });
    if (repo.uploadUsage(req.site.instanceId).n >= MAX_IMAGES_PER_SITE) {
      return res.status(409).json({ error: 'Image limit reached for this site.' });
    }
    const id = crypto.randomBytes(12).toString('hex');
    fs.mkdirSync(cfg.uploadDir, { recursive: true });
    fs.writeFileSync(path.join(cfg.uploadDir, `${id}.${type}`), buf);
    repo.addUpload(id, req.site.instanceId, type, buf.length);
    res.json({ url: `/u/${id}.${type}` });
  });

  r.get('/stats', (req, res) => {
    const plan = getPlan(req.site.plan);
    const since = new Date(Date.now() - (plan.statsDays - 1) * 86400_000);
    const totals = Object.fromEntries(EVENT_NAMES.map((n) => [n, 0]));
    const daily = {};
    for (const row of repo.eventsSince(req.site.instanceId, dayKey(since))) {
      if (!(row.name in totals)) continue;
      totals[row.name] += row.count;
      daily[row.day] ??= { day: row.day, viewed: 0, opened: 0 };
      if (row.name === 'viewed' || row.name === 'opened') daily[row.day][row.name] += row.count;
    }
    res.json({ days: plan.statsDays, totals, daily: Object.values(daily) });
  });

  r.post('/refresh-plan', async (req, res) => {
    try {
      const site = await sites.syncFromWix(req.site.instanceId);
      res.json({ plan: site.plan });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  return r;
}
