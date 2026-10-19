// Settings shared by the dashboard (which writes them) and the embedded site
// script (which reads them). The site script receives them through Wix
// embedded-script "dynamic parameters", which are plain strings, so the
// settings are sent as base64url-encoded JSON plus a few pre-sanitized
// strings for the <noscript> fallback (which cannot run code to decode).
//
// This file has no imports so it can be unit tested with plain Node.

export type DisplayMode = 'notice' | 'modal' | 'lock';
export type Frequency = 'always' | 'session';

export interface GuardSettings {
  /** Master switch. When false the script is embedded but disabled. */
  enabled: boolean;
  /** notice = dismissible bar, modal = dismissible dialog, lock = blocks the page. */
  mode: DisplayMode;
  title: string;
  message: string;
  /** Label of the "I've disabled it, reload" button. */
  reloadText: string;
  /** Label of the dismiss button (notice/modal only). */
  dismissText: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  /** Show the message on every page view, or once per browser session. */
  frequency: Frequency;
  /**
   * Also probe a well-known ad server URL. Catches network-level blockers
   * (Brave Shields, DNS blockers, uBlock) that don't hide page elements.
   */
  networkProbe: boolean;
  /**
   * Show the message to visitors whose browser has scripts turned off
   * (e.g. Brave "Block scripts", NoScript). Uses <noscript>, so it works
   * even though the detector itself can't run.
   */
  noScriptProtection: boolean;
  /**
   * Fail closed: render the message by default and only remove it once the
   * detector has run and found no blocker. Covers blockers that kill just
   * this script while leaving the rest of the page's JavaScript running.
   */
  strictMode: boolean;
  /** Seconds before the fail-closed message appears if the detector hasn't cleared it. */
  strictDelaySeconds: number;
  /** Show "Protected by AdBlock Guard" on the message. */
  showBranding: boolean;
  /** Path prefixes (e.g. "/blog") where the detector should not run. */
  excludedPaths: string[];
}

export const DEFAULT_SETTINGS: GuardSettings = {
  enabled: true,
  mode: 'modal',
  title: 'Ad blocker detected',
  message:
    'This site is free because of the ads we show. Please allow ads for this site, then reload the page.',
  reloadText: "I've allowed ads, reload",
  dismissText: 'Continue anyway',
  accentColor: '#116DFF',
  backgroundColor: '#FFFFFF',
  textColor: '#162D3D',
  frequency: 'always',
  networkProbe: true,
  noScriptProtection: true,
  strictMode: false,
  strictDelaySeconds: 4,
  showBranding: true,
  excludedPaths: [],
};

/**
 * Features only available on a paid plan. Everything else, including the
 * scripts-blocked (<noscript>) protection, is in the free plan: a detector
 * that silently fails when scripts are blocked isn't worth installing.
 */
export const PREMIUM_FEATURES = {
  lockMode: 'Lock mode: block the page until the ad blocker is off',
  customText: 'Custom title, message and button labels',
  customColors: 'Custom colors',
  strictMode: 'Strict mode: fail closed if the detector itself is blocked',
  removeBranding: 'Remove "Protected by AdBlock Guard"',
  frequency: 'Show once per session',
  excludedPaths: 'Exclude pages',
} as const;

export const LIMITS = {
  title: 80,
  message: 400,
  button: 40,
  excludedPaths: 20,
  path: 100,
} as const;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Cleans owner-entered text: removes control characters and enforces the
 * length limit. The site script renders it with textContent, so it is never
 * interpreted as HTML.
 */
function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLength);
}

/**
 * For text substituted straight into the HTML template (the <noscript> and
 * strict-mode fallbacks, which can't run code). Wix substitutes dynamic
 * parameters as raw text, so markup and template braces are removed. The
 * text only ever lands in element content, never in an attribute, so quotes
 * are safe. Stripping (rather than entity-encoding) keeps the output correct
 * whether or not Wix also escapes the value.
 */
export function sanitizeText(value: unknown, maxLength: number): string {
  return cleanText(value, maxLength).replace(/[<>{}]/g, '');
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function text(value: unknown, max: number, fallback: string): string {
  const cleaned = cleanText(value, max);
  return cleaned || fallback;
}

function paths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((p) => sanitizeText(p, LIMITS.path))
    .filter((p) => p.startsWith('/') && p.length > 1)
    .slice(0, LIMITS.excludedPaths);
}

