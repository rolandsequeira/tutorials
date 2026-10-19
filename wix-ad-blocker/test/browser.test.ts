import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { adHosts, closeBrowser, load, openScenario, SITE } from './harness.ts';

after(closeBrowser);

// Chromium's preload scanner requests <script src> tags in the page's HTML
// before any JavaScript runs, so no in-page blocker can stop that request.
// What matters is that the ad code never runs; see the "ran" assertions.
const PRELOADED = 'pagead2.googlesyndication.com';

const ALL_ADS = [
  'c.amazon-adsystem.com',
  'fastlane.rubiconproject.com',
  'ib.adnxs.com',
  'pagead2.googlesyndication.com',
  'sb.scorecardresearch.com',
  'securepubads.g.doubleclick.net',
  'tpc.googlesyndication.com',
  'widgets.outbrain.com',
];

test('baseline: without the app, the demo page loads every ad', async () => {
  const { context, page, requested } = await openScenario({ noEmbed: true });
  const results = await load(page);
  await page.waitForTimeout(200);
  assert.deepEqual(adHosts(requested), ALL_ADS);
  assert.deepEqual(results.ran, ['pagead2.googlesyndication.com', 'securepubads.g.doubleclick.net', 'static.parastorage.com']);
  assert.equal(results.fetchAd, 'ok');
  await context.close();
});

test('free plan: every ad request is blocked, however it is made', async () => {
  const { context, page, requested } = await openScenario();
  const results = await load(page);
  await page.waitForTimeout(200);
  // The tracker is left because tracker blocking is Premium.
  assert.deepEqual(adHosts(requested), [PRELOADED, 'sb.scorecardresearch.com']);
  assert.deepEqual(results, {
    ran: ['static.parastorage.com'],
    fetchAd: 'failed',
    fetchFirstParty: 'ok',
    beacon: false,
    xhrAd: 'failed',
  });
  assert.equal(await page.locator('iframe[src]').count(), 0, 'no ad iframes left in the page');

  const stats = await page.evaluate(() => (window as any).__adFreeSite);
  const via = new Set(stats.blocked.map((b: { via: string }) => b.via));
  for (const v of ['html', 'property', 'attribute', 'fetch', 'xhr', 'beacon']) assert.ok(via.has(v), `blocked via ${v}`);
  await context.close();
});

test('the site itself and Wix infrastructure always load', async () => {
  const { context, page, requested } = await openScenario({ isPremium: true, settings: { blockTrackers: true } });
  const results = await load(page);
  assert.ok(requested.has('static.parastorage.com'));
  assert.ok(requested.has('static.wixstatic.com'));
  assert.equal(results.fetchFirstParty, 'ok');
  assert.equal(await page.locator('#logo').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), true);
  await context.close();
});

test('Wix domains stay unblocked even if a tampered config lists them', async () => {
  const { context, page, requested } = await openScenario({ noEmbed: true });
  const { renderEmbed } = await import('./harness.ts');
  const tampered = Buffer.from(
    JSON.stringify({ customBlocked: ['parastorage.com', 'wixstatic.com', 'example-site.test'] }),
  ).toString('base64url');
  const embed = renderEmbed({}, true).replace(/var RAW_CONFIG = '[^']*'/, `var RAW_CONFIG = '${tampered}'`);
  await page.route(SITE, async (route) => {
    const { sitePage } = await import('./harness.ts');
    await route.fulfill({ contentType: 'text/html', body: sitePage(embed) });
  });
  const results = await load(page);
  assert.ok(requested.has('static.parastorage.com'));
  assert.ok(requested.has('static.wixstatic.com'));
  assert.equal(results.fetchFirstParty, 'ok');
  await context.close();
});

test('empty ad slots are hidden, and shown again when the option is off', async () => {
  const on = await openScenario();
  await load(on.page);
  assert.equal(await on.page.locator('#adsense-slot').isVisible(), false);
  assert.equal(await on.page.locator('#div-gpt-ad-1').isVisible(), false);
  await on.context.close();

  const off = await openScenario({ settings: { hideAdSlots: false } });
  await load(off.page);
  assert.equal(await off.page.locator('#adsense-slot').isVisible(), true);
  await off.context.close();
});

