(function () {
  'use strict';

  if (window.__mccAuthThemeToggleLoaded) return;
  window.__mccAuthThemeToggleLoaded = true;

  var STYLE_ID = 'mcc-auth-theme-toggle-style';
  var BTN_ID = 'mcc-auth-theme-toggle';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = ''
      + '#' + BTN_ID + '{position:fixed;top:16px;right:16px;z-index:10000;'
      + 'display:inline-flex;align-items:center;gap:6px;padding:8px 14px;height:38px;'
      + 'border-radius:20px;background:var(--bg-elevated,rgba(28,28,42,.95));'
      + 'border:1px solid var(--border-subtle,rgba(255,255,255,.08));'
      + 'color:var(--text-secondary,#a8b3c7);font-family:inherit;font-size:.85rem;'
      + 'font-weight:500;cursor:pointer;transition:all .2s ease;white-space:nowrap;'
      + 'box-shadow:0 2px 8px rgba(0,0,0,.18);}'
      + '#' + BTN_ID + ':hover{background:var(--accent-gold-soft,rgba(201,162,39,.12));'
      + 'border-color:var(--accent-gold,#c9a227);transform:scale(1.05);'
      + 'box-shadow:0 0 12px rgba(201,162,39,.25);}'
      + '#' + BTN_ID + ' svg{width:14px;height:14px;flex-shrink:0;}'
      + '[data-theme="dark"] #' + BTN_ID + ' .ttl-sun{display:inline-flex;align-items:center;gap:4px;}'
      + '[data-theme="dark"] #' + BTN_ID + ' .ttl-moon{display:none;}'
      + '[data-theme="light"] #' + BTN_ID + ' .ttl-sun{display:none;}'
      + '[data-theme="light"] #' + BTN_ID + ' .ttl-moon{display:inline-flex;align-items:center;gap:4px;}'
      + 'html.theme-transition,html.theme-transition *,html.theme-transition *::before,'
      + 'html.theme-transition *::after{transition:background-color .3s ease,color .3s ease,border-color .3s ease!important;}'
      + '@media (max-width:480px){#' + BTN_ID + '{top:10px;right:10px;padding:6px 12px;height:34px;font-size:.78rem;}}';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function toggleTheme() {
    var html = document.documentElement;
    html.classList.add('theme-transition');
    var current = html.getAttribute('data-theme') || 'dark';
    var next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = next === 'dark' ? '#12161c' : '#fefdfb';
    setTimeout(function () { html.classList.remove('theme-transition'); }, 300);
  }
  window.toggleTheme = window.toggleTheme || toggleTheme;

  function injectButton() {
    if (document.getElementById(BTN_ID)) return;
    var btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle light/dark theme');
    btn.setAttribute('title', 'Toggle theme');
    btn.innerHTML = ''
      + '<span class="ttl-sun"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>Day</span>'
      + '<span class="ttl-moon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>Night</span>';
    btn.addEventListener('click', function () { window.toggleTheme(); });
    document.body.appendChild(btn);
  }

  function init() {
    var html = document.documentElement;
    if (!html.getAttribute('data-theme')) {
      var stored = 'dark';
      try { stored = localStorage.getItem('theme') || 'dark'; } catch (e) {}
      html.setAttribute('data-theme', stored);
    }
    injectStyles();
    if (document.body) {
      injectButton();
    } else {
      document.addEventListener('DOMContentLoaded', injectButton);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
