import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { verifySignedInstance, signInstance, verifyWebhook } from '../src/wix.js';
import { sanitizeSettings, publicWidgetConfig, DEFAULT_SETTINGS } from '../src/plans.js';

const SECRET = 'test-app-secret';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' });

function signWebhook(eventType, instanceId, data, key = privateKey) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const payload = { data: JSON.stringify({ eventType, instanceId, data: JSON.stringify(data) }), exp: Math.floor(Date.now() / 1000) + 300 };
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url');
  return `${unsigned}.${sig}`;
}

const silent = { info() {}, warn() {}, error() {} };

function setup({ billing = null } = {}) {
  const cfg = loadConfig({
    WIX_APP_ID: 'app-1', WIX_APP_SECRET: SECRET, WIX_PUBLIC_KEY: PUBLIC_PEM, DEV_MODE: '0',
    WIX_PLAN_MAP: JSON.stringify({ 'plan-pro-monthly': 'pro' }), DB_PATH: ':memory:',
  });
  const calls = { embed: [], instance: [] };
  const wix = {
    embedScript: async (id) => { calls.embed.push(id); return {}; },
    getAppInstance: async (id) => {
      calls.instance.push(id);
      return { instance: { isFree: !billing, billing }, site: { url: 'https://news.example.com', siteDisplayName: 'News' } };
    },
    upgradeUrl: (id) => `https://www.wix.com/apps/upgrade/app-1?appInstanceId=${id}`,
  };
  const repo = openDb(':memory:');
  const { app } = createApp({ cfg, repo, wix, log: silent });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { repo, calls, server, base };
}

const dash = (base, signed, path, init = {}) => fetch(`${base}/api/dashboard${path}`, {
  ...init, headers: { 'x-wix-instance': signed, 'content-type': 'application/json', ...(init.headers || {}) },
});

test('signed instance: valid, tampered, wrong secret', () => {
  const signed = signInstance({ instanceId: 'abc-123' }, SECRET);
  assert.equal(verifySignedInstance(signed, SECRET).instanceId, 'abc-123');
  assert.equal(verifySignedInstance(signed, 'other'), null);
  const [sig] = signed.split('.');
  const forged = Buffer.from(JSON.stringify({ instanceId: 'victim' })).toString('base64url');
  assert.equal(verifySignedInstance(`${sig}.${forged}`, SECRET), null);
  assert.equal(verifySignedInstance('garbage', SECRET), null);
});

test('webhook JWT verification rejects bad signatures', () => {
  const ev = verifyWebhook(signWebhook('AppInstalled', 'inst-1', { appId: 'app-1' }), PUBLIC_PEM);
  assert.equal(ev.eventType, 'AppInstalled');
  assert.equal(ev.instanceId, 'inst-1');
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  assert.throws(() => verifyWebhook(signWebhook('AppInstalled', 'inst-1', {}, other), PUBLIC_PEM));
});

test('settings sanitization validates fields and enforces the plan', () => {
  const free = sanitizeSettings({
    mode: 'block', layout: 'sideways', frequency: 'hourly', delaySeconds: 999, backgroundColor: 'red',
    showBranding: false, excludePaths: ['/blog'], title: '  Hi\u0000 there  ', message: '',
  }, undefined, 'free');
  assert.equal(free.mode, 'dismiss');
  assert.equal(free.layout, DEFAULT_SETTINGS.layout);
  assert.equal(free.frequency, DEFAULT_SETTINGS.frequency);
  assert.equal(free.delaySeconds, 30);
  assert.equal(free.backgroundColor, DEFAULT_SETTINGS.backgroundColor);
  assert.equal(free.showBranding, true);
  assert.deepEqual(free.excludePaths, []);
  assert.equal(free.title, 'Hi there');
  assert.equal(free.message, DEFAULT_SETTINGS.message);

  const pro = sanitizeSettings({
    mode: 'block', layout: 'banner-top', showBranding: false,
    excludePaths: ['/blog', 'no-slash', '/x"><script>', ' /shop/ '], accentColor: '#00AA11',
  }, undefined, 'pro');
  assert.equal(pro.mode, 'block');
  assert.equal(pro.layout, 'modal', 'block mode always uses the pop-up');
  assert.equal(pro.showBranding, false);
  assert.deepEqual(pro.excludePaths, ['/blog', '/shop/']);
  assert.equal(pro.accentColor, '#00aa11');

  // Downgrade: stored Pro settings are served as Free.
  const cfg = publicWidgetConfig({ plan: 'free', settings: pro }, 'Notice', 'https://example.com');
  assert.equal(cfg.mode, 'dismiss');
  assert.deepEqual(cfg.excludePaths, []);
  assert.deepEqual(cfg.branding, { name: 'Notice', url: 'https://example.com' });
});