/** Coerces untrusted input (e.g. decoded parameters) into valid settings. */
export function normalizeSettings(input: unknown): GuardSettings {
  const s = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const delay = Number(s.strictDelaySeconds);
  return {
    enabled: bool(s.enabled, d.enabled),
    mode: pick(s.mode, ['notice', 'modal', 'lock'] as const, d.mode),
    title: text(s.title, LIMITS.title, d.title),
    message: text(s.message, LIMITS.message, d.message),
    reloadText: text(s.reloadText, LIMITS.button, d.reloadText),
    dismissText: text(s.dismissText, LIMITS.button, d.dismissText),
    accentColor: color(s.accentColor, d.accentColor),
    backgroundColor: color(s.backgroundColor, d.backgroundColor),
    textColor: color(s.textColor, d.textColor),
    frequency: pick(s.frequency, ['always', 'session'] as const, d.frequency),
    networkProbe: bool(s.networkProbe, d.networkProbe),
    noScriptProtection: bool(s.noScriptProtection, d.noScriptProtection),
    strictMode: bool(s.strictMode, d.strictMode),
    strictDelaySeconds: Number.isFinite(delay)
      ? Math.min(15, Math.max(2, Math.round(delay)))
      : d.strictDelaySeconds,
    showBranding: bool(s.showBranding, d.showBranding),
    excludedPaths: paths(s.excludedPaths),
  };
}

/**
 * Returns the settings that are actually allowed on the site's plan. Free
 * sites keep the owner's choices for free features and get defaults for
 * everything else.
 */
export function applyPlan(settings: GuardSettings, isPremium: boolean): GuardSettings {
  const s = normalizeSettings(settings);
  if (isPremium) return s;
  const d = DEFAULT_SETTINGS;
  return {
    ...s,
    mode: s.mode === 'lock' ? d.mode : s.mode,
    title: d.title,
    message: d.message,
    reloadText: d.reloadText,
    dismissText: d.dismissText,
    accentColor: d.accentColor,
    backgroundColor: d.backgroundColor,
    textColor: d.textColor,
    frequency: d.frequency,
    strictMode: false,
    strictDelaySeconds: d.strictDelaySeconds,
    showBranding: true,
    excludedPaths: [],
  };
}

/** Lists the premium features a settings object uses (for upgrade prompts). */
export function premiumFeaturesUsed(settings: GuardSettings): (keyof typeof PREMIUM_FEATURES)[] {
  const s = normalizeSettings(settings);
  const d = DEFAULT_SETTINGS;
  const used: (keyof typeof PREMIUM_FEATURES)[] = [];
  if (s.mode === 'lock') used.push('lockMode');
  if (
    s.title !== d.title ||
    s.message !== d.message ||
    s.reloadText !== d.reloadText ||
    s.dismissText !== d.dismissText
  )
    used.push('customText');
  if (
    s.accentColor !== d.accentColor ||
    s.backgroundColor !== d.backgroundColor ||
    s.textColor !== d.textColor
  )
    used.push('customColors');
  if (s.strictMode) used.push('strictMode');
  if (!s.showBranding) used.push('removeBranding');
  if (s.frequency !== d.frequency) used.push('frequency');
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

export function encodeSettings(settings: GuardSettings): string {
  return toBase64Url(JSON.stringify(normalizeSettings(settings)));
}

export function decodeSettings(value: string | undefined | null): GuardSettings {
  if (!value) return normalizeSettings({});
  try {
    return normalizeSettings(JSON.parse(fromBase64Url(value)));
  } catch {
    return normalizeSettings({});
  }
}

/** Parameter names must match the {{placeholders}} in embedded.html. */
export type EmbedParameters = {
  config: string;
  noscript: 'on' | 'off';
  nsTitle: string;
  nsMessage: string;
  nsLock: 'on' | 'off';
  nsBranding: 'on' | 'off';
  strict: 'on' | 'off';
  strictDelay: string;
  accent: string;
  bg: string;
  fg: string;
};

/**
 * Builds the dynamic parameters for the embedded script. The plan is applied
 * here so a free site can never receive premium settings.
 */
export function toEmbedParameters(settings: GuardSettings, isPremium: boolean): EmbedParameters {
  const s = applyPlan(settings, isPremium);
  return {
    config: encodeSettings(s),
    noscript: s.enabled && s.noScriptProtection ? 'on' : 'off',
    nsTitle: sanitizeText(s.title, LIMITS.title),
    nsMessage: sanitizeText(
      `${s.message} Scripts appear to be blocked in your browser. Please allow scripts and ads for this site, then reload.`,
      LIMITS.message + 120,
    ),
    nsLock: s.mode === 'lock' ? 'on' : 'off',
    nsBranding: s.showBranding ? 'on' : 'off',
    strict: s.enabled && s.strictMode ? 'on' : 'off',
    strictDelay: `${s.strictDelaySeconds}s`,
    accent: s.accentColor,
    bg: s.backgroundColor,
    fg: s.textColor,
  };
}
