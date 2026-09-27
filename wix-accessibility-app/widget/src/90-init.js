// Boot sequence.
function injectPageCss() {
  if (document.getElementById('a11ytk-style')) return;
  var style = h('style', { id: 'a11ytk-style', text: pageCss() });
  (document.head || ROOT).appendChild(style);
}

function restoreState() {
  var saved = storeGet(STORE_KEY, {});
  state = {};
  Object.keys(saved).forEach(function (id) {
    if (id === 'profile') { state.profile = saved.profile; return; }
    var f = FEATURES[id];
    if (!f || f.kind === 'action' || !hasFeature(id) || !saved[id]) return;
    // Do not auto-start the microphone on page load; browsers require a gesture anyway.
    if (id === 'voiceNav' || id === 'readMode') return;
    state[id] = saved[id];
    try { f.apply(saved[id]); } catch (e) { console.error('[a11ytk]', id, e); }
  });
  saveState();
}

function isExcludedPath() {
  return (CONFIG.excludePaths || []).some(function (p) { return location.pathname.indexOf(p) === 0; });
}

function watchDom() {
  var pending = [];
  var flush = debounce(function () {
    var nodes = pending; pending = [];
    if (state.fontSize && state.fontSize !== 100) {
      nodes.forEach(function (n) { if (n.isConnected) scaleFonts(n); });
    }
    Object.keys(FEATURES).forEach(function (id) { if (FEATURES[id].onMutate && isOn(id)) FEATURES[id].onMutate(); });
    if (CONFIG.autoFix) runAutoFix(document);
  }, 600);
  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var added = muts[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType === 1 && !isOwn(n) && !n.classList.contains('a11ytk-skip')) pending.push(n);
      }
    }
    if (pending.length) flush();
  }).observe(document.body, { childList: true, subtree: true });
}

function watchRoutes() {
  var fire = debounce(function () { emit('route'); }, 1200);
  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    history[m] = function () { var r = orig.apply(this, arguments); fire(); return r; };
  });
  addEventListener('popstate', fire);
  on('route', function () {
    if (panelView === 'structure') { panelView = 'main'; if (panelOpen) renderPanel(); }
    maybeAudit();
  });
}

function globalKeys(e) {
  if (e.key === 'Escape' && panelOpen) { handleEscape(); return; }
  // Screen reader shortcuts: Ctrl+/ toggles text to speech, Ctrl+K pauses/resumes speech.
  if (e.ctrlKey && !e.altKey && !e.metaKey && e.key === '/' && hasFeature('screenReader')) {
    e.preventDefault();
    var next = state.screenReader ? 0 : 1;
    setFeature('screenReader', next);
    if (next) speak(t('screenReader') + ': ' + t('on') + '. ' + t('srHelp'));
    return;
  }
  if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'k' || e.key === 'K') && state.screenReader && window.speechSynthesis) {
    e.preventDefault();
    if (speechSynthesis.paused) speechSynthesis.resume(); else if (speechSynthesis.speaking) speechSynthesis.pause();
    return;
  }
  // Alt+A toggles the panel from anywhere (also when the trigger is hidden).
  if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyA')) {
    e.preventDefault();
    togglePanel();
  }
}

function start() {
  if (!CONFIG || !CONFIG.enabled || isExcludedPath()) return;
  ROOT.style.setProperty('--a11ytk-accent', CONFIG.ui.primaryColor);
  if (CONFIG.customCss) (document.head || ROOT).appendChild(h('style', { id: 'a11ytk-custom', text: CONFIG.customCss }));
  setLanguage(detectLanguage()).then(function () {
    buildUI();
    restoreState();
    document.addEventListener('keydown', globalKeys);
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href="#accessibility"], [data-a11ytk-open]');
      if (a) { e.preventDefault(); openPanel(); }
    });
    var afterLoad = function () {
      setTimeout(function () {
        maybeAudit();
        if (CONFIG.autoFix) runAutoFix(document);
        watchDom();
        watchRoutes();
      }, 1200);
    };
    if (document.readyState === 'complete') afterLoad(); else addEventListener('load', afterLoad);
    if (Math.random() < 0.1) track('load', 10); // sampled page-view counter
    addEventListener('pagehide', flushCounters);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushCounters(); });
    setInterval(flushCounters, 60000);
    // Expose a tiny API for site owners (e.g. a custom "Accessibility" button).
    window.A11yToolkit = { open: openPanel, close: closePanel, reset: resetAll, version: VERSION };
  });
}

function boot() {
  injectPageCss();
  var cacheKey = STORE_KEY + ':cfg';
  var noCache = SCRIPT.hasAttribute('data-nocache');
  var cached = noCache ? null : storeGet(cacheKey, null, true);
  if (cached && cached.t > Date.now() - 5 * 60 * 1000) { CONFIG = cached.c; start(); return; }
  fetch(BASE + '/api/widget/config?i=' + encodeURIComponent(INSTANCE) + (noCache ? '&t=' + Date.now() : ''))
    .then(function (r) { if (!r.ok) throw new Error('config ' + r.status); return r.json(); })
    .then(function (cfg) { CONFIG = cfg; storeSet(cacheKey, { t: Date.now(), c: cfg }, true); start(); })
    .catch(function (e) { console.warn('[a11ytk] disabled:', e.message); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
