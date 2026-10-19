/*!
 * Ad blocker detector + notice for Wix sites. No dependencies.
 *
 * Embedded by Wix as:
 *   <script src="https://<your-host>/notice.js" data-instance="{{instanceId}}" defer></script>
 *
 * Without data-instance the script only exposes window.SiteNotice (used by
 * the dashboard's live preview and by tests) and does nothing else.
 *
 * Naming note: nothing here (file name, API paths, element ids, class names)
 * contains "ad", "adblock" or similar words, because filter lists hide or
 * block anything that looks like an anti-adblock script.
 */
(function () {
  'use strict';

  var VERSION = '0.1.0';
  var script = document.currentScript || document.querySelector('script[data-instance][src*="/notice.js"]');
  var ORIGIN = '';
  try { ORIGIN = script ? new URL(script.src, location.href).origin : ''; } catch (e) { /* inline */ }
  var instanceId = script && script.getAttribute('data-instance');
  // Wix leaves the literal "{{instanceId}}" if the parameter was never filled in.
  if (instanceId && instanceId.indexOf('{{') === 0) instanceId = null;

  var DEFAULTS = {
    enabled: true,
    layout: 'modal',
    mode: 'dismiss',
    frequency: 'session',
    delaySeconds: 1,
    title: 'Looks like you are using an ad blocker',
    message: 'Ads help us keep this site free. Please consider adding us to your ad blocker\'s allowlist, then reload the page.',
    reloadLabel: 'I\'ve disabled it, reload',
    dismissLabel: 'Continue anyway',
    backgroundColor: '#ffffff',
    textColor: '#111827',
    accentColor: '#dc2626',
    overlayOpacity: 60,
    excludePaths: [],
    branding: null,
  };

  // ---------------------------------------------------------------- storage
  function store(kind) {
    try { var s = window[kind]; var k = '__sn_t'; s.setItem(k, '1'); s.removeItem(k); return s; } catch (e) { return null; }
  }
  var local = store('localStorage');
  var session = store('sessionStorage');
  function key(name) { return 'sn:' + (instanceId || 'preview') + ':' + name; }

  // -------------------------------------------------------------- detection
  // Class names that generic cosmetic filters (EasyList "##.adsbox" etc.) hide.
  var BAIT_CLASSES = 'ad ads adsbox ad-banner ad-placement ad-slot doubleclick pub_300x250 pub_728x90 text-ad textAd text_ad sponsored-ad banner_ad';
  // A script every network filter list blocks. We only send a HEAD request; nothing is executed.
  var BAIT_URL = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

  function baitHidden(el) {
    if (!el.isConnected) return true;
    if (el.offsetParent === null || el.offsetHeight === 0 || el.offsetWidth === 0 || el.clientHeight === 0) return true;
    var cs = window.getComputedStyle(el);
    return !cs || cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0';
  }

  function checkBait() {
    return new Promise(function (resolve) {
      var el = document.createElement('div');
      el.className = BAIT_CLASSES;
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '&nbsp;';
      // No !important: blockers inject "display:none !important" and must be able to win.
      el.style.cssText = 'position:absolute;left:-10000px;top:-10000px;width:10px;height:10px;pointer-events:none;';
      (document.body || document.documentElement).appendChild(el);
      // Some blockers apply cosmetic filters from a MutationObserver, so look a few times.
      var checks = [50, 400, 1200];
      var i = 0;
      (function next() {
        setTimeout(function () {
          if (baitHidden(el)) { if (el.isConnected) el.remove(); resolve(true); return; }
          if (++i < checks.length) return next();
          el.remove();
          resolve(false);
        }, checks[i] - (i ? checks[i - 1] : 0));
      })();
    });
  }

  function checkNetwork() {
    if (!window.fetch || navigator.onLine === false) return Promise.resolve(false);
    return new Promise(function (resolve) {
      // A slow network is "unknown", not "blocked". Blockers fail the request immediately.
      var timer = setTimeout(function () { resolve(false); }, 4000);
      fetch(BAIT_URL, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', credentials: 'omit' })
        .then(function () { clearTimeout(timer); resolve(false); })
        .catch(function () { clearTimeout(timer); resolve(navigator.onLine !== false); });
    });
  }

  /** Resolves to {blocked, bait, network}. */
  function detect() {
    return Promise.all([checkBait(), checkNetwork()]).then(function (r) {
      return { blocked: r[0] || r[1], bait: r[0], network: r[1] };
    });
  }

  // ----------------------------------------------------------------- notice
  function luminance(hex) {
    var n = parseInt(String(hex).slice(1), 16);
    if (isNaN(n)) return 1;
    var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function css(c, inPreview, block) {
    // A wall that still lets people read the page isn't a wall.
    var overlay = block ? Math.max(c.overlayOpacity, 85) : c.overlayOpacity;
    var pos = inPreview ? 'absolute' : 'fixed';
    var onAccent = luminance(c.accentColor) > 0.4 ? '#111' : '#fff';
    return [
      ':host{all:initial}',
      '*{box-sizing:border-box}',
      '.wrap{position:' + pos + ';z-index:2147483647;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:' + c.textColor + '}',
      '.ov{inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,' + (overlay / 100) + ')' + (block ? ';backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)' : '') + '}',
      '.box{position:relative;background:' + c.backgroundColor + ';border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.3);max-width:440px;width:100%;padding:28px 24px 20px;text-align:center;border-top:5px solid ' + c.accentColor + '}',
      '.icon{width:52px;height:52px;margin:0 auto 10px;color:' + c.accentColor + '}',
      'h2{margin:0 0 8px;font-size:20px;line-height:1.3;font-weight:700;color:inherit}',
      'p{margin:0 0 18px;color:inherit;opacity:.85;white-space:pre-line}',
      '.actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}',
      'button{font:inherit;font-weight:600;cursor:pointer;border-radius:8px;padding:10px 16px;border:2px solid ' + c.accentColor + '}',
      '.primary{background:' + c.accentColor + ';color:' + onAccent + '}',
      '.secondary{background:transparent;color:inherit}',
      'button:focus-visible{outline:3px solid ' + c.textColor + ';outline-offset:2px}',
      '.x{position:absolute;top:6px;right:6px;border:0;background:transparent;color:inherit;font-size:22px;line-height:1;padding:6px 10px;opacity:.6}',
      '.x:hover{opacity:1}',
      '.brand{display:block;margin-top:14px;font-size:12px;color:inherit;opacity:.6;text-decoration:none}',
      '.brand:hover{opacity:1;text-decoration:underline}',
      // Banners
      '.bar{left:0;right:0;background:' + c.backgroundColor + ';box-shadow:0 0 18px rgba(0,0,0,.2);padding:12px 48px 12px 16px}',
      '.bar.top{top:0;border-bottom:4px solid ' + c.accentColor + '}',
      '.bar.bottom{bottom:0;border-top:4px solid ' + c.accentColor + '}',
      '.bar .in{display:flex;align-items:center;gap:14px;flex-wrap:wrap;max-width:1100px;margin:0 auto}',
      '.bar .icon{width:32px;height:32px;margin:0;flex:none}',
      '.bar .txt{flex:1 1 260px;text-align:left}',
      '.bar .actions{flex:0 0 auto;justify-content:flex-start}',
      '.bar h2{font-size:16px;margin:0}',
      '.bar p{margin:0;font-size:14px}',
      '.bar .brand{margin:0;flex-basis:100%;text-align:right}',
      '.bar .x{top:50%;transform:translateY(-50%)}',
      '@media (max-width:480px){.box{padding:24px 16px 16px}.bar .actions{flex:1 1 100%}.actions button{flex:1 1 100%}}',
      '@media (prefers-reduced-motion:no-preference){.box,.bar{animation:sn-in .25s ease-out}}',
      '@keyframes sn-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    ].join('\n');
  }

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

  function h(tag, attrs, text) {
    var el = document.createElement(tag);
    for (var k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    if (text != null) el.textContent = text;
    return el;
  }

  /**
   * Draw the notice. Options:
   *   container  - draw inside this element instead of the page (dashboard preview)
   *   onReload, onDismiss - callbacks
   * Returns {host, close}.
   */
  function render(config, opts) {
    opts = opts || {};
    var c = {};
    for (var k in DEFAULTS) c[k] = config && config[k] != null ? config[k] : DEFAULTS[k];
    var block = c.mode === 'block';
    var layout = block ? 'modal' : c.layout;
    var preview = !!opts.container;

    var host = h('div', { id: 'sn-' + Math.random().toString(36).slice(2, 8) });
    if (preview) host.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    var root = host.attachShadow ? host.attachShadow({ mode: 'closed' }) : host;
    root.appendChild(h('style', null, css(c, preview, block)));

    var titleId = 't', msgId = 'm';
    var box, wrap;
    if (layout === 'modal') {
      wrap = h('div', { class: 'wrap ov' });
      box = h('div', { class: 'box', role: 'dialog', 'aria-modal': preview ? null : 'true', 'aria-labelledby': titleId, 'aria-describedby': msgId });
      wrap.appendChild(box);
      var icon = h('div', { class: 'icon' }); icon.innerHTML = ICON; box.appendChild(icon);
      box.appendChild(h('h2', { id: titleId }, c.title));
      box.appendChild(h('p', { id: msgId }, c.message));
    } else {
      wrap = h('div', { class: 'wrap bar ' + (layout === 'banner-top' ? 'top' : 'bottom'), role: 'region', 'aria-labelledby': titleId });
      box = h('div', { class: 'in' });
      wrap.appendChild(box);
      var bi = h('div', { class: 'icon' }); bi.innerHTML = ICON; box.appendChild(bi);
      var txt = h('div', { class: 'txt' });
      txt.appendChild(h('h2', { id: titleId }, c.title));
      txt.appendChild(h('p', { id: msgId }, c.message));
      box.appendChild(txt);
    }
    if (preview) wrap.style.pointerEvents = 'auto';

    var actions = h('div', { class: 'actions' });
    var reloadBtn = h('button', { type: 'button', class: 'primary' }, c.reloadLabel);
    actions.appendChild(reloadBtn);
    var dismissBtn = null, closeBtn = null;
    if (!block) {
      dismissBtn = h('button', { type: 'button', class: 'secondary' }, c.dismissLabel);
      actions.appendChild(dismissBtn);
      closeBtn = h('button', { type: 'button', class: 'x', 'aria-label': 'Close' }, '×');
      (layout === 'modal' ? box : wrap).appendChild(closeBtn);
    }
    box.appendChild(actions);
    if (c.branding && c.branding.name) {
      var a = h('a', { class: 'brand', href: c.branding.url || '#', target: '_blank', rel: 'noopener' }, 'Powered by ' + c.branding.name);
      box.appendChild(a);
    }

    root.appendChild(wrap);
    var parent = opts.container || document.body || document.documentElement;
    parent.appendChild(host);

    var prevOverflow = null;
    var prevFocus = document.activeElement;
    var guard = null;
    var closed = false;

    function close() {
      if (closed) return;
      closed = true;
      if (guard) guard.disconnect();
      document.removeEventListener('keydown', onKey, true);
      if (prevOverflow !== null) document.documentElement.style.overflow = prevOverflow;
      host.remove();
      if (prevFocus && prevFocus.focus && !preview) try { prevFocus.focus(); } catch (e) { /* ignore */ }
    }

    function onKey(e) {
      if (e.key === 'Escape' && !block) { e.stopPropagation(); dismiss(); return; }
      if (e.key !== 'Tab' || layout !== 'modal') return;
      // Keep focus inside the dialog.
      var items = [reloadBtn, dismissBtn, closeBtn].filter(Boolean);
      var active = root.activeElement || null;
      var i = items.indexOf(active);
      e.preventDefault();
      var n = (i + (e.shiftKey ? -1 : 1) + items.length) % items.length;
      items[i === -1 ? 0 : n].focus();
    }

    function dismiss() {
      close();
      if (opts.onDismiss) opts.onDismiss();
    }

    reloadBtn.addEventListener('click', function () {
      if (opts.onReload) opts.onReload();
      if (!preview) location.reload();
    });
    if (dismissBtn) dismissBtn.addEventListener('click', dismiss);
    if (closeBtn) closeBtn.addEventListener('click', dismiss);

    if (!preview) {
      if (layout === 'modal') {
        document.addEventListener('keydown', onKey, true);
        prevOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        setTimeout(function () { reloadBtn.focus(); }, 0);
      } else if (!block) {
        document.addEventListener('keydown', onKey, true);
      }
      if (block && window.MutationObserver) {
        // Put the wall back if the page (or a blocker's element picker) removes it.
        guard = new MutationObserver(function () { if (!host.isConnected && !closed) parent.appendChild(host); });
        guard.observe(parent, { childList: true });
      }
    }

    return { host: host, close: close };
  }

  // ------------------------------------------------------------ frequency
  var PERIOD = { day: 864e5, week: 6048e5 };

  function recentlyDismissed(c) {
    if (c.mode === 'block' || c.frequency === 'every-page') return false;
    if (c.frequency === 'session') return !!(session && session.getItem(key('dismissed')));
    var t = Number(local && local.getItem(key('dismissed')));
    return !!t && Date.now() - t < (PERIOD[c.frequency] || 0);
  }

  function rememberDismiss(c) {
    if (c.frequency === 'session') { if (session) session.setItem(key('dismissed'), '1'); }
    else if (PERIOD[c.frequency] && local) local.setItem(key('dismissed'), String(Date.now()));
  }

  function excluded(paths, pathname) {
    for (var i = 0; i < (paths || []).length; i++) {
      var p = paths[i];
      if (!p) continue;
      if (pathname === p || pathname.indexOf(p.charAt(p.length - 1) === '/' ? p : p + '/') === 0) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- counters
  // Each event is counted at most once per visitor session, so the dashboard
  // can show "N% of visitors use an ad blocker".
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
  function run(config) {
    var c = {};
    for (var k in DEFAULTS) c[k] = config && config[k] != null ? config[k] : DEFAULTS[k];
    var forced = /[?&]sn-preview=1\b/.test(location.search);
    if (!c.enabled && !forced) return Promise.resolve(null);
    if (excluded(c.excludePaths, location.pathname) && !forced) return Promise.resolve(null);

    return detect().then(function (result) {
      var events = ['checked'];
      var reloadFlag = session && session.getItem(key('reload'));
      if (result.blocked) events.push('detected');
      else if (reloadFlag) { events.push('recovered'); session.removeItem(key('reload')); }
      ping(events);

      if (!(result.blocked || forced) || (!forced && recentlyDismissed(c))) return result;
      setTimeout(function () {
        ping(['shown']);
        render(c, {
          onDismiss: function () { rememberDismiss(c); ping(['dismissed']); },
          onReload: function () { if (session) session.setItem(key('reload'), '1'); ping(['reload']); },
        });
      }, forced ? 0 : Math.max(0, Number(c.delaySeconds) || 0) * 1000);
      return result;
    });
  }

  function start() {
    fetch(ORIGIN + '/api/v1/config?i=' + encodeURIComponent(instanceId), { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) { if (cfg) return run(cfg); })
      .catch(function () { /* never break the host site */ });
  }

  window.SiteNotice = { version: VERSION, detect: detect, render: render, run: run, defaults: DEFAULTS };

  if (instanceId && ORIGIN && window.fetch && window.Promise) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})();