test('install webhook embeds the script; config and pings work; removal hides the site', async (t) => {
  const { repo, calls, server, base } = setup();
  t.after(() => server.close());
  const id = 'inst-0000-1111';

  let res = await fetch(`${base}/webhooks/wix`, { method: 'POST', body: signWebhook('AppInstalled', id, {}) });
  assert.equal(res.status, 200);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(calls.embed, [id]);
  assert.equal(repo.getSite(id).scriptEmbedded, true);
  assert.equal(repo.getSite(id).siteUrl, 'https://news.example.com');

  res = await fetch(`${base}/webhooks/wix`, { method: 'POST', body: 'not-a-jwt' });
  assert.equal(res.status, 401);

  res = await fetch(`${base}/api/v1/config?i=${id}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const cfg = await res.json();
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.mode, 'dismiss');
  assert.ok(!('plan' in cfg));

  res = await fetch(`${base}/api/v1/ping`, { method: 'POST', body: JSON.stringify({ i: id, e: ['checked', 'detected', 'bogus', 'checked'] }) });
  assert.equal(res.status, 204);
  await fetch(`${base}/api/v1/ping`, { method: 'POST', body: JSON.stringify({ i: id, e: ['checked'] }) });

  const signed = signInstance({ instanceId: id }, SECRET);
  const stats = await (await dash(base, signed, '/stats')).json();
  assert.equal(stats.days, 7);
  assert.equal(stats.totals.checked, 2);
  assert.equal(stats.totals.detected, 1);
  assert.ok(!('bogus' in stats.totals));

  assert.equal((await fetch(`${base}/api/v1/config?i=bad id`)).status, 400);
  assert.equal((await fetch(`${base}/api/v1/config?i=unknown-site-1`)).status, 404);

  await fetch(`${base}/webhooks/wix`, { method: 'POST', body: signWebhook('AppRemoved', id, {}) });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((await fetch(`${base}/api/v1/config?i=${id}`)).status, 404);
});

test('dashboard: auth, save settings, plan from the signed instance', async (t) => {
  const { server, base } = setup({ billing: { packageName: 'plan-pro-monthly' } });
  t.after(() => server.close());
  const id = 'inst-2222-3333';

  assert.equal((await fetch(`${base}/api/dashboard/site`)).status, 401);
  assert.equal((await dash(base, signInstance({ instanceId: id }, 'wrong'), '/site')).status, 401);

  const free = signInstance({ instanceId: id, vendorProductId: null }, SECRET);
  let res = await dash(base, free, '/settings', { method: 'PUT', body: JSON.stringify({ mode: 'block', title: 'Please' }) });
  let body = await res.json();
  assert.equal(body.settings.mode, 'dismiss');
  assert.equal(body.settings.title, 'Please');

  const pro = signInstance({ instanceId: id, vendorProductId: 'plan-pro-monthly' }, SECRET);
  res = await dash(base, pro, '/settings', { method: 'PUT', body: JSON.stringify({ mode: 'block', showBranding: false }) });
  body = await res.json();
  assert.equal(body.settings.mode, 'block');
  assert.equal(body.settings.title, 'Please', 'a partial update keeps other fields');

  const site = await (await dash(base, pro, '/site')).json();
  assert.equal(site.plan, 'pro');
  assert.equal(site.limits.blockMode, true);
  assert.equal(site.scriptEmbedded, true, 'opening the dashboard embeds the script if it was missing');

  const cfg = await (await fetch(`${base}/api/v1/config?i=${id}`)).json();
  assert.equal(cfg.mode, 'block');
  assert.equal(cfg.branding, null);
});

test('serves the notice script and dashboard with the right headers', async (t) => {
  const { server, base } = setup();
  t.after(() => server.close());
  let res = await fetch(`${base}/notice.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  assert.match(await res.text(), /window\.SiteNotice/);
  res = await fetch(`${base}/dashboard?instance=x`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors/);
  assert.equal((await fetch(`${base}/demo`)).status, 404, 'demo page only exists in DEV_MODE');
});
