import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { verifySignedInstance, signInstance, verifyWebhook } from '../src/wix.js';
import { sanitizeSettings, publicWidgetConfig, planFromVendorProduct } from '../src/plans.js';
import { isAllowedImageUrl, normalizeImageUrl } from '../src/alttext.js';

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
    WIX_PLAN_MAP: JSON.stringify({ 'plan-pro-monthly': 'pro' }), DB_PATH: ':memory:', ANTHROPIC_API_KEY: '',
  });
  const calls = { embed: [], instance: [] };
  const wix = {
    embedScript: async (id) => { calls.embed.push(id); return {}; },
    getAppInstance: async (id) => {
      calls.instance.push(id);
      return { instance: { isFree: !billing, billing }, site: { url: 'https://bakery.example.com', siteDisplayName: 'Bakery' } };
    },
    upgradeUrl: (id) => `https://www.wix.com/apps/upgrade/app-1?appInstanceId=${id}`,
  };
  const altClient = {
    beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'A sourdough loaf on a wooden board' }] }) } },
  };
  const repo = openDb(':memory:');
  const { app, altText } = createApp({ cfg, repo, wix, altClient, log: silent });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { cfg, repo, calls, server, base, altText };
}

test('signed instance: valid, tampered, wrong secret', () => {
  const signed = signInstance({ instanceId: 'abc-123', vendorProductId: 'plan-pro-monthly' }, SECRET);
  assert.equal(verifySignedInstance(signed, SECRET).instanceId, 'abc-123');
  assert.equal(verifySignedInstance(signed, 'other'), null);
  const [sig, payload] = signed.split('.');
  const forged = Buffer.from(JSON.stringify({ instanceId: 'victim' })).toString('base64url');
  assert.equal(verifySignedInstance(`${sig}.${forged}`, SECRET), null);
  assert.equal(verifySignedInstance(`${sig}.${payload}x`, SECRET), null);
  assert.equal(verifySignedInstance('garbage', SECRET), null);
});

test('webhook JWT verification rejects bad signatures', () => {
  const jwt = signWebhook('AppInstalled', 'inst-1', { appId: 'app-1' });
  const ev = verifyWebhook(jwt, PUBLIC_PEM);
  assert.equal(ev.eventType, 'AppInstalled');
  assert.equal(ev.instanceId, 'inst-1');
  assert.equal(ev.data.appId, 'app-1');
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  assert.throws(() => verifyWebhook(signWebhook('AppInstalled', 'inst-1', {}, other), PUBLIC_PEM));
});

test('settings sanitization enforces plan limits and formats', () => {
  const free = sanitizeSettings({ showBranding: false, customCss: 'body{}', primaryColor: 'red', position: 'nowhere', offsetX: 9999 }, undefined, 'free');
  assert.equal(free.showBranding, true);
  assert.equal(free.customCss, '');
  assert.equal(free.primaryColor, '#1a56db');
  assert.equal(free.position, 'bottom-right');
  assert.equal(free.offsetX, 200);
  const biz = sanitizeSettings({ showBranding: false, customCss: '</style><script>x</script>', statementUrl: 'javascript:alert(1)' }, undefined, 'business');
  assert.equal(biz.showBranding, false);
  assert.ok(!/<\/?\s*style/i.test(biz.customCss));
  assert.equal(biz.statementUrl, '');
});

test('plan mapping', () => {
  assert.equal(planFromVendorProduct(null, {}), 'free');
  assert.equal(planFromVendorProduct('plan-pro-monthly', { 'plan-pro-monthly': 'pro' }), 'pro');
  assert.equal(planFromVendorProduct('abc_business_yearly', {}), 'business');
  const cfg = publicWidgetConfig({ plan: 'free', settings: {} }, 'X');
  assert.ok(!cfg.features.includes('voiceNav'));
  assert.equal(cfg.autoFix, null);
});

test('image URL allowlist and normalization', () => {
  assert.ok(isAllowedImageUrl('https://static.wixstatic.com/media/a~mv2.jpg/v1/fill/w_10/a.jpg', null));
  assert.ok(isAllowedImageUrl('https://bakery.example.com/img.png', 'https://www.bakery.example.com'));
  assert.ok(!isAllowedImageUrl('https://evil.example.org/x.png', 'https://bakery.example.com'));
  assert.ok(!isAllowedImageUrl('http://static.wixstatic.com/media/a.jpg', null));
  assert.equal(normalizeImageUrl('https://static.wixstatic.com/media/a~mv2.jpg/v1/fill/w_980,h_600/a.jpg'), 'https://static.wixstatic.com/media/a~mv2.jpg');
});

