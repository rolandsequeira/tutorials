(function () {
  'use strict';
  var qs = new URLSearchParams(location.search);
  var headers = { 'content-type': 'application/json' };
  if (qs.get('instance')) headers['x-wix-instance'] = qs.get('instance');
  else if (qs.get('instanceId')) { // DEV_MODE only
    headers['x-dev-instance'] = qs.get('instanceId');
    if (qs.get('plan')) headers['x-dev-plan'] = qs.get('plan');
  }

  var $ = function (sel) { return document.querySelector(sel); };
  var form = $('#settings-form');
  var editor = $('#chart-editor');
  var site = null;
  var charts = [];       // working copy, saved with the rest of the form
  var selected = 0;
  var collections = [];
  var popup = null;

  var MEASURES = [['text', 'Text'], ['length', 'Length (cm)'], ['weight', 'Weight (kg)']];

  function api(method, path, body, raw) {
    var h = Object.assign({}, headers);
    if (raw) h['content-type'] = raw.type || 'application/octet-stream';
    return fetch('/api/dashboard' + path, { method: method, headers: h, body: raw || (body ? JSON.stringify(body) : undefined) })
      .then(function (r) {
        if (r.status === 401) throw new Error('Your session expired. Reopen the app from your Wix dashboard.');
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j.error && j.error.length > 20 ? j.error : 'Request failed (' + r.status + ')');
          return j;
        });
      });
  }

  function showError(msg) {
    var el = $('#error');
    el.textContent = msg;
    el.hidden = !msg;
  }
  function dirty() { $('#save-status').textContent = 'Unsaved changes'; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  // ------------------------------------------------------------ general settings
  var FIELDS = ['linkText', 'linkStyle', 'position', 'fallback', 'layout', 'defaultUnit',
    'accentColor', 'textColor', 'backgroundColor', 'headerColor', 'productPath', 'customSelector'];

  function fill(s) {
    form.enabled.checked = !!s.enabled;
    FIELDS.forEach(function (k) { form[k].value = s[k] == null ? '' : s[k]; });
    form.showUnitSwitch.checked = !!s.showUnitSwitch;
    form.showBranding.checked = s.showBranding !== false;
    charts = clone(s.charts || []);
    if (selected >= charts.length) selected = 0;
    drawChartList();
    drawEditor();
  }

  function read() {
    var out = { enabled: form.enabled.checked, showUnitSwitch: form.showUnitSwitch.checked, showBranding: form.showBranding.checked };
    FIELDS.forEach(function (k) { out[k] = form[k].value; });
    out.charts = charts.map(function (c) { var x = clone(c); delete x.active; return x; });
    return out;
  }

  function applyPlanLocks() {
    var limits = site.limits;
    document.querySelectorAll('[data-requires]').forEach(function (box) {
      var allowed = !!limits[box.getAttribute('data-requires')];
      box.classList.toggle('locked', !allowed);
      var lock = box.querySelector('.lock');
      if (lock) lock.hidden = allowed;
      box.querySelectorAll('input, textarea, select, button').forEach(function (i) { i.disabled = !allowed; });
    });
    var full = charts.length >= limits.maxCharts;
    $('#charts-lock').hidden = !(full && limits.maxCharts < site.plans.pro.maxCharts);
    $('#add-chart').disabled = full;
    $('#template-select').disabled = full;
  }

  // ------------------------------------------------------------ chart list
  function summary(c) {
    var a = c.assign || {};
    var parts = [];
    if (a.products && a.products.length) parts.push(a.products.length + ' product' + (a.products.length > 1 ? 's' : ''));
    if (a.keywords && a.keywords.length) parts.push('keywords: ' + a.keywords.join(', '));
    if (a.collections && a.collections.length) {
      parts.push(a.collections.map(function (id) {
        var col = collections.find(function (x) { return x.id === id; });
        return col ? col.name : 'category';
      }).join(', '));
    }
    if (a.all) parts.push('all other products');
    return parts.length ? 'Shown on ' + parts.join(' · ') : 'Not assigned to any product yet';
  }

  function drawChartList() {
    var ol = $('#chart-list');
    ol.textContent = '';
    charts.forEach(function (c, i) {
      var li = el('li', { class: 'chart-item' + (i === selected ? ' sel' : '') + (c.active === false ? ' inactive' : '') });
      var info = el('div', { class: 'ci-info' });
      info.appendChild(el('b', null, c.name));
      info.appendChild(el('span', { class: 'muted small' }, c.active === false ? 'Not shown on the Free plan. Upgrade to use it.' : summary(c)));
      li.appendChild(info);
      var btns = el('div', { class: 'ci-btns' });
      function b(label, aria, fn, disabled) {
        var x = el('button', { type: 'button', class: 'btn small-btn', 'aria-label': aria }, label);
        x.disabled = !!disabled;
        x.addEventListener('click', fn);
        btns.appendChild(x);
      }
      b('Edit', 'Edit ' + c.name, function () { selected = i; drawChartList(); drawEditor(); drawPreview(); editor.scrollIntoView({ behavior: 'smooth' }); });
      b('↑', 'Move ' + c.name + ' up', function () { move(i, -1); }, i === 0);
      b('↓', 'Move ' + c.name + ' down', function () { move(i, 1); }, i === charts.length - 1);
      b('Copy', 'Duplicate ' + c.name, function () { addChart(Object.assign(clone(c), { name: c.name + ' (copy)' })); }, charts.length >= site.limits.maxCharts);
      b('Delete', 'Delete ' + c.name, function () {
        if (!confirm('Delete the chart "' + c.name + '"?')) return;
        charts.splice(i, 1);
        if (selected >= charts.length) selected = Math.max(0, charts.length - 1);
        changed();
      });
      li.appendChild(btns);
      ol.appendChild(li);
    });
    if (!charts.length) ol.appendChild(el('li', { class: 'muted' }, 'No charts yet. Add one below.'));
    if (site) applyPlanLocks();
  }

  function move(i, d) {
    var c = charts.splice(i, 1)[0];
    charts.splice(i + d, 0, c);
    if (selected === i) selected = i + d;
    else if (selected === i + d) selected = i;
    changed();
  }

  function newId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  function addChart(c) {
    c.id = newId();
    c.assign = c.assign || { all: !charts.length, products: [], collections: [], keywords: [] };
    charts.push(c);
    selected = charts.length - 1;
    changed();
    editor.scrollIntoView({ behavior: 'smooth' });
  }

  function changed() { drawChartList(); drawEditor(); drawPreview(); dirty(); }

  // ------------------------------------------------------------ chart editor
  function cur() { return charts[selected]; }

  function drawEditor() {
    var c = cur();
    editor.hidden = !c;
    if (!c) return;
    $('#editor-name').textContent = c.name;
    editor.querySelectorAll('[data-chart]').forEach(function (i) { i.value = c[i.getAttribute('data-chart')] || ''; });
    var a = c.assign;
    editor.querySelector('[data-assign=all]').checked = !!a.all;
    editor.querySelector('[data-assign=keywords]').value = (a.keywords || []).join(', ');
    editor.querySelector('[data-assign=products]').value = (a.products || []).join('\n');
    drawCollections();
    drawGrid();
    drawThumb();
  }

  function drawThumb() {
    var c = cur();
    var img = $('#image-thumb');
    var src = c && c.image ? (c.image.indexOf('/u/') === 0 ? site.baseUrl + c.image : c.image) : '';
    img.hidden = !src;
    if (src) img.src = src;
  }

  function drawCollections() {
    var box = $('#collections');
    box.textContent = '';
    var c = cur();
    collections.forEach(function (col) {
      var l = el('label', { class: 'check' });
      var cb = el('input', { type: 'checkbox', value: col.id });
      cb.checked = c.assign.collections.indexOf(col.id) !== -1;
      cb.addEventListener('change', function () {
        var list = cur().assign.collections;
        var at = list.indexOf(col.id);
        if (cb.checked && at === -1) list.push(col.id);
        if (!cb.checked && at !== -1) list.splice(at, 1);
        drawChartList(); drawPreview(); dirty();
      });
      l.appendChild(cb);
      l.appendChild(document.createTextNode(' ' + col.name));
      box.appendChild(l);
    });
  }

  function drawGrid() {
    var c = cur();
    var t = $('#grid');
    t.textContent = '';
    var thead = el('thead');
    var tr = el('tr');
    c.columns.forEach(function (col, ci) {
      var th = el('th', { scope: 'col' });
      var label = el('input', { 'aria-label': 'Column ' + (ci + 1) + ' name', maxlength: '40' });
      label.value = col.label;
      label.addEventListener('input', function () { col.label = label.value; drawPreview(); dirty(); });
      var sel = el('select', { 'aria-label': 'Column ' + (ci + 1) + ' type' });
      MEASURES.forEach(function (m) { var o = el('option', { value: m[0] }, m[1]); sel.appendChild(o); });
      sel.value = col.measure;
      sel.addEventListener('change', function () { col.measure = sel.value; drawPreview(); dirty(); });
      th.appendChild(label);
      th.appendChild(sel);
      if (c.columns.length > 1) {
        var x = el('button', { type: 'button', class: 'del', 'aria-label': 'Delete column ' + (col.label || ci + 1) }, '×');
        x.addEventListener('click', function () {
          c.columns.splice(ci, 1);
          c.rows.forEach(function (r) { r.splice(ci, 1); });
          drawGrid(); drawPreview(); dirty();
        });
        th.appendChild(x);
      }
      tr.appendChild(th);
    });
    tr.appendChild(el('th', { class: 'gutter' }));
    thead.appendChild(tr);
    t.appendChild(thead);
    var tbody = el('tbody');
    c.rows.forEach(function (row, ri) {
      var r = el('tr');
      c.columns.forEach(function (col, ci) {
        var td = el('td');
        var inp = el('input', { 'aria-label': (col.label || 'Column ' + (ci + 1)) + ', row ' + (ri + 1), maxlength: '40' });
        inp.value = row[ci] == null ? '' : row[ci];
        inp.addEventListener('input', function () { row[ci] = inp.value; drawPreview(); dirty(); });
        td.appendChild(inp);
        r.appendChild(td);
      });
      var g = el('td', { class: 'gutter' });
      var x = el('button', { type: 'button', class: 'del', 'aria-label': 'Delete row ' + (ri + 1) }, '×');
      x.addEventListener('click', function () { c.rows.splice(ri, 1); drawGrid(); drawPreview(); dirty(); });
      g.appendChild(x);
      r.appendChild(g);
      tbody.appendChild(r);
    });
    t.appendChild(tbody);
    $('#add-row').disabled = c.rows.length >= site.maxRows;
    $('#add-col').disabled = c.columns.length >= site.maxColumns;
  }

  /** Parse cells pasted from Excel / Google Sheets (tab separated) or a CSV. */
  function parsePaste(text) {
    var lines = text.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); });
    if (!lines.length) return null;
    var sep = lines[0].indexOf('\t') !== -1 ? '\t' : lines[0].indexOf(';') !== -1 ? ';' : ',';
    var cells = lines.map(function (l) { return l.split(sep).map(function (v) { return v.trim().replace(/^"|"$/g, ''); }); });
    var head = cells.shift().slice(0, site.maxColumns);
    return {
      columns: head.map(function (label, i) {
        var unitHint = /\b(cm|mm|in|inch|inches|")\b|\((cm|in)\)/i.test(label);
        var weightHint = /\b(kg|lb|lbs)\b/i.test(label);
        var numeric = i > 0 && cells.length && cells.every(function (r) { return /^[\d.,\s+–-]*$/.test(r[i] || ''); });
        return {
          label: label.replace(/\s*\((cm|in|kg|lb)\)\s*$/i, ''),
          measure: weightHint ? 'weight' : unitHint || (numeric && /chest|bust|waist|hip|length|height|inseam|sleeve|foot|hand|circ|brust|taille|hüft|länge/i.test(label)) ? 'length' : 'text',
        };
      }),
      rows: cells.slice(0, site.maxRows).map(function (r) { return head.map(function (_, i) { return r[i] || ''; }); }),
    };
  }

  editor.addEventListener('input', function (e) {
    var t = e.target;
    var c = cur();
    if (!c) return;
    if (t.hasAttribute('data-chart')) {
      c[t.getAttribute('data-chart')] = t.value;
      if (t.getAttribute('data-chart') === 'name') { $('#editor-name').textContent = t.value; drawChartList(); }
      if (t.getAttribute('data-chart') === 'image') drawThumb();
    } else if (t.getAttribute('data-assign') === 'keywords') {
      c.assign.keywords = t.value.split(',').map(function (k) { return k.trim().toLowerCase(); }).filter(Boolean);
      drawChartList();
    } else if (t.getAttribute('data-assign') === 'products') {
      c.assign.products = t.value.split('\n').map(function (p) {
        p = p.trim();
        var m = p.match(/\/product-page\/([^/?#]+)/); // accept a full product URL too
        return (m ? m[1] : p).toLowerCase();
      }).filter(Boolean);
      drawChartList();
    } else return;
    drawPreview(); dirty();
  });
  editor.querySelector('[data-assign=all]').addEventListener('change', function (e) {
    cur().assign.all = e.target.checked; drawChartList(); dirty();
  });

  $('#add-row').addEventListener('click', function () {
    var c = cur();
    c.rows.push(c.columns.map(function () { return ''; }));
    drawGrid(); dirty();
    var inputs = $('#grid').querySelectorAll('tbody tr:last-child input');
    if (inputs[0]) inputs[0].focus();
  });
  $('#add-col').addEventListener('click', function () {
    var c = cur();
    c.columns.push({ label: 'Column ' + (c.columns.length + 1), measure: 'length' });
    c.rows.forEach(function (r) { r.push(''); });
    drawGrid(); drawPreview(); dirty();
  });
  $('#paste-apply').addEventListener('click', function () {
    var parsed = parsePaste($('#paste-box').value);
    if (!parsed) return;
    var c = cur();
    c.columns = parsed.columns;
    c.rows = parsed.rows;
    $('#paste-box').value = '';
    $('.paste').open = false;
    drawGrid(); drawPreview(); dirty();
  });
  $('#image-file').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var status = $('#save-status');
    status.textContent = 'Uploading image…';
    api('POST', '/images', null, file).then(function (r) {
      cur().image = r.url;
      editor.querySelector('[data-chart=image]').value = r.url;
      drawThumb(); drawPreview(); dirty();
      showError('');
    }).catch(function (err) { status.textContent = ''; showError(err.message); })
      .then(function () { e.target.value = ''; });
  });
  $('#image-remove').addEventListener('click', function () {
    cur().image = null;
    editor.querySelector('[data-chart=image]').value = '';
    drawThumb(); drawPreview(); dirty();
  });

  $('#add-chart').addEventListener('click', function () {
    var key = $('#template-select').value;
    var tpl = site.templates.find(function (t) { return t.key === key; });
    addChart(tpl
      ? { name: tpl.name, title: tpl.title, note: tpl.note, image: null, columns: clone(tpl.columns), rows: clone(tpl.rows) }
      : { name: 'New chart', title: 'Size guide', note: '', image: null, columns: [{ label: 'Size', measure: 'text' }, { label: 'Chest', measure: 'length' }], rows: [['S', ''], ['M', ''], ['L', '']] });
  });

  // ------------------------------------------------------------ preview
  function drawPreview() {
    if (!window.SizeGuide || !site) return;
    var s = read();
    var c = cur();
    if (!site.limits.unitSwitch) s.showUnitSwitch = false;
    s.branding = s.showBranding || !site.limits.removeBranding ? { name: site.appName, url: site.landingUrl } : null;
    var image = c && site.limits.images && c.image ? (c.image.indexOf('/u/') === 0 ? site.baseUrl + c.image : c.image) : null;
    s.chart = c ? { title: c.title, note: c.note, image: image, columns: c.columns, rows: c.rows } : null;
    $('#preview-chart-name').textContent = c ? 'Showing "' + c.name + '".' : '';
    $('#fake-title').textContent = c && c.name ? c.name.replace(/ \(.*\)$/, '') : 'Product name';
    var slot = $('#fake-link-slot');
    slot.textContent = '';
    var wasOpen = !popup || popup.isOpen;
    if (popup && popup.handle) popup.handle.close();
    popup = { isOpen: false, handle: null };
    if (!s.chart) return;
    var p = popup;
    function show() {
      p.handle = window.SizeGuide.open(s, { container: $('#preview'), onClose: function () { p.isOpen = false; } });
      p.isOpen = true;
    }
    slot.appendChild(window.SizeGuide.trigger(s, show));
    if (wasOpen) show();
  }

  // ------------------------------------------------------------ stats
  function tile(value, label) {
    var d = el('div', { class: 'tile' });
    d.appendChild(el('div', { class: 'v' }, value));
    d.appendChild(el('div', { class: 'l' }, label));
    return d;
  }
  function pct(a, b) { return b ? Math.round((a / b) * 100) + '%' : '–'; }

  function drawStats(stats) {
    var t = stats.totals;
    $('#stats-range').textContent = '(last ' + stats.days + ' days, counted once per visit)';
    var tiles = $('#stat-tiles');
    tiles.textContent = '';
    tiles.appendChild(tile(t.viewed.toLocaleString(), 'Visits that saw the link'));
    tiles.appendChild(tile(t.opened.toLocaleString(), 'Visits that opened the guide'));
    tiles.appendChild(tile(pct(t.opened, t.viewed), 'Open rate'));
    tiles.appendChild(tile(t.unit.toLocaleString(), 'Switched to other units'));

    var chart = $('#daily-chart');
    chart.textContent = '';
    var byDay = {};
    stats.daily.forEach(function (d) { byDay[d.day] = d; });
    var days = [];
    for (var i = stats.days - 1; i >= 0; i--) days.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
    var max = Math.max.apply(null, days.map(function (d) { return (byDay[d] || {}).viewed || 0; }).concat([1]));
    days.forEach(function (day) {
      var d = byDay[day] || { viewed: 0, opened: 0 };
      var col = el('div', { class: 'day', title: day + ': ' + d.viewed + ' saw the link, ' + d.opened + ' opened it' });
      var bar = el('div', { class: 'bar' });
      bar.style.height = (d.viewed / max) * 100 + '%';
      var inner = el('i');
      inner.style.height = d.viewed ? Math.min(100, (d.opened / d.viewed) * 100) + '%' : '0';
      bar.appendChild(inner);
      col.appendChild(bar);
      chart.appendChild(col);
    });
    if (!chart.nextElementSibling || !chart.nextElementSibling.classList.contains('legend')) {
      var legend = el('div', { class: 'legend' });
      legend.appendChild(el('span', null, 'Saw the link'));
      legend.appendChild(el('span', { class: 's1' }, 'Opened the guide'));
      chart.after(legend);
    }
  }

  // ------------------------------------------------------------ boot
  function load() {
    return api('GET', '/site').then(function (s) {
      site = s;
      $('#app-name').textContent = s.appName;
      document.title = s.appName + ' settings';
      $('#site-line').textContent = s.siteName || s.siteUrl || s.instanceId;
      $('#plan-badge').textContent = s.planName + ' plan';
      var up = $('#upgrade');
      up.hidden = !(s.upgradeUrl && s.plan === 'free');
      if (s.upgradeUrl) up.href = s.upgradeUrl;
      $('#embed-warning').hidden = !!s.scriptEmbedded;
      if (s.siteUrl) {
        var lp = $('#live-preview');
        lp.href = s.siteUrl + (s.siteUrl.indexOf('?') === -1 ? '?' : '&') + 'sg-preview=1&sg-open=1';
        lp.hidden = false;
      }
      var ts = $('#template-select');
      ts.appendChild(el('option', { value: '' }, 'Empty chart'));
      s.templates.forEach(function (t) { ts.appendChild(el('option', { value: t.key }, t.name)); });
      ts.value = s.templates[0] ? s.templates[0].key : '';
      fill(s.settings);
      applyPlanLocks();
      drawPreview();
      api('GET', '/collections').then(function (r) {
        collections = r.collections || [];
        $('#collections-status').textContent = r.error || (collections.length ? '' : 'No categories found in your store.');
        drawCollections();
        drawChartList();
      }).catch(function () { $('#collections-status').textContent = 'Could not load categories.'; });
      return api('GET', '/stats').then(drawStats);
    }).catch(function (e) { showError(e.message); });
  }

  form.addEventListener('input', function (e) { if (!editor.contains(e.target)) { drawPreview(); dirty(); } });
  form.addEventListener('change', function (e) { if (!editor.contains(e.target)) drawPreview(); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var status = $('#save-status');
    status.textContent = 'Saving…';
    api('PUT', '/settings', read()).then(function (r) {
      fill(r.settings);
      applyPlanLocks();
      drawPreview();
      showError('');
      status.textContent = 'Saved. Shoppers see the change within 5 minutes.';
    }).catch(function (err) { status.textContent = ''; showError(err.message); });
  });

  load();
})();
