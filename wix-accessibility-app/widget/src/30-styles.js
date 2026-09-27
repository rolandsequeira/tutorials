// Page-level CSS (applied through classes on <html>) and widget CSS (shadow DOM).
var X = ':not(#' + HOST_ID + ')';
var NOICON = ':not(i):not([class*="icon"]):not([class*="Icon"]):not([class*="fa-"]):not(svg):not(svg *)';

function pageCss() {
  var c = 'html.a11ytk-';
  var rules = [
    // Spacing
    c + 'lh-1 body *' + X + '{line-height:1.5!important}',
    c + 'lh-2 body *' + X + '{line-height:1.8!important}',
    c + 'lh-3 body *' + X + '{line-height:2.2!important}',
    c + 'ls-1 body *' + X + '{letter-spacing:.06em!important}',
    c + 'ls-2 body *' + X + '{letter-spacing:.12em!important}',
    c + 'ls-3 body *' + X + '{letter-spacing:.18em!important}',
    c + 'ws-1 body *' + X + '{word-spacing:.16em!important}',
    c + 'ws-2 body *' + X + '{word-spacing:.32em!important}',
    c + 'ws-3 body *' + X + '{word-spacing:.5em!important}',
    c + 'align-1 body *' + X + '{text-align:left!important}',
    c + 'align-2 body *' + X + '{text-align:center!important}',
    c + 'align-3 body *' + X + '{text-align:right!important}',
    c + 'align-4 body *' + X + '{text-align:justify!important}',
    // Fonts
    '@font-face{font-family:"OpenDyslexic";src:url("' + BASE + '/fonts/OpenDyslexic-Regular.woff") format("woff");font-weight:400;font-display:swap}',
    '@font-face{font-family:"OpenDyslexic";src:url("' + BASE + '/fonts/OpenDyslexic-Bold.woff") format("woff");font-weight:700;font-display:swap}',
    c + 'readable body *' + X + NOICON + '{font-family:"Atkinson Hyperlegible",Verdana,Tahoma,Arial,sans-serif!important}',
    c + 'dyslexic body *' + X + NOICON + '{font-family:"OpenDyslexic","Comic Sans MS",Verdana,sans-serif!important}',
    // Highlights
    c + 'htitles h1,' + c + 'htitles h2,' + c + 'htitles h3,' + c + 'htitles h4,' + c + 'htitles h5,' + c + 'htitles h6,' + c + 'htitles [role=heading]' +
      '{outline:3px solid var(--a11ytk-accent,#1a56db)!important;outline-offset:3px!important}',
    c + 'hlinks a[href],' + c + 'hlinks [role=link]{outline:3px dashed #d97706!important;outline-offset:2px!important;text-decoration:underline!important;text-underline-offset:3px!important}',
    c + 'hfocus *:focus,' + c + 'hfocus *:focus-visible{outline:4px solid #f59e0b!important;outline-offset:2px!important;box-shadow:0 0 0 7px rgba(0,0,0,.65)!important}',
    // Motion
    c + 'stopanim *,' + c + 'stopanim *::before,' + c + 'stopanim *::after{animation-duration:0s!important;animation-iteration-count:1!important;transition:none!important;scroll-behavior:auto!important}',
    // Images
    c + 'hideimg body img,' + c + 'hideimg body picture,' + c + 'hideimg body video,' + c + 'hideimg body svg[role=img],' + c + 'hideimg body [role=img]' + X +
      '{visibility:hidden!important}',
    c + 'hideimg body *' + X + '{background-image:none!important}',
    // Cursor
    c + 'cursor-1,' + c + 'cursor-1 *{cursor:' + cursorUri('#000', '#fff') + ',auto!important}',
    c + 'cursor-2,' + c + 'cursor-2 *{cursor:' + cursorUri('#fff', '#000') + ',auto!important}',
    // Contrast themes (color overrides; filters are handled by an overlay)
    c + 'contrast-1 body,' + c + 'contrast-1 body *' + X + ':not(img):not(video):not(svg *)' +
      '{background-color:#000!important;color:#fff!important;border-color:#fff!important;text-shadow:none!important;box-shadow:none!important}',
    c + 'contrast-1 body a[href],' + c + 'contrast-1 body a[href] *{color:#ffe14d!important}',
    c + 'contrast-1 body button,' + c + 'contrast-1 body [role=button]{border:1px solid #fff!important}',
    c + 'contrast-2 body,' + c + 'contrast-2 body *' + X + ':not(img):not(video):not(svg *)' +
      '{background-color:#fff!important;color:#000!important;border-color:#000!important;text-shadow:none!important;box-shadow:none!important}',
    c + 'contrast-2 body a[href],' + c + 'contrast-2 body a[href] *{color:#0000c8!important}',
    c + 'contrast-2 body button,' + c + 'contrast-2 body [role=button]{border:1px solid #000!important}',
    // Custom colors
    c + 'ctext body *' + X + ':not(h1):not(h2):not(h3):not(h4):not(h5):not(h6){color:var(--a11ytk-ctext)!important}',
    c + 'ctitle body h1,' + c + 'ctitle body h2,' + c + 'ctitle body h3,' + c + 'ctitle body h4,' + c + 'ctitle body h5,' + c + 'ctitle body h6,' +
      c + 'ctitle body h1 *,' + c + 'ctitle body h2 *,' + c + 'ctitle body h3 *,' + c + 'ctitle body h4 *,' + c + 'ctitle body h5 *,' + c + 'ctitle body h6 *' +
      '{color:var(--a11ytk-ctitle)!important}',
    c + 'cbg body,' + c + 'cbg body *' + X + ':not(img):not(video){background-color:var(--a11ytk-cbg)!important}',
    // Helpers
    '.a11ytk-sr{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}',
    '.a11ytk-skip{position:fixed!important;top:-100px!important;left:12px!important;z-index:2147483647!important;background:#111!important;color:#fff!important;padding:12px 18px!important;border-radius:6px!important;font:600 16px/1.2 system-ui,sans-serif!important;text-decoration:underline!important}',
    '.a11ytk-skip:focus{top:12px!important;outline:3px solid #f59e0b!important}',
    '.a11ytk-reading{outline:3px solid #f59e0b!important;background-color:rgba(245,158,11,.18)!important}',
  ];
  return rules.join('\n');
}

