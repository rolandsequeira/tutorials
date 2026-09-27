// Inline SVG icons (24x24, stroke based, currentColor).
function svg(body, fill) {
  return '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" ' +
    (fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"') +
    '>' + body + '</svg>';
}

var ICONS = {
  lumaccess: '<svg viewBox="0 0 64 64" width="24" height="24" aria-hidden="true" focusable="false"><g stroke="#FCD34D" stroke-width="3.5" stroke-linecap="round"><line x1="23.8" y1="11.3" x2="20.3" y2="9.3"/><line x1="32" y1="6.5" x2="32" y2="2.5"/><line x1="40.2" y1="11.3" x2="43.7" y2="9.3"/></g><circle cx="32" cy="18" r="5.5" fill="currentColor"/><g fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 29 Q32 36 52 29"/><path d="M32 31.5 V40"/><path d="M32 40 L23.5 55"/><path d="M32 40 L40.5 55"/></g></svg>',
  person: svg('<circle cx="12" cy="4" r="2"/><path d="M4 8.5c2.7.8 5.3 1.2 8 1.2s5.3-.4 8-1.2l.5 1.9c-2.1.7-4.3 1.1-6.5 1.3V14l2 8h-2.2L12 16l-1.8 6H8l2-8v-2.3c-2.2-.2-4.4-.6-6.5-1.3z"/>', true),
  wheelchair: svg('<circle cx="10" cy="3.5" r="2"/><path d="M9 7.5h2l.4 4H16v2h-4.3l.3 2.2 4.5.1 2.4 4.4-1.8.9-1.8-3.3-5-.1c-.5 0-.9-.4-1-.9zM7.2 11.1l.3 2.1a4.5 4.5 0 1 0 6.2 5.2l1.4 1.5A6.5 6.5 0 1 1 7.2 11.1z"/>', true),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  toggle: svg('<circle cx="12" cy="12" r="10"/><path d="M12 2v20" /><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  reset: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  hide: svg('<path d="M17.9 17.9A10 10 0 0 1 12 19C5.6 19 2 12 2 12a18 18 0 0 1 4.1-5.1M9.9 5.2A9 9 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-2.2 3.2M1 1l22 22"/>'),
  doc: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  // features
  fontSize: svg('<path d="M4 7V4h16v3M9 20h6M12 4v16"/>'),
  lineHeight: svg('<path d="M11 6h10M11 12h10M11 18h10M4 8l2-3 2 3M4 16l2 3 2-3M6 5v14"/>'),
  letterSpacing: svg('<path d="M4 16l4-10 4 10M5.5 12.5h5M15 6v10M21 16h-6M2 20h20M2 18v4M22 18v4"/>'),
  wordSpacing: svg('<path d="M3 6h6M3 10h6M15 6h6M15 10h6M3 17h18M3 15v4M21 15v4"/>'),
  textAlign: svg('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
  readableFont: svg('<path d="M4 20l6-16h2l6 16M7 14h8"/>'),
  dyslexiaFont: svg('<path d="M5 20V4h5a6 6 0 0 1 0 12H5"/><path d="M15 20h5"/>'),
  highlightTitles: svg('<path d="M6 4v16M18 4v16M6 12h12"/><rect x="2" y="2" width="20" height="20" rx="2" stroke-dasharray="3 2"/>'),
  highlightLinks: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  textMagnifier: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.4-4.4M8 11h6M11 8v6"/>'),
  contrast: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>'),
  saturation: svg('<path d="M12 2.7l5.7 5.7a8 8 0 1 1-11.4 0z"/><path d="M12 2.7V21" />'),
  customColors: svg('<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c1 0 1.5-.8 1.5-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1.1 0-.9.7-1.7 1.7-1.7h2A5.6 5.6 0 0 0 22 11c0-5-4.5-9-10-9z"/>'),
  bigCursor: svg('<path d="M5 3l14 7-6 2-2 6z"/>'),
  readingGuide: svg('<path d="M3 5h18M3 19h18"/><rect x="2" y="10" width="20" height="4" rx="1" fill="currentColor"/>'),
  readingMask: svg('<rect x="2" y="2" width="20" height="6" fill="currentColor" stroke="none"/><rect x="2" y="16" width="20" height="6" fill="currentColor" stroke="none"/><path d="M5 12h14"/>'),
  stopAnimations: svg('<circle cx="12" cy="12" r="10"/><path d="M10 15V9M14 15V9"/>'),
  hideImages: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21M2 2l20 20"/>'),
  muteSounds: svg('<path d="M11 5L6 9H2v6h4l5 4zM23 9l-6 6M17 9l6 6"/>'),
  highlightFocus: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><rect x="7" y="7" width="10" height="10" rx="1"/>'),
  highlightHover: svg('<path d="M9 9l5 12 1.8-5.2L21 14z"/><path d="M3 3h6M3 3v6"/>'),
  imageDescriptions: svg('<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M7 21h10M8 13l3-3 2 2 3-3"/>'),
  keyboardNav: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'),
  pageStructure: svg('<path d="M3 4h7v6H3zM14 4h7v3h-7zM14 11h7v3h-7zM3 14h7v6H3zM14 18h7v2h-7z"/>'),
  screenReader: svg('<path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
  readPage: svg('<path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z"/>'),
  voiceNav: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>'),
  virtualKeyboard: svg('<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M18 12h.01M9 12h6M9 21l3-3 3 3"/>'),
  dictionary: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
  colorBlind: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h9"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor"/>'),
  contentScale: svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  smartContrast: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/><path d="M16 6l2-2M18 10h2"/>'),
  readMode: svg('<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  talkType: svg('<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M3 21h18"/>'),
  signLanguage: svg('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 5a1.5 1.5 0 0 1 3 0v7M14 6.5a1.5 1.5 0 0 1 3 0V13"/><path d="M17 9.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L3.2 16a1.6 1.6 0 0 1 2.4-2.1L8 16"/>'),
  move: svg('<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>'),
  flag: svg('<path d="M4 22V4a1 1 0 0 1 1-1h13l-2 5 2 5H5"/>'),
  expand: svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  // profiles
  p_seizure: svg('<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>'),
  p_vision: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  p_adhd: svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
  p_cognitive: svg('<path d="M9.5 2a3.5 3.5 0 0 0-3.4 4.3A3.5 3.5 0 0 0 4 12.7 3.5 3.5 0 0 0 9.5 17H12V2zM14.5 2a3.5 3.5 0 0 1 3.4 4.3 3.5 3.5 0 0 1 2.1 6.4 3.5 3.5 0 0 1-5.5 4.3H12"/><path d="M12 17v5"/>'),
  p_keyboard: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'),
  p_blind: svg('<path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
  p_dyslexia: svg('<path d="M4 7V4h16v3M9 20h6M12 4v16"/>'),
  p_elderly: svg('<circle cx="12" cy="4" r="2"/><path d="M12 7v7l-3 8M12 14l3 8M8 10h8M18 9v13"/>'),
  p_motor: svg('<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4L2.4 16a2 2 0 0 1 2.8-2.8L7 15"/>'),
  p_colorblind: svg('<circle cx="9" cy="9" r="6"/><circle cx="15" cy="15" r="6"/>'),
};

// Large cursors as data URIs.
function cursorUri(fill, stroke) {
  var s = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><path d="M4 2l16 8-7 2-3 8z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  return 'url("data:image/svg+xml,' + encodeURIComponent(s) + '") 6 4';
}
