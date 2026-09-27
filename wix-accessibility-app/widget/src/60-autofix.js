// Automatic remediation of common markup problems (paid plans).
// These fixes help assistive-technology users, but they do not replace
// fixing the site itself; the dashboard report lists the underlying issues.
var fixCounts = {};
function fixed(id) { fixCounts[id] = (fixCounts[id] || 0) + 1; }

var SOCIAL = [
  [/facebook\.com/, 'Facebook'], [/instagram\.com/, 'Instagram'], [/(twitter|x)\.com/, 'X (Twitter)'],
  [/linkedin\.com/, 'LinkedIn'], [/youtube\.com|youtu\.be/, 'YouTube'], [/tiktok\.com/, 'TikTok'],
  [/pinterest\./, 'Pinterest'], [/wa\.me|whatsapp\.com/, 'WhatsApp'], [/t\.me|telegram\./, 'Telegram'],
  [/vimeo\.com/, 'Vimeo'], [/spotify\.com/, 'Spotify'], [/maps\.google|goo\.gl\/maps|google\.[a-z.]+\/maps/, 'Google Maps'],
];

function humanize(s) {
  return decodeURIComponent(s || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_+~]+/g, ' ').replace(/\s+/g, ' ').trim();
}

var FILENAME_ALT = /(\.(jpe?g|png|gif|webp|svg|avif|heic)$)|^(img|dsc|dscn|image|photo|pic|screenshot|whatsapp image)[\s_-]*\d/i;
function badAlt(img) {
  var alt = img.getAttribute('alt');
  return alt === null || FILENAME_ALT.test(alt.trim());
}

function linkLabel(el) {
  var href = el.getAttribute('href') || '';
  if (/^mailto:/i.test(href)) return 'Email ' + href.slice(7).split('?')[0];
  if (/^tel:/i.test(href)) return 'Call ' + href.slice(4);
  for (var i = 0; i < SOCIAL.length; i++) if (SOCIAL[i][0].test(href)) return SOCIAL[i][1];
  var title = el.getAttribute('title');
  if (title) return title;
  try {
    var u = new URL(href, location.href);
    var seg = u.pathname.split('/').filter(Boolean).pop();
    if (u.host !== location.host) return u.host.replace(/^www\./, '') + (seg ? ' – ' + humanize(seg) : '');
    return seg ? humanize(seg) : 'Home';
  } catch (e) { return ''; }
}

function runAutoFix(scope) {
  var af = CONFIG.autoFix;
  if (!af) return;
  scope = scope || document;

  if (af.pageLang && !ROOT.getAttribute('lang')) {
    ROOT.setAttribute('lang', (CONFIG.ui.language !== 'auto' && CONFIG.ui.language) || (navigator.language || 'en').slice(0, 2));
    fixed('html-lang');
  }

  if (af.viewportZoom) {
    var vp = document.querySelector('meta[name=viewport]');
    if (vp && /maximum-scale\s*=\s*1(\.0)?\b|user-scalable\s*=\s*(no|0)/i.test(vp.content)) {
      vp.content = vp.content.replace(/,?\s*maximum-scale\s*=\s*[\d.]+/i, '').replace(/,?\s*user-scalable\s*=\s*(no|0)/i, '');
      fixed('meta-viewport');
    }
  }

  if (af.skipLink && !document.querySelector('.a11ytk-skip') && document.body) {
    var main = document.querySelector('main, [role=main], #PAGES_CONTAINER, #SITE_PAGES');
    if (main) {
      if (!main.id) main.id = 'a11ytk-main';
      var skip = h('a', { class: 'a11ytk-skip', href: '#' + main.id, text: t('skipToContent') });
      skip.addEventListener('click', function (e) { e.preventDefault(); focusElement(main); });
      document.body.insertBefore(skip, document.body.firstChild);
    }
  }

  if (af.emptyLinks) {
    scope.querySelectorAll('a[href], button, [role=button], [role=link]').forEach(function (el) {
      if (isOwn(el) || el.hasAttribute('data-a11ytk-name') || accName(el)) return;
      var label = el.tagName === 'A' ? linkLabel(el) : (el.getAttribute('title') || humanize(el.getAttribute('name') || el.id || ''));
      if (!label) {
        var svgT = el.querySelector('svg title');
        label = svgT ? svgT.textContent.trim() : '';
      }
      if (label) {
        el.setAttribute('aria-label', label);
        el.setAttribute('data-a11ytk-name', '');
        fixed(el.tagName === 'A' ? 'link-name' : 'button-name');
      }
    });
  }

  if (af.formLabels) {
    scope.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]), select, textarea').forEach(function (el) {
      if (isOwn(el) || el.hasAttribute('data-a11ytk-name') || accNameStrict(el)) return;
      var label = el.getAttribute('placeholder') || el.getAttribute('title') || humanize(el.getAttribute('name') || el.id || '') ||
        (el.type === 'email' ? 'Email' : el.type === 'search' ? 'Search' : el.type === 'tel' ? 'Phone' : '');
      if (label) {
        el.setAttribute('aria-label', label);
        el.setAttribute('data-a11ytk-name', '');
        fixed('label');
      }
    });
  }

  if (af.iframeTitles) {
    scope.querySelectorAll('iframe:not([title])').forEach(function (f) {
      if (isOwn(f)) return;
      var src = f.getAttribute('src') || '';
      var label = /youtube/.test(src) ? 'YouTube video' : /vimeo/.test(src) ? 'Vimeo video' : /maps/.test(src) ? 'Map' : 'Embedded content';
      try {
        var fhost = src ? new URL(src, location.href).host.replace(/^www\./, '') : '';
        if (label === 'Embedded content' && fhost) label += ' from ' + fhost;
      } catch (e) { /* ignore */ }
      f.setAttribute('title', label);
      fixed('frame-title');
    });
  }

  if (af.newTabWarning) {
    scope.querySelectorAll('a[target=_blank]:not([data-a11ytk-nt])').forEach(function (a) {
      if (isOwn(a)) return;
      a.setAttribute('data-a11ytk-nt', '');
      if (a.getAttribute('aria-label')) a.setAttribute('aria-label', a.getAttribute('aria-label') + ' ' + t('opensNewTab'));
      else a.appendChild(h('span', { class: 'a11ytk-sr', text: ' ' + t('opensNewTab') }));
    });
  }

  if (CONFIG.aiAltText) requestAltTexts(scope);
  else markDecorativeSpacers(scope);
}

