// Feature registry + visual/content adjustments.
var FEATURES = {};
var GROUPS = { content: [], color: [], orientation: [], tools: [] };

/**
 * kind: 'toggle' (boolean) | 'levels' (0..levels.length, 0 = off) | 'stepper' | 'colors' | 'action'
 */
function feature(id, group, def) {
  def.id = id;
  def.group = group;
  FEATURES[id] = def;
  GROUPS[group].push(id);
}

function setClass(name, onOff) { ROOT.classList.toggle('a11ytk-' + name, !!onOff); }
function setLevelClass(prefix, value, max) {
  for (var i = 1; i <= max; i++) ROOT.classList.toggle('a11ytk-' + prefix + '-' + i, value === i);
}

// Overlay layers inside the shadow root.
var layers = {};
function layer(name, cls) {
  if (!layers[name]) {
    layers[name] = h('div', { class: cls || name, 'aria-hidden': 'true' });
    shadow.querySelector('.root').appendChild(layers[name]);
  }
  return layers[name];
}
function removeLayer(name) {
  if (layers[name]) { layers[name].remove(); delete layers[name]; }
}

// Pointer tracking shared by guide / mask / magnifier / hover features.
var pointer = { x: 0, y: 0 };
var pointerHandlers = [];
document.addEventListener('mousemove', function (e) {
  pointer.x = e.clientX; pointer.y = e.clientY;
  for (var i = 0; i < pointerHandlers.length; i++) pointerHandlers[i](e);
}, { passive: true });
function onPointer(fn, enable) {
  var i = pointerHandlers.indexOf(fn);
  if (enable && i === -1) pointerHandlers.push(fn);
  if (!enable && i !== -1) pointerHandlers.splice(i, 1);
}

/* ---------- Text size (per-element scaling; works with Wix px-based typography) ---------- */
var fsOrig = new WeakMap();
var fsTouched = new Set();
var SKIP_TAGS = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|IFRAME|SVG|PATH|IMG|VIDEO|CANVAS|BR|HR|META|LINK)$/;

function hasOwnText(el) {
  for (var n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 3 && /\S/.test(n.nodeValue)) return true;
  }
  return /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName);
}

function scaleFonts(root) {
  var scale = (state.fontSize || 100) / 100;
  if (scale === 1) {
    fsTouched.forEach(function (el) {
      var o = fsOrig.get(el);
      if (!o) return;
      el.style.setProperty('font-size', o.inFs, o.inFsP);
      el.style.setProperty('line-height', o.inLh, o.inLhP);
      if (!o.inFs) el.style.removeProperty('font-size');
      if (!o.inLh) el.style.removeProperty('line-height');
    });
    fsTouched.clear();
    return;
  }
  root = root || document.body;
  var els = [];
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode: function (n) {
      if (n.id === HOST_ID || SKIP_TAGS.test(n.tagName.toUpperCase())) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  if (root.nodeType === 1 && hasOwnText(root)) els.push(root);
  while (walker.nextNode()) if (hasOwnText(walker.currentNode)) els.push(walker.currentNode);

  // Read phase (avoid layout thrash), then write phase.
  var fresh = [];
  els.forEach(function (el) {
    if (fsOrig.has(el)) return;
    var cs = getComputedStyle(el);
    var fs = parseFloat(cs.fontSize);
    var anc = el.parentElement;
    while (anc && !fsTouched.has(anc)) anc = anc.parentElement;
    if (anc) {
      // New node under an already scaled ancestor: undo inherited scaling.
      var ao = fsOrig.get(anc);
      if (Math.abs(fs - ao.fs * scale) < 0.5) fs = ao.fs;
    }
    fresh.push([el, {
      fs: fs,
      lh: /px$/.test(cs.lineHeight) ? parseFloat(cs.lineHeight) : null,
      inFs: el.style.getPropertyValue('font-size'), inFsP: el.style.getPropertyPriority('font-size'),
      inLh: el.style.getPropertyValue('line-height'), inLhP: el.style.getPropertyPriority('line-height'),
    }]);
  });
  fresh.forEach(function (p) { fsOrig.set(p[0], p[1]); });
  els.forEach(function (el) {
    var o = fsOrig.get(el);
    if (!o || !o.fs) return;
    el.style.setProperty('font-size', (o.fs * scale).toFixed(2) + 'px', 'important');
    if (o.lh && !state.lineHeight) el.style.setProperty('line-height', (o.lh * scale).toFixed(2) + 'px', 'important');
    else if (state.lineHeight) el.style.removeProperty('line-height');
    fsTouched.add(el);
  });
}

feature('fontSize', 'content', { kind: 'stepper', min: 80, max: 200, step: 10, apply: function () { scaleFonts(); } });
feature('lineHeight', 'content', { kind: 'levels', levels: 3, apply: function (v) { setLevelClass('lh', v, 3); if (state.fontSize && state.fontSize !== 100) { scaleFonts(); } } });
feature('letterSpacing', 'content', { kind: 'levels', levels: 3, apply: function (v) { setLevelClass('ls', v, 3); } });
feature('wordSpacing', 'content', { kind: 'levels', levels: 3, apply: function (v) { setLevelClass('ws', v, 3); } });
feature('textAlign', 'content', { kind: 'levels', levels: ['l_left', 'l_center', 'l_right', 'l_justify'], apply: function (v) { setLevelClass('align', v, 4); } });

var fontLinkAdded = false;
feature('readableFont', 'content', {
  kind: 'toggle', exclusive: ['dyslexiaFont'],
  apply: function (v) {
    if (v && !fontLinkAdded) {
      fontLinkAdded = true;
      document.head.appendChild(h('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap' }));
    }
    setClass('readable', v);
  },
});
feature('dyslexiaFont', 'content', { kind: 'toggle', exclusive: ['readableFont'], apply: function (v) { setClass('dyslexic', v); } });
feature('highlightTitles', 'content', { kind: 'toggle', apply: function (v) { setClass('htitles', v); } });
feature('highlightLinks', 'content', { kind: 'toggle', apply: function (v) { setClass('hlinks', v); } });

