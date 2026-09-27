// State management + widget UI (trigger button and panel).
var panelView = 'main';
var panelOpen = false;
var lastFocus = null;

function offValue(id) {
  var k = FEATURES[id].kind;
  return k === 'toggle' ? false : k === 'colors' ? null : 0;
}
function isOn(id) {
  var v = state[id];
  if (FEATURES[id] && FEATURES[id].kind === 'stepper') return !!v && v !== 100;
  if (FEATURES[id] && FEATURES[id].kind === 'colors') return !!v && !!(v.text || v.title || v.bg);
  return !!v;
}
function saveState() { storeSet(STORE_KEY, state); }

/** Set a feature value, apply it, persist. `silent` skips re-render (batch updates). */
function setFeature(id, value, silent) {
  var f = FEATURES[id];
  if (!f || !hasFeature(id)) return;
  if (f.exclusive && value) {
    f.exclusive.forEach(function (x) { if (state[x]) { state[x] = offValue(x); FEATURES[x].apply(state[x]); } });
  }
  state[id] = value;
  try { f.apply(value); } catch (e) { console.error('[a11ytk]', id, e); }
  saveState();
  if (isOn(id)) track('feature:' + id);
  if (!silent) emit('render');
}

function resetAll() {
  Object.keys(FEATURES).forEach(function (id) {
    if (FEATURES[id].kind === 'action') return;
    if (isOn(id)) setFeature(id, offValue(id), true);
  });
  if (typeof stopReading === 'function') stopReading();
  state = {};
  saveState();
  emit('render');
  announce(t('reset'));
  track('reset');
}

function announce(msg) {
  var live = shadow && shadow.querySelector('.live');
  if (!live) return;
  live.textContent = '';
  setTimeout(function () { live.textContent = msg; }, 50);
}

/* ---------- Tiles ---------- */
function levelLabel(f, v) {
  if (Array.isArray(f.levels)) return v ? t(f.levels[v - 1]) : t('off');
  return v ? v + '/' + f.levels : t('off');
}

function tile(id) {
  var f = FEATURES[id];
  var v = state[id] || offValue(id);
  if (f.kind === 'stepper') return stepper(id);
  if (f.kind === 'colors') return colorsBlock(id);

  var pressed = f.kind === 'action' ? (f.active ? f.active() : false) : isOn(id);
  var children = [h('span', { html: ICONS[id] || ICONS.person }), h('span', { text: t(id) })];
  var aria = t(id);
  if (f.kind === 'levels') {
    var n = Array.isArray(f.levels) ? f.levels.length : f.levels;
    var dots = h('span', { class: 'dots', 'aria-hidden': 'true' });
    for (var i = 1; i <= n; i++) dots.appendChild(h('i', { class: i <= v ? 'on' : null }));
    children.push(Array.isArray(f.levels) ? h('span', { class: 'lvl', text: v ? levelLabel(f, v) : '' }) : dots);
    aria += ': ' + levelLabel(f, v);
  }
  return h('button', {
    type: 'button', class: 'tile', 'data-fid': id,
    'aria-pressed': f.kind === 'action' && !f.active ? null : String(pressed),
    'aria-label': aria,
    onclick: function () {
      if (f.kind === 'action') { f.run(); track('action:' + id); emit('render'); return; }
      var next;
      if (f.kind === 'toggle') next = !state[id];
      else {
        var max = Array.isArray(f.levels) ? f.levels.length : f.levels;
        next = ((state[id] || 0) + 1) % (max + 1);
      }
      setFeature(id, next);
      announce(t(id) + ': ' + (f.kind === 'levels' ? levelLabel(f, next) : next ? t('on') : t('off')));
    },
  }, children);
}

function stepper(id) {
  var f = FEATURES[id];
  var v = state[id] || 100;
  var change = function (d) {
    var next = Math.min(f.max, Math.max(f.min, v + d));
    setFeature(id, next === 100 ? 0 : next);
    announce(t(id) + ': ' + next + '%');
  };
  return h('div', { class: 'stepper', role: 'group', 'aria-label': t(id) }, [
    h('span', { class: 'lab' }, [h('span', { html: ICONS[id] }), t(id)]),
    h('button', { type: 'button', 'data-fid': id + '-', 'aria-label': t(id) + ' −', html: ICONS.minus, disabled: v <= f.min, onclick: function () { change(-f.step); } }),
    h('output', { text: v + '%', 'aria-live': 'off' }),
    h('button', { type: 'button', 'data-fid': id + '+', 'aria-label': t(id) + ' +', html: ICONS.plus, disabled: v >= f.max, onclick: function () { change(f.step); } }),
  ]);
}