test('premium: tracker blocking stops the tracking pixel', async () => {
  const { context, page, requested } = await openScenario({ isPremium: true, settings: { blockTrackers: true } });
  await load(page);
  await page.waitForTimeout(200);
  assert.deepEqual(adHosts(requested), [PRELOADED]);
  await context.close();
});

test('allow list: the owner can keep their own ad partner', async () => {
  const { context, page, requested } = await openScenario({ settings: { allowed: ['doubleclick.net'] } });
  const results = await load(page);
  assert.ok(requested.has('securepubads.g.doubleclick.net'));
  assert.deepEqual(results.ran, ['securepubads.g.doubleclick.net', 'static.parastorage.com']);
  await context.close();
});

test('premium: custom block list; ignored on the free plan', async () => {
  const bodyEnd = `<script>
    var t = document.createElement('script'); t.src = 'https://cdn.sneaky-ads.example/load.js'; document.body.appendChild(t);
  </script><script src="https://tag.sneaky-ads.example/inline.js"></script>`;
  const premium = await openScenario({ isPremium: true, settings: { customBlocked: ['sneaky-ads.example'] }, bodyEnd });
  const p = await load(premium.page);
  await premium.page.waitForTimeout(200);
  assert.ok(!premium.requested.has('cdn.sneaky-ads.example'));
  assert.ok(!p.ran.some((h) => h.endsWith('sneaky-ads.example')));
  await premium.context.close();

  const free = await openScenario({ isPremium: false, settings: { customBlocked: ['sneaky-ads.example'] }, bodyEnd });
  await load(free.page);
  await free.page.waitForTimeout(200);
  assert.ok(free.requested.has('cdn.sneaky-ads.example'));
  await free.context.close();
});

// Opens two windows as the page loads, with no click: one to an ad host, one not.
const POPUPS = `<script>window.__auto = {
  adHost: window.open('https://popads.net/pop') === null,
  noClick: window.open('https://partner.example/deal') === null,
};</script>
<button id="open" onclick="window.__clicked = !!window.open('https://partner.example/deal')">Deal</button>`;

test('pop-ups: ad-host pop-ups are always blocked, others only without a click (premium)', async () => {
  const { context, page } = await openScenario({ isPremium: true, settings: { blockPopups: true }, bodyEnd: POPUPS });
  await load(page);
  assert.deepEqual(await page.evaluate(() => (window as any).__auto), { adHost: true, noClick: true });

  const popup = context.waitForEvent('page');
  await page.click('#open');
  await popup;
  assert.equal(await page.evaluate(() => (window as any).__clicked), true);
  await context.close();
});

test('pop-ups without a click are allowed on the free plan, ad hosts are still blocked', async () => {
  const { context, page } = await openScenario({ settings: { blockPopups: true }, bodyEnd: POPUPS });
  const pages = context.waitForEvent('page');
  await load(page);
  await pages;
  assert.deepEqual(await page.evaluate(() => (window as any).__auto), { adHost: true, noClick: false });
  await context.close();
});

test('excluded pages load ads normally, other pages are still protected', async () => {
  const excluded = await openScenario({ isPremium: true, settings: { excludedPaths: ['/blog'] } });
  const r = await load(excluded.page, `${SITE}blog/lemon-cake`);
  assert.equal(r.fetchAd, 'ok');
  assert.ok(excluded.requested.has('securepubads.g.doubleclick.net'));
  assert.equal(await excluded.page.locator('#adsense-slot').isVisible(), true);
  await excluded.context.close();

  const other = await openScenario({ isPremium: true, settings: { excludedPaths: ['/blog'] } });
  const r2 = await load(other.page, `${SITE}blogging-tips`);
  assert.equal(r2.fetchAd, 'failed');
  await other.context.close();
});

test('turned off: the script does nothing', async () => {
  const { context, page, requested } = await openScenario({ settings: { enabled: false } });
  const results = await load(page);
  await page.waitForTimeout(200);
  assert.deepEqual(adHosts(requested), ALL_ADS);
  assert.equal(results.fetchAd, 'ok');
  await context.close();
});