/* ---------- Text magnifier ---------- */
var magnifierTarget = null;
function magnifierMove(e) {
  var el = e.target;
  if (isOwn(el)) { removeLayer('mag'); return; }
  while (el && el !== document.body && !hasOwnText(el)) el = el.parentElement;
  if (!el || el === document.body) { removeLayer('mag'); magnifierTarget = null; return; }
  if (el !== magnifierTarget) {
    magnifierTarget = el;
    var txt = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? (el.value || el.placeholder) : textOf(el, 300);
    if (!txt) { removeLayer('mag'); return; }
    layer('mag', 'tip').textContent = txt;
  }
  var tip = layers.mag;
  if (!tip) return;
  var x = Math.min(e.clientX + 16, innerWidth - tip.offsetWidth - 8);
  var y = e.clientY + 24 + tip.offsetHeight > innerHeight ? e.clientY - tip.offsetHeight - 16 : e.clientY + 24;
  tip.style.left = Math.max(8, x) + 'px';
  tip.style.top = Math.max(8, y) + 'px';
}
feature('textMagnifier', 'content', {
  kind: 'toggle',
  apply: function (v) { onPointer(magnifierMove, v); if (!v) { removeLayer('mag'); magnifierTarget = null; } },
});

/* ---------- Color: contrast / saturation via a backdrop-filter overlay ---------- */
function updateFilter() {
  var f = [];
  if (state.contrast === 3) f.push('contrast(1.6)');
  if (state.contrast === 4) f.push('invert(1) hue-rotate(180deg)');
  if (state.saturation === 1) f.push('saturate(0.4)');
  if (state.saturation === 2) f.push('saturate(2)');
  if (state.saturation === 3) f.push('grayscale(1)');
  if (!f.length) { removeLayer('filter'); return; }
  var el = layer('filter');
  el.style.backdropFilter = f.join(' ');
  el.style.webkitBackdropFilter = f.join(' ');
}
feature('contrast', 'color', {
  kind: 'levels', levels: ['l_dark', 'l_light', 'l_high', 'l_invert'],
  apply: function (v) { setLevelClass('contrast', v, 2); updateFilter(); },
});
feature('saturation', 'color', {
  kind: 'levels', levels: ['l_low', 'l_high', 'l_mono'],
  apply: function () { updateFilter(); },
});
feature('customColors', 'color', {
  kind: 'colors',
  apply: function (v) {
    v = v || {};
    ['text', 'title', 'bg'].forEach(function (k) {
      var cls = { text: 'ctext', title: 'ctitle', bg: 'cbg' }[k];
      if (v[k]) ROOT.style.setProperty('--a11ytk-' + cls, v[k]); else ROOT.style.removeProperty('--a11ytk-' + cls);
      setClass(cls, !!v[k]);
    });
  },
});