var PALETTE = ['#000000', '#ffffff', '#1a56db', '#b91c1c', '#15803d', '#a16207', '#7e22ce', '#ffe14d'];
function colorsBlock(id) {
  var v = state[id] || {};
  var wrap = h('div', { class: 'colors', role: 'group', 'aria-label': t(id) });
  wrap.appendChild(h('div', { class: 'lab', style: 'display:flex;gap:8px;align-items:center;font-weight:600' }, [h('span', { html: ICONS[id] }), t(id)]));
  [['text', 'textColor'], ['title', 'titleColor'], ['bg', 'bgColor']].forEach(function (pair) {
    var row = h('div', { class: 'row', role: 'radiogroup', 'aria-label': t(pair[1]) }, [h('span', { text: t(pair[1]) })]);
    PALETTE.forEach(function (c) {
      row.appendChild(h('button', {
        type: 'button', class: 'swatch', style: 'background:' + c, 'data-fid': id + pair[0] + c,
        role: 'radio', 'aria-checked': String(v[pair[0]] === c), 'aria-pressed': String(v[pair[0]] === c), 'aria-label': t(pair[1]) + ' ' + c,
        onclick: function () {
          var next = Object.assign({}, state[id] || {});
          next[pair[0]] = next[pair[0]] === c ? null : c;
          setFeature(id, next);
        },
      }));
    });
    wrap.appendChild(row);
  });
  return wrap;
}

function profileButton(p) {
  var id = p[0];
  var pressed = state.profile === id;
  return h('button', {
    type: 'button', class: 'profile', 'data-fid': id, 'aria-pressed': String(pressed),
    onclick: function () { toggleProfile(id); },
  }, [h('span', { html: ICONS[id] }), h('span', null, [h('b', { text: t(id) }), h('small', { text: t(id + '_d') })])]);
}

/* ---------- Panel ---------- */
function renderPanel() {
  if (!shadow) return;
  var panel = shadow.querySelector('.panel');
  var body = panel.querySelector('.body');
  var active = shadow.activeElement && shadow.activeElement.getAttribute('data-fid');
  var scroll = body.scrollTop;
  body.innerHTML = '';

  panel.querySelector('h2').textContent = t('title');
  panel.querySelector('.close').setAttribute('aria-label', t('close'));
  panel.querySelector('select').setAttribute('aria-label', t('language'));

  if (panelView === 'structure') {
    renderStructure(body);
  } else {
    if (hasFeature('profiles')) {
      body.appendChild(h('h3', { text: t('sectionProfiles') }));
      var pg = h('div', { class: 'profiles' });
      PROFILES.forEach(function (p) { pg.appendChild(profileButton(p)); });
      body.appendChild(pg);
    }
    [['content', 'sectionContent'], ['color', 'sectionColor'], ['orientation', 'sectionOrientation'], ['tools', 'sectionTools']].forEach(function (g) {
      var ids = GROUPS[g[0]].filter(hasFeature);
      if (!ids.length) return;
      body.appendChild(h('h3', { text: t(g[1]) }));
      var grid = h('div', { class: 'grid' });
      ids.forEach(function (id) { grid.appendChild(tile(id)); });
      body.appendChild(grid);
    });
  }
  body.scrollTop = scroll;
  renderFooter(panel.querySelector('.foot'));
  var el = active && shadow.querySelector('[data-fid="' + active + '"]');
  if (el) el.focus();
  else if (active) panel.querySelector('.close').focus();
}

function renderFooter(foot) {
  foot.innerHTML = '';
  foot.appendChild(h('button', { type: 'button', 'data-fid': 'reset', onclick: resetAll }, [h('span', { html: ICONS.reset }), t('reset')]));
  if (CONFIG.ui.statementUrl) {
    foot.appendChild(h('a', { href: CONFIG.ui.statementUrl, target: '_blank', rel: 'noopener' }, [h('span', { html: ICONS.doc }), t('statement')]));
  }
  foot.appendChild(h('button', {
    type: 'button', 'data-fid': 'hide',
    onclick: function () { storeSet(STORE_KEY + ':hidden', true, true); closePanel(); applyTriggerVisibility(); announce(t('hidden')); track('hide'); },
  }, [h('span', { html: ICONS.hide }), t('hide')]));
  if (CONFIG.ui.showBranding) {
    foot.appendChild(h('div', { class: 'brand', text: t('poweredBy') + ' ' + CONFIG.ui.brandName }));
  }
}