test('install webhook -> embed script -> plan sync -> widget config', async (t) => {
  const s = setup({ billing: { packageName: 'plan-pro-monthly', billingCycle: 'MONTHLY' } });
  t.after(() => s.server.close());
  let r = await fetch(`${s.base}/api/widget/config?i=inst-0001`);
  assert.equal(r.status, 404);

  r = await fetch(`${s.base}/webhooks/wix`, { method: 'POST', body: 'not-a-jwt' });
  assert.equal(r.status, 401);

  r = await fetch(`${s.base}/webhooks/wix`, { method: 'POST', body: signWebhook('AppInstalled', 'inst-0001', { appId: 'app-1' }) });
  assert.equal(r.status, 200);
  await new Promise((res) => setTimeout(res, 50));
  assert.deepEqual(s.calls.embed, ['inst-0001']);
  const site = s.repo.getSite('inst-0001');
  assert.equal(site.plan, 'pro');
  assert.equal(site.siteUrl, 'https://bakery.example.com');

  r = await fetch(`${s.base}/api/widget/config?i=inst-0001`);
  const cfg = await r.json();
  assert.equal(cfg.plan, 'pro');
  assert.ok(cfg.features.includes('voiceNav'));
  assert.equal(r.headers.get('access-control-allow-origin'), '*');

  await fetch(`${s.base}/webhooks/wix`, { method: 'POST', body: signWebhook('AppRemoved', 'inst-0001', {}) });
  await new Promise((res) => setTimeout(res, 20));
  r = await fetch(`${s.base}/api/widget/config?i=inst-0001`);
  assert.equal(r.status, 404);
});

test('dashboard auth and settings', async (t) => {
  const s = setup();
  t.after(() => s.server.close());
  let r = await fetch(`${s.base}/api/dashboard/site`);
  assert.equal(r.status, 401);
  r = await fetch(`${s.base}/api/dashboard/site`, { headers: { 'x-dev-instance': 'inst-0002' } });
  assert.equal(r.status, 401, 'dev header must be ignored outside DEV_MODE');

  const signed = signInstance({ instanceId: 'inst-0002', vendorProductId: null }, SECRET);
  const headers = { 'x-wix-instance': signed, 'content-type': 'application/json' };
  r = await fetch(`${s.base}/api/dashboard/site`, { headers });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.plan, 'free');
  assert.match(body.upgradeUrl, /appInstanceId=inst-0002/);

  r = await fetch(`${s.base}/api/dashboard/settings`, { method: 'PUT', headers, body: JSON.stringify({ position: 'top-left', showBranding: false }) });
  const saved = (await r.json()).settings;
  assert.equal(saved.position, 'top-left');
  assert.equal(saved.showBranding, true); // free plan cannot remove branding

  r = await fetch(`${s.base}/api/dashboard/audits`, { headers });
  assert.equal((await r.json()).details, false);
});

test('AI alt text: queue, generate, serve, quota and host checks', async (t) => {
  const s = setup();
  t.after(() => s.server.close());
  s.repo.ensureSite('inst-0003');
  s.repo.updatePlan('inst-0003', { plan: 'pro' });
  s.repo.updateSiteInfo('inst-0003', { siteUrl: 'https://bakery.example.com' });
  const img = 'https://static.wixstatic.com/media/abc~mv2.jpg/v1/fill/w_300,h_200/abc.jpg';
  const post = (images) => fetch(`${s.base}/api/widget/alt-text`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ i: 'inst-0003', page: 'https://bakery.example.com/', images }),
  }).then((r) => r.json());

  let res = await post([img, 'https://evil.example.org/x.png']);
  assert.deepEqual(res.alts, {});
  assert.equal(res.queued, 1);
  await s.altText.processQueue();
  res = await post([img, img.replace('w_300', 'w_600')]);
  assert.equal(res.alts[img], 'A sourdough loaf on a wooden board');
  assert.equal(Object.keys(res.alts).length, 2, 'size variants share one cached description');
  assert.equal(s.repo.getUsage('inst-0003', 'ai_alt'), 1);

  // Free plan gets nothing.
  s.repo.ensureSite('inst-0004');
  const free = await fetch(`${s.base}/api/widget/alt-text`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ i: 'inst-0004', images: [img] }),
  }).then((r) => r.json());
  assert.deepEqual(free, { alts: {} });
});

test('events and audits are validated', async (t) => {
  const s = setup();
  t.after(() => s.server.close());
  s.repo.ensureSite('inst-0005');
  let r = await fetch(`${s.base}/api/widget/events`, { method: 'POST', body: JSON.stringify({ i: 'inst-0005', e: { open: 3, 'bad key!': 5, load: 1e9 } }) });
  assert.equal(r.status, 204);
  const rows = s.repo.eventsSince('inst-0005', '2000-01-01');
  assert.deepEqual(rows.map((x) => [x.name, x.count]).sort(), [['load', 50], ['open', 3]]);

  r = await fetch(`${s.base}/api/widget/audit`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ i: 'inst-0005', page: 'https://x.com/about', score: 180, issues: [{ id: 'image-alt', impact: 'bogus', count: 2 }] }),
  });
  assert.equal(r.status, 204);
  r = await fetch(`${s.base}/api/widget/audit`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ i: 'inst-0005', page: 'javascript:alert(1)', score: 50, issues: [] }),
  });
  assert.equal(r.status, 400);
  assert.equal(s.repo.listAudits('inst-0005').length, 1);
  const a = s.repo.listAudits('inst-0005')[0];
  assert.equal(a.score, 100);
  assert.equal(a.issues[0].impact, 'minor');
});
