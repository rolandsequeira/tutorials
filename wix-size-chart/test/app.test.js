import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { verifySignedInstance, signInstance, verifyWebhook } from '../src/wix.js';
import { sanitizeSettings, publicWidgetConfig, matchChart, enforcePlan, DEFAULT_SETTINGS } from '../src/plans.js';
import { sniffImage } from '../src/routes/dashboard.js';

const SECRET = 'test-app-secret';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' });
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

function signWebhook(eventType, instanceId, data, key = privateKey) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const payload = { data: JSON.stringify({ eventType, instanceId, data: JSON.stringify(data) }), exp: Math.floor(Date.now() / 1000) + 300 };
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url');
  return `${unsigned}.${sig}`;
}

const silent = { info() {}, warn() {}, error() {} };

function setup({ billing = null, products = {} } = {}) {
  const cfg = loadConfig({
    WIX_APP_ID: 'app-1', WIX_APP_SECRET: SECRET, WIX_PUBLIC_KEY: PUBLIC_PEM, DEV_MODE: '0',
    WIX_PLAN_MAP: JSON.stringify({ 'plan-pro-monthly': 'pro' }), DB_PATH: ':memory:',
    BASE_URL: 'https://sizes.example.com',
    UPLOAD_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'fitchart-test-')),
  });
  const calls = { embed: [], instance: [], product: [] };
  const wix = {
    embedScript: async (id) => { calls.embed.push(id); return {}; },
    getAppInstance: async (id) => {
      calls.instance.push(id);
      return { instance: { isFree: !billing, billing }, site: { url: 'https://shop.example.com', siteDisplayName: 'Shop' } };
    },
    getProductBySlug: async (id, slug) => { calls.product.push(slug); return products[slug] || null; },
    listCollections: async () => [{ id: 'col-shoes', name: 'Shoes' }],
    upgradeUrl: (id) => `https://www.wix.com/apps/upgrade/app-1?appInstanceId=${id}`,
  };
  const repo = openDb(':memory:');
  const { app } = createApp({ cfg, repo, wix, log: silent });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { repo, calls, server, base, cfg };
}

const dash = (base, signed, p, init = {}) => fetch(`${base}/api/dashboard${p}`, {
  ...init, headers: { 'x-wix-instance': signed, 'content-type': 'application/json', ...(init.headers || {}) },
});

const chart = (id, assign, extra = {}) => ({
  id, name: id, title: id, columns: [{ label: 'Size', measure: 'text' }, { label: 'Hand', measure: 'length' }],
  rows: [['M', '18-20']], assign: { all: false, products: [], collections: [], keywords: [], ...assign }, ...extra,
});

test('signed instance and webhook verification', () => {
  const signed = signInstance({ instanceId: 'abc-123' }, SECRET);
  assert.equal(verifySignedInstance(signed, SECRET).instanceId, 'abc-123');
  assert.equal(verifySignedInstance(signed, 'other'), null);
  const [sig] = signed.split('.');
  const forged = Buffer.from(JSON.stringify({ instanceId: 'victim' })).toString('base64url');
  assert.equal(verifySignedInstance(`${sig}.${forged}`, SECRET), null);

  const ev = verifyWebhook(signWebhook('AppInstalled', 'inst-1', {}), PUBLIC_PEM);
  assert.equal(ev.eventType, 'AppInstalled');
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  assert.throws(() => verifyWebhook(signWebhook('AppInstalled', 'inst-1', {}, other), PUBLIC_PEM));
});

