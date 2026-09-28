// Plan catalogue. Wix bills the site owner; we only map the purchased
// vendor product ID (see WIX_PLAN_MAP) to one of these keys.

export const PLANS = {
  free: {
    name: 'Free',
    blockMode: false,       // full-page "disable your ad blocker to continue" wall
    removeBranding: false,
    excludePaths: false,
    statsDays: 7,
  },
  pro: {
    name: 'Pro',
    blockMode: true,
    removeBranding: true,
    excludePaths: true,
    statsDays: 90,
  },
};

export function getPlan(key) {
  return PLANS[key] || PLANS.free;
}

/** Map a Wix vendorProductId / billing packageName to an internal plan key. */
export function planFromVendorProduct(vendorProductId, planMap) {
  if (!vendorProductId) return 'free';
  const mapped = planMap?.[vendorProductId];
  if (mapped && PLANS[mapped]) return mapped;
  // Fallback: allow plan IDs that literally contain the plan key.
  const id = String(vendorProductId).toLowerCase();
  if (id.includes('pro') || id.includes('premium')) return 'pro';
  return 'free';
}

export const LAYOUTS = ['modal', 'banner-top', 'banner-bottom'];
export const MODES = ['dismiss', 'block'];
export const FREQUENCIES = ['every-page', 'session', 'day', 'week'];

export const DEFAULT_SETTINGS = {
  enabled: true,
  layout: 'modal',
  mode: 'dismiss',
  frequency: 'session',
  delaySeconds: 1,
  title: 'Looks like you are using an ad blocker',
  message: 'Ads help us keep this site free. Please consider adding us to your ad blocker\'s allowlist, then reload the page.',
  reloadLabel: 'I\'ve disabled it, reload',
  dismissLabel: 'Continue anyway',
  backgroundColor: '#ffffff',
  textColor: '#111827',
  accentColor: '#dc2626',
  overlayOpacity: 60,
  showBranding: true,
  excludePaths: [],
};

const HEX = /^#[0-9a-f]{6}$/i;
const cleanText = (v, max, fallback) => {
  if (typeof v !== 'string') return fallback;
  // Strip control characters; the widget renders with textContent, so no HTML escaping is needed here.
  const s = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
  return s || fallback;
};
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
const clamp = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/**
 * Merge an untrusted settings patch from the dashboard onto the current
 * settings, validating every field and enforcing the site's plan.
 */
export function sanitizeSettings(input, current = DEFAULT_SETTINGS, planKey = 'free') {
  const plan = getPlan(planKey);
  const src = input && typeof input === 'object' ? input : {};
  const cur = { ...DEFAULT_SETTINGS, ...current };
  const has = (k) => Object.prototype.hasOwnProperty.call(src, k);
  const out = { ...cur };

  if (has('enabled')) out.enabled = src.enabled === true;
  if (has('layout')) out.layout = pick(src.layout, LAYOUTS, cur.layout);
  if (has('mode')) out.mode = pick(src.mode, MODES, cur.mode);
  if (has('frequency')) out.frequency = pick(src.frequency, FREQUENCIES, cur.frequency);
  if (has('delaySeconds')) out.delaySeconds = clamp(src.delaySeconds, 0, 30, cur.delaySeconds);
  if (has('title')) out.title = cleanText(src.title, 120, DEFAULT_SETTINGS.title);
  if (has('message')) out.message = cleanText(src.message, 600, DEFAULT_SETTINGS.message);
  if (has('reloadLabel')) out.reloadLabel = cleanText(src.reloadLabel, 40, DEFAULT_SETTINGS.reloadLabel);
  if (has('dismissLabel')) out.dismissLabel = cleanText(src.dismissLabel, 40, DEFAULT_SETTINGS.dismissLabel);
  for (const k of ['backgroundColor', 'textColor', 'accentColor']) {
    if (has(k)) out[k] = HEX.test(src[k]) ? src[k].toLowerCase() : cur[k];
  }
  if (has('overlayOpacity')) out.overlayOpacity = clamp(src.overlayOpacity, 0, 95, cur.overlayOpacity);
  if (has('showBranding')) out.showBranding = src.showBranding !== false;
  if (has('excludePaths') && Array.isArray(src.excludePaths)) {
    out.excludePaths = src.excludePaths
      .filter((p) => typeof p === 'string')
      .map((p) => p.trim())
      .filter((p) => /^\/[^\s<>"']{0,200}$/.test(p))
      .slice(0, 50);
  }

  // Plan enforcement happens last so a downgrade also strips paid options.
  return enforcePlan(out, planKey);
}

export function enforcePlan(settings, planKey) {
  const plan = getPlan(planKey);
  const out = { ...settings };
  if (!plan.blockMode) out.mode = 'dismiss';
  // A bottom/top banner can't block the page, so block mode always uses the modal.
  if (out.mode === 'block') out.layout = 'modal';
  if (!plan.removeBranding) out.showBranding = true;
  if (!plan.excludePaths) out.excludePaths = [];
  return out;
}

/** What the visitor script receives. Only display settings, never billing data. */
export function publicWidgetConfig(site, appName, landingUrl) {
  const s = enforcePlan({ ...DEFAULT_SETTINGS, ...site.settings }, site.plan);
  return {
    enabled: s.enabled,
    layout: s.layout,
    mode: s.mode,
    frequency: s.frequency,
    delaySeconds: s.delaySeconds,
    title: s.title,
    message: s.message,
    reloadLabel: s.reloadLabel,
    dismissLabel: s.dismissLabel,
    backgroundColor: s.backgroundColor,
    textColor: s.textColor,
    accentColor: s.accentColor,
    overlayOpacity: s.overlayOpacity,
    excludePaths: s.excludePaths,
    branding: s.showBranding ? { name: appName, url: landingUrl } : null,
  };
}
