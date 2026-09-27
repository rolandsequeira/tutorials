// Text to speech, read page aloud, voice navigation.
var synth = window.speechSynthesis;
var RATES = [1, 1, 1.4, 0.75];

function pickVoice(lang) {
  if (!synth) return null;
  var voices = synth.getVoices();
  lang = (lang || '').toLowerCase();
  var base = lang.slice(0, 2);
  return voices.find(function (v) { return v.lang.toLowerCase() === lang; }) ||
    voices.find(function (v) { return v.lang.toLowerCase().slice(0, 2) === base; }) || null;
}

function speak(text, opts) {
  if (!synth || !text) return;
  opts = opts || {};
  if (!opts.queue) synth.cancel();
  var u = new SpeechSynthesisUtterance(text.slice(0, 3000));
  var lang = ROOT.lang || LANG;
  u.lang = lang;
  var v = pickVoice(lang);
  if (v) u.voice = v;
  u.rate = RATES[state.screenReader || 1] || 1;
  if (opts.onend) u.onend = opts.onend;
  if (opts.onerror) u.onerror = opts.onerror;
  synth.speak(u);
}

function describeForSpeech(el) {
  var role = el.getAttribute('role') || '';
  var name = accName(el);
  if (el.tagName === 'A' || role === 'link') return name + ', link';
  if (el.tagName === 'BUTTON' || role === 'button') return name + ', button';
  if (/^H[1-6]$/.test(el.tagName)) return name + ', heading level ' + el.tagName[1];
  if (el.tagName === 'IMG') return (name || t('noAlt')) + ', image';
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    var val = el.type === 'password' ? '' : el.value;
    return (name || '') + ', ' + (el.type === 'checkbox' || el.type === 'radio' ? (el.checked ? 'checked ' : 'not checked ') + el.type : 'edit text') + (val ? ', ' + val : '');
  }
  if (el.tagName === 'SELECT') return name + ', ' + (el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '') + ', list';
  return name;
}

var srHoverTimer = null;
var srLast = null;
function srFocus(e) {
  if (isOwn(e.target)) return;
  speak(describeForSpeech(e.target));
}
function srHover(e) {
  clearTimeout(srHoverTimer);
  var el = e.target;
  if (!el || isOwn(el)) return;
  srHoverTimer = setTimeout(function () {
    var target = el.closest('a[href],button,[role=button],[role=link],h1,h2,h3,h4,h5,h6,img,input,select,textarea,li,p,td,th,label') || el;
    if (target === srLast || target === document.body) return;
    srLast = target;
    var text = describeForSpeech(target) || textOf(target, 600);
    if (text) speak(text);
  }, 450);
}

feature('screenReader', 'tools', {
  kind: 'levels', levels: ['l_normal', 'l_fast', 'l_slow'],
  apply: function (v) {
    if (v && !synth) { announce(t('speechUnsupported')); return; }
    document.removeEventListener('focusin', srFocus, true);
    document.removeEventListener('mouseover', srHover, true);
    if (v) {
      document.addEventListener('focusin', srFocus, true);
      document.addEventListener('mouseover', srHover, true);
    } else if (synth) { synth.cancel(); srLast = null; }
  },
});

