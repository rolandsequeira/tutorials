// Settings shared by the dashboard (which writes them) and the embedded site
// script (which reads them). The site script receives them through a Wix
// embedded-script "dynamic parameter", which is a plain string, so the
// settings are sent as base64url-encoded JSON.
//
// The built-in ad and tracker domain lists live in embedded.html, not here,
// so every app release updates them on all sites without the owner having to
// re-save their settings.
//
// This file has no imports so it can be unit tested with plain Node.

export interface BlockerSettings {
  /** Master switch. When false the script is embedded but disabled. */
  enabled: boolean;
  /** Block requests to the built-in list of ad networks. */
  blockAds: boolean;
  /** Hide empty ad slots (AdSense, Google Publisher Tag, Taboola, Outbrain). */
  hideAdSlots: boolean;
  /** Block the built-in list of third-party ad trackers and data brokers. */
  blockTrackers: boolean;
  /** Block pop-ups and pop-unders that open without a visitor click. */
  blockPopups: boolean;
  /** Extra domains the owner wants blocked (e.g. "ads.example.com"). */
  customBlocked: string[];
  /** Domains never blocked, e.g. the owner's own ad partner. */
  allowed: string[];
  /** Path prefixes (e.g. "/blog") where the blocker should not run. */
  excludedPaths: string[];
}

export const DEFAULT_SETTINGS: BlockerSettings = {
  enabled: true,
  blockAds: true,
  hideAdSlots: true,
  blockTrackers: false,
  blockPopups: false,
  customBlocked: [],
  allowed: [],
  excludedPaths: [],
};

/**
 * Features only available on a paid plan. Ad blocking, slot hiding and the
 * allow list are free: the free plan has to be useful on its own, and an
 * owner must always be able to unblock their own ad partner.
 */
export const PREMIUM_FEATURES = {
  blockTrackers: 'Block third-party ad trackers and data brokers',
  blockPopups: 'Block pop-ups and pop-unders',
  customBlocked: 'Block your own list of domains',
  excludedPaths: 'Turn the blocker off on chosen pages',
} as const;

export const LIMITS = {
  domains: 50,
  domain: 100,
  excludedPaths: 20,
  path: 100,
} as const;

/**
 * Wix's own infrastructure. These are never blocked, whatever the owner
 * enters, so the app can't break the site, the editor or Wix's own branding.
 * The embedded script has the same list (plus the site's own hostname).
 */
export const PROTECTED_DOMAINS = [
  'wix.com',
  'wixsite.com',
  'wixstatic.com',
  'parastorage.com',
  'wixapps.net',
  'wix-code.com',
  'wixmp.com',
  'filesusr.com',
  'editorx.io',
  'wixstudio.io',
  'wixstudio.com',
] as const;

const DOMAIN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** True if host is domain itself or one of its subdomains. */
export function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isProtectedDomain(domain: string): boolean {
  return PROTECTED_DOMAINS.some((p) => matchesDomain(domain, p));
}

/**
 * Turns what an owner typed ("https://Ads.Example.com/path", "*.example.com")
 * into a bare lowercase domain, or '' if it isn't one.
 */
export function cleanDomain(value: unknown): string {
  if (typeof value !== 'string') return '';
  let d = value.trim().toLowerCase().slice(0, LIMITS.domain * 2);
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  d = d.replace(/^\*\./, '').replace(/^\.+/, '');
  d = d.split(/[/?#:\s]/)[0].replace(/\.$/, '');
  return d.length <= LIMITS.domain && DOMAIN.test(d) ? d : '';
}

function domains(value: unknown, { blocking }: { blocking: boolean }): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const d = cleanDomain(v);
    if (!d || out.includes(d)) continue;
    if (blocking && isProtectedDomain(d)) continue;
    out.push(d);
    if (out.length === LIMITS.domains) break;
  }
  return out;
}

function paths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.trim().replace(/[\u0000-\u001F\u007F<>{}"'\\]/g, '').slice(0, LIMITS.path))
    .filter((p) => p.startsWith('/') && p.length > 1)
    .slice(0, LIMITS.excludedPaths);
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Coerces untrusted input (e.g. decoded parameters) into valid settings. */
export function normalizeSettings(input: unknown): BlockerSettings {
  const s = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    enabled: bool(s.enabled, d.enabled),
    blockAds: bool(s.blockAds, d.blockAds),
    hideAdSlots: bool(s.hideAdSlots, d.hideAdSlots),
    blockTrackers: bool(s.blockTrackers, d.blockTrackers),
    blockPopups: bool(s.blockPopups, d.blockPopups),
    customBlocked: domains(s.customBlocked, { blocking: true }),
    allowed: domains(s.allowed, { blocking: false }),
    excludedPaths: paths(s.excludedPaths),
  };
}

/**
 * Returns the settings that are actually allowed on the site's plan. Free
 * sites keep the owner's choices for free features and get defaults for
 * everything else.
 */
export function applyPlan(settings: BlockerSettings, isPremium: boolean): BlockerSettings {
  const s = normalizeSettings(settings);
  if (isPremium) return s;
  return {
    ...s,
    blockTrackers: false,
    blockPopups: false,
    customBlocked: [],
    excludedPaths: [],
  };
}

/** Lists the premium features a settings object uses (for upgrade prompts). */
export function premiumFeaturesUsed(settings: BlockerSettings): (keyof typeof PREMIUM_FEATURES)[] {
  const s = normalizeSettings(settings);
  const used: (keyof typeof PREMIUM_FEATURES)[] = [];
  if (s.blockTrackers) used.push('blockTrackers');
  if (s.blockPopups) used.push('blockPopups');
  if (s.customBlocked.length > 0) used.push('customBlocked');
  if (s.excludedPaths.length > 0) used.push('excludedPaths');
  return used;
}

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  let b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeSettings(settings: BlockerSettings): string {
  return toBase64Url(JSON.stringify(normalizeSettings(settings)));
}

export function decodeSettings(value: string | undefined | null): BlockerSettings {
  if (!value) return normalizeSettings({});
  try {
    return normalizeSettings(JSON.parse(fromBase64Url(value)));
  } catch {
    return normalizeSettings({});
  }
}

/** Parameter names must match the {{placeholders}} in embedded.html. */
export type EmbedParameters = { config: string };

/**
 * Builds the dynamic parameters for the embedded script. The plan is applied
 * here so a free site can never receive premium settings.
 */
export function toEmbedParameters(settings: BlockerSettings, isPremium: boolean): EmbedParameters {
  return { config: encodeSettings(applyPlan(settings, isPremium)) };
}
