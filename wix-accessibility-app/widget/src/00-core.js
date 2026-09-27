// Core: script discovery, state, storage, helpers.
if (window.__a11ytkLoaded) return;
window.__a11ytkLoaded = true;

var SCRIPT = document.currentScript ||
  document.querySelector('script[src*="/widget.js"][data-instance]');
var INSTANCE = SCRIPT ? SCRIPT.getAttribute('data-instance') : null;
if (!INSTANCE || INSTANCE.indexOf('{{') === 0) return; // template param not substituted
var BASE = SCRIPT.getAttribute('data-base') || new URL(SCRIPT.src, location.href).origin;
var ROOT = document.documentElement;
var STORE_KEY = 'a11ytk:' + INSTANCE;
var HOST_ID = 'a11ytk-host';

var CONFIG = null;   // server config
var state = {};      // feature id -> value (0/false = off)
var shadow = null;   // shadow root of the widget host
var hostEl = null;

function storeGet(key, fallback, session) {
  try {
    var raw = (session ? sessionStorage : localStorage).getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function storeSet(key, value, session) {
  try { (session ? sessionStorage : localStorage).setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
}

function h(tag, attrs, children) {
  var el = document.createElement(tag);
  if (attrs) {
    for (var k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  (children || []).forEach(function (c) {
    if (c === null || c === undefined) return;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}

function debounce(fn, ms) {
  var t;
  return function () {
    var args = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, args); }, ms);
  };
}

function isOwn(el) {
  return !!el && (el === hostEl || el.id === HOST_ID || (el.closest && el.closest('#' + HOST_ID)));
}

function isVisible(el) {
  if (!el || !el.getClientRects || !el.getClientRects().length) return false;
  var cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0;
}

function textOf(el, max) {
  var t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  return max && t.length > max ? t.slice(0, max) + '…' : t;
}

/** Best-effort accessible name (subset of the accname algorithm). */
function accName(el) {
  if (!el || el.nodeType !== 1) return '';
  var v = el.getAttribute('aria-label');
  if (v && v.trim()) return v.trim();
  var lb = el.getAttribute('aria-labelledby');
  if (lb) {
    var s = lb.split(/\s+/).map(function (id) { var n = document.getElementById(id); return n ? textOf(n) : ''; }).join(' ').trim();
    if (s) return s;
  }
  if (el.tagName === 'IMG' || el.tagName === 'AREA') return (el.getAttribute('alt') || '').trim();
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
    if (el.id) {
      try {
        var lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (lab && textOf(lab)) return textOf(lab);
      } catch (e) { /* ignore */ }
    }
    var wrap = el.closest('label');
    if (wrap && textOf(wrap)) return textOf(wrap);
    if (el.type === 'submit' || el.type === 'button') return el.value || '';
    return (el.getAttribute('title') || el.getAttribute('placeholder') || '').trim();
  }
  var txt = textOf(el);
  if (txt) return txt;
  var img = el.querySelector && el.querySelector('img[alt]:not([alt=""]), svg title, [aria-label]');
  if (img) return img.tagName === 'title' ? img.textContent.trim() : (img.getAttribute('alt') || img.getAttribute('aria-label') || '').trim();
  return (el.getAttribute('title') || '').trim();
}

var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"], summary';
var CLICKABLE = 'a[href], button, [role=button], [role=link], [role=menuitem], [role=tab], input[type=submit], input[type=button], input[type=checkbox], input[type=radio], summary, select';

function focusElement(el) {
  if (!el) return;
  if (!el.matches(FOCUSABLE)) el.setAttribute('tabindex', '-1');
  el.scrollIntoView({ block: 'center', behavior: state.stopAnimations ? 'auto' : 'smooth' });
  try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
}

// Simple pub/sub used between modules.
var bus = {};
function on(evt, fn) { (bus[evt] = bus[evt] || []).push(fn); }
function emit(evt, data) { (bus[evt] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error('[a11ytk]', e); } }); }

// Analytics counters, flushed with sendBeacon.
var counters = {};
function track(name, n) {
  counters[name] = (counters[name] || 0) + (n || 1);
  if (CONFIG && CONFIG.ga4 && typeof window.gtag === 'function' && name.indexOf(':') > 0) {
    try { window.gtag('event', 'accessibility_' + name.split(':')[0], { a11y_item: name.split(':')[1] }); } catch (e) { /* ignore */ }
  }
}
function flushCounters() {
  var keys = Object.keys(counters);
  if (!keys.length) return;
  var payload = JSON.stringify({ i: INSTANCE, e: counters });
  counters = {};
  var url = BASE + '/api/widget/events';
  if (navigator.sendBeacon) navigator.sendBeacon(url, payload);
  else fetch(url, { method: 'POST', body: payload, keepalive: true, mode: 'cors' }).catch(function () {});
}

function hasFeature(id) {
  return !!CONFIG && CONFIG.features.indexOf(id) !== -1;
}
