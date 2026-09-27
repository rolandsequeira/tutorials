// Color-blindness correction, content scaling, smart contrast, read mode,
// talk & type (dictation) and sign language (VLibras).

/* ---------- Color blindness correction (daltonization via SVG filters on <html>) ---------- */
// Simulation matrices (Viénot et al.) used to compute daltonization matrices:
// D = I + E·(I − S), where E shifts the lost information into visible channels.
var CB_SIM = {
  protanopia: [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]],
  deuteranopia: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]],
  tritanopia: [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]],
};
var CB_SHIFT = [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]];
var CB_TYPES = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];

function daltonizeMatrix(sim) {
  var d = [];
  for (var r = 0; r < 3; r++) {
    d.push([]);
    for (var c = 0; c < 3; c++) {
      var acc = 0;
      for (var k = 0; k < 3; k++) acc += CB_SHIFT[r][k] * ((k === c ? 1 : 0) - sim[k][c]);
      d[r].push((r === c ? 1 : 0) + acc);
    }
  }
  return d;
}

function ensureCbFilters() {
  if (document.getElementById('a11ytk-cb-svg')) return;
  var ns = 'http://www.w3.org/2000/svg';
  var svgEl = document.createElementNS(ns, 'svg');
  svgEl.setAttribute('id', 'a11ytk-cb-svg');
  svgEl.setAttribute('aria-hidden', 'true');
  svgEl.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  var defs = document.createElementNS(ns, 'defs');
  Object.keys(CB_SIM).forEach(function (type) {
    var m = daltonizeMatrix(CB_SIM[type]);
    var f = document.createElementNS(ns, 'filter');
    f.setAttribute('id', 'a11ytk-cb-' + type);
    f.setAttribute('color-interpolation-filters', 'linearRGB');
    var fm = document.createElementNS(ns, 'feColorMatrix');
    fm.setAttribute('type', 'matrix');
    fm.setAttribute('values', m.map(function (row) { return row.map(function (v) { return v.toFixed(3); }).join(' ') + ' 0 0'; }).join(' ') + ' 0 0 0 1 0');
    f.appendChild(fm);
    defs.appendChild(f);
  });
  // Achromatopsia: grayscale with a contrast boost so shapes stay distinct.
  var a = document.createElementNS(ns, 'filter');
  a.setAttribute('id', 'a11ytk-cb-achromatopsia');
  a.innerHTML = '<feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="1.25" intercept="-0.12"/><feFuncG type="linear" slope="1.25" intercept="-0.12"/><feFuncB type="linear" slope="1.25" intercept="-0.12"/></feComponentTransfer>';
  defs.appendChild(a);
  svgEl.appendChild(defs);
  document.body.appendChild(svgEl);
}

feature('colorBlind', 'color', {
  kind: 'levels', levels: ['l_protanopia', 'l_deuteranopia', 'l_tritanopia', 'l_achromatopsia'],
  apply: function (v) {
    if (!v) { ROOT.style.removeProperty('filter'); return; }
    ensureCbFilters();
    // Root-element filters do not break position:fixed (spec exception for the root).
    ROOT.style.setProperty('filter', 'url(#a11ytk-cb-' + CB_TYPES[v - 1] + ')', 'important');
  },
});

/* ---------- Content scaling (zooms layout, not just text) ---------- */
feature('contentScale', 'content', {
  kind: 'stepper', min: 80, max: 150, step: 10,
  apply: function (v) {
    var on = v && v !== 100;
    setClass('zoom', on);
    if (on) ROOT.style.setProperty('--a11ytk-zoom', String(v / 100)); else ROOT.style.removeProperty('--a11ytk-zoom');
  },
});