/* ---------- Read page aloud ---------- */
var reading = null;
function readableBlocks() {
  var main = document.querySelector('main, [role=main], #PAGES_CONTAINER, #SITE_PAGES') || document.body;
  var nodes = main.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,td,th,dt,dd');
  var out = [];
  nodes.forEach(function (n) {
    if (isOwn(n) || !isVisible(n)) return;
    if (n.parentElement && n.parentElement.closest('p,li,blockquote,td,th')) return; // avoid nested duplicates
    var txt = textOf(n);
    if (txt.length > 1) out.push(n);
  });
  return out;
}
function stopReading() {
  if (!reading) return;
  if (reading.el) reading.el.classList.remove('a11ytk-reading');
  reading = null;
  if (synth) synth.cancel();
  removeLayer('readbubble');
  emit('render');
}
function readNext() {
  if (!reading) return;
  if (reading.el) reading.el.classList.remove('a11ytk-reading');
  var el = reading.blocks[reading.i++];
  if (!el) { stopReading(); return; }
  reading.el = el;
  el.classList.add('a11ytk-reading');
  el.scrollIntoView({ block: 'center', behavior: state.stopAnimations ? 'auto' : 'smooth' });
  speak(describeForSpeech(el) || textOf(el), { onend: readNext, onerror: function (e) { if (e.error !== 'interrupted' && e.error !== 'canceled') stopReading(); } });
}
feature('readPage', 'tools', {
  kind: 'action',
  active: function () { return !!reading; },
  run: function () {
    if (reading) { stopReading(); return; }
    if (!synth) { announce(t('speechUnsupported')); return; }
    reading = { blocks: readableBlocks(), i: 0, el: null };
    var b = layer('readbubble', 'bubble');
    b.setAttribute('aria-hidden', 'false');
    b.innerHTML = '';
    b.appendChild(h('span', { text: t('readPage') }));
    b.appendChild(h('button', { type: 'button', text: t('stop'), onclick: stopReading }));
    readNext();
  },
});

/* ---------- Voice navigation ---------- */
var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
var recog = null;
var numbered = [];

function clickables() {
  return Array.prototype.filter.call(document.querySelectorAll(CLICKABLE + ', input[type=text], input[type=email], input[type=search], textarea'), function (el) {
    if (isOwn(el) || !isVisible(el)) return false;
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  });
}
function showNumbers() {
  hideNumbers();
  numbered = clickables().slice(0, 150);
  var wrap = layer('numbers', 'numbers');
  wrap.style.cssText = 'position:absolute;left:0;top:0;';
  numbered.forEach(function (el, i) {
    var r = el.getBoundingClientRect();
    var b = h('span', { class: 'badge', text: String(i + 1) });
    b.style.left = (r.left + scrollX) + 'px';
    b.style.top = (r.top + scrollY) + 'px';
    wrap.appendChild(b);
  });
}
function hideNumbers() { numbered = []; removeLayer('numbers'); }

function activate(el) {
  if (!el) return false;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(submit|button|checkbox|radio)$/.test(el.type)) { focusElement(el); return true; }
  focusElement(el);
  el.click();
  return true;
}

