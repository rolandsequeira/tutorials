import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  applyPlan,
  cleanDomain,
  decodeSettings,
  encodeSettings,
  normalizeSettings,
  premiumFeaturesUsed,
  toEmbedParameters,
} from '../src/shared/config.ts';

const premiumSettings = {
  ...DEFAULT_SETTINGS,
  blockTrackers: true,
  blockPopups: true,
  customBlocked: ['ads.example.com'],
  allowed: ['partner.example'],
  excludedPaths: ['/blog'],
};

test('settings round-trip through the embed parameter', () => {
  const encoded = encodeSettings(premiumSettings);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeSettings(encoded), normalizeSettings(premiumSettings));
});

test('garbage or missing parameters decode to defaults', () => {
  assert.deepEqual(decodeSettings(''), DEFAULT_SETTINGS);
  assert.deepEqual(decodeSettings('not base64 json!!'), DEFAULT_SETTINGS);
  assert.deepEqual(decodeSettings(undefined), DEFAULT_SETTINGS);
});

test('defaults survive normalization unchanged', () => {
  assert.deepEqual(normalizeSettings(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  assert.deepEqual(premiumFeaturesUsed(DEFAULT_SETTINGS), []);
});

test('cleanDomain accepts what owners paste and rejects the rest', () => {
  assert.equal(cleanDomain('https://Ads.Example.com/path?x=1'), 'ads.example.com');
  assert.equal(cleanDomain('*.example.com'), 'example.com');
  assert.equal(cleanDomain(' example.com:8080 '), 'example.com');
  assert.equal(cleanDomain('example.com.'), 'example.com');
  assert.equal(cleanDomain('localhost'), '');
  assert.equal(cleanDomain('exa mple.com'), '');
  assert.equal(cleanDomain("ads.com';alert(1)//"), '');
  assert.equal(cleanDomain(42), '');
});

test('Wix domains can never be blocked, but can be allowed', () => {
  const s = normalizeSettings({
    customBlocked: ['wix.com', 'static.parastorage.com', 'www.wixstatic.com', 'evil-ads.com', 'evil-ads.com'],
    allowed: ['wix.com'],
  });
  assert.deepEqual(s.customBlocked, ['evil-ads.com']);
  assert.deepEqual(s.allowed, ['wix.com']);
});

test('lists and paths are capped and cleaned', () => {
  const many = Array.from({ length: 80 }, (_, i) => `ads${i}.example.com`);
  const s = normalizeSettings({ customBlocked: many, excludedPaths: ['/ok', 'no-slash', '/', 42, '/a"b'] });
  assert.equal(s.customBlocked.length, 50);
  assert.deepEqual(s.excludedPaths, ['/ok', '/ab']);
});

test('free plan never receives premium settings, but keeps its allow list', () => {
  const free = applyPlan(premiumSettings, false);
  assert.deepEqual(premiumFeaturesUsed(free), []);
  assert.deepEqual(free.allowed, ['partner.example']);
  assert.deepEqual(decodeSettings(toEmbedParameters(premiumSettings, false).config), free);
});

test('premium plan keeps premium settings', () => {
  assert.deepEqual(
    decodeSettings(toEmbedParameters(premiumSettings, true).config),
    normalizeSettings(premiumSettings),
  );
  assert.deepEqual(premiumFeaturesUsed(premiumSettings).sort(), [
    'blockPopups',
    'blockTrackers',
    'customBlocked',
    'excludedPaths',
  ]);
});
