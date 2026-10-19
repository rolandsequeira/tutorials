// Serves embedded.html inside a fake Wix page that also carries ad code, so
// the blocker can be tested in a real Chromium. Every request the page makes
// is recorded, so tests can check what actually reached the network.
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { DEFAULT_SETTINGS, type BlockerSettings, toEmbedParameters } from '../src/shared/config.ts';

const TEMPLATE = readFileSync(
  new URL('../src/site/embedded-scripts/ad-blocker/embedded.html', import.meta.url),
  'utf8',
);

export const SITE = 'https://example-site.test/';

/** Mimics Wix's dynamic-parameter substitution. */
export function renderEmbed(settings: Partial<BlockerSettings>, isPremium: boolean): string {
  const params = toEmbedParameters({ ...DEFAULT_SETTINGS, ...settings }, isPremium) as Record<string, string>;
  return TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_, name: string) => params[name] ?? '');
}

/**
 * A recipe page with the kinds of ad code site owners end up with: an
 * AdSense tag in the HTML, a GPT-style loader that inserts scripts and
 * iframes, a tracking pixel, a beacon and a pop-under. Wix's own static
 * assets and a first-party request are there to prove they still load.
 */
export function sitePage(embed: string, bodyEnd = ''): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Demo site</title>${embed}
<script src="https://static.parastorage.com/services/wix-thunderbolt/app.js"></script>
<style>body{margin:0;font:18px/1.6 Georgia,serif;background:#f7f4ef;color:#222}
main{max-width:720px;margin:32px auto;padding:0 16px}</style></head>
<body><main><h1>Grandma's lemon cake</h1>
<p>Preheat the oven to 180°C. Cream the butter and sugar until pale and fluffy.</p>
<ins class="adsbygoogle" id="adsense-slot" style="display:block;height:250px">Ad</ins>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1"></script>
<div id="div-gpt-ad-1" style="height:90px">Ad</div>
<p>Add the eggs one at a time, then fold in the flour and the zest of two lemons.</p>
<div id="html-ad"></div>
<img id="logo" src="https://static.wixstatic.com/media/logo.png" alt="">
</main>
<script>
  // GPT-style loader: builds elements from JavaScript.
  var s = document.createElement('script');
  s.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
  document.head.appendChild(s);
  var f = document.createElement('iframe');
  f.setAttribute('src', 'https://tpc.googlesyndication.com/safeframe/1-0-40/html/container.html');
  document.getElementById('div-gpt-ad-1').appendChild(f);
  document.getElementById('html-ad').innerHTML =
    '<iframe src="https://widgets.outbrain.com/feed.html"></iframe>';
  new Image().src = 'https://sb.scorecardresearch.com/p?c1=2';
  window.__results = {
    fetchAd: fetch('https://c.amazon-adsystem.com/e/dtb/bid').then(() => 'ok', () => 'failed'),
    fetchFirstParty: fetch('/api/recipes').then(() => 'ok', () => 'failed'),
    beacon: navigator.sendBeacon('https://ib.adnxs.com/ut/v3'),
    xhrAd: new Promise((resolve) => {
      var x = new XMLHttpRequest();
      x.open('GET', 'https://fastlane.rubiconproject.com/a/api/fastlane.json');
      x.onload = () => resolve('ok');
      x.onerror = () => resolve('failed');
      x.send();
    }),
  };
</script>
${bodyEnd}</body></html>`;
}

const RAN_SCRIPT = '(window.__ran = window.__ran || []).push(new URL(document.currentScript.src).hostname);';

export interface Scenario {
  settings?: Partial<BlockerSettings>;
  isPremium?: boolean;
  /** Without the app installed, to show what the page loads by default. */
  noEmbed?: boolean;
  bodyEnd?: string;
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

export interface Opened {
  context: BrowserContext;
  page: Page;
  /** Hostnames of every request that reached the network. */
  requested: Set<string>;
}

export async function openScenario(s: Scenario = {}): Promise<Opened> {
  const b = await getBrowser();
  const context = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const embed = s.noEmbed ? '' : renderEmbed(s.settings ?? {}, s.isPremium ?? false);
  const html = sitePage(embed, s.bodyEnd);
  const requested = new Set<string>();

  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    requested.add(url.hostname);
    if (url.origin === new URL(SITE).origin && url.pathname.startsWith('/api/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (url.origin === new URL(SITE).origin) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    }
    const type = route.request().resourceType();
    // Each script records that it ran, so tests can tell "requested" from "executed".
    if (type === 'script') return route.fulfill({ status: 200, contentType: 'text/javascript', body: RAN_SCRIPT });
    if (type === 'image') {
      return route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') });
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>ad</p>' });
  });

  const page = await context.newPage();
  return { context, page, requested };
}

/** Loads the page and waits for its scripted requests to settle. */
export async function load(page: Page, url = SITE) {
  await page.goto(url);
  return page.evaluate(async () => {
    const r = (window as any).__results;
    return {
      ran: ((window as any).__ran ?? []).sort() as string[],
      fetchAd: await r.fetchAd,
      fetchFirstParty: await r.fetchFirstParty,
      beacon: r.beacon,
      xhrAd: await r.xhrAd,
    };
  });
}

export function adHosts(requested: Set<string>): string[] {
  const ad = /(doubleclick|googlesyndication|outbrain|amazon-adsystem|adnxs|rubiconproject|scorecardresearch|popads)\./;
  return [...requested].filter((h) => ad.test(h)).sort();
}