function widgetCss() {
  var ui = CONFIG.ui;
  var size = { small: 44, medium: 56, large: 68 }[ui.iconSize] || 56;
  return [
    ':host{all:initial}',
    '*{box-sizing:border-box}',
    '.root{--p:' + ui.primaryColor + ';--pi:' + ui.iconColor + ';--bg:#fff;--fg:#111827;--muted:#4b5563;--card:#f3f4f6;--line:#d1d5db;font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--fg)}',
    '.root.dark{--bg:#111827;--fg:#f9fafb;--muted:#d1d5db;--card:#1f2937;--line:#374151}',
    'button{font:inherit;color:inherit;cursor:pointer}',
    ':focus-visible{outline:3px solid #f59e0b;outline-offset:2px}',
    '.trigger{position:fixed;z-index:2147483646;width:' + size + 'px;height:' + size + 'px;border-radius:50%;border:3px solid #fff;background:var(--p);color:var(--pi);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.35);padding:0;transition:transform .15s}',
    '.trigger:hover{transform:scale(1.06)}',
    '.trigger svg{width:62%;height:62%}',
    '.panel{position:fixed;z-index:2147483647;top:12px;bottom:12px;width:min(440px,calc(100vw - 24px));background:var(--bg);color:var(--fg);border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden}',
    '.panel[hidden]{display:none}',
    '.panel.left{left:12px}.panel.right{right:12px}',
    '@media (max-width:520px){.panel{left:0!important;right:0!important;bottom:0;top:auto;height:85vh;width:100vw;border-radius:14px 14px 0 0}}',
    '.head{background:var(--p);color:var(--pi);padding:14px 16px;display:flex;align-items:center;gap:10px}',
    '.head h2{font-size:18px;margin:0;flex:1;font-weight:700}',
    '.head select{font:inherit;font-size:14px;border-radius:8px;border:0;padding:6px 8px;max-width:130px;color:#111;background:#fff}',
    '.icon-btn{background:rgba(255,255,255,.18);border:0;border-radius:8px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;color:inherit;padding:0}',
    '.icon-btn:hover{background:rgba(255,255,255,.32)}',
    '.body{flex:1;overflow:auto;padding:12px 14px 18px}',
    'h3{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:18px 2px 8px}',
    '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
    '@media (max-width:360px){.grid{grid-template-columns:repeat(2,1fr)}}',
    '.tile{background:var(--card);border:2px solid transparent;border-radius:12px;padding:12px 6px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;min-height:92px;font-size:13px;line-height:1.25}',
    '.tile:hover{border-color:var(--line)}',
    '.tile[aria-pressed=true]{border-color:var(--p);background:color-mix(in srgb,var(--p) 14%,var(--bg))}',
    '.tile svg{width:26px;height:26px}',
    '.tile .lvl{font-size:11px;color:var(--muted);min-height:13px}',
    '.dots{display:flex;gap:3px}.dots i{width:14px;height:4px;border-radius:2px;background:var(--line)}.dots i.on{background:var(--p)}',
    '.profiles{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.profile{display:flex;align-items:center;gap:10px;background:var(--card);border:2px solid transparent;border-radius:12px;padding:10px;text-align:start}',
    '.profile[aria-pressed=true]{border-color:var(--p);background:color-mix(in srgb,var(--p) 14%,var(--bg))}',
    '.profile svg{flex:none;width:24px;height:24px}',
    '.profile b{display:block;font-size:13.5px}.profile small{display:block;font-size:11.5px;color:var(--muted)}',
    '.stepper{grid-column:1/-1;display:flex;align-items:center;gap:10px;background:var(--card);border-radius:12px;padding:10px 12px}',
    '.stepper .lab{flex:1;display:flex;align-items:center;gap:8px;font-weight:600}',
    '.stepper button{width:40px;height:40px;border-radius:10px;border:0;background:var(--p);color:var(--pi);display:flex;align-items:center;justify-content:center}',
    '.stepper output{min-width:52px;text-align:center;font-weight:700}',
    '.colors{grid-column:1/-1;background:var(--card);border-radius:12px;padding:10px 12px}',
    '.colors .row{display:flex;align-items:center;gap:8px;margin:6px 0;flex-wrap:wrap}',
    '.colors .row span{width:92px;font-size:13px}',
    '.swatch{width:28px;height:28px;border-radius:50%;border:2px solid var(--line);padding:0}',
    '.swatch[aria-pressed=true]{outline:3px solid var(--p);outline-offset:1px}',
    '.foot{border-top:1px solid var(--line);padding:10px 14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
    '.foot button,.foot a{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--bg);border-radius:8px;padding:8px 10px;font-size:13px;color:var(--fg);text-decoration:none}',
    '.foot svg{width:16px;height:16px}',
    '.brand{flex-basis:100%;text-align:center;font-size:11.5px;color:var(--muted)}',
    '.sub h3{margin-top:4px}',
    '.tabs{display:flex;gap:6px;margin:6px 0 10px}.tabs button{flex:1;border:1px solid var(--line);background:var(--card);border-radius:8px;padding:8px}.tabs button[aria-selected=true]{background:var(--p);color:var(--pi);border-color:var(--p)}',
    '.list{list-style:none;margin:0;padding:0}.list li button{width:100%;text-align:start;border:0;background:transparent;border-bottom:1px solid var(--line);padding:9px 6px}.list li button:hover{background:var(--card)}',
    '.list .tag{display:inline-block;min-width:34px;font-size:11px;font-weight:700;background:var(--card);border-radius:4px;padding:2px 4px;margin-inline-end:8px;text-align:center}',
    '.live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}',
    // Overlays
    '.filter{position:fixed;inset:0;pointer-events:none;z-index:2147483000}',
    '.guide{position:fixed;left:0;right:0;height:14px;margin-top:-7px;background:rgba(245,158,11,.35);border-top:3px solid #111;border-bottom:3px solid #111;pointer-events:none;z-index:2147483600}',
    '.mask{position:fixed;left:0;right:0;background:rgba(0,0,0,.6);pointer-events:none;z-index:2147483600}',
    '.tip{position:fixed;z-index:2147483645;max-width:min(560px,90vw);background:#111;color:#fff;border-radius:10px;padding:10px 14px;font-size:26px;line-height:1.35;box-shadow:0 6px 20px rgba(0,0,0,.4);pointer-events:none}',
    '.tip.small{font-size:16px}',
    '.hoverbox{position:fixed;z-index:2147483600;pointer-events:none;border:3px solid #f59e0b;border-radius:4px}',
    '.badge{position:absolute;z-index:2147483640;background:#111;color:#ffe14d;font:700 13px/1 system-ui,sans-serif;padding:3px 5px;border-radius:4px;pointer-events:none}',
    '.bubble{position:fixed;z-index:2147483645;left:50%;transform:translateX(-50%);bottom:18px;background:#111;color:#fff;border-radius:999px;padding:10px 18px;font-size:15px;max-width:90vw;display:flex;gap:10px;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.4)}',
    '.bubble button{background:#fff;color:#111;border:0;border-radius:999px;padding:5px 12px;font-weight:600}',
    '.popup{position:fixed;z-index:2147483645;width:min(360px,92vw);background:var(--bg);color:var(--fg);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);padding:14px 16px;font-size:14px;max-height:50vh;overflow:auto}',
    '.popup h4{margin:0 0 6px;font-size:18px}.popup p{margin:6px 0}.popup em{color:var(--muted)}.popup a{color:var(--p)}',
    '.popup .x{position:absolute;top:8px;right:8px;background:transparent;border:0;width:30px;height:30px;padding:0;color:var(--fg)}',
    '.kb{position:fixed;left:0;right:0;bottom:0;z-index:2147483645;background:#1f2937;padding:8px;display:flex;flex-direction:column;gap:6px;box-shadow:0 -6px 20px rgba(0,0,0,.35)}',
    '.kb .r{display:flex;gap:5px;justify-content:center}',
    '.kb button{flex:1;max-width:64px;height:48px;border:0;border-radius:8px;background:#f9fafb;color:#111;font-size:18px;padding:0}',
    '.kb button.w{max-width:140px;font-size:14px}.kb button.xw{max-width:360px}.kb button.on{background:#fcd34d}',
  ].join('\n');
}