function openPanel() {
  if (!shadow) return;
  var panel = shadow.querySelector('.panel');
  lastFocus = document.activeElement;
  panelView = 'main';
  renderPanel();
  panel.hidden = false;
  panelOpen = true;
  shadow.querySelector('.trigger').setAttribute('aria-expanded', 'true');
  panel.querySelector('.close').focus();
  track('open');
}
function closePanel() {
  if (!shadow || !panelOpen) return;
  shadow.querySelector('.panel').hidden = true;
  panelOpen = false;
  var trig = shadow.querySelector('.trigger');
  trig.setAttribute('aria-expanded', 'false');
  if (lastFocus && lastFocus.focus && lastFocus !== document.body) lastFocus.focus();
  else if (trig.style.display !== 'none') trig.focus();
}
function togglePanel() { if (panelOpen) closePanel(); else openPanel(); }

function applyTriggerVisibility() {
  var trig = shadow.querySelector('.trigger');
  var hide = CONFIG.ui.hideTrigger || storeGet(STORE_KEY + ':hidden', false, true) ||
    (CONFIG.ui.hideOnMobile && matchMedia('(max-width: 768px)').matches);
  trig.style.display = hide ? 'none' : '';
}

function positionStyles() {
  var ui = CONFIG.ui;
  var pos = ui.position.split('-');
  var v = pos[0], side = pos[1];
  var s = side + ':' + ui.offsetX + 'px;';
  if (v === 'middle') s += 'top:50%;margin-top:-28px;';
  else s += v + ':' + ui.offsetY + 'px;';
  return { trigger: s, side: side };
}

function buildUI() {
  hostEl = h('div', { id: HOST_ID });
  document.body.appendChild(hostEl);
  shadow = hostEl.attachShadow({ mode: 'open' });
  shadow.appendChild(h('style', { text: widgetCss() }));

  var dark = CONFIG.ui.panelTheme === 'dark' || (CONFIG.ui.panelTheme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  var root = h('div', { class: 'root' + (dark ? ' dark' : ''), dir: RTL_LANGS.indexOf(LANG) !== -1 ? 'rtl' : 'ltr', lang: LANG });
  shadow.appendChild(root);
  var pos = positionStyles();

  var trigger = h('button', {
    type: 'button', class: 'trigger', 'aria-label': t('open'), 'aria-expanded': 'false', 'aria-controls': 'a11ytk-panel',
    title: t('open'), style: pos.trigger, html: ICONS[CONFIG.ui.icon] || ICONS.person, onclick: togglePanel,
  });
  root.appendChild(trigger);

  var langSelect = h('select', {
    onchange: function (e) {
      setLanguage(e.target.value, true).then(function () {
        root.setAttribute('dir', RTL_LANGS.indexOf(LANG) !== -1 ? 'rtl' : 'ltr');
        root.setAttribute('lang', LANG);
      });
    },
  });
  Object.keys(LANGUAGES).forEach(function (k) {
    langSelect.appendChild(h('option', { value: k, text: LANGUAGES[k], selected: k === LANG }));
  });

  var panel = h('div', {
    id: 'a11ytk-panel', class: 'panel ' + pos.side, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'a11ytk-title', hidden: true,
  }, [
    h('div', { class: 'head' }, [
      h('span', { html: ICONS[CONFIG.ui.icon] || ICONS.person }),
      h('h2', { id: 'a11ytk-title', text: t('title') }),
      langSelect,
      h('button', { type: 'button', class: 'icon-btn close', html: ICONS.close, onclick: closePanel }),
    ]),
    h('div', { class: 'body' }),
    h('div', { class: 'foot' }),
  ]);
  root.appendChild(panel);
  root.appendChild(h('div', { class: 'live', role: 'status', 'aria-live': 'polite' }));

  // Keyboard: Esc closes, Tab is trapped inside the dialog.
  panel.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); if (panelView !== 'main') { panelView = 'main'; renderPanel(); panel.querySelector('.close').focus(); } else closePanel(); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(panel.querySelectorAll('button:not([disabled]), select, a[href]'), function (el) { return el.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && shadow.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && shadow.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  applyTriggerVisibility();
  on('render', function () { if (panelOpen) renderPanel(); });
  on('lang', function () {
    trigger.setAttribute('aria-label', t('open'));
    trigger.title = t('open');
    if (panelOpen) renderPanel();
  });
}
