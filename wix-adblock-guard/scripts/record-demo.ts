// Records a demo video of AdBlock Guard for the App Market listing / YouTube.
// Runs the real embedded script in Chromium against simulated ad blockers.
//
//   npm run demo-video   ->  demo-output/adblock-guard-demo.webm
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';
import { DEFAULT_SETTINGS, type GuardSettings } from '../src/shared/config.ts';
import { renderEmbed, sitePage } from '../test/harness.ts';

const OUT = new URL('../demo-output/', import.meta.url).pathname;
const SITE = 'https://example-site.test/';
const AD_HOST = 'pagead2.googlesyndication.com';

type Scene = {
  settings?: Partial<GuardSettings>;
  isPremium?: boolean;
  cosmetic?: boolean;
  network?: boolean;
  caption: string;
};

let scene: Scene = { caption: '' };
let slideHtml = '';

function slide(title: string, subtitle = '', footer = ''): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
background:linear-gradient(135deg,#0b1f3a,#116dff);color:#fff;font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;text-align:center}
h1{font-size:56px;margin:0 40px 16px}p{font-size:26px;margin:0 80px;opacity:.9;line-height:1.4}
small{position:absolute;bottom:28px;font-size:16px;opacity:.7}ul{font-size:24px;text-align:left;line-height:1.7}
</style></head><body><h1>${title}</h1>${subtitle}<small>${footer}</small></body></html>`;
}

function caption(text: string): string {
  return `<div id="demo-caption" style="position:fixed;top:16px;left:16px;z-index:2147483647;background:#0b1f3a;color:#fff;
font:600 18px -apple-system,'Segoe UI',Roboto,sans-serif;padding:10px 16px;border-radius:8px;
box-shadow:0 4px 16px rgba(0,0,0,.3)">${text}</div>`;
}

async function showSlide(page: Page, html: string, ms: number) {
  slideHtml = html;
  await page.goto('https://slides.test/');
  await page.waitForTimeout(ms);
}

async function showScene(page: Page, s: Scene, ms: number) {
  scene = s;
  await page.goto(SITE);
  // Once the overlay is up, move the caption after it so it stays on top.
  await page.waitForTimeout(600);
  await page
    .evaluate(() => {
      const c = document.getElementById('demo-caption');
      if (c) document.body.appendChild(c);
    })
    .catch(() => {}); // scripts disabled in the no-script scene
  await page.waitForTimeout(ms - 600);
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
  });

  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'slides.test') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: slideHtml });
    }
    if (url.hostname === AD_HOST) {
      if (scene.network) return route.abort('blockedbyclient');
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    }
    if (url.hostname === 'example-site.test') {
      const cosmetic = scene.cosmetic
        ? '<style>.adsbox,.ad-banner,.adsbygoogle,.ad{display:none!important}</style>'
        : '';
      const body = sitePage(
        renderEmbed({ ...DEFAULT_SETTINGS, ...scene.settings }, scene.isPremium ?? false),
        cosmetic,
        caption(scene.caption),
      );
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body });
    }
    return route.abort();
  });

  // Open the overlay's shadow root so the demo can click its buttons.
  await context.addInitScript(() => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
      return attach.call(this, { ...init, mode: 'open' });
    };
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  await showSlide(page, slide('AdBlock Guard for Wix',
    '<p>Ask visitors who block ads to allow them, so your free content keeps paying for itself.</p>',
    'Demo recorded in Chromium with simulated ad blockers'), 3500);

  await showScene(page, { caption: '1. Visitor without an ad blocker: nothing changes' }, 3500);

  await showSlide(page, slide('Visitor with an ad blocker',
    '<p>Detects element hiding (AdBlock, uBlock Origin) and blocked ad requests (Brave Shields, DNS blockers).</p>'), 3000);
  await showScene(page, { caption: '2. Ad blocker on: a friendly pop-up asks to allow ads', cosmetic: true, network: true }, 3500);
  await page.getByRole('button', { name: 'Continue anyway' }).click();
  await page.waitForTimeout(1500);

  await showSlide(page, slide('Scripts blocked entirely?',
    '<p>Some visitors block <b>all</b> scripts, e.g. Brave “Block scripts”.<br>Most detectors silently fail here. AdBlock Guard still shows your message, with no JavaScript needed.</p>'), 4500);
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
  await showScene(page, { caption: '3. All scripts blocked: the message still appears', cosmetic: true, network: true }, 4500);
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });

  await showSlide(page, slide('Premium',
    '<ul><li>Lock the page until ads are allowed</li><li>Your own text and colors</li><li>Strict mode: fails closed if the detector is attacked</li><li>Exclude pages, once-per-visit, no branding</li></ul>'), 4500);
  await showScene(page, {
    caption: '4. Premium: lock mode with your own message and colors',
    cosmetic: true,
    network: true,
    isPremium: true,
    settings: {
      mode: 'lock',
      title: 'Support The Daily Recipe',
      message: 'Our recipes are free thanks to ads. Please pause your ad blocker for this site, then reload.',
      reloadText: "Done, reload the page",
      accentColor: '#E63946',
      backgroundColor: '#FFF8F0',
      textColor: '#1D3557',
      showBranding: false,
    },
  }, 5000);

  await showSlide(page, slide('AdBlock Guard',
    '<p>Free plan includes detection, pop-up or bar, and scripts-blocked protection.<br>Install it from the Wix App Market.</p>',
    'by Coders Creation'), 4000);

  const video = page.video();
  await context.close();
  await browser.close();
  const path = await video?.path();
  const target = `${OUT}adblock-guard-demo.webm`;
  if (path) renameSync(path, target);
  for (const f of readdirSync(OUT)) if (f !== 'adblock-guard-demo.webm') rmSync(OUT + f);
  console.log(`Saved ${target}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
