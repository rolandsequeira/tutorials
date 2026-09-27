// Keyboard shortcuts navigation + on-screen virtual keyboard.
var NAV_TARGETS = {
  h: 'h1,h2,h3,h4,h5,h6,[role=heading]',
  l: 'a[href]',
  f: 'input:not([type=hidden]),select,textarea',
  b: 'button,[role=button],input[type=submit],input[type=button]',
  g: 'img[alt]:not([alt=""]),[role=img]',
};

function isTyping(el) {
  return el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
}

function navKeydown(e) {
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  var key = (e.code || '').replace(/^Key/, '').toLowerCase();
  if (key === 'm') {
    var main = document.querySelector('main, [role=main], #PAGES_CONTAINER, #SITE_PAGES');
    if (main) { e.preventDefault(); focusElement(main); }
    return;
  }
  var sel = NAV_TARGETS[key];
  if (!sel) return;
  var list = Array.prototype.filter.call(document.querySelectorAll(sel), function (el) { return !isOwn(el) && isVisible(el); });
  if (!list.length) return;
  e.preventDefault();
  var next = moveInList(list, e.shiftKey ? -1 : 1);
  if (next) announce(accName(next) || textOf(next, 80));
}

feature('keyboardNav', 'orientation', {
  kind: 'toggle',
  apply: function (v) {
    document.removeEventListener('keydown', navKeydown, true);
    if (v) {
      document.addEventListener('keydown', navKeydown, true);
      // Make custom widgets reachable with Tab.
      document.querySelectorAll('[role=button]:not([tabindex]),[role=link]:not([tabindex]),[role=tab]:not([tabindex]),[role=menuitem]:not([tabindex])').forEach(function (el) {
        if (!isOwn(el)) { el.setAttribute('tabindex', '0'); el.setAttribute('data-a11ytk-tab', ''); }
      });
      announce(t('shortcutsHelp'));
    } else {
      document.querySelectorAll('[data-a11ytk-tab]').forEach(function (el) { el.removeAttribute('tabindex'); el.removeAttribute('data-a11ytk-tab'); });
    }
  },
});

/* ---------- Virtual keyboard ---------- */
var kbTarget = null;
var kbShift = false;
var kbSymbols = false;
var KB_LETTERS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
var KB_SYMBOLS = ['1234567890', '@#$%&*-+()', '!"\':;/?,.', '_=[]{}<>'];

function kbInsert(text) {
  var el = kbTarget;
  if (!el) return;
  if (el.isContentEditable) { document.execCommand('insertText', false, text); return; }
  var start = el.selectionStart != null ? el.selectionStart : el.value.length;
  var end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
  var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  var value = el.value;
  var next;
  if (text === '\b') {
    if (start === end && start > 0) start--;
    next = value.slice(0, start) + value.slice(end);
    setter.call(el, next);
    try { el.setSelectionRange(start, start); } catch (e) { /* type=email etc. */ }
  } else {
    next = value.slice(0, start) + text + value.slice(end);
    setter.call(el, next);
    try { el.setSelectionRange(start + text.length, start + text.length); } catch (e) { /* ignore */ }
  }
  // Wix/React inputs listen to input events.
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderKeyboard() {
  var kb = layer('kb', 'kb');
  kb.setAttribute('aria-hidden', 'true'); // physical keyboard/AT users do not need it announced
  kb.innerHTML = '';
  var rows = kbSymbols ? KB_SYMBOLS : KB_LETTERS;
  rows.forEach(function (row, ri) {
    var r = h('div', { class: 'r' });
    if (ri === 3) r.appendChild(kbKey(t('shift'), function () { kbShift = !kbShift; renderKeyboard(); }, 'w' + (kbShift ? ' on' : '')));
    row.split('').forEach(function (ch) {
      var c = kbShift ? ch.toUpperCase() : ch;
      r.appendChild(kbKey(c, function () { kbInsert(c); if (kbShift) { kbShift = false; renderKeyboard(); } }));
    });
    if (ri === 3) r.appendChild(kbKey('⌫', function () { kbInsert('\b'); }, 'w'));
    kb.appendChild(r);
  });
  var last = h('div', { class: 'r' });
  last.appendChild(kbKey(kbSymbols ? 'ABC' : '?123', function () { kbSymbols = !kbSymbols; renderKeyboard(); }, 'w'));
  last.appendChild(kbKey(t('space'), function () { kbInsert(' '); }, 'xw'));
  last.appendChild(kbKey(t('enter'), function () {
    if (kbTarget && kbTarget.tagName === 'TEXTAREA') { kbInsert('\n'); return; }
    if (kbTarget && kbTarget.form) {
      if (kbTarget.form.requestSubmit) kbTarget.form.requestSubmit(); else kbTarget.form.submit();
    }
  }, 'w'));
  last.appendChild(kbKey('✕', hideKeyboard, 'w'));
  kb.appendChild(last);
}
function kbKey(label, fn, cls) {
  return h('button', {
    type: 'button', class: cls || null, text: label, tabindex: '-1',
    // Keep focus in the page's input.
    onmousedown: function (e) { e.preventDefault(); },
    onclick: function (e) { e.preventDefault(); fn(); },
  });
}
function hideKeyboard() { kbTarget = null; removeLayer('kb'); }
function kbFocus(e) {
  var el = e.target;
  if (isOwn(el)) return;
  var textual = (el.tagName === 'INPUT' && /^(text|email|search|tel|url|password|number|)$/.test(el.type)) || el.tagName === 'TEXTAREA' || el.isContentEditable;
  if (textual) { kbTarget = el; renderKeyboard(); }
}
feature('virtualKeyboard', 'tools', {
  kind: 'toggle',
  apply: function (v) {
    document.removeEventListener('focusin', kbFocus, true);
    if (v) {
      document.addEventListener('focusin', kbFocus, true);
      if (isTyping(document.activeElement)) kbFocus({ target: document.activeElement });
    } else hideKeyboard();
  },
});
