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
  var site = null;
  var preview = null;

  function api(method, path, body) {
    return fetch('/api/dashboard' + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        if (r.status === 401) throw new Error('Your session expired. Reopen the app from your Wix dashboard.');
        if (!r.ok) throw new Error('Request failed (' + r.status + ')');
        return r.json();
      });
  }

  function showError(msg) {
    var el = $('#error');
    el.textContent = msg;
    el.hidden = !msg;
  }

  // ------------------------------------------------------------ form <-> settings
  function fill(s) {
    form.enabled.checked = !!s.enabled;
    form.querySelectorAll('input[name=mode]').forEach(function (r) { r.checked = r.value === s.mode; });
    ['layout', 'frequency', 'delaySeconds', 'title', 'message', 'reloadLabel', 'dismissLabel',
      'backgroundColor', 'textColor', 'accentColor', 'overlayOpacity'].forEach(function (k) { form[k].value = s[k]; });
    form.excludePaths.value = (s.excludePaths || []).join('\n');
    form.showBranding.checked = s.showBranding !== false;
    syncDisabled();
  }

  function read() {
    var mode = form.querySelector('input[name=mode]:checked');
    return {
      enabled: form.enabled.checked,
      mode: mode ? mode.value : 'dismiss',
      layout: form.layout.value,
      frequency: form.frequency.value,
      delaySeconds: Number(form.delaySeconds.value),
      title: form.title.value,
      message: form.message.value,
      reloadLabel: form.reloadLabel.value,
      dismissLabel: form.dismissLabel.value,
      backgroundColor: form.backgroundColor.value,
      textColor: form.textColor.value,
      accentColor: form.accentColor.value,
      overlayOpacity: Number(form.overlayOpacity.value),
      excludePaths: form.excludePaths.value.split('\n').map(function (p) { return p.trim(); }).filter(Boolean),
      showBranding: form.showBranding.checked,
    };
  }

  // Block mode is always a pop-up without a close button.
  function syncDisabled() {
    var block = form.querySelector('input[name=mode][value=block]').checked;
    form.layout.disabled = block;
    if (block) form.layout.value = 'modal';
    form.frequency.disabled = block;
    $('#dismiss-label-field').hidden = block;
  }

  function applyPlanLocks() {
    var limits = site.limits;
    document.querySelectorAll('[data-requires]').forEach(function (el) {
      var allowed = !!limits[el.getAttribute('data-requires')];
      el.classList.toggle('locked', !allowed);
      var lock = el.querySelector('.lock');
      if (lock) lock.hidden = allowed;
      el.querySelectorAll('input, textarea, select').forEach(function (i) { i.disabled = !allowed; });
    });
  }

  // ------------------------------------------------------------ preview
  function drawPreview() {
    if (!window.SiteNotice) return;
    if (preview) preview.close();
    var s = read();
    if (!site.limits.blockMode) s.mode = 'dismiss';
    s.branding = s.showBranding || !site.limits.removeBranding ? { name: site.appName, url: site.landingUrl } : null;
    preview = window.SiteNotice.render(s, { container: $('#preview') });
  }

  // ------------------------------------------------------------ stats
  function tile(value, label) {
    var d = document.createElement('div');
    d.className = 'tile';
    var v = document.createElement('div'); v.className = 'v'; v.textContent = value;
    var l = document.createElement('div'); l.className = 'l'; l.textContent = label;
    d.appendChild(v); d.appendChild(l);
    return d;
  }

  function pct(a, b) { return b ? Math.round((a / b) * 100) + '%' : '–'; }

  function drawStats(stats) {
    var t = stats.totals;
    $('#stats-range').textContent = '(last ' + stats.days + ' days, counted once per visit)';
    var tiles = $('#stat-tiles');
    tiles.textContent = '';
    tiles.appendChild(tile(t.checked.toLocaleString(), 'Visits checked'));
    tiles.appendChild(tile(pct(t.detected, t.checked), 'Visits with an ad blocker'));
    tiles.appendChild(tile(t.shown.toLocaleString(), 'Notices shown'));
    tiles.appendChild(tile(t.recovered.toLocaleString(), 'Visitors who turned it off'));

    var chart = $('#daily-chart');
    chart.textContent = '';
    var byDay = {};
    stats.daily.forEach(function (d) { byDay[d.day] = d; });
    var days = [];
    for (var i = stats.days - 1; i >= 0; i--) days.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
    var max = Math.max.apply(null, days.map(function (d) { return (byDay[d] || {}).checked || 0; }).concat([1]));
    days.forEach(function (day) {
      var d = byDay[day] || { checked: 0, detected: 0 };
      var col = document.createElement('div');
      col.className = 'day';
      col.title = day + ': ' + d.checked + ' checked, ' + d.detected + ' with an ad blocker';
      var bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = (d.checked / max) * 100 + '%';
      var inner = document.createElement('i');
      inner.style.height = d.checked ? (d.detected / d.checked) * 100 + '%' : '0';
      bar.appendChild(inner);
      col.appendChild(bar);
      chart.appendChild(col);
    });
    if (!chart.nextElementSibling || !chart.nextElementSibling.classList.contains('legend')) {
      var legend = document.createElement('div');
      legend.className = 'legend';
      legend.innerHTML = '<span>Visits checked</span><span class="s1">With an ad blocker</span>';
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
        lp.href = s.siteUrl + (s.siteUrl.indexOf('?') === -1 ? '?' : '&') + 'sn-preview=1';
        lp.hidden = false;
      }
      fill(s.settings);
      applyPlanLocks();
      drawPreview();
      return api('GET', '/stats').then(drawStats);
    }).catch(function (e) { showError(e.message); });
  }

  form.addEventListener('input', function () { syncDisabled(); drawPreview(); $('#save-status').textContent = 'Unsaved changes'; });
  form.addEventListener('change', function () { syncDisabled(); drawPreview(); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var status = $('#save-status');
    status.textContent = 'Saving…';
    api('PUT', '/settings', read()).then(function (r) {
      fill(r.settings);
      applyPlanLocks();
      drawPreview();
      showError('');
      status.textContent = 'Saved. Visitors see the change within 5 minutes.';
    }).catch(function (err) { status.textContent = ''; showError(err.message); });
  });

  load();
})();