var WORD_NUMS = { one: 1, two: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
function headingList() {
  return Array.prototype.filter.call(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]'), function (el) { return !isOwn(el) && isVisible(el); });
}
function moveInList(list, dir) {
  var cur = document.activeElement;
  var idx = list.indexOf(cur);
  if (idx === -1) {
    // Pick relative to viewport position.
    idx = dir > 0 ? list.findIndex(function (el) { return el.getBoundingClientRect().top > 5; }) - 1 : list.length;
  }
  var next = list[Math.max(0, Math.min(list.length - 1, idx + dir))];
  focusElement(next);
  return next;
}

function handleCommand(raw) {
  var cmd = raw.toLowerCase().trim().replace(/[.!?]$/, '');
  var num = cmd.match(/^(?:click |press |select |number )?(\d+|one|two|three|four|for|five|six|seven|eight|nine|ten)$/);
  var behavior = state.stopAnimations ? 'auto' : 'smooth';
  if (num && numbered.length) {
    var n = WORD_NUMS[num[1]] || parseInt(num[1], 10);
    activate(numbered[n - 1]); hideNumbers(); return true;
  }
  if (/scroll down|page down|down$/.test(cmd)) { scrollBy({ top: innerHeight * 0.8, behavior: behavior }); return true; }
  if (/scroll up|page up|up$/.test(cmd)) { scrollBy({ top: -innerHeight * 0.8, behavior: behavior }); return true; }
  if (/stop reading|^stop$/.test(cmd)) { stopReading(); return true; }
  if (/stop listening|turn off voice/.test(cmd)) { setFeature('voiceNav', false); return true; }
  if (/\btop\b/.test(cmd)) { scrollTo({ top: 0, behavior: behavior }); return true; }
  if (/\bbottom\b/.test(cmd)) { scrollTo({ top: document.body.scrollHeight, behavior: behavior }); return true; }
  if (/go back|^back$/.test(cmd)) { history.back(); return true; }
  if (/go forward|^forward$/.test(cmd)) { history.forward(); return true; }
  if (/reload|refresh/.test(cmd)) { location.reload(); return true; }
  if (/next heading/.test(cmd)) { moveInList(headingList(), 1); return true; }
  if (/previous heading/.test(cmd)) { moveInList(headingList(), -1); return true; }
  if (/show numbers|show links|numbers/.test(cmd)) { showNumbers(); return true; }
  if (/hide numbers/.test(cmd)) { hideNumbers(); return true; }
  if (/zoom in|bigger|larger/.test(cmd)) { setFeature('fontSize', Math.min(200, (state.fontSize || 100) + 10)); return true; }
  if (/zoom out|smaller/.test(cmd)) { setFeature('fontSize', Math.max(80, (state.fontSize || 100) - 10)); return true; }
  if (/read (the )?page/.test(cmd) && hasFeature('readPage')) { FEATURES.readPage.run(); return true; }
  if (/open menu|menu/.test(cmd)) {
    var m = document.querySelector('[aria-label*="menu" i], [data-testid*="menu" i] button, nav button');
    if (m) { activate(m); return true; }
  }
  if (/^help|what can i say/.test(cmd)) { voiceBubble(t('voiceHelp')); return 'keep'; }
  var click = cmd.match(/^(?:click|press|open|go to|select)\s+(?:on\s+)?(?:the\s+)?(.+)$/);
  if (click) {
    var target = click[1];
    var best = null, bestScore = 0;
    clickables().forEach(function (el) {
      var name = accName(el).toLowerCase();
      if (!name) return;
      var score = name === target ? 3 : name.indexOf(target) === 0 ? 2 : name.indexOf(target) !== -1 ? 1 : 0;
      if (score > bestScore) { best = el; bestScore = score; }
    });
    if (best) { activate(best); return true; }
  }
  return false;
}

function voiceBubble(text) {
  var b = layer('voice', 'bubble');
  b.setAttribute('aria-hidden', 'false');
  b.innerHTML = '';
  b.appendChild(h('span', { html: ICONS.voiceNav }));
  b.appendChild(h('span', { text: text, role: 'status' }));
  b.appendChild(h('button', { type: 'button', text: t('stop'), onclick: function () { setFeature('voiceNav', false); } }));
}

feature('voiceNav', 'tools', {
  kind: 'toggle',
  apply: function (v) {
    if (!v) {
      if (recog) { recog.onend = null; try { recog.stop(); } catch (e) { /* ignore */ } recog = null; }
      removeLayer('voice'); hideNumbers();
      return;
    }
    if (!Recognition) { announce(t('voiceUnsupported')); state.voiceNav = false; return; }
    if (recog) return;
    recog = new Recognition();
    recog.lang = ROOT.lang || navigator.language || 'en-US';
    recog.continuous = true;
    recog.interimResults = false;
    recog.onresult = function (e) {
      var res = e.results[e.results.length - 1];
      var heard = res[0].transcript;
      var ok = handleCommand(heard);
      if (ok !== 'keep') voiceBubble('“' + heard.trim() + '”' + (ok ? ' ✓' : ' ?'));
      track('voice:' + (ok ? 'ok' : 'miss'));
    };
    recog.onend = function () { if (state.voiceNav && recog) { try { recog.start(); } catch (e) { /* ignore */ } } };
    recog.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setFeature('voiceNav', false); announce(t('voiceUnsupported')); }
    };
    try { recog.start(); } catch (e) { /* already started */ }
    voiceBubble(t('listening') + ' ' + t('voiceHelp'));
  },
});
