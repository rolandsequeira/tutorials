// Produces the AdBlock Guard launch kit in marketing/out/:
//   icon-512/256/64.png, logo.png      App Dashboard icon + listing logo
//   screenshot-*.png (1600x900)        App Market screenshots
//   youtube-thumbnail.png (1280x720)
//   adblock-guard-demo.mp4 (1080p)     marketing video for YouTube / the listing
//
// Everything shown is the real app: the real detector (embedded.html) against
// simulated ad blockers, and the real dashboard page (built by vite from
// marketing/preview with the Wix SDK mocked). Each scene is recorded in its
// own browser context, because one of them needs JavaScript turned off, and
// ffmpeg joins them.
//
// Run: npm run media     (needs ffmpeg on PATH)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { DEFAULT_SETTINGS, type GuardSettings } from '../src/shared/config.ts';
import { renderEmbed } from '../test/harness.ts';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, 'out');
const RAW = join(OUT, 'raw');
const DASHBOARD = join(OUT, 'dashboard');
const ICON = readFileSync(join(HERE, 'brand/adblock-guard-icon.svg'), 'utf8');
const LOGO = readFileSync(join(HERE, 'brand/adblock-guard-logo.svg'), 'utf8');
const ZOOM = 1.4; // pages are laid out at 1371px and recorded at 1920px
const AD_HOST = 'pagead2.googlesyndication.com';

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png',
};

const icon = (size: number) => ICON.replace('<svg ', `<svg width="${size}" height="${size}" `);
const LOCK_TITLE = 'Please support us: allow ads';
const LOCK_SETTINGS: Partial<GuardSettings> = {
  mode: 'lock',
  title: LOCK_TITLE,
  message: 'Our recipes are free because of ads. Turn off your ad blocker for this site, then reload.',
  accentColor: '#E8590C',
};

// ------------------------------------------------------------ demo site ----
/** A recipe blog that earns from ads. Captions are part of the HTML so they
 *  show even in the scene where JavaScript is off. */
function sitePage(embed: string, opts: { cosmetic?: boolean; caption?: string; sub?: string } = {}): string {
  // What AdBlock / uBlock Origin / Brave inject: element-hiding rules.
  const cosmetic = opts.cosmetic
    ? '<style>.adsbox,.ad-banner,.adsbygoogle,.ad,.pub_300x250{display:none!important}</style>'
    : '';
  const cap = opts.caption
    ? `<div id="mk-cap"><b>${opts.caption}</b>${opts.sub ? `<span>${opts.sub}</span>` : ''}</div>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>The Daily Recipe</title>${cosmetic}
<style>
  html{zoom:${ZOOM}}*{box-sizing:border-box}
  body{margin:0;background:#fffaf3;color:#2a2420;font:18px/1.65 Georgia,serif}
  header{display:flex;align-items:center;justify-content:space-between;background:#1d3557;color:#fff;padding:18px 48px}
  .brand{font:700 26px Georgia,serif}nav a{color:#dbe7f5;margin-left:24px;font:500 15px Inter,Arial,sans-serif;text-decoration:none}
  .wrap{display:grid;grid-template-columns:1fr 300px;gap:36px;max-width:1240px;margin:28px auto;padding:0 32px}
  h1{font-size:40px;line-height:1.15;margin:0 0 12px}.meta{font:14px Inter,Arial,sans-serif;color:#8a7f6c;margin-bottom:18px}
  .hero{height:260px;border-radius:14px;background:radial-gradient(circle at 30% 40%,#ffe08a,#f4b942 45%,#d98c1f);margin-bottom:18px}
  .ad{border:1px solid #e7dfd2;border-radius:10px;background:#fff;padding:14px 18px;font:15px/1.4 Inter,Arial,sans-serif;margin:18px 0}
  .ad small{display:block;color:#9a9083;font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
  .ad b{font-size:18px;color:#1d3557}.ad i{display:inline-block;margin-top:8px;background:#1d3557;color:#fff;font-style:normal;padding:6px 12px;border-radius:6px}
  .side{height:280px;display:flex;flex-direction:column;justify-content:flex-end;background:linear-gradient(#e9f3ff,#fff)}
  #mk-cap{pointer-events:none;position:fixed;left:50%;bottom:34px;transform:translateX(-50%);zoom:${1 / ZOOM};z-index:2147483647;
    background:rgba(11,31,58,.94);color:#fff;border-left:10px solid #22c55e;border-radius:16px;padding:22px 34px;
    font:700 40px/1.25 Inter,Arial,sans-serif;white-space:nowrap;box-shadow:0 18px 50px rgba(0,0,0,.35);animation:cap .5s .3s both}
  #mk-cap span{display:block;font:500 28px/1.3 Inter,Arial,sans-serif;color:#cbd5e1;margin-top:6px}
  @keyframes cap{from{opacity:0;transform:translate(-50%,16px)}to{opacity:1;transform:translateX(-50%)}}
</style></head><body>
<header><div class="brand">The Daily Recipe</div><nav><a href="#">Recipes</a><a href="#">Baking</a><a href="#">Weeknight</a><a href="#">About</a></nav></header>
<div class="wrap"><main>
  <h1>Grandma's lemon drizzle cake</h1><div class="meta">By Ana Ruiz · 25 min prep · Serves 8</div>
  <div class="hero"></div>
  <p>Preheat the oven to 180°C. Cream the butter and sugar until pale and fluffy, then add the eggs one at a time.</p>
  <div class="ad"><small>Advertisement</small><b>Chef-grade knife set, 30% off</b><br>Free shipping this week only.<br><i>Shop now</i></div>
  <p>Fold in the flour and the zest of two lemons. Bake for 45 minutes, until a skewer comes out clean.</p>
</main>
<aside><div class="ad side"><small>Advertisement</small><b>Stand mixers</b>Bake more, stir less.<br><i>See deals</i></div></aside></div>
${cap}${embed}</body></html>`;
}

