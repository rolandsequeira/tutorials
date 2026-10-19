import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  applyPlan,
  decodeSettings,
  encodeSettings,
  normalizeSettings,
  premiumFeaturesUsed,
  sanitizeText,
  toEmbedParameters,
} from '../src/shared/config.ts';

const premiumSettings = {
  ...DEFAULT_SETTINGS,
  mode: 'lock' as const,
  title: 'Bitte Werbeblocker ausschalten ✋',
  accentColor: '#FF0000',
  strictMode: true,
  showBranding: false,
  frequency: 'session' as const,
  excludedPaths: ['/blog'],
};

test('settings round-trip through the embed parameter, including non-ASCII text', () => {
  const encoded = encodeSettings(premiumSettings);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeSettings(encoded), normalizeSettings(premiumSettings));
});

test('garbage or missing parameters decode to defaults', () => {
  assert.deepEqual(decodeSettings(''), DEFAULT_SETTINGS);
  assert.deepEqual(decodeSettings('not base64 json!!'), DEFAULT_SETTINGS);
  assert.deepEqual(decodeSettings(undefined), DEFAULT_SETTINGS);
});

test('normalize rejects invalid values', () => {
  const s = normalizeSettings({
    mode: 'evil',
    accentColor: 'red; background:url(x)',
    strictDelaySeconds: 999,
    excludedPaths: ['/ok', 'no-slash', '/', 42],
  });
  assert.equal(s.mode, DEFAULT_SETTINGS.mode);
  assert.equal(s.accentColor, DEFAULT_SETTINGS.accentColor);
  assert.equal(s.strictDelaySeconds, 15);
  assert.deepEqual(s.excludedPaths, ['/ok']);
});

test('sanitizeText strips characters that could break out of HTML', () => {
  assert.equal(
    sanitizeText('<script>alert("x")</script> {{config}}', 100),
    'scriptalert("x")/script config',
  );
  assert.equal(sanitizeText("I've allowed ads", 100), "I've allowed ads");
  assert.equal(sanitizeText('a'.repeat(10), 4), 'aaaa');
});

test('defaults survive normalization unchanged', () => {
  assert.deepEqual(normalizeSettings(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  assert.deepEqual(premiumFeaturesUsed(DEFAULT_SETTINGS), []);
});

test('owner text keeps quotes and apostrophes', () => {
  const s = normalizeSettings({ title: `We're "free" because of ads` });
  assert.equal(s.title, `We're "free" because of ads`);
});

test('free plan never receives premium settings', () => {
  const free = applyPlan(premiumSettings, false);
  assert.deepEqual(premiumFeaturesUsed(free), []);
  assert.equal(free.mode, DEFAULT_SETTINGS.mode);
  assert.equal(free.strictMode, false);
  assert.equal(free.showBranding, true);

  const params = toEmbedParameters(premiumSettings, false);
  assert.deepEqual(decodeSettings(params.config), free);
  assert.equal(params.strict, 'off');
  assert.equal(params.nsLock, 'off');
  assert.equal(params.nsBranding, 'on');
});

test('free plan keeps scripts-blocked protection and network detection', () => {
  const params = toEmbedParameters({ ...DEFAULT_SETTINGS, noScriptProtection: true }, false);
  assert.equal(params.noscript, 'on');
  assert.equal(decodeSettings(params.config).networkProbe, true);
});

test('premium plan keeps premium settings', () => {
  const params = toEmbedParameters(premiumSettings, true);
  assert.deepEqual(decodeSettings(params.config), normalizeSettings(premiumSettings));
  assert.equal(params.strict, 'on');
  assert.equal(params.nsLock, 'on');
  assert.equal(params.nsBranding, 'off');
  assert.equal(params.accent, '#FF0000');
  assert.deepEqual(premiumFeaturesUsed(premiumSettings).sort(), [
    'customColors',
    'customText',
    'excludedPaths',
    'frequency',
    'lockMode',
    'removeBranding',
    'strictMode',
  ]);
});

test('disabling protection turns off the no-script and strict fallbacks', () => {
  const params = toEmbedParameters({ ...premiumSettings, enabled: false }, true);
  assert.equal(params.noscript, 'off');
  assert.equal(params.strict, 'off');
});
