// i18n: English is built in; other languages load from /i18n/<lang>.json.
var EN = {
  title: 'Accessibility',
  open: 'Open accessibility menu (Alt+A)',
  close: 'Close',
  language: 'Language',
  reset: 'Reset settings',
  statement: 'Accessibility statement',
  hide: 'Hide interface',
  hidden: 'Accessibility menu hidden. Press Alt+A to open it again.',
  poweredBy: 'Powered by',
  sectionProfiles: 'Accessibility profiles',
  sectionContent: 'Content adjustments',
  sectionColor: 'Color adjustments',
  sectionOrientation: 'Orientation & navigation',
  sectionTools: 'Assistive tools',
  on: 'On', off: 'Off',
  // profiles
  p_seizure: 'Seizure safe', p_seizure_d: 'Stops flashes and reduces color',
  p_vision: 'Vision impaired', p_vision_d: 'Enhances the website visuals',
  p_adhd: 'ADHD friendly', p_adhd_d: 'Less distraction, more focus',
  p_cognitive: 'Cognitive disability', p_cognitive_d: 'Helps with reading and focusing',
  p_keyboard: 'Keyboard navigation', p_keyboard_d: 'Use the site with the keyboard',
  p_blind: 'Blind users', p_blind_d: 'Screen reader support',
  p_dyslexia: 'Dyslexia friendly', p_dyslexia_d: 'Easier-to-read font and spacing',
  p_elderly: 'Older adults', p_elderly_d: 'Bigger text and cursor',
  p_motor: 'Motor impaired', p_motor_d: 'Easier pointing and typing',
  p_colorblind: 'Color blind', p_colorblind_d: 'Stronger colors and link cues',
  // features
  fontSize: 'Text size',
  lineHeight: 'Line height',
  letterSpacing: 'Letter spacing',
  wordSpacing: 'Word spacing',
  textAlign: 'Text alignment',
  readableFont: 'Readable font',
  dyslexiaFont: 'Dyslexia font',
  highlightTitles: 'Highlight titles',
  highlightLinks: 'Highlight links',
  textMagnifier: 'Text magnifier',
  contrast: 'Contrast',
  saturation: 'Saturation',
  customColors: 'Custom colors',
  textColor: 'Text', titleColor: 'Titles', bgColor: 'Background',
  bigCursor: 'Big cursor',
  readingGuide: 'Reading guide',
  readingMask: 'Reading mask',
  stopAnimations: 'Stop animations',
  hideImages: 'Hide images',
  muteSounds: 'Mute sounds',
  highlightFocus: 'Highlight focus',
  highlightHover: 'Highlight hover',
  imageDescriptions: 'Image descriptions',
  keyboardNav: 'Keyboard shortcuts',
  pageStructure: 'Page structure',
  screenReader: 'Text to speech',
  readPage: 'Read page aloud',
  voiceNav: 'Voice navigation',
  virtualKeyboard: 'Virtual keyboard',
  dictionary: 'Dictionary',
  // levels
  l_left: 'Left', l_center: 'Center', l_right: 'Right', l_justify: 'Justify',
  l_dark: 'Dark', l_light: 'Light', l_high: 'High', l_invert: 'Inverted',
  l_low: 'Low', l_mono: 'Monochrome',
  l_black: 'Black', l_white: 'White',
  l_normal: 'Normal', l_fast: 'Fast', l_slow: 'Slow',
  // misc
  headings: 'Headings', landmarks: 'Landmarks', links: 'Links', none: 'Nothing found',
  back: 'Back',
  noAlt: 'No description available',
  listening: 'Listening…',
  voiceHelp: 'Say: "scroll down", "go to top", "next heading", "show numbers", "click 3", "click contact", "go back", "stop listening".',
  voiceUnsupported: 'Voice navigation is not supported in this browser.',
  speechUnsupported: 'Text to speech is not supported in this browser.',
  dictLoading: 'Looking up…',
  dictNotFound: 'No definition found.',
  dictMore: 'More on Wiktionary',
  skipToContent: 'Skip to main content',
  opensNewTab: '(opens in a new tab)',
  stop: 'Stop',
  shortcutsHelp: 'Alt+H next heading, Alt+L next link, Alt+F next form field, Alt+B next button, Alt+M main content. Add Shift to go back.',
  space: 'Space', enter: 'Enter', shift: 'Shift', backspace: 'Delete',
};

var LANG = 'en';
var STRINGS = EN;
var RTL_LANGS = ['ar', 'he', 'fa', 'ur'];
var LANGUAGES = {
  en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano', pt: 'Português',
  nl: 'Nederlands', pl: 'Polski', tr: 'Türkçe', ru: 'Русский', ar: 'العربية', he: 'עברית',
  hi: 'हिन्दी', zh: '中文', ja: '日本語',
};

function t(key) { return STRINGS[key] || EN[key] || key; }

function detectLanguage() {
  var saved = storeGet(STORE_KEY + ':lang', null);
  if (saved && LANGUAGES[saved]) return saved;
  var cfgLang = CONFIG && CONFIG.ui.language;
  if (cfgLang && cfgLang !== 'auto' && LANGUAGES[cfgLang]) return cfgLang;
  var cands = [ROOT.lang, navigator.language].concat(navigator.languages || []);
  for (var i = 0; i < cands.length; i++) {
    var c = (cands[i] || '').slice(0, 2).toLowerCase();
    if (LANGUAGES[c]) return c;
  }
  return 'en';
}

function setLanguage(lang, persist) {
  if (persist) storeSet(STORE_KEY + ':lang', lang);
  LANG = lang;
  if (lang === 'en') { STRINGS = EN; emit('lang'); return Promise.resolve(); }
  return fetch(BASE + '/i18n/' + lang + '.json')
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (json) { STRINGS = json; emit('lang'); })
    .catch(function () { STRINGS = EN; emit('lang'); });
}
