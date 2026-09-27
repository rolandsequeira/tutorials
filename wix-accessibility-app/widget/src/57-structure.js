// Page structure view: headings, landmarks and links, rendered inside the panel.
var LANDMARKS = [
  ['header, [role=banner]', 'Header'],
  ['nav, [role=navigation]', 'Navigation'],
  ['main, [role=main]', 'Main'],
  ['aside, [role=complementary]', 'Complementary'],
  ['form[aria-label], form[aria-labelledby], [role=form], [role=search]', 'Form'],
  ['footer, [role=contentinfo]', 'Footer'],
];

function structureItems(tab) {
  var items = [];
  if (tab === 'headings') {
    headingList().forEach(function (el) {
      var lvl = /^H[1-6]$/.test(el.tagName) ? el.tagName : 'H' + (el.getAttribute('aria-level') || '2');
      var txt = textOf(el, 90);
      if (txt) items.push({ tag: lvl, text: txt, el: el, indent: (parseInt(lvl[1], 10) - 1) * 12 });
    });
  } else if (tab === 'landmarks') {
    LANDMARKS.forEach(function (lm) {
      document.querySelectorAll(lm[0]).forEach(function (el) {
        if (isOwn(el) || !isVisible(el)) return;
        items.push({ tag: lm[1].slice(0, 4), text: (accName(el) && el.getAttribute('aria-label')) || lm[1], el: el });
      });
    });
  } else {
    var seen = {};
    document.querySelectorAll('a[href]').forEach(function (el) {
      if (isOwn(el) || !isVisible(el)) return;
      var name = accName(el);
      var key = name + '|' + el.href;
      if (!name || seen[key]) return;
      seen[key] = 1;
      items.push({ tag: 'A', text: name.slice(0, 90), el: el });
    });
  }
  return items;
}

var structureTab = 'headings';
function renderStructure(container) {
  container.appendChild(h('button', {
    type: 'button', class: 'icon-btn', style: 'background:var(--card);color:var(--fg);width:auto;padding:0 12px;gap:6px',
    'data-fid': 'back',
    onclick: function () { panelView = 'main'; renderPanel(); shadow.querySelector('.panel .close').focus(); },
  }, [h('span', { html: ICONS.back }), t('back')]));
  var sub = h('div', { class: 'sub' });
  sub.appendChild(h('h3', { text: t('pageStructure') }));
  var tabs = h('div', { class: 'tabs', role: 'tablist' });
  ['headings', 'landmarks', 'links'].forEach(function (k) {
    tabs.appendChild(h('button', {
      type: 'button', role: 'tab', 'data-fid': 'tab-' + k, 'aria-selected': String(structureTab === k), text: t(k),
      onclick: function () { structureTab = k; renderPanel(); },
    }));
  });
  sub.appendChild(tabs);
  var items = structureItems(structureTab);
  var list = h('ul', { class: 'list', role: 'tabpanel' });
  if (!items.length) list.appendChild(h('li', { text: t('none') }));
  items.forEach(function (it) {
    var btn = h('button', { type: 'button', onclick: function () { closePanel(); focusElement(it.el); } }, [
      h('span', { class: 'tag', text: it.tag }), it.text,
    ]);
    if (it.indent) btn.style.paddingInlineStart = (6 + it.indent) + 'px';
    list.appendChild(h('li', null, [btn]));
  });
  sub.appendChild(list);
  container.appendChild(sub);
}

feature('pageStructure', 'orientation', {
  kind: 'action',
  run: function () { panelView = 'structure'; renderPanel(); },
});