test('settings sanitization validates charts and enforces the plan', () => {
  const input = {
    position: 'sideways', accentColor: 'red', showUnitSwitch: true, showBranding: false,
    productPath: '/shop', customSelector: '<script>',
    charts: [
      { id: 'gloves', name: ' Gloves\u0000 ', columns: [{ label: 'Size', measure: 'bogus' }, { label: 'Hand', measure: 'length' }],
        rows: [['M', '18-20', 'extra cell'], 'not-a-row'], image: 'javascript:alert(1)',
        assign: { all: 'yes', products: ['Boxing-Gloves', 'bad slug!', 'boxing-gloves'], keywords: [' Glove '], collections: ['x"y'] } },
      { id: 'gloves', name: 'Second', columns: [], rows: [], image: '/u/abc123.png' },
    ],
  };
  const free = sanitizeSettings(input, undefined, 'free');
  assert.equal(free.position, DEFAULT_SETTINGS.position);
  assert.equal(free.accentColor, DEFAULT_SETTINGS.accentColor);
  assert.equal(free.showUnitSwitch, false, 'unit switch is Pro');
  assert.equal(free.showBranding, true);
  assert.equal(free.productPath, '/shop/');
  assert.equal(free.customSelector, '');
  const [a, b] = free.charts;
  assert.equal(a.name, 'Gloves');
  assert.equal(a.columns[0].measure, 'text');
  assert.deepEqual(a.rows, [['M', '18-20']]);
  assert.equal(a.image, null);
  assert.deepEqual(a.assign, { all: false, products: ['boxing-gloves'], collections: [], keywords: ['glove'] });
  assert.notEqual(b.id, a.id, 'duplicate ids are renamed');
  assert.deepEqual(b.columns, [{ label: 'Size', measure: 'text' }]);
  assert.equal(a.active, true);
  assert.equal(b.active, false, 'Free serves only the first chart');
  assert.equal(b.image, null, 'images are Pro');

  const pro = sanitizeSettings(input, undefined, 'pro');
  assert.equal(pro.showUnitSwitch, true);
  assert.equal(pro.showBranding, false);
  assert.equal(pro.charts[1].active, true);
  assert.equal(pro.charts[1].image, '/u/abc123.png');

  const cfg = publicWidgetConfig({ plan: 'pro', settings: pro }, pro.charts[1], 'FitChart', 'https://x.test', 'https://sizes.example.com');
  assert.equal(cfg.chart.image, 'https://sizes.example.com/u/abc123.png');
  assert.equal(cfg.branding, null);
});

test('chart matching: product, then keyword, then category, then all', () => {
  const charts = enforcePlan({ charts: [
    chart('all', { all: true }),
    chart('shoes', { collections: ['col-shoes'] }),
    chart('gloves', { keywords: ['glove'] }),
    chart('special', { products: ['boxing-gloves-16oz'] }),
  ] }, 'pro').charts;
  assert.equal(matchChart(charts, { slug: 'boxing-gloves-16oz' }).id, 'special');
  assert.equal(matchChart(charts, { slug: 'boxing-gloves-12oz' }).id, 'gloves');
  assert.equal(matchChart(charts, { slug: 'x', name: 'Winter Gloves' }).id, 'gloves');
  assert.equal(matchChart(charts, { slug: 'runner', collections: ['col-shoes'] }).id, 'shoes');
  assert.equal(matchChart(charts, { slug: 'hat' }).id, 'all');
  assert.equal(matchChart(enforcePlan({ charts }, 'free').charts, { slug: 'boxing-gloves-16oz' }).id, 'all', 'Free only uses chart 1');
});

test('install, guide lookup by slug and category, pings, removal', async (t) => {
  const { repo, calls, server, base } = setup({
    billing: { packageName: 'plan-pro-monthly' },
    products: { 'trail-runner': { id: 'p1', name: 'Trail Runner', collections: ['col-shoes'] } },
  });
  t.after(() => server.close());
  const id = 'inst-0000-1111';

  let res = await fetch(`${base}/webhooks/wix`, { method: 'POST', body: signWebhook('AppInstalled', id, {}) });
  assert.equal(res.status, 200);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(calls.embed, [id]);
  assert.equal(repo.getSite(id).plan, 'pro');

  // Default install: one chart for all products.
  let cfg = await (await fetch(`${base}/api/v1/guide?i=${id}&p=any-shirt`)).json();
  assert.equal(cfg.chart.id, 'default');
  assert.equal(calls.product.length, 0, 'no Wix lookup when no chart uses categories');

  const signed = signInstance({ instanceId: id, vendorProductId: 'plan-pro-monthly' }, SECRET);
  res = await dash(base, signed, '/settings', { method: 'PUT', body: JSON.stringify({
    charts: [chart('shoes', { collections: ['col-shoes'] }), chart('gloves', { keywords: ['glove'] })],
  }) });
  assert.equal(res.status, 200);

  cfg = await (await fetch(`${base}/api/v1/guide?i=${id}&p=trail-runner`)).json();
  assert.equal(cfg.chart.id, 'shoes');
  await fetch(`${base}/api/v1/guide?i=${id}&p=trail-runner`);
  assert.deepEqual(calls.product, ['trail-runner'], 'product lookups are cached');
  cfg = await (await fetch(`${base}/api/v1/guide?i=${id}&p=Boxing-Gloves-12oz`)).json();
  assert.equal(cfg.chart.id, 'gloves');
  cfg = await (await fetch(`${base}/api/v1/guide?i=${id}&p=hat`)).json();
  assert.equal(cfg.chart, null);
  assert.equal(cfg.productPath, '/product-page/');
  assert.ok(!('plan' in cfg));

  res = await fetch(`${base}/api/v1/ping`, { method: 'POST', body: JSON.stringify({ i: id, e: ['viewed', 'opened', 'bogus', 'viewed'] }) });
  assert.equal(res.status, 204);
  const stats = await (await dash(base, signed, '/stats')).json();
  assert.equal(stats.days, 90);
  assert.equal(stats.totals.viewed, 1);
  assert.equal(stats.totals.opened, 1);
  assert.ok(!('bogus' in stats.totals));

  assert.equal((await fetch(`${base}/api/v1/guide?i=bad id`)).status, 400);
  assert.equal((await fetch(`${base}/api/v1/guide?i=unknown-site-1`)).status, 404);
  await fetch(`${base}/webhooks/wix`, { method: 'POST', body: signWebhook('AppRemoved', id, {}) });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((await fetch(`${base}/api/v1/guide?i=${id}`)).status, 404);
});

