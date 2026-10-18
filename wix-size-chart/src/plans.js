// Plan catalogue. Wix bills the site owner; we only map the purchased
// vendor product ID (see WIX_PLAN_MAP) to one of these keys.

export const PLANS = {
  free: {
    name: 'Free',
    maxCharts: 1,
    unitSwitch: false,      // cm/inch (and kg/lb) toggle for visitors
    images: false,          // "how to measure" picture in the pop-up
    removeBranding: false,
    statsDays: 7,
  },
  pro: {
    name: 'Pro',
    maxCharts: 50,
    unitSwitch: true,
    images: true,
    removeBranding: true,
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

export const POSITIONS = ['after-options', 'before-cart', 'after-title'];
export const LINK_STYLES = ['link', 'button'];
export const LAYOUTS = ['modal', 'drawer'];
export const UNITS = ['metric', 'imperial'];
export const FALLBACKS = ['floating', 'none'];
// What a column holds. "length" converts cm <-> in, "weight" kg <-> lb, "text" never converts.
export const MEASURES = ['text', 'length', 'weight'];

export const MAX_COLUMNS = 12;
export const MAX_ROWS = 40;

export const DEFAULT_CHART = {
  id: 'default',
  name: 'Size chart',
  title: 'Size guide',
  note: 'Measure over your underwear with a soft tape. If you are between two sizes, choose the bigger one.',
  image: null,
  columns: [
    { label: 'Size', measure: 'text' },
    { label: 'Chest', measure: 'length' },
    { label: 'Waist', measure: 'length' },
    { label: 'Hips', measure: 'length' },
  ],
  rows: [
    ['XS', '82-86', '66-70', '88-92'],
    ['S', '86-90', '70-74', '92-96'],
    ['M', '90-96', '74-80', '96-102'],
    ['L', '96-102', '80-86', '102-108'],
    ['XL', '102-108', '86-94', '108-114'],
  ],
  assign: { all: true, products: [], collections: [], keywords: [] },
};

export const DEFAULT_SETTINGS = {
  enabled: true,
  linkText: 'Size guide',
  linkStyle: 'link',
  position: 'after-options',
  layout: 'modal',
  defaultUnit: 'metric',
  showUnitSwitch: true,
  accentColor: '#111827',
  textColor: '#111827',
  backgroundColor: '#ffffff',
  headerColor: '#f3f4f6',
  // Wix lets owners rename the product page URL prefix (SEO settings).
  productPath: '/product-page/',
  // CSS selector to put the link after, when the automatic placement doesn't fit the theme.
  customSelector: '',
  fallback: 'floating',
  showBranding: true,
  charts: [DEFAULT_CHART],
};

const HEX = /^#[0-9a-f]{6}$/i;
const cleanText = (v, max, fallback = '') => {
  if (typeof v !== 'string') return fallback;
  // Strip control characters (keep newlines); the widget renders with textContent.
  const s = v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
  return s || fallback;
};
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
const list = (v, max, re, len = 120, lower = false) => (Array.isArray(v) ? v : [])
  .filter((x) => typeof x === 'string')
  .map((x) => (lower ? x.toLowerCase() : x).trim().slice(0, len))
  .filter((x) => x && re.test(x))
  .filter((x, i, a) => a.indexOf(x) === i)
  .slice(0, max);

// Uploaded images are served by this app under /u/; anything else must be a plain https URL.
const IMAGE_RE = /^(\/u\/[a-z0-9-]+\.(png|jpe?g|webp|gif)|https:\/\/[^\s"'<>()]{4,500})$/i;

export function sanitizeChart(input, index = 0) {
  const src = input && typeof input === 'object' ? input : {};
  let columns = (Array.isArray(src.columns) ? src.columns : []).slice(0, MAX_COLUMNS).map((c, i) => ({
    label: cleanText(c?.label, 40, `Column ${i + 1}`),
    measure: pick(c?.measure, MEASURES, 'text'),
  }));
  if (!columns.length) columns = [{ label: 'Size', measure: 'text' }];
  const rows = (Array.isArray(src.rows) ? src.rows : []).slice(0, MAX_ROWS)
    .filter(Array.isArray)
    .map((r) => columns.map((_, i) => cleanText(r[i] == null ? '' : String(r[i]), 40)));
  const a = src.assign && typeof src.assign === 'object' ? src.assign : {};
  return {
    id: /^[a-z0-9-]{1,40}$/i.test(src.id) ? src.id : `chart-${index + 1}`,
    name: cleanText(src.name, 60, `Chart ${index + 1}`),
    title: cleanText(src.title, 80, 'Size guide'),
    note: cleanText(src.note, 1000),
    image: typeof src.image === 'string' && IMAGE_RE.test(src.image.trim()) ? src.image.trim() : null,
    columns,
    rows,
    assign: {
      all: a.all === true,
      products: list(a.products, 200, /^[a-z0-9][a-z0-9._~%-]*$/i, 120, true),
      collections: list(a.collections, 50, /^[a-z0-9-]{1,64}$/i),
      keywords: list(a.keywords, 30, /\S/, 40, true),
    },
  };
}

/**
 * Merge an untrusted settings patch from the dashboard onto the current
 * settings, validating every field and enforcing the site's plan.
 */
export function sanitizeSettings(input, current = DEFAULT_SETTINGS, planKey = 'free') {
  const src = input && typeof input === 'object' ? input : {};
  const cur = { ...DEFAULT_SETTINGS, ...current };
  const has = (k) => Object.prototype.hasOwnProperty.call(src, k);
  const out = { ...cur };

  if (has('enabled')) out.enabled = src.enabled === true;
  if (has('linkText')) out.linkText = cleanText(src.linkText, 40, DEFAULT_SETTINGS.linkText);
  if (has('linkStyle')) out.linkStyle = pick(src.linkStyle, LINK_STYLES, cur.linkStyle);
  if (has('position')) out.position = pick(src.position, POSITIONS, cur.position);
  if (has('layout')) out.layout = pick(src.layout, LAYOUTS, cur.layout);
  if (has('defaultUnit')) out.defaultUnit = pick(src.defaultUnit, UNITS, cur.defaultUnit);
  if (has('showUnitSwitch')) out.showUnitSwitch = src.showUnitSwitch !== false;
  for (const k of ['accentColor', 'textColor', 'backgroundColor', 'headerColor']) {
    if (has(k)) out[k] = HEX.test(src[k]) ? src[k].toLowerCase() : cur[k];
  }
  if (has('productPath')) {
    const p = cleanText(src.productPath, 60);
    out.productPath = /^\/[a-z0-9_-]+\/$/i.test(p) ? p : /^\/[a-z0-9_-]+$/i.test(p) ? `${p}/` : DEFAULT_SETTINGS.productPath;
  }
  if (has('customSelector')) {
    const s = cleanText(src.customSelector, 200);
    out.customSelector = /[<>{}]/.test(s) ? '' : s;
  }
  if (has('fallback')) out.fallback = pick(src.fallback, FALLBACKS, cur.fallback);
  if (has('showBranding')) out.showBranding = src.showBranding !== false;
  if (has('charts') && Array.isArray(src.charts)) {
    const seen = new Set();
    out.charts = src.charts.slice(0, PLANS.pro.maxCharts).map((c, i) => {
      const chart = sanitizeChart(c, i);
      while (seen.has(chart.id)) chart.id = `${chart.id}-${i + 1}`;
      seen.add(chart.id);
      return chart;
    });
  }

  return enforcePlan(out, planKey);
}

/**
 * Apply plan limits. Charts beyond the limit are kept in storage (so an
 * upgrade brings them back) but enforcePlan marks them inactive.
 */
export function enforcePlan(settings, planKey) {
  const plan = getPlan(planKey);
  const out = { ...settings };
  if (!plan.removeBranding) out.showBranding = true;
  if (!plan.unitSwitch) out.showUnitSwitch = false;
  out.charts = (out.charts || []).map((c, i) => ({
    ...c,
    image: plan.images ? c.image : null,
    active: i < plan.maxCharts,
  }));
  return out;
}

// --------------------------------------------------------------- matching
/**
 * Pick the chart for a product. Most specific wins: the product itself,
 * then a keyword in its URL slug or name, then one of its collections
 * (categories), then a chart set to "all products".
 */
export function matchChart(charts, { slug = '', name = '', collections = [] } = {}) {
  const active = charts.filter((c) => c.active !== false);
  const s = String(slug).toLowerCase();
  const text = `${s.replace(/[-_]+/g, ' ')} ${String(name).toLowerCase()}`;
  return active.find((c) => c.assign.products.includes(s))
    || active.find((c) => c.assign.keywords.some((k) => text.includes(k)))
    || active.find((c) => c.assign.collections.some((id) => collections.includes(id)))
    || active.find((c) => c.assign.all)
    || null;
}

/** Whether any active chart needs the product's collections to decide. */
export function needsCollections(charts) {
  return charts.some((c) => c.active !== false && c.assign.collections.length);
}

/** What the visitor script receives. Only display settings, never billing data. */
export function publicWidgetConfig(site, chart, appName, landingUrl, baseUrl = '') {
  const s = enforcePlan({ ...DEFAULT_SETTINGS, ...site.settings }, site.plan);
  const image = chart?.image && chart.image.startsWith('/u/') ? baseUrl + chart.image : chart?.image || null;
  return {
    enabled: s.enabled,
    linkText: s.linkText,
    linkStyle: s.linkStyle,
    position: s.position,
    layout: s.layout,
    defaultUnit: s.defaultUnit,
    showUnitSwitch: s.showUnitSwitch,
    accentColor: s.accentColor,
    textColor: s.textColor,
    backgroundColor: s.backgroundColor,
    headerColor: s.headerColor,
    productPath: s.productPath,
    customSelector: s.customSelector,
    fallback: s.fallback,
    branding: s.showBranding ? { name: appName, url: landingUrl } : null,
    chart: chart ? { id: chart.id, title: chart.title, note: chart.note, image, columns: chart.columns, rows: chart.rows } : null,
  };
}
