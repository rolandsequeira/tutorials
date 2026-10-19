import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { closeBrowser, gotoAndWaitForResult, openScenario, SITE, visibleMessage } from './harness.ts';

after(closeBrowser);

test('no blocker: no message', async () => {
  const { context, page } = await openScenario({ blocker: 'none' });
  const result = await gotoAndWaitForResult(page);
  assert.deepEqual(result, { blocked: false, cosmetic: false, network: false, brave: false });
  assert.equal(await visibleMessage(page), null);
  await context.close();
});

test('cosmetic blocker (element hiding) is detected', async () => {
  const { context, page } = await openScenario({ blocker: 'cosmetic' });
  const result = (await gotoAndWaitForResult(page)) as any;
  assert.equal(result.blocked, true);
  assert.equal(result.cosmetic, true);
  assert.match((await visibleMessage(page)) ?? '', /Ad blocker detected/);
  await context.close();
});

test('network blocker (Brave Shields / uBlock request blocking) is detected', async () => {
  const { context, page } = await openScenario({ blocker: 'network' });
  const result = (await gotoAndWaitForResult(page)) as any;
  assert.equal(result.blocked, true);
  assert.equal(result.network, true);
  assert.ok(await visibleMessage(page));
  await context.close();
});

test('reviewer case: scripts blocked entirely (Brave "Block scripts") still shows the message', async () => {
  const { context, page } = await openScenario({ blocker: 'both', javaScriptEnabled: false });
  await page.goto(SITE);
  const message = await visibleMessage(page);
  assert.match(message ?? '', /Ad blocker detected/);
  assert.match(message ?? '', /Scripts appear to be blocked/);
  // Dismissible without JavaScript on non-lock modes.
  await page.locator('label:visible', { hasText: 'Continue anyway' }).click();
  assert.equal(await visibleMessage(page), null);
  await context.close();
});

test('scripts blocked + no-script protection off: no message', async () => {
  const { context, page } = await openScenario({
    javaScriptEnabled: false,
    settings: { noScriptProtection: false },
  });
  await page.goto(SITE);
  assert.equal(await visibleMessage(page), null);
  await context.close();
});

test('strict mode: message appears if this script is killed but page JS still runs', async () => {
  const { context, page } = await openScenario({
    isPremium: true,
    killInlineScripts: true,
    settings: { strictMode: true, strictDelaySeconds: 2 },
  });
  await page.goto(SITE);
  assert.equal(await visibleMessage(page), null, 'hidden during the grace period');
  await page.waitForTimeout(2500);
  assert.match((await visibleMessage(page)) ?? '', /Ad blocker detected/);
  await context.close();
});

test('strict mode: clean visitors never see the fallback', async () => {
  const { context, page } = await openScenario({
    isPremium: true,
    settings: { strictMode: true, strictDelaySeconds: 2 },
  });
  await gotoAndWaitForResult(page);
  await page.waitForTimeout(2500);
  assert.equal(await visibleMessage(page), null);
  await context.close();
});

test('strict mode is not applied on the free plan', async () => {
  const { context, page } = await openScenario({
    isPremium: false,
    killInlineScripts: true,
    settings: { strictMode: true, strictDelaySeconds: 2 },
  });
  await page.goto(SITE);
  await page.waitForTimeout(2500);
  assert.equal(await visibleMessage(page), null);
  await context.close();
});

test('dismiss with "once per session" keeps it dismissed on reload', async () => {
  const { context, page } = await openScenario({
    isPremium: true,
    blocker: 'cosmetic',
    settings: { frequency: 'session' },
  });
  await gotoAndWaitForResult(page);
  await page.getByRole('button', { name: 'Continue anyway' }).click();
  assert.equal(await visibleMessage(page), null);
  const second = (await gotoAndWaitForResult(page)) as any;
  assert.equal(second.skipped, true);
  assert.equal(await visibleMessage(page), null);
  await context.close();
});

test('lock mode: no dismiss button, and the message comes back if removed', async () => {
  const { context, page } = await openScenario({
    isPremium: true,
    blocker: 'cosmetic',
    settings: { mode: 'lock', title: 'Please turn off your ad blocker' },
  });
  await gotoAndWaitForResult(page);
  assert.match((await visibleMessage(page)) ?? '', /Please turn off your ad blocker/);
  assert.equal(await page.getByRole('button', { name: 'Continue anyway' }).count(), 0);
  // Simulate a blocker or the visitor deleting the overlay in dev tools.
  await page.evaluate(() => {
    for (const el of Array.from(document.body.children)) {
      if (el.shadowRoot) el.remove();
    }
  });
  await page.waitForTimeout(300);
  assert.match((await visibleMessage(page)) ?? '', /Please turn off your ad blocker/);
  await context.close();
});

test('excluded pages are skipped, other pages are still protected', async () => {
  const { context, page } = await openScenario({
    isPremium: true,
    blocker: 'both',
    settings: { excludedPaths: ['/blog'] },
  });
  const excluded = (await gotoAndWaitForResult(page, 5000, `${SITE}blog/lemon-cake`)) as any;
  assert.equal(excluded.skipped, true);
  assert.equal(await visibleMessage(page), null);
  const other = (await gotoAndWaitForResult(page, 5000, `${SITE}blogging-tips`)) as any;
  assert.equal(other.blocked, true);
  await context.close();
});

test('custom premium text is rendered as text, not HTML', async () => {
  const { context, page } = await openScenario({
    isPremium: true,
    blocker: 'cosmetic',
    settings: { title: '<img src=x onerror=alert(1)>Hi' },
  });
  let dialogFired = false;
  page.on('dialog', (d) => { dialogFired = true; void d.dismiss(); });
  await gotoAndWaitForResult(page);
  assert.match((await visibleMessage(page)) ?? '', /<img src=x onerror=alert\(1\)>Hi/);
  assert.equal(dialogFired, false);
  await context.close();
});