test('dashboard: auth, plan limits, image upload', async (t) => {
  const { server, base } = setup();
  t.after(() => server.close());
  const id = 'inst-2222-3333';
  assert.equal((await fetch(`${base}/api/dashboard/site`)).status, 401);

  const free = signInstance({ instanceId: id, vendorProductId: null }, SECRET);
  let res = await dash(base, free, '/images', { method: 'POST', body: PNG, headers: { 'content-type': 'image/png' } });
  assert.equal(res.status, 402, 'uploads are Pro');
  const site = await (await dash(base, free, '/site')).json();
  assert.equal(site.limits.maxCharts, 1);
  assert.ok(site.templates.some((tp) => tp.key === 'gloves'));
  assert.equal(site.scriptEmbedded, true);

  const pro = signInstance({ instanceId: id, vendorProductId: 'plan-pro-monthly' }, SECRET);
  res = await dash(base, pro, '/images', { method: 'POST', body: Buffer.from('<svg onload=alert(1)>'), headers: { 'content-type': 'image/svg+xml' } });
  assert.equal(res.status, 415);
  res = await dash(base, pro, '/images', { method: 'POST', body: PNG, headers: { 'content-type': 'image/png' } });
  assert.equal(res.status, 200);
  const { url } = await res.json();
  assert.match(url, /^\/u\/[a-f0-9]{24}\.png$/);
  res = await fetch(base + url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(`${base}/u/${'0'.repeat(24)}.png`)).status, 404);

  res = await dash(base, pro, '/settings', { method: 'PUT', body: JSON.stringify({ charts: [chart('a', { all: true }, { image: url })] }) });
  assert.equal((await res.json()).settings.charts[0].image, url);
  const cfg = await (await fetch(`${base}/api/v1/guide?i=${id}&p=x`)).json();
  assert.equal(cfg.chart.image, `https://sizes.example.com${url}`);

  // Downgrade: the image and unit switch disappear from what visitors get.
  await dash(base, free, '/site');
  const cfg2 = await (await fetch(`${base}/api/v1/guide?i=${id}&p=y`)).json();
  assert.equal(cfg2.chart.image, null);
  assert.equal(cfg2.showUnitSwitch, false);

  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpg');
  assert.equal(sniffImage(Buffer.from('GIF89a......')), 'gif');
});

test('visitor script: unit conversion and product slugs', async (t) => {
  const { server, base } = setup();
  t.after(() => server.close());
  const res = await fetch(`${base}/guide.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  const ctx = { window: {}, document: { currentScript: null, querySelector: () => null }, location: { href: 'https://x.test/', search: '' } };
  vm.runInNewContext(await res.text(), ctx);
  const sg = ctx.window.SizeGuide;
  assert.equal(sg.convert('86-90', 'length', 'imperial'), '34-35.5');
  assert.equal(sg.convert('22.5', 'length', 'imperial'), '9');
  assert.equal(sg.convert('16-17', 'length', 'imperial'), '6.5');
  assert.equal(sg.convert('up to 45', 'weight', 'imperial'), 'up to 99');
  assert.equal(sg.convert('90+', 'weight', 'imperial'), '198+');
  assert.equal(sg.convert('XL', 'text', 'imperial'), 'XL');
  assert.equal(sg.convert('86-90', 'length', 'metric'), '86-90');
  assert.equal(sg.productSlug('/fr/product-page/Gants-De-Boxe', '/product-page/'), 'gants-de-boxe');
  assert.equal(sg.productSlug('/shop/item-1/', '/shop/'), 'item-1');
  assert.equal(sg.productSlug('/blog/post', '/product-page/'), '');

  const dashRes = await fetch(`${base}/dashboard?instance=x`);
  assert.equal(dashRes.status, 200);
  assert.match(dashRes.headers.get('content-security-policy'), /frame-ancestors/);
  assert.equal((await fetch(`${base}/demo`, { redirect: 'manual' })).status, 404, 'demo page only exists in DEV_MODE');
});
