// One-click accessibility profiles: bundles of feature values.
var PROFILES = [
  ['p_seizure', { stopAnimations: true, saturation: 1, muteSounds: true }],
  ['p_vision', { fontSize: 130, contrast: 3, readableFont: true, highlightTitles: true, bigCursor: 1, highlightLinks: true }],
  ['p_adhd', { readingMask: true, stopAnimations: true, saturation: 1, highlightFocus: true }],
  ['p_cognitive', { highlightTitles: true, highlightLinks: true, readingGuide: true, readableFont: true, stopAnimations: true }],
  ['p_keyboard', { keyboardNav: true, highlightFocus: true }],
  ['p_blind', { screenReader: 1, keyboardNav: true, highlightFocus: true }],
  ['p_dyslexia', { dyslexiaFont: true, letterSpacing: 1, lineHeight: 1, wordSpacing: 1, readingGuide: true }],
  ['p_elderly', { fontSize: 140, lineHeight: 1, bigCursor: 1, readableFont: true, highlightLinks: true }],
  ['p_motor', { bigCursor: 1, highlightFocus: true, highlightHover: true, stopAnimations: true, virtualKeyboard: true }],
  ['p_colorblind', { saturation: 2, highlightLinks: true, highlightTitles: true }],
];

function profileValues(id) {
  for (var i = 0; i < PROFILES.length; i++) if (PROFILES[i][0] === id) return PROFILES[i][1];
  return null;
}

function toggleProfile(id) {
  var current = state.profile;
  // Clear values set by the currently active profile.
  if (current) {
    var prev = profileValues(current) || {};
    Object.keys(prev).forEach(function (k) { if (FEATURES[k]) setFeature(k, offValue(k), true); });
  }
  if (current === id) { state.profile = ''; saveState(); emit('render'); return; }
  var vals = profileValues(id) || {};
  Object.keys(vals).forEach(function (k) { if (FEATURES[k] && hasFeature(k)) setFeature(k, vals[k], true); });
  state.profile = id;
  saveState();
  track('profile:' + id.slice(2));
  emit('render');
  announce(t(id) + ': ' + t('on'));
}
