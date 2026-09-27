// Plan catalogue. Wix bills the site owner; we only map the purchased
// vendor product ID (see WIX_PLAN_MAP) to one of these keys.

export const FREE_FEATURES = [
  // content
  'fontSize', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textAlign',
  'readableFont', 'dyslexiaFont', 'highlightTitles', 'highlightLinks', 'textMagnifier',
  // color
  'contrast', 'saturation',
  // orientation
  'bigCursor', 'readingGuide', 'readingMask', 'stopAnimations', 'hideImages',
  'muteSounds', 'highlightFocus', 'highlightHover', 'imageDescriptions',
  'keyboardNav', 'pageStructure',
  // profiles
  'profiles',
];

export const PRO_FEATURES = [
  'customColors', 'screenReader', 'readPage', 'voiceNav', 'virtualKeyboard', 'dictionary',
];

export const PLANS = {
  free: {
    name: 'Free',
    features: FREE_FEATURES,
    autoFix: false,          // DOM remediation (labels, lang, skip link...)
    aiAltTextPerMonth: 0,
    auditDetails: false,     // free sees issue counts only
    removeBranding: false,
    customCss: false,
    excludePaths: false,
    analyticsDays: 7,
  },
  pro: {
    name: 'Pro',
    features: [...FREE_FEATURES, ...PRO_FEATURES],
    autoFix: true,
    aiAltTextPerMonth: 1000,
    auditDetails: true,
    removeBranding: true,
    customCss: false,
    excludePaths: false,
    analyticsDays: 90,
  },
  business: {
    name: 'Business',
    features: [...FREE_FEATURES, ...PRO_FEATURES],
    autoFix: true,
    aiAltTextPerMonth: 10000,
    auditDetails: true,
    removeBranding: true,
    customCss: true,
    excludePaths: true,
    analyticsDays: 365,
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
  if (id.includes('business') || id.includes('agency')) return 'business';
  if (id.includes('pro') || id.includes('premium')) return 'pro';
  return 'free';
}

export const DEFAULT_SETTINGS = {
  enabled: true,
  position: 'bottom-right', // bottom-right | bottom-left | top-right | top-left | middle-right | middle-left
  offsetX: 20,
  offsetY: 20,
  icon: 'person',          // person | wheelchair | eye | toggle
  iconSize: 'medium',      // small | medium | large
  primaryColor: '#1a56db',
  iconColor: '#ffffff',
  panelTheme: 'auto',      // auto | light | dark
  language: 'auto',        // auto | en | es | ...
  hideOnMobile: false,
  hideTrigger: false,      // open only through a link to #accessibility or Alt+A
  statementUrl: '',
  disabledFeatures: [],
  autoFix: {
    altText: true,         // AI alt text for images missing it
    emptyLinks: true,
    formLabels: true,
    iframeTitles: true,
    pageLang: true,
    newTabWarning: true,
    skipLink: true,
    viewportZoom: true,
  },
  ga4: false,
  showBranding: true,
  customCss: '',
  excludePaths: [],
};

const HEX = /^#[0-9a-f]{6}$/i;
const ENUMS = {
  position: ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'middle-right', 'middle-left'],
  icon: ['person', 'wheelchair', 'eye', 'toggle'],
  iconSize: ['small', 'medium', 'large'],
  panelTheme: ['auto', 'light', 'dark'],
};
export const LANGUAGES = ['auto', 'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'tr', 'ru', 'ar', 'he', 'hi', 'zh', 'ja'];

/** Validate and merge untrusted settings from the dashboard. */
export function sanitizeSettings(input, current = DEFAULT_SETTINGS, planKey = 'free') {
  const plan = getPlan(planKey);
  const out = structuredClone({ ...DEFAULT_SETTINGS, ...current, autoFix: { ...DEFAULT_SETTINGS.autoFix, ...(current.autoFix || {}) } });
  if (!input || typeof input !== 'object') return out;

  if (typeof input.enabled === 'boolean') out.enabled = input.enabled;
  for (const [k, allowed] of Object.entries(ENUMS)) {
    if (allowed.includes(input[k])) out[k] = input[k];
  }
  if (LANGUAGES.includes(input.language)) out.language = input.language;
  for (const k of ['offsetX', 'offsetY']) {
    const n = Number(input[k]);
    if (Number.isFinite(n)) out[k] = Math.min(200, Math.max(0, Math.round(n)));
  }
  for (const k of ['primaryColor', 'iconColor']) {
    if (typeof input[k] === 'string' && HEX.test(input[k])) out[k] = input[k];
  }
  for (const k of ['hideOnMobile', 'hideTrigger', 'ga4']) {
    if (typeof input[k] === 'boolean') out[k] = input[k];
  }
  if (typeof input.statementUrl === 'string') {
    const u = input.statementUrl.trim();
    out.statementUrl = u === '' || /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u.slice(0, 500) : out.statementUrl;
  }
  if (Array.isArray(input.disabledFeatures)) {
    const known = new Set([...FREE_FEATURES, ...PRO_FEATURES]);
    out.disabledFeatures = input.disabledFeatures.filter((f) => known.has(f));
  }
  if (input.autoFix && typeof input.autoFix === 'object') {
    for (const k of Object.keys(DEFAULT_SETTINGS.autoFix)) {
      if (typeof input.autoFix[k] === 'boolean') out.autoFix[k] = input.autoFix[k];
    }
  }
  if (typeof input.showBranding === 'boolean') {
    out.showBranding = plan.removeBranding ? input.showBranding : true;
  }
  if (typeof input.customCss === 'string' && plan.customCss) {
    // Strip anything that could break out of the <style> element.
    out.customCss = input.customCss.replace(/<\/?\s*style/gi, '').slice(0, 10000);
  }
  if (Array.isArray(input.excludePaths) && plan.excludePaths) {
    out.excludePaths = input.excludePaths
      .filter((p) => typeof p === 'string' && p.startsWith('/'))
      .map((p) => p.slice(0, 200))
      .slice(0, 50);
  }
  return out;
}

/** Settings as the public widget sees them (plan limits applied). */
export function publicWidgetConfig(site, appName) {
  const plan = getPlan(site.plan);
  const s = sanitizeSettings({}, site.settings, site.plan);
  const disabled = new Set(s.disabledFeatures);
  return {
    v: 1,
    plan: site.plan,
    enabled: s.enabled,
    features: plan.features.filter((f) => !disabled.has(f)),
    autoFix: plan.autoFix ? s.autoFix : null,
    aiAltText: plan.aiAltTextPerMonth > 0 && s.autoFix.altText,
    ui: {
      position: s.position,
      offsetX: s.offsetX,
      offsetY: s.offsetY,
      icon: s.icon,
      iconSize: s.iconSize,
      primaryColor: s.primaryColor,
      iconColor: s.iconColor,
      panelTheme: s.panelTheme,
      language: s.language,
      hideOnMobile: s.hideOnMobile,
      hideTrigger: s.hideTrigger,
      statementUrl: s.statementUrl,
      showBranding: plan.removeBranding ? s.showBranding : true,
      brandName: appName,
    },
    ga4: s.ga4,
    customCss: plan.customCss ? s.customCss : '',
    excludePaths: plan.excludePaths ? s.excludePaths : [],
    // Sample rate for background page audits (keeps server load tiny).
    auditSampleRate: 0.1,
  };
}
