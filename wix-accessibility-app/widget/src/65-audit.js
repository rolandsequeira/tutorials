// Lightweight WCAG checks on a sample of page views. Results feed the
// site owner's dashboard report. Runs BEFORE auto-fix so it reflects the source.
function parseColor(c) {
  var m = c && c.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  var p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
function luminance(c) {
  var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function contrastRatio(a, b) {
  var l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function effectiveBg(el) {
  for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
    var cs = getComputedStyle(n);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // unknown (image/gradient)
    var c = parseColor(cs.backgroundColor);
    if (c && c.a >= 0.95) return c;
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}
function sampleOf(el) {
  var s = el.outerHTML.replace(/\s+/g, ' ');
  return s.length > 160 ? s.slice(0, 157) + '…' : s;
}

function runAudit() {
  var issues = {};
  function add(id, impact, wcag, el) {
    var it = issues[id] || (issues[id] = { id: id, impact: impact, wcag: wcag, count: 0, samples: [] });
    it.count++;
    if (el && it.samples.length < 5) it.samples.push(sampleOf(el));
  }
  var body = document.body;
  if (!body) return null;

  if (!ROOT.getAttribute('lang')) add('html-lang', 'serious', '3.1.1');
  if (!document.title.trim()) add('document-title', 'serious', '2.4.2');
  var vp = document.querySelector('meta[name=viewport]');
  if (vp && /maximum-scale\s*=\s*1(\.0)?\b|user-scalable\s*=\s*(no|0)/i.test(vp.content)) add('meta-viewport', 'critical', '1.4.4');

  body.querySelectorAll('img').forEach(function (img) {
    if (isOwn(img) || img.hasAttribute('data-a11ytk-alt')) return;
    if (img.getAttribute('role') === 'presentation' || img.getAttribute('aria-hidden') === 'true') return;
    if (badAlt(img)) add('image-alt', 'critical', '1.1.1', img);
  });
  body.querySelectorAll('a[href]').forEach(function (a) {
    if (!isOwn(a) && !a.hasAttribute('data-a11ytk-name') && isVisible(a) && !accName(a)) add('link-name', 'serious', '2.4.4', a);
  });
  body.querySelectorAll('button, [role=button]').forEach(function (b) {
    if (!isOwn(b) && !b.hasAttribute('data-a11ytk-name') && isVisible(b) && !accName(b)) add('button-name', 'critical', '4.1.2', b);
  });
  body.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]), select, textarea').forEach(function (el) {
    if (!isOwn(el) && !el.hasAttribute('data-a11ytk-name') && isVisible(el) && !accNameStrict(el)) add('label', 'critical', '1.3.1', el);
  });
  body.querySelectorAll('iframe').forEach(function (f) {
    if (!isOwn(f) && !f.getAttribute('title') && !f.getAttribute('aria-label')) add('frame-title', 'serious', '4.1.2', f);
  });
  body.querySelectorAll('[tabindex]').forEach(function (el) {
    if (parseInt(el.getAttribute('tabindex'), 10) > 0) add('tabindex', 'serious', '2.4.3', el);
  });
  body.querySelectorAll('video[autoplay]:not([muted]), audio[autoplay]').forEach(function (m) { add('no-autoplay-audio', 'moderate', '1.4.2', m); });

  var heads = headingList();
  if (!heads.some(function (el) { return el.tagName === 'H1' || el.getAttribute('aria-level') === '1'; })) add('page-has-h1', 'moderate', '1.3.1');
  var prev = 0;
  heads.forEach(function (el) {
    var lvl = /^H[1-6]$/.test(el.tagName) ? +el.tagName[1] : +(el.getAttribute('aria-level') || 2);
    if (prev && lvl > prev + 1) add('heading-order', 'moderate', '1.3.1', el);
    prev = lvl;
  });
  if (!document.querySelector('main, [role=main]')) add('landmark-main', 'moderate', '1.3.1');

  // Color contrast on up to 250 visible text elements.
  var checked = 0;
  var walker = document.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode() && checked < 250) {
    var el = walker.currentNode;
    if (isOwn(el) || SKIP_TAGS.test(el.tagName.toUpperCase()) || !hasOwnText(el)) continue;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
    checked++;
    var fg = parseColor(cs.color);
    var bg = effectiveBg(el);
    if (!fg || !bg) continue;
    if (fg.a < 1) fg = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
    var size = parseFloat(cs.fontSize);
    var large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    if (contrastRatio(fg, bg) < (large ? 3 : 4.5)) add('color-contrast', 'serious', '1.4.3', el);
  }

  var list = Object.keys(issues).map(function (k) { return issues[k]; });
  var weights = { critical: 12, serious: 7, moderate: 3, minor: 1 };
  var penalty = list.reduce(function (s, it) { return s + weights[it.impact] + Math.min(8, Math.floor(it.count / 5)); }, 0);
  return { score: Math.max(0, 100 - penalty), issues: list };
}

function maybeAudit() {
  var key = STORE_KEY + ':audit:' + location.pathname;
  var last = storeGet(key, 0);
  if (Date.now() - last < 6 * 3600 * 1000) return;
  if (Math.random() > (CONFIG.auditSampleRate || 0.1)) return;
  var run = function () {
    var result = runAudit();
    if (!result) return;
    storeSet(key, Date.now());
    // Attach counts of what auto-fix repaired in this page view.
    setTimeout(function () {
      result.issues.forEach(function (it) { it.fixed = fixCounts[it.id] || 0; });
      fetch(BASE + '/api/widget/audit', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ i: INSTANCE, page: location.href, score: result.score, issues: result.issues }),
      }).catch(function () {});
    }, 4000);
  };
  run(); // synchronous on purpose: must observe the page before auto-fix mutates it
}