/* ---------- Orientation ---------- */
feature('bigCursor', 'orientation', { kind: 'levels', levels: ['l_black', 'l_white'], apply: function (v) { setLevelClass('cursor', v, 2); } });

function guideMove(e) { if (layers.guide) layers.guide.style.top = e.clientY + 'px'; }
feature('readingGuide', 'orientation', {
  kind: 'toggle', exclusive: ['readingMask'],
  apply: function (v) {
    onPointer(guideMove, v);
    if (v) { layer('guide').style.top = pointer.y + 'px'; } else removeLayer('guide');
  },
});

function maskMove(e) {
  var half = 60;
  if (layers.maskTop) layers.maskTop.style.height = Math.max(0, e.clientY - half) + 'px';
  if (layers.maskBottom) layers.maskBottom.style.top = (e.clientY + half) + 'px';
}
feature('readingMask', 'orientation', {
  kind: 'toggle', exclusive: ['readingGuide'],
  apply: function (v) {
    onPointer(maskMove, v);
    if (v) {
      layer('maskTop', 'mask').style.top = '0';
      layer('maskBottom', 'mask').style.bottom = '0';
      maskMove({ clientY: pointer.y || innerHeight / 2 });
    } else { removeLayer('maskTop'); removeLayer('maskBottom'); }
  },
});

function pauseMedia() {
  document.querySelectorAll('video, audio').forEach(function (m) {
    if (!m.paused) { m.pause(); m.setAttribute('data-a11ytk-paused', ''); }
    m.removeAttribute('autoplay');
  });
}
feature('stopAnimations', 'orientation', {
  kind: 'toggle',
  apply: function (v) {
    setClass('stopanim', v);
    if (v) pauseMedia();
    else document.querySelectorAll('[data-a11ytk-paused]').forEach(function (m) { m.removeAttribute('data-a11ytk-paused'); });
  },
  onMutate: pauseMedia,
});
feature('hideImages', 'orientation', { kind: 'toggle', apply: function (v) { setClass('hideimg', v); } });

function muteAll(v) {
  document.querySelectorAll('video, audio').forEach(function (m) {
    if (v) { if (!m.muted) { m.muted = true; m.setAttribute('data-a11ytk-muted', ''); } }
    else if (m.hasAttribute('data-a11ytk-muted')) { m.muted = false; m.removeAttribute('data-a11ytk-muted'); }
  });
}
feature('muteSounds', 'orientation', { kind: 'toggle', apply: muteAll, onMutate: function () { muteAll(true); } });
feature('highlightFocus', 'orientation', { kind: 'toggle', apply: function (v) { setClass('hfocus', v); } });

function hoverMove(e) {
  var el = e.target;
  if (!el || isOwn(el) || el === document.body || el === ROOT) { removeLayer('hover'); return; }
  var r = el.getBoundingClientRect();
  if (r.width > innerWidth * 0.95 && r.height > innerHeight * 0.6) { removeLayer('hover'); return; }
  var box = layer('hover', 'hoverbox');
  box.style.left = (r.left - 3) + 'px'; box.style.top = (r.top - 3) + 'px';
  box.style.width = (r.width + 6) + 'px'; box.style.height = (r.height + 6) + 'px';
}
feature('highlightHover', 'orientation', { kind: 'toggle', apply: function (v) { onPointer(hoverMove, v); if (!v) removeLayer('hover'); } });

function imgDescMove(e) {
  var el = e.target;
  var img = el && el.tagName === 'IMG' ? el : null;
  if (!img) { removeLayer('imgdesc'); return; }
  var alt = img.getAttribute('alt');
  var tip = layer('imgdesc', 'tip small');
  tip.textContent = alt ? alt : t('noAlt');
  tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px';
  tip.style.top = Math.min(e.clientY + 20, innerHeight - tip.offsetHeight - 8) + 'px';
}
feature('imageDescriptions', 'orientation', { kind: 'toggle', apply: function (v) { onPointer(imgDescMove, v); if (!v) removeLayer('imgdesc'); } });