// ------------------------------------------------------------ scene cards --
const CARD_CSS = `
  *{box-sizing:border-box}html,body{margin:0;height:100%}
  body{background:radial-gradient(1200px 700px at 20% 10%,#116dff 0%,#0b1f3a 55%,#06101f 100%);color:#fff;
    font-family:Inter,Arial,sans-serif;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .in{animation:in .7s ease-out both}.d1{animation-delay:.25s}.d2{animation-delay:.5s}.d3{animation-delay:.75s}
  @keyframes in{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
  h1{font-size:96px;font-weight:800;letter-spacing:-.03em;margin:28px 0 10px;line-height:1}
  h2{font-size:64px;font-weight:800;letter-spacing:-.02em;margin:0 0 40px;line-height:1.1}
  p{font-size:36px;color:#cbd5e1;margin:0;line-height:1.35}
  .c{text-align:center;max-width:1560px;padding:0 60px}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:26px 48px;text-align:left}
  .f{display:flex;gap:18px;align-items:flex-start;font-size:32px;line-height:1.3}
  .f b{display:block}.f small{display:block;color:#94a3b8;font-size:24px;margin-top:4px}
  .k{flex:none;width:52px;height:52px;border-radius:14px;background:#22c55e;display:flex;align-items:center;justify-content:center;font-size:30px}
  .pro{background:#7c3aed}
  .pill{display:inline-block;background:#facc15;color:#111;font-weight:800;font-size:36px;border-radius:999px;padding:18px 40px;margin-top:40px}
  .by{margin-top:26px;font-size:26px;color:#94a3b8}
`;
const card = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>${CARD_CSS}</style></head><body>${body}</body></html>`;

const CARDS: Record<string, string> = {
  title: card(`<div class="c"><div class="in">${icon(220)}</div>
    <h1 class="in d1">AdBlock Guard</h1>
    <p class="in d2">Win back the ad revenue ad blockers take<br>from your Wix site.</p></div>`),
  problem: card(`<div class="c"><h2 class="in">Ad blockers hide the ads<br>that pay for your content.</h2>
    <p class="in d1">AdBlock Guard detects them and asks visitors,<br>politely or firmly, to allow ads on your site.</p></div>`),
  premium: card(`<div class="c"><h2 class="in">Make it yours</h2>
    <p class="in d1">Your words, your colors, and a lock mode<br>that keeps content hidden until ads are allowed.</p></div>`),
  features: card(`<div class="c"><h2 class="in">Detects every kind of blocker</h2><div class="grid">
    <div class="f in d1"><span class="k">🧩</span><div><b>Browser extensions</b><small>AdBlock, AdBlock Plus, uBlock Origin</small></div></div>
    <div class="f in d1"><span class="k">🦁</span><div><b>Brave Shields and DNS blockers</b><small>With Shields instructions for Brave users</small></div></div>
    <div class="f in d2"><span class="k">🚫</span><div><b>All scripts blocked</b><small>The message still shows, no JavaScript needed</small></div></div>
    <div class="f in d2"><span class="k">💬</span><div><b>Pop-up or bottom bar</b><small>Dismissible, free plan</small></div></div>
    <div class="f in d3"><span class="k pro">🔒</span><div><b>Lock mode and strict mode</b><small>Premium</small></div></div>
    <div class="f in d3"><span class="k pro">🎨</span><div><b>Your text, colors, excluded pages</b><small>Premium</small></div></div>
    </div></div>`),
  outro: card(`<div class="c"><div class="in">${LOGO.replace('<svg ', '<svg width="820" ').replace('fill="#0B1F3A">AdBlock', 'fill="#fff">AdBlock').replace('fill="#116DFF"> Guard', 'fill="#7DB3FF"> Guard')}</div>
    <div class="pill in d1">Free on the Wix App Market</div>
    <div class="by in d2">Search “AdBlock Guard” in the Wix App Market</div></div>`),
};

// ------------------------------------------------------------- scenes -----
type SiteScene = {
  kind: 'site';
  settings?: Partial<GuardSettings>;
  isPremium?: boolean;
  blocker?: 'none' | 'cosmetic' | 'network';
  brave?: boolean;
  javaScriptEnabled?: boolean;
  caption: string;
  sub?: string;
  ms: number;
};
type Scene = { kind: 'card'; name: string; ms: number } | SiteScene | { kind: 'dashboard' };

async function newContext(browser: Browser, opts: { video: boolean; js?: boolean; size?: [number, number] }) {
  const [width, height] = opts.size ?? [1920, 1080];
  return browser.newContext({
    viewport: { width, height },
    javaScriptEnabled: opts.js ?? true,
    ...(opts.video ? { recordVideo: { dir: RAW, size: { width: 1920, height: 1080 } } } : {}),
  });
}

async function route(context: BrowserContext, scene?: SiteScene) {
  await context.route('**/*', async (r) => {
    const url = new URL(r.request().url());
    if (url.hostname === 'site.test' && scene) {
      const embed = renderEmbed({ ...DEFAULT_SETTINGS, ...scene.settings }, scene.isPremium ?? false);
      return r.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: sitePage(embed, { cosmetic: scene.blocker === 'cosmetic', caption: scene.caption, sub: scene.sub }),
      });
    }
    if (url.hostname === AD_HOST) {
      // Network blockers (Brave Shields, uBlock, Pi-hole) cancel ad requests.
      if (scene?.blocker === 'network') return r.abort('blockedbyclient');
      return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    }
    if (url.hostname === 'dash.test') {
      const file = join(DASHBOARD, url.pathname.replace(/^\//, '') || 'index.html');
      if (!existsSync(file)) return r.fulfill({ status: 404, body: '' });
      return r.fulfill({ body: readFileSync(file), contentType: TYPES[extname(file)] ?? 'application/octet-stream' });
    }
    if (url.hostname === 'card.test') {
      return r.fulfill({ contentType: 'text/html; charset=utf-8', body: CARDS[url.pathname.slice(1)] ?? '' });
    }
    return r.fulfill({ status: 204, body: '' });
  });
  if (scene?.brave) {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'brave', { value: { isBrave: () => Promise.resolve(true) } });
    });
  }
}

/** Keeps the caption above the detector's overlay, which is added later. */
async function captionOnTop(page: Page) {
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const c = document.getElementById('mk-cap');
    if (c) document.body.appendChild(c);
  }).catch(() => {});
}

async function showCursor(page: Page, x: number, y: number) {
  await page.evaluate(({ x, y, zoom }) => {
    const c = document.createElement('div');
    c.id = 'mk-cursor';
    c.innerHTML = '<svg width="30" height="44" viewBox="0 0 15 22"><path d="M1 1v17l4.5-4 3 7 3-1.4-3-6.6H15z" fill="#111" stroke="#fff" stroke-width="1.2"/></svg>';
    c.style.cssText = `position:fixed;left:${x / zoom}px;top:${y / zoom}px;zoom:${1 / zoom};z-index:2147483646;pointer-events:none;` +
      'transition:left .7s cubic-bezier(.4,0,.2,1),top .7s cubic-bezier(.4,0,.2,1)';
    document.documentElement.appendChild(c);
  }, { x, y, zoom: ZOOM });
}

/** Glides the fake cursor to the element, then clicks it for real. */
async function clickWithCursor(page: Page, locator: ReturnType<Page['locator']>, clickCount = 1) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element not visible');
  await page.evaluate(({ x, y }) => {
    const c = document.getElementById('mk-cursor')!;
    c.style.left = `${x}px`;
    c.style.top = `${y}px`;
  }, { x: (box.x + box.width / 2) / ZOOM, y: (box.y + box.height / 2) / ZOOM });
  await page.waitForTimeout(800);
  await locator.click({ clickCount });
  await page.waitForTimeout(400);
}

async function dashboardCaption(page: Page, text: string) {
  await page.evaluate(({ text, zoom }) => {
    document.getElementById('mk-cap')?.remove();
    const el = document.createElement('div');
    el.id = 'mk-cap';
    el.textContent = text;
    el.style.cssText = `position:fixed;left:50%;bottom:34px;transform:translateX(-50%);zoom:${1 / zoom};z-index:2147483647;` +
      'pointer-events:none;background:rgba(11,31,58,.94);color:#fff;border-left:10px solid #116dff;border-radius:16px;padding:22px 34px;' +
      'font:700 40px/1.25 Inter,Arial,sans-serif;white-space:nowrap;box-shadow:0 18px 50px rgba(0,0,0,.35)';
    document.documentElement.appendChild(el);
  }, { text, zoom: ZOOM });
}

async function dashboardScene(page: Page) {
  await page.goto('https://dash.test/index.html?plan=premium');
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: `html{zoom:${ZOOM}}` });
  await page.waitForTimeout(200);
  await showCursor(page, 1500, 820);
  await dashboardCaption(page, 'Set it up from your Wix dashboard');
  await page.waitForTimeout(1500);
  await page.mouse.wheel(0, 330);
  await page.waitForTimeout(700);
  await dashboardCaption(page, 'Premium: lock the page until ads are allowed');
  await clickWithCursor(page, page.getByText('Lock the page until ads are allowed', { exact: true }));
  await dashboardCaption(page, 'Use your own words and colors');
  const title = page.locator('input[value="Ad blocker detected"]').first();
  const titleInput = (await title.count()) ? title : page.getByRole('textbox').first();
  await clickWithCursor(page, titleInput, 3);
  await page.keyboard.type(LOCK_TITLE, { delay: 55 });
  await page.waitForTimeout(600);
  await page.mouse.wheel(0, -330);
  await page.waitForTimeout(600);
  await clickWithCursor(page, page.getByRole('button', { name: 'Save' }));
  await dashboardCaption(page, 'Saved. It’s live on your site.');
  await page.waitForTimeout(2200);
}

const SCENES: Scene[] = [
  { kind: 'card', name: 'title', ms: 4000 },
  { kind: 'card', name: 'problem', ms: 4800 },
  { kind: 'site', blocker: 'none', caption: 'Visitor without an ad blocker', sub: 'Nothing changes. Your ads show as usual.', ms: 4500 },
  { kind: 'site', blocker: 'cosmetic', caption: 'Visitor with AdBlock or uBlock Origin', sub: 'A friendly reminder to allow ads', ms: 5500 },
  { kind: 'site', blocker: 'network', brave: true, caption: 'Brave Shields', sub: 'Brave users get steps to turn Shields off for your site', ms: 5500 },
  { kind: 'site', blocker: 'cosmetic', javaScriptEnabled: false, caption: 'All scripts blocked', sub: 'The message still appears. Most detectors miss this.', ms: 5500 },
  { kind: 'card', name: 'premium', ms: 3800 },
  { kind: 'dashboard' },
  { kind: 'site', blocker: 'cosmetic', isPremium: true, settings: LOCK_SETTINGS, caption: 'Lock mode', sub: 'Content stays hidden until ads are allowed', ms: 5500 },
  { kind: 'card', name: 'features', ms: 7000 },
  { kind: 'card', name: 'outro', ms: 5000 },
];

async function recordScene(browser: Browser, scene: Scene, index: number): Promise<string> {
  const js = scene.kind === 'site' ? scene.javaScriptEnabled ?? true : true;
  const context = await newContext(browser, { video: true, js });
  await route(context, scene.kind === 'site' ? scene : undefined);
  const page = await context.newPage();
  if (scene.kind === 'card') {
    await page.goto(`https://card.test/${scene.name}`);
    await page.waitForTimeout(scene.ms);
  } else if (scene.kind === 'site') {
    await page.goto('https://site.test/');
    if (js) await captionOnTop(page);
    await page.waitForTimeout(scene.ms - (js ? 900 : 0));
  } else {
    await dashboardScene(page);
  }
  const video = page.video()!;
  await context.close();
  const path = join(RAW, `scene-${String(index).padStart(2, '0')}.webm`);
  await video.saveAs(path);
  await video.delete();
  return path;
}

