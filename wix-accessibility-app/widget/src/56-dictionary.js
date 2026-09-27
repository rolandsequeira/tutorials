// Dictionary: double-click (or select) a word to see its definition.
function closeDict() { removeLayer('dict'); }

function showDefinition(word, rect) {
  var box = layer('dict', 'popup');
  box.setAttribute('aria-hidden', 'false');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', t('dictionary') + ': ' + word);
  box.innerHTML = '';
  box.appendChild(h('button', { type: 'button', class: 'x', 'aria-label': t('close'), html: ICONS.close, onclick: closeDict }));
  var search = h('form', { class: 'dsearch', role: 'search', onsubmit: function (e) {
    e.preventDefault();
    var w = search.querySelector('input').value.trim();
    if (w) showDefinition(w, rect);
  } }, [
    h('input', { type: 'search', 'aria-label': t('dictSearch'), placeholder: t('dictSearch'), value: word }),
    h('button', { type: 'submit', text: '→', 'aria-label': t('dictSearch') }),
  ]);
  box.appendChild(search);
  box.appendChild(h('h4', { text: word }));
  var body = h('div', { role: 'status', text: t('dictLoading') });
  box.appendChild(body);
  var top = rect.bottom + 10;
  box.style.left = Math.max(8, Math.min(rect.left, innerWidth - 370)) + 'px';
  box.style.top = (top + 200 > innerHeight ? Math.max(8, rect.top - 210) : top) + 'px';

  var wikiLang = (ROOT.lang || LANG || 'en').slice(0, 2);
  var more = h('a', { href: 'https://' + wikiLang + '.wiktionary.org/wiki/' + encodeURIComponent(word), target: '_blank', rel: 'noopener', text: t('dictMore') });

  if (!word) { body.textContent = ''; box.querySelector('h4').remove(); setTimeout(function () { search.querySelector('input').focus(); }, 30); return; }
  if (wikiLang !== 'en') { body.textContent = ''; body.appendChild(more); return; }
  fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word))
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (data) {
      body.textContent = '';
      var entry = Array.isArray(data) && data[0];
      if (!entry) { body.appendChild(h('p', { text: t('dictNotFound') })); body.appendChild(more); return; }
      if (entry.phonetic) body.appendChild(h('p', null, [h('em', { text: entry.phonetic })]));
      (entry.meanings || []).slice(0, 3).forEach(function (m) {
        var d = m.definitions && m.definitions[0];
        if (!d) return;
        body.appendChild(h('p', null, [h('em', { text: m.partOfSpeech + ' — ' }), d.definition]));
      });
      body.appendChild(more);
    })
    .catch(function () { body.textContent = t('dictNotFound'); body.appendChild(more); });
  track('dict:lookup');
}

function dictHandler(e) {
  if (isOwn(e.target)) return;
  var sel = window.getSelection();
  var word = sel ? sel.toString().trim() : '';
  if (!word || word.length > 40 || /\s/.test(word)) return;
  word = word.replace(/[^\p{L}\p{M}'-]/gu, '');
  if (!word) return;
  var rect = sel.getRangeAt(0).getBoundingClientRect();
  showDefinition(word, rect);
}
function dictEsc(e) { if (e.key === 'Escape') closeDict(); }

feature('dictionary', 'tools', {
  kind: 'toggle',
  afterClick: function (v) { if (v) showDefinition('', { left: 16, top: 80, bottom: 80 }); },
  apply: function (v) {
    document.removeEventListener('dblclick', dictHandler, true);
    document.removeEventListener('keydown', dictEsc, true);
    if (v) {
      document.addEventListener('dblclick', dictHandler, true);
      document.addEventListener('keydown', dictEsc, true);
    } else closeDict();
  },
});