// Label check without placeholder fallback (placeholders are not labels).
function accNameStrict(el) {
  if ((el.getAttribute('aria-label') || '').trim() || el.getAttribute('aria-labelledby') || (el.getAttribute('title') || '').trim()) return true;
  if (el.id) {
    try { if (document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) return true; } catch (e) { /* ignore */ }
  }
  return !!el.closest('label');
}

function markDecorativeSpacers(scope) {
  scope.querySelectorAll('img:not([alt])').forEach(function (img) {
    if (img.naturalWidth && img.naturalWidth <= 2 && img.naturalHeight <= 2) { img.setAttribute('alt', ''); fixed('image-alt'); }
  });
}

/* ---------- AI alt text ---------- */
var altRequested = {};
var altCache = storeGet(STORE_KEY + ':alts', {}, true); // per session

function altCandidates(scope) {
  var out = [];
  scope.querySelectorAll('img').forEach(function (img) {
    if (isOwn(img) || img.hasAttribute('data-a11ytk-alt')) return;
    if (img.getAttribute('role') === 'presentation' || img.getAttribute('aria-hidden') === 'true') return;
    var src = img.currentSrc || img.src;
    if (!src || src.indexOf('data:') === 0) return;
    var alt = img.getAttribute('alt');
    var missing = badAlt(img);
    // Wix renders un-described images with alt="": caption them only when large enough to be content.
    if (!missing && alt === '' && img.width >= 150 && img.height >= 100 && !img.closest('a[aria-label], button[aria-label]')) missing = true;
    if (missing) out.push(img);
  });
  return out;
}

function applyAlt(img, alt) {
  img.setAttribute('alt', alt);
  img.setAttribute('data-a11ytk-alt', '');
  fixed('image-alt');
}

function requestAltTexts(scope) {
  var imgs = altCandidates(scope);
  var ask = [];
  imgs.forEach(function (img) {
    var src = img.currentSrc || img.src;
    if (altCache[src] !== undefined) { applyAlt(img, altCache[src]); return; }
    if (!altRequested[src]) { altRequested[src] = []; ask.push(src); }
    altRequested[src].push(img);
  });
  if (!ask.length) return;
  fetch(BASE + '/api/widget/alt-text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ i: INSTANCE, page: location.href, images: ask.slice(0, 40) }),
  }).then(function (r) { return r.ok ? r.json() : { alts: {} }; }).then(function (res) {
    Object.keys(res.alts || {}).forEach(function (src) {
      altCache[src] = res.alts[src];
      (altRequested[src] || []).forEach(function (img) { applyAlt(img, res.alts[src]); });
    });
    storeSet(STORE_KEY + ':alts', altCache, true);
  }).catch(function () { /* offline; try on next page */ });
}
