import express from 'express';
import { verifySignedInstance } from '../wix.js';
import { getPlan, PLANS, sanitizeSettings, enforcePlan, planFromVendorProduct } from '../plans.js';
import { dayKey } from '../db.js';
import { EVENT_NAMES } from './public.js';

/** API used by the settings page that Wix shows inside the site owner's dashboard. */
export function dashboardRoutes({ repo, cfg, wix, sites, log = console }) {
  const r = express.Router();
  r.use(express.json({ limit: '32kb' }));

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
      scriptEmbedded: site.scriptEmbedded || cfg.devMode,
      upgradeUrl: cfg.wixAppId ? wix.upgradeUrl(site.instanceId) : null,
      appName: cfg.appName,
      landingUrl: cfg.landingUrl,
    });
  });

  r.put('/settings', (req, res) => {
    const next = sanitizeSettings(req.body, req.site.settings, req.site.plan);
    repo.updateSettings(req.site.instanceId, next);
    res.json({ settings: next });
  });

  r.get('/stats', (req, res) => {
    const plan = getPlan(req.site.plan);
    const since = new Date(Date.now() - (plan.statsDays - 1) * 86400_000);
    const totals = Object.fromEntries(EVENT_NAMES.map((n) => [n, 0]));
    const daily = {};
    for (const row of repo.eventsSince(req.site.instanceId, dayKey(since))) {
      if (!(row.name in totals)) continue;
      totals[row.name] += row.count;
      daily[row.day] ??= { day: row.day, checked: 0, detected: 0 };
      if (row.name === 'checked' || row.name === 'detected') daily[row.day][row.name] += row.count;
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
