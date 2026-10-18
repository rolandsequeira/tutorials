/*!
 * FitChart: a "Size guide" link and size chart pop-up for Wix Stores product pages. No dependencies.
 *
 * Embedded by Wix as:
 *   <script src="https://<your-host>/guide.js" data-instance="{{instanceId}}" defer></script>
 *
 * Without data-instance the script only exposes window.SizeGuide (used by
 * the dashboard's live preview and by tests) and does nothing else.
 */
(function () {
  'use strict';

  var VERSION = '0.1.0';
  var script = document.currentScript || document.querySelector('script[data-instance][src*="/guide.js"]');
  var ORIGIN = '';
  try { ORIGIN = script ? new URL(script.src, location.href).origin : ''; } catch (e) { /* inline */ }
  var instanceId = script && script.getAttribute('data-instance');
  // Wix leaves the literal "{{instanceId}}" if the parameter was never filled in.
  if (instanceId && instanceId.indexOf('{{') === 0) instanceId = null;

  var DEFAULTS = {
    enabled: true,
    linkText: 'Size guide',
    linkStyle: 'link',
    position: 'after-options',
    layout: 'modal',
    defaultUnit: 'metric',
    showUnitSwitch: true,
    accentColor: '#111827',
    textColor: '#111827',
    backgroundColor: '#ffffff',
    headerColor: '#f3f4f6',
    productPath: '/product-page/',
    customSelector: '',
    fallback: 'floating',
    branding: null,
    chart: null,
  };

  function merge(config) {
    var c = {};
    for (var k in DEFAULTS) c[k] = config && config[k] != null ? config[k] : DEFAULTS[k];
    return c;
  }

  // ---------------------------------------------------------------- storage
  function store(kind) {
    try { var s = window[kind]; var k = '__sg_t'; s.setItem(k, '1'); s.removeItem(k); return s; } catch (e) { return null; }
  }
  var local = store('localStorage');
  var session = store('sessionStorage');
  function key(name) { return 'sg:' + (instanceId || 'preview') + ':' + name; }

  // ------------------------------------------------------------- conversion
  // Charts are stored in cm and kg. Imperial view: inches (nearest 0.5) and pounds (whole).
  var UNIT_LABEL = { metric: { length: 'cm', weight: 'kg' }, imperial: { length: 'in', weight: 'lb' } };

  function fmt(n) { return String(Math.round(n * 10) / 10).replace(/\.0$/, ''); }

  function convert(value, measure, unit) {
    var v = value == null ? '' : String(value);
    if (unit !== 'imperial' || (measure !== 'length' && measure !== 'weight')) return v;
    return v.replace(/\d+(?:[.,]\d+)?/g, function (m) {
      var n = parseFloat(m.replace(',', '.'));
      if (measure === 'length') return fmt(Math.round((n / 2.54) * 2) / 2);
      return fmt(Math.round(n * 2.20462));
    }).replace(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/g, function (m, a, b) {
      return a === b ? a : m; // rounding can turn a narrow range like 16-17 cm into 6.5-6.5 in
    });
  }

  function hasMeasures(chart) {
    return !!(chart && chart.columns || []).some(function (c) { return c.measure === 'length' || c.measure === 'weight'; });
  }

  function luminance(hex) {
    var n = parseInt(String(hex).slice(1), 16);
    if (isNaN(n)) return 1;
    var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function h(tag, attrs, text) {
    var el = document.createElement(tag);
    for (var k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    if (text != null) el.textContent = text;
    return el;
  }

  // ---------------------------------------------------------------- pop-up
  function popupCss(c, inPreview) {
    var pos = inPreview ? 'absolute' : 'fixed';
    var onAccent = luminance(c.accentColor) > 0.4 ? '#111' : '#fff';
    var drawer = c.layout === 'drawer';
    return [
      ':host{all:initial}',
      '*{box-sizing:border-box}',
      '.ov{position:' + pos + ';inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.45);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:' + c.textColor + '}',
      drawer ? '.ov{justify-content:flex-end;align-items:stretch;padding:0}' : '',
      '.box{position:relative;background:' + c.backgroundColor + ';box-shadow:0 20px 50px rgba(0,0,0,.3);width:100%;display:flex;flex-direction:column;overflow:hidden;' +
        (drawer ? 'max-width:520px;height:100%;' : 'max-width:760px;max-height:min(88vh,100%);border-radius:14px;') + '}',
      '.hd{display:flex;align-items:center;gap:12px;padding:16px 56px 12px 20px;border-bottom:1px solid rgba(127,127,127,.25)}',
      'h2{margin:0;font-size:19px;line-height:1.3;font-weight:700;color:inherit;flex:1 1 auto}',
      '.x{position:absolute;top:10px;right:10px;border:0;background:transparent;color:inherit;font:inherit;font-size:24px;line-height:1;padding:6px 10px;cursor:pointer;opacity:.7;border-radius:8px}',
      '.x:hover{opacity:1}',
      '.units{display:inline-flex;border:2px solid ' + c.accentColor + ';border-radius:999px;overflow:hidden;flex:none}',
      '.units button{font:inherit;font-size:13px;font-weight:600;border:0;padding:4px 12px;cursor:pointer;background:transparent;color:inherit}',
      '.units button[aria-pressed="true"]{background:' + c.accentColor + ';color:' + onAccent + '}',
      '.bd{overflow:auto;padding:16px 20px 20px;-webkit-overflow-scrolling:touch}',
      '.tw{overflow-x:auto;border:1px solid rgba(127,127,127,.25);border-radius:10px}',
      'table{border-collapse:collapse;width:100%;font-size:14px;font-variant-numeric:tabular-nums}',
      'caption{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}',
      'th,td{padding:9px 12px;text-align:center;white-space:nowrap;border-bottom:1px solid rgba(127,127,127,.18)}',
      'thead th{white-space:normal;min-width:64px;background:' + c.headerColor + ';color:' + (luminance(c.headerColor) > 0.4 ? '#111' : '#fff') + ';font-weight:700;position:sticky;top:0}',
      'tbody th{font-weight:700;text-align:left}',
      'tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}',
      'tbody tr:hover{background:rgba(127,127,127,.08)}',
      '.note{margin:14px 0 0;white-space:pre-line;opacity:.85}',
      '.img{display:block;max-width:100%;height:auto;margin:16px auto 0;border-radius:8px}',
      '.brand{display:block;margin-top:14px;font-size:12px;color:inherit;opacity:.6;text-decoration:none;text-align:center}',
      '.brand:hover{opacity:1;text-decoration:underline}',
      'button:focus-visible,a:focus-visible{outline:3px solid ' + c.accentColor + ';outline-offset:2px}',
      '@media (max-width:560px){.ov{padding:0;align-items:flex-end}.box{max-height:92%;border-radius:14px 14px 0 0;max-width:none}' + (drawer ? '.box{height:92%}' : '') + '}',
      '@media (prefers-reduced-motion:no-preference){.box{animation:sg-in .22s ease-out}}',
      '@keyframes sg-in{from{opacity:0;transform:' + (drawer ? 'translateX(24px)' : 'translateY(10px)') + '}to{opacity:1;transform:none}}',
    ].join('\n');
  }

  function preferredUnit(c) {
    if (!c.showUnitSwitch) return c.defaultUnit;
    var saved = local && local.getItem('sg:unit');
    return saved === 'metric' || saved === 'imperial' ? saved : c.defaultUnit;
  }

  /**
   * Open the size chart. Options:
   *   container - draw inside this element instead of the page (dashboard preview)
   *   returnFocus - element to focus after closing (the link)
   *   onClose, onUnit - callbacks
   * Returns {host, close}.
   */
  function open(config, opts) {
    opts = opts || {};
    var c = merge(config);
    var chart = c.chart || { title: c.linkText, columns: [], rows: [] };
    var preview = !!opts.container;
    var unit = preferredUnit(c);

    var host = h('div', { id: 'sg-' + Math.random().toString(36).slice(2, 8) });
    if (preview) host.style.cssText = 'position:absolute;inset:0;z-index:2;';
    var root = host.attachShadow ? host.attachShadow({ mode: 'closed' }) : host;
    root.appendChild(h('style', null, popupCss(c, preview)));

    var ov = h('div', { class: 'ov' });
    var box = h('div', { class: 'box', role: 'dialog', 'aria-modal': preview ? null : 'true', 'aria-labelledby': 'sg-t' });
    ov.appendChild(box);
    var hd = h('div', { class: 'hd' });
    hd.appendChild(h('h2', { id: 'sg-t' }, chart.title || c.linkText));
    var unitBtns = [];
    if (c.showUnitSwitch && hasMeasures(chart)) {
      var group = h('div', { class: 'units', role: 'group', 'aria-label': 'Units' });
      [['metric', chart.columns.some(function (x) { return x.measure === 'length'; }) ? 'cm' : 'kg'],
        ['imperial', chart.columns.some(function (x) { return x.measure === 'length'; }) ? 'in' : 'lb']].forEach(function (u) {
        var b = h('button', { type: 'button', 'data-unit': u[0], 'aria-pressed': String(u[0] === unit) }, u[1]);
        b.addEventListener('click', function () { setUnit(u[0]); });
        unitBtns.push(b);
        group.appendChild(b);
      });
      hd.appendChild(group);
    }
    box.appendChild(hd);
    var closeBtn = h('button', { type: 'button', class: 'x', 'aria-label': 'Close' }, '×');
    box.appendChild(closeBtn);

    var bd = h('div', { class: 'bd' });
    var tw = h('div', { class: 'tw', tabindex: '0', role: 'region', 'aria-label': chart.title || 'Size chart' });
    var table = h('table');
    tw.appendChild(table);
    bd.appendChild(tw);
    if (chart.note) bd.appendChild(h('p', { class: 'note' }, chart.note));
    if (chart.image) bd.appendChild(h('img', { class: 'img', src: chart.image, alt: 'How to measure', loading: 'lazy' }));
    if (c.branding && c.branding.name) {
      bd.appendChild(h('a', { class: 'brand', href: c.branding.url || '#', target: '_blank', rel: 'noopener' }, 'Powered by ' + c.branding.name));
    }
    box.appendChild(bd);

    function drawTable() {
      table.textContent = '';
      table.appendChild(h('caption', null, chart.title || 'Size chart'));
      var thead = h('thead');
      var tr = h('tr');
      chart.columns.forEach(function (col) {
        var u = UNIT_LABEL[unit][col.measure];
        tr.appendChild(h('th', { scope: 'col' }, col.label + (u ? ' (' + u + ')' : '')));
      });
      thead.appendChild(tr);
      table.appendChild(thead);
      var tbody = h('tbody');
      chart.rows.forEach(function (row) {
        var r = h('tr');
        chart.columns.forEach(function (col, i) {
          r.appendChild(h(i === 0 ? 'th' : 'td', i === 0 ? { scope: 'row' } : null, convert(row[i], col.measure, unit)));
        });
        tbody.appendChild(r);
      });
      table.appendChild(tbody);
    }

    function setUnit(u) {
      if (u === unit) return;
      unit = u;
      if (local && !preview) local.setItem('sg:unit', u);
      unitBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-unit') === u)); });
      drawTable();
      if (opts.onUnit) opts.onUnit(u);
    }
    drawTable();

    root.appendChild(ov);
    var parent = opts.container || document.body || document.documentElement;
    parent.appendChild(host);

    var prevOverflow = null;
    var prevFocus = opts.returnFocus || document.activeElement;
    var closed = false;

    function focusables() {
      return [].slice.call(root.querySelectorAll('button, a[href], [tabindex="0"]'));
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var items = focusables();
      var i = items.indexOf(root.activeElement || null);
      e.preventDefault();
      var n = (i + (e.shiftKey ? -1 : 1) + items.length) % items.length;
      items[i === -1 ? 0 : n].focus();
    }
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      if (prevOverflow !== null) document.documentElement.style.overflow = prevOverflow;
      host.remove();
      if (prevFocus && prevFocus.focus && !preview) try { prevFocus.focus(); } catch (e) { /* ignore */ }
      if (opts.onClose) opts.onClose();
    }

    closeBtn.addEventListener('click', close);
    if (!preview) {
      ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
      document.addEventListener('keydown', onKey, true);
      prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      setTimeout(function () { closeBtn.focus(); }, 0);
    }
    return { host: host, close: close, setUnit: setUnit };
  }

  // ------------------------------------------------------------- the link
  var RULER = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0z"/>' +
    '<path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/></svg>';

  /** The "Size guide" link as an element (closed shadow root, so the site theme can't restyle it). */
  function trigger(config, onClick, floating) {
    var c = merge(config);
    var onAccent = luminance(c.accentColor) > 0.4 ? '#111' : '#fff';
    var host = h(floating ? 'div' : 'span', { 'data-sg-trigger': '1' });
    host.style.cssText = floating
      ? 'position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147483645;'
      : 'display:block;margin:10px 0;';
    var root = host.attachShadow ? host.attachShadow({ mode: 'closed' }) : host;
    var btnCss = c.linkStyle === 'button' || floating
      ? 'background:' + c.accentColor + ';color:' + onAccent + ';border:2px solid ' + c.accentColor + ';border-radius:8px;padding:8px 14px;font-weight:600'
      : 'background:transparent;color:' + c.accentColor + ';border:0;padding:2px 0;text-decoration:underline;text-underline-offset:3px';
    if (floating) btnCss += ';border-radius:8px 0 0 8px;writing-mode:vertical-rl;transform:rotate(180deg);padding:14px 8px';
    root.appendChild(h('style', null, ':host{all:initial}button{font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:6px;' + btnCss + '}' +
      'button:hover{opacity:.85}button:focus-visible{outline:3px solid ' + c.accentColor + ';outline-offset:2px}svg{flex:none}'));
    var btn = h('button', { type: 'button', 'aria-haspopup': 'dialog' });
    var icon = h('span'); icon.innerHTML = RULER; icon.style.display = 'inline-flex';
    btn.appendChild(icon);
    btn.appendChild(document.createTextNode(c.linkText));
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); onClick(btn); });
    root.appendChild(btn);
    return host;
  }

  // ------------------------------------------------------------ placement
  // Size option labels in the languages Wix Stores sites commonly use.
  var SIZE_RE = /size|gr(ö|oe|ö)(ß|ss)e|taille|talla|taglia|tamanho|tama[nñ]o|maat|storlek|st(ø|o)rrelse|koko|rozmiar|velikost|m(é|e)ret|beden|размер|サイズ|尺码|尺寸|사이즈|מידה|مقاس/i;

  function visible(el) { return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); }
  function first(selectors, scope) {
    for (var i = 0; i < selectors.length; i++) {
      var list = (scope || document).querySelectorAll(selectors[i]);
      for (var j = 0; j < list.length; j++) if (visible(list[j])) return list[j];
    }
    return null;
  }

  /** The product option whose label mentions size (the innermost match), or the whole options area. */
  function findSizeOption() {
    var blocks = document.querySelectorAll('[data-hook*="option" i], [data-hook*="dropdown" i], [role="radiogroup"], fieldset, select');
    var match = null;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (!visible(b) || b.closest('[data-sg-trigger]')) continue;
      var label = b.getAttribute('aria-label') || '';
      var head = b.querySelector('[data-hook*="title" i], label, legend, [data-hook*="label" i]');
      // Later matches in document order are nested deeper, so the last one wins.
      if (SIZE_RE.test(label) || (head && SIZE_RE.test(head.textContent || ''))) match = b;
    }
    if (match) {
      // Insert after the option's own wrapper rather than inside a dropdown.
      if (match.tagName === 'SELECT' && match.parentNode) match = match.parentNode;
      return { el: match, where: 'after' };
    }
    var all = first(['[data-hook="product-options"]', '[data-hook*="product-options" i]']);
    return all ? { el: all, where: 'after' } : null;
  }

  function findAnchor(c) {
    if (c.customSelector) {
      try { var custom = first([c.customSelector]); if (custom) return { el: custom, where: 'after' }; } catch (e) { /* bad selector */ }
    }
    var finders = {
      'after-options': findSizeOption,
      'before-cart': function () {
        var cart = first(['[data-hook="add-to-cart"]', '[data-hook*="add-to-cart" i]', '[data-hook*="buy-now" i]', 'button[aria-label*="add to cart" i]']);
        if (!cart) return null;
        var block = cart.closest('[data-hook*="quantity" i], [data-hook="product-page-cta"], [data-hook*="action" i]') || cart;
        return { el: block, where: 'before' };
      },
      'after-title': function () {
        var t = first(['[data-hook="product-title"]', '[data-hook*="product-title" i]', 'h1']);
        return t ? { el: t, where: 'after' } : null;
      },
    };
    var order = [c.position].concat(['after-options', 'before-cart', 'after-title'].filter(function (p) { return p !== c.position; }));
    for (var i = 0; i < order.length; i++) {
      var a = finders[order[i]] && finders[order[i]]();
      if (a) return a;
    }
    return null;
  }

  function place(anchor, el) {
    if (anchor.where === 'before') anchor.el.parentNode.insertBefore(el, anchor.el);
    else anchor.el.parentNode.insertBefore(el, anchor.el.nextSibling);
  }

  /** Product slug from a Wix Stores URL such as /product-page/boxing-gloves or /fr/product-page/boxing-gloves. */
  function productSlug(pathname, productPath) {
    var p = productPath || DEFAULTS.productPath;
    var i = pathname.indexOf(p);
    if (i === -1) return '';
    var slug = pathname.slice(i + p.length).split('/')[0];
    try { slug = decodeURIComponent(slug); } catch (e) { /* keep raw */ }
    return slug.toLowerCase();
  }

  // ---------------------------------------------------------------- counters
  // Each event is counted at most once per visitor session.
  function ping(names) {
    if (!instanceId || !ORIGIN) return;
    var sent = {};
    try { sent = JSON.parse((session && session.getItem(key('sent'))) || '{}'); } catch (e) { /* reset */ }
    var fresh = names.filter(function (n) { return !sent[n]; });
    if (!fresh.length) return;
    fresh.forEach(function (n) { sent[n] = 1; });
    if (session) session.setItem(key('sent'), JSON.stringify(sent));
    var body = JSON.stringify({ i: instanceId, e: fresh });
    var url = ORIGIN + '/api/v1/ping';
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
    } catch (e) { /* fall through */ }
    try { fetch(url, { method: 'POST', body: body, keepalive: true, headers: { 'content-type': 'text/plain' } }); } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------------ run
  // Wix sites are single-page apps: moving between products changes the URL
  // without a reload, and Wix re-renders the product page as it goes. So the
  // script watches the URL and the page, and puts the link back when needed.
  var current = null; // {path, config, el, anchorEl}
  var observer = null;
  var forced = /[?&]sg-preview=1\b/.test(location.search);
  var DEFAULT_PATH = DEFAULTS.productPath;

  function removeTrigger() {
    if (current && current.el) current.el.remove();
    document.querySelectorAll('[data-sg-trigger]').forEach(function (n) { n.remove(); });
  }

  function openGuide(cfg, btn) {
    ping(['opened']);
    open(cfg, { returnFocus: btn, onUnit: function () { ping(['unit']); } });
  }

  function ensureTrigger(deadline) {
    if (!current || !current.config || !current.config.chart) return;
    if (current.el && current.el.isConnected && (current.floating || (current.anchorEl && current.anchorEl.isConnected))) return;
    var cfg = current.config;
    var anchor = findAnchor(cfg);
    if (!anchor && Date.now() < deadline) return; // the page is still rendering; the observer calls us again
    removeTrigger();
    if (!anchor && cfg.fallback !== 'floating' && !forced) return;
    var el = trigger(cfg, function (btn) { openGuide(cfg, btn); }, !anchor);
    if (anchor) place(anchor, el);
    else (document.body || document.documentElement).appendChild(el);
    current.el = el;
    current.anchorEl = anchor ? anchor.el : null;
    current.floating = !anchor;
    ping(['viewed']);
  }

  function guideUrl(params) {
    return ORIGIN + '/api/v1/guide?i=' + encodeURIComponent(instanceId) + params;
  }
  function getJson(url) {
    return fetch(url, { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; });
  }

  function onRoute() {
    var path = location.pathname;
    if (current && current.path === path) return;
    removeTrigger();
    current = { path: path, config: null };
    var mine = current;
    // Owners can rename the product URL prefix in Wix; the config says what it is.
    var knownPath = session && session.getItem(key('path'));
    var slug = productSlug(path, knownPath || DEFAULT_PATH);
    if (!slug && !forced) {
      if (knownPath || !session) return;
      // First page of the visit isn't a default product URL: learn the prefix once.
      getJson(guideUrl('')).then(function (cfg) {
        if (!cfg || mine !== current) return;
        session.setItem(key('path'), cfg.productPath || DEFAULT_PATH);
        if (productSlug(path, cfg.productPath)) { current = null; onRoute(); }
      }).catch(function () { /* ignore */ });
      return;
    }
    var titleEl = document.querySelector('[data-hook="product-title"], h1');
    var name = titleEl ? (titleEl.textContent || '').trim().slice(0, 120) : '';
    getJson(guideUrl(slug ? '&p=' + encodeURIComponent(slug) + (name ? '&n=' + encodeURIComponent(name) : '') : '&pv=1'))
      .then(function (cfg) {
        if (!cfg || mine !== current) return;
        if (session) session.setItem(key('path'), cfg.productPath || DEFAULT_PATH);
        if ((!cfg.enabled && !forced) || !cfg.chart) return;
        mine.config = merge(cfg);
        mine.deadline = Date.now() + 8000;
        ensureTrigger(mine.deadline);
        if (forced && /[?&]sg-open=1\b/.test(location.search)) openGuide(mine.config);
      })
      .catch(function () { /* never break the host site */ });
  }

  function start() {
    var timer = null;
    observer = new MutationObserver(function () {
      if (timer) return;
      timer = setTimeout(function () {
        timer = null;
        if (location.pathname !== (current && current.path)) onRoute();
        else if (current && current.config) ensureTrigger(current.deadline || 0);
      }, 150);
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    window.addEventListener('popstate', onRoute);
    onRoute();
  }

  window.SizeGuide = {
    version: VERSION, open: open, trigger: trigger, convert: convert,
    productSlug: productSlug, findAnchor: function (c) { return findAnchor(merge(c)); }, defaults: DEFAULTS,
  };

  if (instanceId && ORIGIN && window.fetch && window.Promise && window.MutationObserver) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})();
