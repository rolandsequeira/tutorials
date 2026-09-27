import { planFromVendorProduct } from './plans.js';

/** Business logic that ties Wix events to local state. */
export function createSiteService({ repo, wix, cfg, log = console }) {
  /** Pull site info + billing from Wix and store the resolved plan. */
  async function syncFromWix(instanceId) {
    const res = await wix.getAppInstance(instanceId);
    const inst = res.instance || {};
    const site = res.site || {};
    repo.updateSiteInfo(instanceId, { siteUrl: site.url || null, siteName: site.siteDisplayName || null });
    const billing = inst.billing;
    if (inst.isFree !== false || !billing) {
      repo.updatePlan(instanceId, { plan: 'free' });
    } else {
      repo.updatePlan(instanceId, {
        plan: planFromVendorProduct(billing.packageName, cfg.wixPlanMap),
        product: billing.packageName || null,
        cycle: billing.billingCycle || null,
        expires: billing.expirationDate || null,
      });
    }
    return repo.getSite(instanceId);
  }

  async function onInstalled(instanceId) {
    repo.ensureSite(instanceId);
    try {
      await wix.embedScript(instanceId);
      repo.markEmbedded(instanceId, true);
    } catch (e) {
      log.error('[install] embed script failed', instanceId, e.message);
    }
    try { await syncFromWix(instanceId); } catch (e) { log.error('[install] sync failed', instanceId, e.message); }
  }

  /**
   * Handle a verified webhook. For every billing event we re-read the
   * instance from Wix instead of trusting event ordering.
   */
  async function handleWebhook({ eventType, instanceId, data }) {
    if (!instanceId) return;
    switch (eventType) {
      case 'AppInstalled':
        await onInstalled(instanceId);
        break;
      case 'AppRemoved':
        repo.ensureSite(instanceId);
        repo.markRemoved(instanceId);
        break;
      case 'PaidPlanPurchased':
      case 'PaidPlanChanged':
      case 'PlanConvertedToPaid':
      case 'PlanReactivated':
      case 'PaidPlanAutoRenewalCancelled':
      case 'PlanTransferred':
        repo.ensureSite(instanceId);
        try {
          await syncFromWix(instanceId);
        } catch (e) {
          // Fall back to the event payload so a paying customer is never stuck on free.
          log.error('[webhook] sync failed, using payload', e.message);
          if (data?.vendorProductId && eventType !== 'PaidPlanAutoRenewalCancelled') {
            repo.updatePlan(instanceId, {
              plan: planFromVendorProduct(data.vendorProductId, cfg.wixPlanMap),
              product: data.vendorProductId,
              cycle: data.cycle || null,
              expires: data.expiresOn || null,
            });
          }
        }
        break;
      default:
        log.info('[webhook] ignored', eventType);
    }
  }

  /** Nightly: catch expirations / missed webhooks. */
  async function resyncPaidSites() {
    for (const id of repo.paidSiteIds()) {
      try { await syncFromWix(id); } catch (e) { log.error('[resync]', id, e.message); }
    }
  }

  return { syncFromWix, onInstalled, handleWebhook, resyncPaidSites };
}
