import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { verifySignedInstance, signInstance, verifyWebhook } from '../src/wix.js';
import { sanitizeSettings, publicWidgetConfig, planFromVendorProduct } from '../src/plans.js';
import { isAllowedImageUrl, normalizeImageUrl } from '../src/alttext.js';
import { analyzePdf, isAllowedDocUrl } from '../src/documents.js';
import zlib from 'node:zlib';

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

function setup({ billing = null, docFetch } = {}) {
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
  const { app, altText, documents } = createApp({ cfg, repo, wix, altClient, docFetch, log: silent });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { cfg, repo, calls, server, base, altText, documents };
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

test('visitor problem reports reach the dashboard', async (t) => {
  const s = setup();
  t.after(() => s.server.close());
  s.repo.ensureSite('inst-0006');
  const post = (body) => fetch(`${s.base}/api/widget/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let r = await post({ i: 'inst-0006', message: 'x' });
  assert.equal(r.status, 400);
  r = await post({ i: 'inst-0006', page: 'javascript:alert(1)', message: 'Menu cannot be opened with keyboard', email: 'not-an-email', prefs: ['fontSize', '<b>'] });
  assert.equal(r.status, 201);
  const signed = signInstance({ instanceId: 'inst-0006', vendorProductId: null }, SECRET);
  const headers = { 'x-wix-instance': signed, 'content-type': 'application/json' };
  const list = await (await fetch(`${s.base}/api/dashboard/feedback`, { headers })).json();
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].page_url, null);
  assert.equal(list.items[0].email, null);
  assert.deepEqual(list.items[0].meta.prefs, ['fontSize']);
  const site = await (await fetch(`${s.base}/api/dashboard/site`, { headers })).json();
  assert.equal(site.openFeedback, 1);
  r = await fetch(`${s.base}/api/dashboard/feedback/${list.items[0].id}`, { method: 'PUT', headers, body: JSON.stringify({ status: 'resolved' }) });
  assert.equal(r.status, 200);
  assert.equal(s.repo.openFeedbackCount('inst-0006'), 0);
  // Another site's owner cannot touch it.
  const other = signInstance({ instanceId: 'inst-0007', vendorProductId: null }, SECRET);
  r = await fetch(`${s.base}/api/dashboard/feedback/${list.items[0].id}`, { method: 'PUT', headers: { ...headers, 'x-wix-instance': other }, body: JSON.stringify({ status: 'open' }) });
  assert.equal(r.status, 404);
});

test('sign language is opt-in and white label is Business-only', () => {
  const pro = publicWidgetConfig({ plan: 'pro', settings: {} }, 'App');
  assert.ok(!pro.features.includes('signLanguage'));
  assert.ok(pro.features.includes('talkType'));
  const proOn = publicWidgetConfig({ plan: 'pro', settings: sanitizeSettings({ signLanguage: true, brandText: 'Agency' }, undefined, 'pro') }, 'App');
  assert.ok(proOn.features.includes('signLanguage'));
  assert.equal(proOn.ui.brandName, 'App');
  const biz = publicWidgetConfig({ plan: 'business', settings: sanitizeSettings({ brandText: 'Acme <b>', brandUrl: 'javascript:x' }, undefined, 'business') }, 'App');
  assert.equal(biz.ui.brandName, 'Acme b');
  assert.equal(biz.ui.brandUrl, '');
  const free = publicWidgetConfig({ plan: 'free', settings: {} }, 'App');
  for (const f of ['colorBlind', 'contentScale', 'smartContrast', 'readMode']) assert.ok(free.features.includes(f), f);
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

const TAGGED_PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >> endobj\n3 0 obj << /Type /Page >> endobj\n%%EOF', 'latin1');
const UNTAGGED_PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n3 0 obj << /Type /Page >> endobj\n%%EOF', 'latin1');
function compressedCatalogPdf() {
  const body = zlib.deflateSync(Buffer.from('<< /Type /Catalog /StructTreeRoot 9 0 R /MarkInfo << /Marked true >> /Lang (de) >>', 'latin1'));
  return Buffer.concat([
    Buffer.from('%PDF-1.7\n4 0 obj << /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ' + body.length + ' >>\nstream\n', 'latin1'),
    body,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
}

test('PDF analysis detects tags, language and compressed catalogs', () => {
  const tagged = analyzePdf(TAGGED_PDF);
  assert.equal(tagged.status, 'tagged');
  assert.equal(tagged.detail.lang, true);
  assert.equal(tagged.detail.title, true);
  assert.equal(analyzePdf(UNTAGGED_PDF).status, 'untagged');
  assert.equal(analyzePdf(compressedCatalogPdf()).status, 'tagged');
  assert.equal(analyzePdf(Buffer.from('<html>')).status, 'error');
  assert.ok(isAllowedDocUrl('https://abc.filesusr.com/ugd/x.pdf', null));
  assert.ok(isAllowedDocUrl('https://www.bakery.example.com/_files/ugd/x.pdf', 'https://bakery.example.com'));
  assert.ok(!isAllowedDocUrl('http://169.254.169.254/latest.pdf', 'https://bakery.example.com'));
  assert.ok(!isAllowedDocUrl('https://user:pw@abc.filesusr.com/x.pdf', null));
});

test('audit queues site PDFs and the checker never leaves the allowlist', async (t) => {
  const requested = [];
  const docFetch = async (url) => {
    requested.push(url);
    if (url.includes('redirect')) return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/secret.pdf' } });
    if (url.includes('moved')) return new Response(null, { status: 301, headers: { location: 'https://abc.filesusr.com/ugd/final.pdf' } });
    return new Response(url.includes('final') ? TAGGED_PDF : UNTAGGED_PDF, { status: 200 });
  };
  const s = setup({ docFetch });
  t.after(() => s.server.close());
  s.repo.ensureSite('inst-0008');
  s.repo.updatePlan('inst-0008', { plan: 'pro' });
  s.repo.updateSiteInfo('inst-0008', { siteUrl: 'https://bakery.example.com' });
  const r = await fetch(`${s.base}/api/widget/audit`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ i: 'inst-0008', page: 'https://bakery.example.com/menu', score: 90, issues: [], pdfs: [
      'https://bakery.example.com/_files/ugd/menu.pdf', 'https://bakery.example.com/redirect.pdf',
      'https://bakery.example.com/moved.pdf', 'https://evil.example.org/x.pdf',
    ] }),
  });
  assert.equal(r.status, 204);
  await s.documents.processQueue();
  const docs = Object.fromEntries(s.repo.listDocuments('inst-0008').map((d) => [d.url.split('/').pop(), d]));
  assert.equal(Object.keys(docs).length, 3, 'foreign host is never stored');
  assert.equal(docs['menu.pdf'].status, 'untagged');
  assert.equal(docs['moved.pdf'].status, 'tagged');
  assert.equal(docs['redirect.pdf'].status, 'error');
  assert.equal(docs['redirect.pdf'].detail.reason, 'host_not_allowed');
  assert.ok(!requested.some((u) => u.includes('169.254')), 'redirect to a private address was not fetched');

  const signed = signInstance({ instanceId: 'inst-0008', vendorProductId: 'pro-x' }, SECRET);
  const list = await (await fetch(`${s.base}/api/dashboard/documents`, { headers: { 'x-wix-instance': signed } })).json();
  assert.equal(list.summary.total, 3);
  assert.equal(list.items.length, 3);
});

test('menu order (Pro) and Adobe Analytics flag reach the widget config', () => {
  const settings = sanitizeSettings({ featureOrder: ['dictionary', 'contrast', 'bogus', 'contrast'], adobe: true }, undefined, 'pro');
  assert.deepEqual(settings.featureOrder, ['dictionary', 'contrast']);
  const cfg = publicWidgetConfig({ plan: 'pro', settings }, 'App');
  assert.deepEqual(cfg.features.slice(0, 2), ['dictionary', 'contrast']);
  assert.equal(cfg.adobe, true);
  const free = sanitizeSettings({ featureOrder: ['contrast'] }, undefined, 'free');
  assert.deepEqual(free.featureOrder, []);
});