// --------------------------------------------------------------- images ----
async function renderImages(browser: Browser) {
  const context = await newContext(browser, { video: false, size: [1600, 900] });
  await route(context);
  const page = await context.newPage();
  for (const size of [512, 256, 64]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${icon(size)}`);
    await page.screenshot({ path: join(OUT, `icon-${size}.png`), omitBackground: true });
  }
  await page.setViewportSize({ width: 1400, height: 256 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${LOGO.replace('<svg ', '<svg width="1400" ')}`);
  await page.screenshot({ path: join(OUT, 'logo.png'), omitBackground: true });
  await context.close();

  const shots: [string, SiteScene | 'dash-premium' | 'dash-free'][] = [
    ['screenshot-1-popup.png', { kind: 'site', blocker: 'cosmetic', caption: '', ms: 0 }],
    ['screenshot-2-scripts-blocked.png', { kind: 'site', blocker: 'cosmetic', javaScriptEnabled: false, caption: '', ms: 0 }],
    ['screenshot-3-lock-mode.png', { kind: 'site', blocker: 'cosmetic', isPremium: true, settings: LOCK_SETTINGS, caption: '', ms: 0 }],
    ['screenshot-4-dashboard.png', 'dash-premium'],
    ['screenshot-5-dashboard-free.png', 'dash-free'],
  ];
  for (const [file, shot] of shots) {
    const site = typeof shot === 'object' ? shot : undefined;
    const ctx = await newContext(browser, { video: false, js: site?.javaScriptEnabled ?? true, size: [1600, 900] });
    await route(ctx, site);
    const p = await ctx.newPage();
    if (site) {
      await p.goto('https://site.test/');
      await p.waitForTimeout(1500);
    } else {
      await p.goto(`https://dash.test/index.html${shot === 'dash-premium' ? '?plan=premium' : ''}`);
      await p.waitForTimeout(2500);
      await p.addStyleTag({ content: `html{zoom:${1600 / 1371}}` });
      await p.waitForTimeout(300);
    }
    await p.screenshot({ path: join(OUT, file) });
    await ctx.close();
  }

  // YouTube thumbnail.
  const thumb = await newContext(browser, { video: false, size: [1280, 720] });
  const t = await thumb.newPage();
  const shot = readFileSync(join(OUT, 'screenshot-1-popup.png')).toString('base64');
  await t.setContent(`<!doctype html><style>
    body{margin:0;width:1280px;height:720px;position:relative;overflow:hidden;font-family:Inter,Arial,sans-serif;background:#0b1f3a}
    .s{position:absolute;inset:0;background:url(data:image/png;base64,${shot}) center 35%/auto 900px}
    .bar{position:absolute;left:0;right:0;bottom:0;height:300px;background:linear-gradient(transparent,rgba(6,16,31,.97) 40%);display:flex;align-items:flex-end;gap:28px;padding:0 40px 36px}
    h1{margin:0;color:#fff;font:900 84px/0.95 Inter,Arial;letter-spacing:-.03em}h1 span{color:#facc15}
  </style><div class="s"></div><div class="bar">${icon(160)}<h1>Stop ad blockers<br>on your <span>Wix site</span></h1></div>`);
  await t.screenshot({ path: join(OUT, 'youtube-thumbnail.png') });
  await thumb.close();
}

// ----------------------------------------------------------------- main ----
if (!existsSync(join(DASHBOARD, 'index.html'))) {
  throw new Error('Build the dashboard preview first: npx vite build --config marketing/preview/vite.config.ts');
}
mkdirSync(OUT, { recursive: true });
rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });
const browser = await chromium.launch();
await renderImages(browser);
console.log('images written');
const parts: string[] = [];
for (const [i, scene] of SCENES.entries()) parts.push(await recordScene(browser, scene, i));
await browser.close();

// Each recording starts with a blank frame or two while the page loads.
const TRIM = 0.5;
const inputs = parts.flatMap((p) => ['-ss', String(TRIM), '-i', p]);
const filter = parts.map((_, i) => `[${i}:v]fps=30,format=yuv420p,setsar=1[v${i}]`).join(';') +
  ';' + parts.map((_, i) => `[v${i}]`).join('') + `concat=n=${parts.length}:v=1:a=0[out]`;
const mp4 = join(OUT, 'adblock-guard-demo.mp4');
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', mp4,
]);
writeFileSync(join(RAW, 'scenes.txt'), parts.join('\n'));
console.log(`video written: ${mp4}`);
