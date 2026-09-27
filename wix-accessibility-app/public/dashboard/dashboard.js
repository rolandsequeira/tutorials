(function () {
  'use strict';
  var qs = new URLSearchParams(location.search);
  var headers = { 'content-type': 'application/json' };
  if (qs.get('instance')) headers['x-wix-instance'] = qs.get('instance');
  else if (qs.get('instanceId')) { // DEV_MODE only
    headers['x-dev-instance'] = qs.get('instanceId');
    if (qs.get('plan')) headers['x-dev-plan'] = qs.get('plan');
  }

  var LABELS = {
    fontSize: 'Text size', lineHeight: 'Line height', letterSpacing: 'Letter spacing', wordSpacing: 'Word spacing',
    textAlign: 'Text alignment', readableFont: 'Readable font', dyslexiaFont: 'Dyslexia font', highlightTitles: 'Highlight titles',
    highlightLinks: 'Highlight links', textMagnifier: 'Text magnifier', contrast: 'Contrast modes', saturation: 'Saturation / monochrome',
    bigCursor: 'Big cursor', readingGuide: 'Reading guide', readingMask: 'Reading mask', stopAnimations: 'Stop animations',
    hideImages: 'Hide images', muteSounds: 'Mute sounds', highlightFocus: 'Highlight focus', highlightHover: 'Highlight hover',
    imageDescriptions: 'Image descriptions', keyboardNav: 'Keyboard shortcuts', pageStructure: 'Page structure', profiles: 'Accessibility profiles',
    customColors: 'Custom colors', screenReader: 'Text to speech', readPage: 'Read page aloud', voiceNav: 'Voice navigation',
    virtualKeyboard: 'Virtual keyboard', dictionary: 'Dictionary',
  };
  var ISSUES = {
    'image-alt': 'Images without a text alternative', 'link-name': 'Links without a name', 'button-name': 'Buttons without a name',
    label: 'Form fields without a label', 'html-lang': 'Page language not set', 'document-title': 'Missing page title',
    'meta-viewport': 'Zoom disabled on mobile', 'frame-title': 'Frames without a title', tabindex: 'Positive tabindex',
    'no-autoplay-audio': 'Media autoplays with sound', 'page-has-h1': 'No main heading (H1)', 'heading-order': 'Skipped heading levels',
    'landmark-main': 'No main landmark', 'color-contrast': 'Low text contrast',
  };
  var HOW_TO = {
    'image-alt': 'In the Wix editor select the image → Settings → "What\'s in the image?" and describe it.',
    'color-contrast': 'Darken the text or lighten the background until the contrast ratio is at least 4.5:1.',
    'page-has-h1': 'Set the main title of each page to Heading 1 in the text settings.',
    'heading-order': 'Use heading levels in order (H1 → H2 → H3) instead of choosing them by size.',
    label: 'Give each form field a visible label in the form settings.',
    'link-name': 'Add link text, or for icon buttons set a tooltip/accessible name in the element settings.',
    'button-name': 'Give icon buttons a text label or accessible name in the element settings.',
  };

  var site = null;
  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function api(method, path, body) {
    return fetch('/api/dashboard' + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        if (r.status === 401) throw new Error('This page must be opened from your Wix dashboard.');
        if (!r.ok) throw new Error('Request failed (' + r.status + ')');
        return r.json();
      });
  }
  function showError(e) { var b = $('#error'); b.textContent = e.message || String(e); b.hidden = false; }
  function fmt(n) { return new Intl.NumberFormat().format(n || 0); }
  function has(flag) { return !!(site && site.limits[flag]); }

  /* ---------- Tabs ---------- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role=tab]'));
  function selectTab(btn) {
    tabs.forEach(function (b) {
      var on = b === btn;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      $('#panel-' + b.dataset.tab).hidden = !on;
    });
    var tab = btn.dataset.tab;
    if (tab === 'report') loadReport();
    if (tab === 'alt') loadAlts();
  }
  tabs.forEach(function (b, i) {
    b.tabIndex = i === 0 ? 0 : -1;
    b.addEventListener('click', function () { selectTab(b); });
    b.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      var n = tabs[(i + d + tabs.length) % tabs.length];
      n.focus(); selectTab(n);
    });
  });

  /* ---------- Site + overview ---------- */
  function renderHeader() {
    $('#app-name').textContent = site.appName;
    document.title = site.appName + ' – dashboard';
    $('#site-line').textContent = site.siteName ? site.siteName + (site.siteUrl ? ' · ' + site.siteUrl : '') : 'Your site';
    $('#plan-badge').textContent = site.planName + ' plan';
    var up = $('#upgrade');
    if (site.upgradeUrl && site.plan !== 'business') {
      up.href = site.upgradeUrl;
      up.textContent = site.plan === 'free' ? 'Upgrade to Pro' : 'Upgrade to Business';
      up.hidden = false;
    }
    $('#preview-link').href = '/preview?i=' + encodeURIComponent(site.instanceId);
  }

  function renderInstall() {
    var box = $('#install-cards');
    box.innerHTML = '';
    var active = site.settings.enabled && site.scriptEmbedded;
    box.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'Widget status' }),
      el('p', { class: active ? 'ok' : 'warn', text: active ? '✓ Installed and active' : site.scriptEmbedded ? 'Turned off in settings' : 'Not installed yet' }),
      el('p', { class: 'muted small', text: 'Wix only runs app scripts on published sites with a connected domain (a Premium plan). Publish your site after installing.' }),
    ]));
    var alt = site.usage.aiAltThisMonth;
    var quota = site.limits.aiAltTextPerMonth;
    box.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'AI alt text this month' }),
      el('p', { text: quota ? fmt(alt) + ' of ' + fmt(quota) + ' images' : 'Not included in the Free plan' }),
      quota ? null : el('p', { class: 'muted small', text: 'Upgrade to describe images automatically for screen-reader users.' }),
    ]));
    box.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'Automatic fixes' }),
      el('p', { class: has('autoFix') ? 'ok' : 'muted', text: has('autoFix') ? '✓ Enabled' : 'Available on Pro' }),
    ]));
  }

  function loadStats() {
    return api('GET', '/stats').then(function (s) {
      $('#stats-range').textContent = '(last ' + s.days + ' days)';
      var t = s.totals;
      var tiles = $('#stat-tiles');
      tiles.innerHTML = '';
      var profileUses = 0, featureUses = 0;
      Object.keys(t).forEach(function (k) {
        if (k.indexOf('profile:') === 0) profileUses += t[k];
        if (k.indexOf('feature:') === 0) featureUses += t[k];
      });
      [['Page views (est.)', t.load], ['Menu opens', t.open], ['Features turned on', featureUses], ['Profiles used', profileUses]].forEach(function (p) {
        tiles.appendChild(el('div', { class: 'tile' }, [el('div', { class: 'v', text: fmt(p[1]) }), el('div', { class: 'l', text: p[0] })]));
      });
      renderDaily(s.daily, s.days);
      renderTop(t);
    });
  }

  function renderDaily(daily, days) {
    var chart = $('#daily-chart');
    chart.innerHTML = '';
    var byDay = {};
    daily.forEach(function (d) { byDay[d.day] = d.open; });
    var n = Math.min(days, 30);
    var series = [];
    for (var i = n - 1; i >= 0; i--) {
      var day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      series.push({ day: day, v: byDay[day] || 0 });
    }
    var max = Math.max.apply(null, series.map(function (d) { return d.v; }));
    if (!max) { chart.appendChild(el('div', { class: 'chart-empty', text: 'No visitor activity yet.' })); }
    var tip = $('#chart-tip');
    series.forEach(function (d) {
      var label = d.day + ': ' + fmt(d.v) + ' opens';
      var col = el('div', { class: 'col', tabindex: max ? '0' : null, 'aria-label': label });
      var bar = el('div', { class: 'bar' });
      bar.style.height = max ? (d.v / max * 100) + '%' : '0';
      col.appendChild(bar);
      var show = function (x, y) { tip.textContent = label; tip.hidden = false; tip.style.left = (x + 12) + 'px'; tip.style.top = (y - 34) + 'px'; };
      col.addEventListener('mousemove', function (e) { show(e.clientX, e.clientY); });
      col.addEventListener('focus', function () { var r = col.getBoundingClientRect(); show(r.left, r.top); });
      col.addEventListener('mouseleave', function () { tip.hidden = true; });
      col.addEventListener('blur', function () { tip.hidden = true; });
      if (max) chart.appendChild(col);
    });
    chart.setAttribute('aria-label', 'Menu opens per day, last ' + n + ' days, peak ' + fmt(max));
    var axis = el('div', { class: 'chart-axis' }, [el('span', { text: series[0].day }), el('span', { text: series[series.length - 1].day })]);
    if (chart.nextElementSibling && chart.nextElementSibling.classList.contains('chart-axis')) chart.nextElementSibling.remove();
    chart.after(axis);
  }

  function renderTop(totals) {
    var list = $('#top-features');
    list.innerHTML = '';
    var rows = Object.keys(totals).filter(function (k) { return /^(feature|profile|action):/.test(k); })
      .map(function (k) {
        var id = k.split(':')[1];
        var name = k.indexOf('profile:') === 0 ? 'Profile: ' + id : (LABELS[id] || id);
        return { name: name, v: totals[k] };
      })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 10);
    if (!rows.length) { list.appendChild(el('li', { class: 'muted', text: 'No data yet.' })); return; }
    var max = rows[0].v;
    rows.forEach(function (r) {
      var fill = el('div', { class: 'fill' });
      fill.style.width = (r.v / max * 100) + '%';
      list.appendChild(el('li', null, [el('span', { text: r.name }), el('div', { class: 'track', 'aria-hidden': 'true' }, [fill]), el('span', { class: 'n', text: fmt(r.v) })]));
    });
  }

  /* ---------- Settings ---------- */
  var form = $('#settings-form');
  function renderSettings() {
    var s = site.settings;
    ['position', 'offsetX', 'offsetY', 'icon', 'iconSize', 'primaryColor', 'iconColor', 'panelTheme', 'language', 'statementUrl', 'customCss'].forEach(function (k) {
      if (form.elements[k]) form.elements[k].value = s[k] == null ? '' : s[k];
    });
    ['enabled', 'hideOnMobile', 'hideTrigger', 'ga4', 'showBranding'].forEach(function (k) { form.elements[k].checked = !!s[k]; });
    Object.keys(s.autoFix).forEach(function (k) { var i = form.elements['autoFix.' + k]; if (i) i.checked = !!s.autoFix[k]; });
    form.elements.excludePaths.value = (s.excludePaths || []).join('\n');

    var checks = $('#feature-checks');
    checks.innerHTML = '';
    var allowed = site.limits.features;
    site.featureCatalog.free.concat(site.featureCatalog.pro).forEach(function (f) {
      var locked = allowed.indexOf(f) === -1;
      var input = el('input', { type: 'checkbox', name: 'feat', value: f, disabled: locked ? 'disabled' : null });
      input.checked = !locked && s.disabledFeatures.indexOf(f) === -1;
      checks.appendChild(el('label', { class: locked ? 'locked' : null }, [input, LABELS[f] || f, locked ? el('span', { class: 'lock', text: 'Pro' }) : null]));
    });

    document.querySelectorAll('[data-requires]').forEach(function (node) {
      var ok = has(node.getAttribute('data-requires'));
      node.classList.toggle('locked', !ok);
      node.querySelectorAll('input, textarea, select').forEach(function (i) { i.disabled = !ok; });
      node.querySelectorAll('.lock').forEach(function (l) { l.hidden = ok; });
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = form.elements;
    var disabled = [];
    document.querySelectorAll('input[name=feat]').forEach(function (i) { if (!i.disabled && !i.checked) disabled.push(i.value); });
    var autoFix = {};
    Object.keys(site.settings.autoFix).forEach(function (k) { if (f['autoFix.' + k]) autoFix[k] = f['autoFix.' + k].checked; });
    var body = {
      enabled: f.enabled.checked, position: f.position.value, offsetX: +f.offsetX.value, offsetY: +f.offsetY.value,
      icon: f.icon.value, iconSize: f.iconSize.value, primaryColor: f.primaryColor.value, iconColor: f.iconColor.value,
      panelTheme: f.panelTheme.value, language: f.language.value, hideOnMobile: f.hideOnMobile.checked,
      hideTrigger: f.hideTrigger.checked, ga4: f.ga4.checked, statementUrl: f.statementUrl.value.trim(),
      showBranding: f.showBranding.checked, disabledFeatures: disabled, autoFix: autoFix,
      customCss: f.customCss.value, excludePaths: f.excludePaths.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
    };
    var status = $('#save-status');
    status.textContent = 'Saving…';
    api('PUT', '/settings', body).then(function (r) {
      site.settings = r.settings;
      renderSettings(); renderInstall();
      status.textContent = 'Saved. Changes reach visitors within 5 minutes.';
    }).catch(function (err) { status.textContent = ''; showError(err); });
  });

  /* ---------- Report ---------- */
  function scoreClass(s) { return s >= 90 ? 'ok' : s >= 70 ? 'warn' : 'bad'; }
  function loadReport() {
    var box = $('#report');
    box.textContent = 'Loading…';
    api('GET', '/audits').then(function (r) {
      box.innerHTML = '';
      if (!r.audits.length) { box.appendChild(el('p', { text: 'No pages checked yet. Reports appear after your published site gets some visitors.' })); return; }
      var avg = Math.round(r.audits.reduce(function (s, a) { return s + a.score; }, 0) / r.audits.length);
      box.appendChild(el('p', null, ['Average score across ' + r.audits.length + ' pages: ', el('span', { class: 'score ' + scoreClass(avg), text: avg + '/100' })]));
      if (!r.details) {
        box.appendChild(el('div', { class: 'upsell' }, [
          el('strong', { text: 'See exactly what to fix. ' }),
          'Pro shows each issue with the affected elements, WCAG references and how to fix it in the Wix editor, and repairs many of them automatically.',
          site.upgradeUrl ? el('p', null, [el('a', { class: 'btn primary', href: site.upgradeUrl, target: '_blank', rel: 'noopener', text: 'Upgrade to Pro' })]) : null,
        ]));
      }
      var table = el('table', null, [el('thead', null, [el('tr', null, [el('th', { text: 'Page' }), el('th', { text: 'Score' }), el('th', { text: r.details ? 'Issues' : 'Issues found' }), el('th', { text: 'Checked' })])])]);
      var tbody = el('tbody');
      r.audits.forEach(function (a) {
        var issuesCell;
        if (!r.details) issuesCell = el('td', { text: fmt(a.issueCount) });
        else {
          issuesCell = el('td');
          if (!a.issues.length) issuesCell.textContent = 'None found';
          a.issues.forEach(function (it) {
            var d = el('details', null, [
              el('summary', null, [
                el('span', { class: 'impact ' + (it.impact === 'critical' || it.impact === 'serious' ? 'bad' : 'warn'), text: it.impact }), ' ',
                (ISSUES[it.id] || it.id) + ' ×' + it.count + (it.fixed ? ' (' + it.fixed + ' auto-fixed)' : ''),
              ]),
              el('p', { class: 'muted small', text: 'WCAG ' + it.wcag + (HOW_TO[it.id] ? ' — ' + HOW_TO[it.id] : '') }),
            ]);
            it.samples.forEach(function (s) { d.appendChild(el('code', { class: 'sample', text: s })); });
            issuesCell.appendChild(d);
          });
        }
        tbody.appendChild(el('tr', null, [
          el('td', null, [/^https?:\/\//i.test(a.page_url) ? el('a', { href: a.page_url, target: '_blank', rel: 'noopener', text: a.path }) : a.path]),
          el('td', { class: 'score ' + scoreClass(a.score), text: String(a.score) }),
          issuesCell,
          el('td', { class: 'muted small', text: new Date(a.created_at).toLocaleString() }),
        ]));
      });
      table.appendChild(tbody);
      box.appendChild(table);
    }).catch(showError);
  }

  /* ---------- AI alt text ---------- */
  function loadAlts() {
    var list = $('#alt-list');
    var sum = $('#alt-summary');
    if (!site.limits.aiAltTextPerMonth) {
      sum.innerHTML = '';
      sum.appendChild(el('div', { class: 'upsell' }, [
        el('strong', { text: 'Describe every image automatically. ' }),
        'Pro uses AI to write alt text for images you haven\'t described, so screen-reader users know what they show. You can review and edit every description here.',
        site.upgradeUrl ? el('p', null, [el('a', { class: 'btn primary', href: site.upgradeUrl, target: '_blank', rel: 'noopener', text: 'Upgrade to Pro' })]) : null,
      ]));
      list.innerHTML = '';
      return;
    }
    list.textContent = 'Loading…';
    api('GET', '/alt-texts?limit=100').then(function (r) {
      var c = r.counts;
      sum.innerHTML = '';
      sum.appendChild(el('p', { text: fmt(c.done + c.edited) + ' images described · ' + fmt(c.pending) + ' in progress · ' + fmt(c.failed) + ' failed · ' + fmt(site.usage.aiAltThisMonth) + '/' + fmt(site.limits.aiAltTextPerMonth) + ' used this month' }));
      sum.appendChild(el('p', { class: 'muted small', text: 'Tip: copy good descriptions into the Wix editor (image settings → "What\'s in the image?") so they are part of your site permanently.' }));
      list.innerHTML = '';
      r.items.forEach(function (it) {
        var input = el('input', { value: it.alt || '', 'aria-label': 'Alt text for image', placeholder: it.status === 'pending' ? 'Generating…' : it.alt === '' ? '(decorative)' : '' });
        var save = el('button', { class: 'btn', type: 'button', text: 'Save', onclick: function () {
          api('PUT', '/alt-texts/' + it.id, { alt: input.value }).then(function () { save.textContent = 'Saved ✓'; }).catch(showError);
        } });
        list.appendChild(el('div', { class: 'alt-row' }, [el('img', { src: it.url, alt: '', loading: 'lazy' }), input, save]));
      });
      if (!r.items.length) list.appendChild(el('p', { class: 'muted', text: 'No images processed yet.' }));
    }).catch(showError);
  }

  /* ---------- Statement ---------- */
  $('#statement-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target.elements;
    var date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    var host = site.siteUrl || 'this website';
    $('#statement-out').value = [
      'Accessibility statement for ' + f.org.value,
      '',
      f.org.value + ' is committed to making ' + host + ' accessible to everyone, including people with disabilities. We are continually improving the experience for all visitors and applying the relevant accessibility standards.',
      '',
      'Conformance goal',
      'We aim to conform to the Web Content Accessibility Guidelines (' + f.std.value + '). These guidelines explain how to make web content more accessible for people with a wide range of disabilities.',
      '',
      'Measures we take',
      '- We review our pages for accessibility issues and fix them as we find them.',
      '- We provide an accessibility menu that lets visitors adjust text size, spacing, contrast, colors, fonts, motion and more, and offers tools such as text to speech and keyboard navigation.',
      '- We describe images with text alternatives and label forms and controls.',
      '',
      'Known limitations',
      'Some content, such as third-party embeds or older documents, may not yet be fully accessible. We are working to address these.',
      '',
      'Feedback and contact',
      'If you have trouble accessing any part of this website, or need information in another format, please contact us at ' + f.email.value + '. We aim to respond within 5 business days.',
      '',
      'This statement was last updated on ' + date + '.',
    ].join('\n');
  });
  $('#copy-statement').addEventListener('click', function () {
    var out = $('#statement-out');
    out.select();
    (navigator.clipboard ? navigator.clipboard.writeText(out.value) : Promise.reject()).catch(function () { document.execCommand('copy'); });
    this.textContent = 'Copied ✓';
  });

  /* ---------- Boot ---------- */
  api('GET', '/site').then(function (s) {
    site = s;
    renderHeader(); renderInstall(); renderSettings();
    return loadStats();
  }).catch(showError);
})();