/* ---------- Smart contrast: repair only the text that fails WCAG contrast ---------- */
var scTouched = new Set();
function applySmartContrast() {
  var body = document.body;
  var walker = document.createTreeWalker(body, NodeFilter.SHOW_ELEMENT, {
    acceptNode: function (n) {
      if (n.id === HOST_ID || SKIP_TAGS.test(n.tagName.toUpperCase())) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  var fixes = [];
  var checked = 0;
  while (walker.nextNode() && checked < 3000) {
    var el = walker.currentNode;
    if (scTouched.has(el) || !hasOwnText(el)) continue;
    checked++;
    var cs = getComputedStyle(el);
    var fg = parseColor(cs.color);
    var bg = effectiveBg(el);
    if (!fg || !bg) continue;
    var size = parseFloat(cs.fontSize);
    var large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    if (contrastRatio(fg, bg) >= (large ? 3 : 4.5)) continue;
    var dark = { r: 0, g: 0, b: 0 }, light = { r: 255, g: 255, b: 255 };
    fixes.push([el, contrastRatio(dark, bg) >= contrastRatio(light, bg) ? '#000000' : '#ffffff', el.style.getPropertyValue('color'), el.style.getPropertyPriority('color')]);
  }
  fixes.forEach(function (f) {
    f[0].__a11ytkColor = [f[2], f[3]];
    f[0].style.setProperty('color', f[1], 'important');
    scTouched.add(f[0]);
  });
}
function clearSmartContrast() {
  scTouched.forEach(function (el) {
    var o = el.__a11ytkColor || ['', ''];
    if (o[0]) el.style.setProperty('color', o[0], o[1]); else el.style.removeProperty('color');
  });
  scTouched.clear();
}
feature('smartContrast', 'color', {
  kind: 'toggle',
  apply: function (v) { if (v) applySmartContrast(); else clearSmartContrast(); },
  onMutate: applySmartContrast,
});

/* ---------- Read mode: distraction-free view of the main content ---------- */
var readModeSize = 20;
function buildReadMode() {
  var main = document.querySelector('main, [role=main], #PAGES_CONTAINER, #SITE_PAGES') || document.body;
  var box = layer('readmode', 'readmode');
  box.setAttribute('aria-hidden', 'false');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', t('readMode'));
  box.innerHTML = '';
  var bar = h('div', { class: 'rm-bar' }, [
    h('strong', { text: t('readMode') }),
    h('button', { type: 'button', 'aria-label': t('fontSize') + ' −', html: ICONS.minus, onclick: function () { readModeSize = Math.max(14, readModeSize - 2); art.style.fontSize = readModeSize + 'px'; } }),
    h('button', { type: 'button', 'aria-label': t('fontSize') + ' +', html: ICONS.plus, onclick: function () { readModeSize = Math.min(40, readModeSize + 2); art.style.fontSize = readModeSize + 'px'; } }),
    h('button', { type: 'button', class: 'rm-close', 'aria-label': t('close'), html: ICONS.close, onclick: function () { setFeature('readMode', false); } }),
  ]);
  var art = h('article', { class: 'rm-body', lang: ROOT.lang || null });
  art.style.fontSize = readModeSize + 'px';
  art.appendChild(h('h1', { text: document.title }));
  var seen = new Set();
  main.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,img[alt]:not([alt=""]),a[href]').forEach(function (n) {
    if (isOwn(n) || !isVisible(n)) return;
    for (var a = n.parentElement; a; a = a.parentElement) if (seen.has(a)) return;
    var tag = n.tagName;
    if (tag === 'IMG' && badAlt(n)) return;
    if (tag === 'IMG') { art.appendChild(h('p', { class: 'rm-img', text: '🖼 ' + n.getAttribute('alt') })); return; }
    if (tag === 'A' && n.closest('p,li,h1,h2,h3,h4,h5,h6')) return; // included through its parent
    var text = textOf(n);
    if (!text || text.length < 2) return;
    seen.add(n);
    if (/^H[1-6]$/.test(tag)) art.appendChild(h(tag === 'H1' ? 'h2' : 'h3', { text: text }));
    else if (tag === 'LI') art.appendChild(h('p', { class: 'rm-li', text: '• ' + text }));
    else if (tag === 'A') art.appendChild(h('p', null, [h('a', { href: n.href, text: text })]));
    else art.appendChild(h('p', { text: text }));
  });
  box.appendChild(bar);
  box.appendChild(art);
  box.addEventListener('keydown', function (e) { if (e.key === 'Escape') setFeature('readMode', false); });
  document.documentElement.style.overflow = 'hidden';
  closePanel();
  setTimeout(function () { var c = box.querySelector('.rm-close'); if (c) c.focus(); }, 50);
}
feature('readMode', 'orientation', {
  kind: 'toggle',
  apply: function (v) {
    if (v) buildReadMode();
    else { removeLayer('readmode'); document.documentElement.style.overflow = ''; }
  },
});

/* ---------- Talk & Type: dictate into the focused form field ---------- */
var dictation = null;
function isTextField(el) {
  return el && ((el.tagName === 'INPUT' && /^(text|email|search|tel|url|number|)$/.test(el.type)) || el.tagName === 'TEXTAREA' || el.isContentEditable);
}
function stopDictation() {
  if (dictation) { dictation.onend = null; try { dictation.stop(); } catch (e) { /* ignore */ } dictation = null; }
  removeLayer('talk');
}
function startDictation(target) {
  stopDictation();
  if (!Recognition) { announce(t('voiceUnsupported')); return; }
  dictation = new Recognition();
  dictation.lang = ROOT.lang || navigator.language || 'en-US';
  dictation.continuous = true;
  dictation.interimResults = false;
  var b = layer('talk', 'bubble');
  b.setAttribute('aria-hidden', 'false');
  b.innerHTML = '';
  b.appendChild(h('span', { html: ICONS.talkType }));
  b.appendChild(h('span', { role: 'status', text: t('talkListening') }));
  b.appendChild(h('button', { type: 'button', text: t('stop'), onmousedown: function (e) { e.preventDefault(); }, onclick: stopDictation }));
  dictation.onresult = function (e) {
    var res = e.results[e.results.length - 1];
    if (!res.isFinal) return;
    var said = res[0].transcript.trim();
    if (!said) return;
    var prev = kbTarget;
    kbTarget = target;
    var v = target.isContentEditable ? target.textContent : target.value;
    kbInsert((v && !/\s$/.test(v) ? ' ' : '') + said);
    kbTarget = prev;
    track('talk:ok');
  };
  dictation.onend = function () { if (dictation && document.activeElement === target) { try { dictation.start(); } catch (e) { /* ignore */ } } else stopDictation(); };
  dictation.onerror = function (e) { if (e.error === 'not-allowed') { stopDictation(); announce(t('voiceUnsupported')); } };
  try { dictation.start(); } catch (e) { /* ignore */ }
}
function talkFocus(e) { if (!isOwn(e.target) && isTextField(e.target)) startDictation(e.target); }
function talkBlur(e) { if (dictation && !isOwn(e.relatedTarget)) setTimeout(function () { if (!isTextField(document.activeElement)) stopDictation(); }, 150); }
feature('talkType', 'tools', {
  kind: 'toggle',
  apply: function (v) {
    document.removeEventListener('focusin', talkFocus, true);
    document.removeEventListener('focusout', talkBlur, true);
    if (v) {
      if (!Recognition) { announce(t('voiceUnsupported')); return; }
      document.addEventListener('focusin', talkFocus, true);
      document.addEventListener('focusout', talkBlur, true);
    } else stopDictation();
  },
});

/* ---------- Sign language (VLibras, Brazilian Sign Language) ---------- */
var vlibrasLoaded = false;
feature('signLanguage', 'tools', {
  kind: 'toggle',
  apply: function (v) {
    var wrap = document.getElementById('a11ytk-vlibras');
    if (!v) { if (wrap) wrap.style.display = 'none'; return; }
    if (wrap) { wrap.style.display = ''; return; }
    wrap = h('div', { id: 'a11ytk-vlibras', vw: '', class: 'enabled' });
    wrap.innerHTML = '<div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>';
    document.body.appendChild(wrap);
    if (vlibrasLoaded) return;
    vlibrasLoaded = true;
    var s = document.createElement('script');
    s.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
    s.onload = function () { try { new window.VLibras.Widget('https://vlibras.gov.br/app'); } catch (e) { console.warn('[a11ytk] VLibras', e); } };
    document.body.appendChild(s);
  },
});
