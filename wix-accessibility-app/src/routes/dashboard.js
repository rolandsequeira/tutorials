import express from 'express';
import { verifySignedInstance } from '../wix.js';
import { getPlan, PLANS, sanitizeSettings, planFromVendorProduct, FREE_FEATURES, PRO_FEATURES } from '../plans.js';
import { dayKey } from '../db.js';

/** API used by the dashboard page that Wix shows inside the site owner's dashboard. */
export function dashboardRoutes({ repo, cfg, wix, sites, log = console }) {
  const r = express.Router();
  r.use(express.json({ limit: '64kb' }));

  // Authenticate every call with the signed instance Wix gave the iframe.
  r.use((req, res, next) => {
    const signed = req.get('x-wix-instance');
    let payload = verifySignedInstance(signed, cfg.wixAppSecret);
    if (!payload && cfg.devMode && req.get('x-dev-instance')) {
      payload = { instanceId: req.get('x-dev-instance'), vendorProductId: req.get('x-dev-plan') || null };
    }
    if (!payload) return res.status(401).json({ error: 'unauthorized' });
    req.wix = payload;
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
      planCycle: site.planCycle,
      planExpires: site.planExpires,
      limits: plan,
      plans: PLANS,
      featureCatalog: { free: FREE_FEATURES, pro: PRO_FEATURES },
      settings: site.settings,
      scriptEmbedded: site.scriptEmbedded || cfg.devMode,
      usage: { aiAltThisMonth: repo.getUsage(site.instanceId, 'ai_alt') },
      altCounts: repo.altCounts(site.instanceId),
      upgradeUrl: cfg.wixAppId ? wix.upgradeUrl(site.instanceId) : null,
      widgetUrl: `${cfg.baseUrl}/widget.js`,
      appName: cfg.appName,
    });
  });

  r.put('/settings', (req, res) => {
    const next = sanitizeSettings(req.body, req.site.settings, req.site.plan);
    repo.updateSettings(req.site.instanceId, next);
    res.json({ settings: next });
  });

  r.get('/stats', (req, res) => {
    const plan = getPlan(req.site.plan);
    const since = new Date(Date.now() - plan.analyticsDays * 86400_000);
    const rows = repo.eventsSince(req.site.instanceId, dayKey(since));
    const totals = {};
    const daily = {};
    for (const row of rows) {
      totals[row.name] = (totals[row.name] || 0) + row.count;
      if (row.name === 'open' || row.name === 'load') {
        daily[row.day] ??= { day: row.day, open: 0, load: 0 };
        daily[row.day][row.name] += row.count;
      }
    }
    res.json({ days: plan.analyticsDays, totals, daily: Object.values(daily) });
  });

  r.get('/audits', (req, res) => {
    const plan = getPlan(req.site.plan);
    const audits = repo.listAudits(req.site.instanceId);
    if (plan.auditDetails) return res.json({ details: true, audits });
    // Free plan: counts only (upsell), no per-issue samples.
    res.json({
      details: false,
      audits: audits.map((a) => ({
        path: a.path,
        score: a.score,
        created_at: a.created_at,
        issueCount: a.issues.reduce((s, i) => s + i.count, 0),
      })),
    });
  });

  r.get('/alt-texts', (req, res) => {
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    res.json({ items: repo.listAlts(req.site.instanceId, limit, offset), counts: repo.altCounts(req.site.instanceId) });
  });

  r.put('/alt-texts/:id', (req, res) => {
    const alt = typeof req.body.alt === 'string' ? req.body.alt.trim().slice(0, 250) : null;
    if (alt === null) return res.status(400).json({ error: 'alt required' });
    const ok = repo.editAlt(req.site.instanceId, Number(req.params.id), alt);
    res.status(ok ? 200 : 404).json({ ok });
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
