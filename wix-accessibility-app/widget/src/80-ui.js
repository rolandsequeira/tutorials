// State management + widget UI (trigger button and panel).
var panelView = 'main';
var uiPrefs = null; // visitor UI preferences: { big: bool, side: 'left'|'right' }
function getUiPrefs() { if (!uiPrefs) uiPrefs = storeGet(STORE_KEY + ':ui', {}) || {}; return uiPrefs; }
function saveUiPrefs() { storeSet(STORE_KEY + ':ui', uiPrefs); }
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
      if (f.afterClick) f.afterClick(next);
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
  } else if (panelView === 'report') {
    renderReport(body);
  } else {
    var big = !!getUiPrefs().big;
    body.appendChild(h('div', { class: 'switchrow' }, [
      h('span', { id: 'a11ytk-big', text: t('oversize') }),
      h('button', {
        type: 'button', role: 'switch', class: 'sw', 'data-fid': 'oversize', 'aria-checked': String(big), 'aria-labelledby': 'a11ytk-big',
        onclick: function () { uiPrefs.big = !big; saveUiPrefs(); applyUiPrefs(); renderPanel(); track('ui:oversize'); },
      }),
    ]));
    if (hasFeature('profiles')) {
      body.appendChild(h('h3', { text: t('sectionProfiles') }));
      var pg = h('div', { class: 'profiles' });
      PROFILES.forEach(function (p) { pg.appendChild(profileButton(p)); });
      body.appendChild(pg);
    }
    [['content', 'sectionContent'], ['color', 'sectionColor'], ['orientation', 'sectionOrientation'], ['tools', 'sectionTools']].forEach(function (g) {
      var ids = GROUPS[g[0]].filter(hasFeature).sort(function (a, b) { return CONFIG.features.indexOf(a) - CONFIG.features.indexOf(b); });
      if (!ids.length) return;
      body.appendChild(h('h3', { text: t(g[1]) }));
      var grid = h('div', { class: 'grid' });
      ids.forEach(function (id) { grid.appendChild(tile(id)); });
      body.appendChild(grid);
      if (g[0] === 'tools' && isOn('screenReader') && window.speechSynthesis) body.appendChild(voicePicker());
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
  foot.appendChild(h('button', { type: 'button', 'data-fid': 'move', onclick: moveWidget }, [h('span', { html: ICONS.move }), t('moveWidget')]));
  foot.appendChild(h('button', {
    type: 'button', 'data-fid': 'report',
    onclick: function () { panelView = 'report'; renderPanel(); var ta = shadow.querySelector('.form textarea'); if (ta) ta.focus(); },
  }, [h('span', { html: ICONS.flag }), t('reportProblem')]));
  foot.appendChild(h('button', {
    type: 'button', 'data-fid': 'hide',
    onclick: function () { storeSet(STORE_KEY + ':hidden', true, true); closePanel(); applyTriggerVisibility(); announce(t('hidden')); track('hide'); },
  }, [h('span', { html: ICONS.hide }), t('hide')]));
  if (CONFIG.ui.showBranding) {
    var brand = h('div', { class: 'brand' }, [t('poweredBy') + ' ']);
    brand.appendChild(CONFIG.ui.brandUrl
      ? h('a', { href: CONFIG.ui.brandUrl, target: '_blank', rel: 'noopener', text: CONFIG.ui.brandName })
      : document.createTextNode(CONFIG.ui.brandName));
    foot.appendChild(brand);
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
  var v = pos[0], side = getUiPrefs().side || pos[1];
  var s = side + ':' + ui.offsetX + 'px;';
  if (v === 'middle') s += 'top:50%;margin-top:-28px;';
  else s += v + ':' + ui.offsetY + 'px;';
  return { trigger: s, side: side };
}

function applyUiPrefs() {
  var root = shadow.querySelector('.root');
  root.classList.toggle('big', !!getUiPrefs().big);
  var pos = positionStyles();
  var trig = shadow.querySelector('.trigger');
  var display = trig.style.display;
  trig.setAttribute('style', pos.trigger);
  trig.style.display = display;
  var panel = shadow.querySelector('.panel');
  panel.classList.toggle('left', pos.side === 'left');
  panel.classList.toggle('right', pos.side === 'right');
}

function moveWidget() {
  uiPrefs.side = positionStyles().side === 'left' ? 'right' : 'left';
  saveUiPrefs();
  applyUiPrefs();
  track('ui:move');
}

function voicePicker() {
  var base = (ROOT.lang || LANG || 'en').slice(0, 2).toLowerCase();
  var voices = speechSynthesis.getVoices().filter(function (v) { return v.lang.toLowerCase().indexOf(base) === 0; });
  var sel = h('select', {
    id: 'a11ytk-voice', 'data-fid': 'voice',
    onchange: function (e) { uiPrefs.voice = e.target.value || null; saveUiPrefs(); speak(t('screenReader')); },
  }, [h('option', { value: '', text: 'Auto' })]);
  voices.forEach(function (v) { sel.appendChild(h('option', { value: v.voiceURI, text: v.name, selected: getUiPrefs().voice === v.voiceURI })); });
  return h('div', { class: 'switchrow', style: 'margin-top:8px' }, [h('label', { for: 'a11ytk-voice', text: t('voice') }), sel]);
}

/* ---------- Report a problem ---------- */
function renderReport(container) {
  container.appendChild(h('button', {
    type: 'button', class: 'icon-btn', style: 'background:var(--card);color:var(--fg);width:auto;padding:0 12px;gap:6px', 'data-fid': 'back',
    onclick: function () { panelView = 'main'; renderPanel(); shadow.querySelector('.panel .close').focus(); },
  }, [h('span', { html: ICONS.back }), t('back')]));
  var status = h('p', { role: 'status' });
  var form = h('form', { class: 'form sub' }, [
    h('h3', { text: t('reportProblem') }),
    h('label', { for: 'a11ytk-rp-msg', text: t('reportDesc') }),
    h('textarea', { id: 'a11ytk-rp-msg', name: 'message', rows: '5', required: true, maxlength: '2000' }),
    h('label', { for: 'a11ytk-rp-email', text: t('reportEmail') }),
    h('input', { id: 'a11ytk-rp-email', name: 'email', type: 'email', maxlength: '200', autocomplete: 'email' }),
    h('button', { type: 'submit', class: 'send', text: t('reportSend') }),
    status,
  ]);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = form.elements.message.value.trim();
    if (!msg) return;
    form.querySelector('.send').disabled = true;
    fetch(BASE + '/api/widget/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ i: INSTANCE, page: location.href, message: msg, email: form.elements.email.value.trim(), lang: LANG, prefs: Object.keys(state).filter(isOnSafe) }),
    }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      form.elements.message.value = '';
      status.textContent = t('reportThanks');
      track('report:sent');
    }).catch(function () {
      status.textContent = t('reportFail');
    }).then(function () { form.querySelector('.send').disabled = false; form.elements.message.focus(); });
  });
  container.appendChild(form);
}
function handleEscape() {
  var panel = shadow.querySelector('.panel');
  if (panelView !== 'main') { panelView = 'main'; renderPanel(); panel.querySelector('.close').focus(); }
  else closePanel();
}
function isOnSafe(id) { return FEATURES[id] ? isOn(id) : false; }

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
    title: t('open'), style: pos.trigger, html: ICONS[CONFIG.ui.icon] || ICONS.lumaccess, onclick: togglePanel,
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
      h('span', { html: ICONS[CONFIG.ui.icon] || ICONS.lumaccess }),
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
    if (e.key === 'Escape') { e.stopPropagation(); handleEscape(); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(panel.querySelectorAll('button:not([disabled]), select, a[href]'), function (el) { return el.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && shadow.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && shadow.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  applyTriggerVisibility();
  applyUiPrefs();
  on('render', function () { if (panelOpen) renderPanel(); });
  on('lang', function () {
    trigger.setAttribute('aria-label', t('open'));
    trigger.title = t('open');
    if (panelOpen) renderPanel();
  });
}
