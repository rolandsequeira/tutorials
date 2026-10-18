// Serves embedded.html inside a fake Wix page so the detector can be tested
// in a real Chromium against simulated ad blockers.
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { DEFAULT_SETTINGS, type GuardSettings, toEmbedParameters } from '../src/shared/config.ts';

const TEMPLATE = readFileSync(
  new URL('../src/site/embedded-scripts/adblock-guard/embedded.html', import.meta.url),
  'utf8',
);

export const SITE = 'https://example-site.test/';
const AD_HOST = 'pagead2.googlesyndication.com';

/** Mimics Wix's dynamic-parameter substitution. */
export function renderEmbed(settings: Partial<GuardSettings>, isPremium: boolean): string {
  const params = toEmbedParameters({ ...DEFAULT_SETTINGS, ...settings }, isPremium) as Record<string, string>;
  return TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_, name: string) => params[name] ?? '');
}

export function sitePage(embed: string, extraHead = '', bodyTop = ''): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Demo site</title>${extraHead}
<style>body{margin:0;font:18px/1.6 Georgia,serif;background:#f7f4ef;color:#222}
header{background:#1d3557;color:#fff;padding:20px 32px;font:700 22px sans-serif}
main{max-width:720px;margin:32px auto;padding:0 16px}.ad{background:#e9e4da;border:1px dashed #b5ab98;
padding:24px;text-align:center;color:#8a7f6c;font:14px sans-serif;margin:24px 0}</style></head>
<body>${bodyTop}<header>The Daily Recipe</header><main><h1>Grandma's lemon cake</h1>
<p>Preheat the oven to 180°C. Cream the butter and sugar until pale and fluffy.</p>
<div class="ad">Advertisement</div>
<p>Add the eggs one at a time, then fold in the flour and the zest of two lemons.</p></main>
${embed}</body></html>`;
}

export type Blocker = 'none' | 'cosmetic' | 'network' | 'both';

export interface Scenario {
  settings?: Partial<GuardSettings>;
  isPremium?: boolean;
  blocker?: Blocker;
  javaScriptEnabled?: boolean;
  /** Block only inline scripts via CSP, like a blocker that kills this script. */
  killInlineScripts?: boolean;
  recordVideoDir?: string;
}

let browser: Browser | undefined;

export async function getBrowser(): Promise<Browser> {
  browser ??= await chromium.launch();
  return browser;
}

export async function closeBrowser() {
  await browser?.close();
  browser = undefined;
}

export async function openScenario(s: Scenario): Promise<{ context: BrowserContext; page: Page }> {
  const b = await getBrowser();
  const context = await b.newContext({
    javaScriptEnabled: s.javaScriptEnabled ?? true,
    viewport: { width: 1280, height: 720 },
    ...(s.recordVideoDir ? { recordVideo: { dir: s.recordVideoDir, size: { width: 1280, height: 720 } } } : {}),
  });
  const blocker = s.blocker ?? 'none';
  // Cosmetic filter, as injected by uBlock Origin / AdBlock Plus / Brave.
  const cosmetic = blocker === 'cosmetic' || blocker === 'both'
    ? '<style>.adsbox,.ad-banner,.adsbygoogle,.ad{display:none!important}</style>'
    : '';
  const html = sitePage(renderEmbed(s.settings ?? {}, s.isPremium ?? false), cosmetic);

  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === AD_HOST) {
      if (blocker === 'network' || blocker === 'both') return route.abort('blockedbyclient');
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    }
    if (url.origin === new URL(SITE).origin) {
      const headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8' };
      if (s.killInlineScripts) headers['content-security-policy'] = "script-src 'none'";
      return route.fulfill({ status: 200, headers, body: html });
    }
    return route.abort();
  });

  // Test-only: open the overlay's closed shadow root so locators can read it.
  await context.addInitScript(() => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
      return attach.call(this, { ...init, mode: 'open' });
    };
  });
  const page = await context.newPage();
  return { context, page };
}

/** Resolves with the detector's result event, or null if it never fires. */
export async function gotoAndWaitForResult(page: Page, timeout = 5000, url = SITE) {
  await page.addInitScript(() => {
    (window as any).__abgResult = new Promise((resolve) =>
      window.addEventListener('adblockguard:result', (e) => resolve((e as CustomEvent).detail)),
    );
  });
  await page.goto(url);
  return page.evaluate(
    (ms) => Promise.race([(window as any).__abgResult, new Promise((r) => setTimeout(() => r(null), ms))]),
    timeout,
  );
}

/** Returns the visible text of the JS overlay (closed shadow root) or a fallback overlay. */
export async function visibleMessage(page: Page): Promise<string | null> {
  const dialog = page.getByRole('dialog').or(page.getByRole('alert'));
  if (await dialog.count()) {
    for (const d of await dialog.all()) {
      if (await d.isVisible()) return (await d.innerText()).trim();
    }
  }
  return null;
}
