// ============================================================================
// www/mcc-theme.js — single theme controller for every portal page.
//
// Modes (localStorage.theme):
//   'auto'  — dark between local sunset and sunrise, light otherwise. This is
//             the default for anyone who has never chosen a theme.
//   'light' / 'dark' — fixed. Existing users keep whatever they had saved.
//
// Sunrise/sunset are computed on-device (no network) with the Almanac for
// Computers sunrise algorithm at the civil-twilight zenith (96°), so the app
// goes dark ~25 min after the sun sets and light ~25 min before it rises.
//
// Location, in order of preference — never prompts the user on its own:
//   1. Cached fix (< 7 days old).
//   2. Device geolocation, only if permission is ALREADY granted (native
//      Capacitor plugin or navigator.geolocation). MCC_THEME.set('auto',
//      { prompt: true }) — the Settings control — is the one path that asks.
//   3. The signed-in profile's ZIP via POST /api/geocode (zip centroid).
//   4. Nothing: fall back to prefers-color-scheme, then dark.
//
// Load this synchronously in <head>, right after the <html data-theme> tag.
// It applies the theme immediately (from cache) so there is no flash, then
// refines once the page is up.
//
// Public API (window.MCC_THEME):
//   mode()            'auto' | 'light' | 'dark'
//   effective()       'light' | 'dark'  (what is on screen)
//   set(mode, opts)   persist + apply; opts.prompt asks for location
//   cycle()           auto → light → dark → auto  (header button)
//   toggle()          light ⇄ dark (legacy header buttons; leaves auto)
//   onChange(fn)      fn({mode, effective}) after every apply
//   sunTimes()        {rise: Date, set: Date} | null for today at the fix
//   status()          human-readable "Following sunrise and sunset near 12345"
// ============================================================================
(function () {
  'use strict';
  if (window.MCC_THEME) return;

  var KEY = 'theme';
  var LOC_KEY = 'mcc_theme_loc';
  var SUN_KEY = 'mcc_theme_sun';
  var LOC_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  var ZENITH_CIVIL = 96;              // degrees; 90.833 would be the geometric sunset
  var META_DARK = '#12161c';
  var META_LIGHT = '#ffffff';
  var VALID = { auto: 1, light: 1, dark: 1 };

  var listeners = [];
  var timer = null;
  var resolving = null;

  // ---------- storage helpers (every read/write guarded) ----------------
  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (_) {} }
  function lsJson(k) { try { return JSON.parse(lsGet(k) || 'null'); } catch (_) { return null; } }

  function mode() {
    var m = lsGet(KEY);
    return VALID[m] ? m : 'auto';
  }

  // ---------- solar calculation ------------------------------------------
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  function sinD(x) { return Math.sin(x * D2R); }
  function cosD(x) { return Math.cos(x * D2R); }
  function mod(a, n) { return ((a % n) + n) % n; }

  // Returns UTC hour (0–24) of the event for the given local calendar day,
  // or null when the sun never reaches the zenith that day (polar cases:
  // 'up' = never sets, 'down' = never rises).
  function solarEventUT(y, m, d, lat, lng, rising) {
    var n1 = Math.floor(275 * (m + 1) / 9);
    var n2 = Math.floor((m + 1 + 9) / 12);
    var n3 = 1 + Math.floor((y - 4 * Math.floor(y / 4) + 2) / 3);
    var N = n1 - n2 * n3 + d - 30;
    var lngHour = lng / 15;
    var t = N + (((rising ? 6 : 18) - lngHour) / 24);
    var M = 0.9856 * t - 3.289;
    var L = mod(M + 1.916 * sinD(M) + 0.020 * sinD(2 * M) + 282.634, 360);
    var RA = mod(R2D * Math.atan(0.91764 * Math.tan(L * D2R)), 360);
    var Lq = Math.floor(L / 90) * 90, RAq = Math.floor(RA / 90) * 90;
    RA = (RA + (Lq - RAq)) / 15;
    var sinDec = 0.39782 * sinD(L);
    var cosDec = Math.cos(Math.asin(sinDec));
    var cosH = (cosD(ZENITH_CIVIL) - sinDec * sinD(lat)) / (cosDec * cosD(lat));
    if (cosH > 1) return 'down';
    if (cosH < -1) return 'up';
    var H = rising ? 360 - R2D * Math.acos(cosH) : R2D * Math.acos(cosH);
    H /= 15;
    var T = H + RA - 0.06571 * t - 6.622;
    return mod(T - lngHour, 24);
  }

  // Sunrise/sunset as Dates for the local calendar day containing `when`.
  function sunTimesFor(when, lat, lng) {
    var y = when.getFullYear(), m = when.getMonth(), d = when.getDate();
    var rise = solarEventUT(y, m, d, lat, lng, true);
    var set = solarEventUT(y, m, d, lat, lng, false);
    if (rise === 'down' || set === 'down') return { polar: 'down' };
    if (rise === 'up' || set === 'up') return { polar: 'up' };
    var base = Date.UTC(y, m, d);
    var riseMs = base + rise * 3600000;
    var setMs = base + set * 3600000;
    // The UT hour is for the local date; if the local day sits a whole UTC
    // day away (far-east/west longitudes) nudge into the local day window.
    var dayStart = new Date(y, m, d).getTime();
    while (riseMs < dayStart) riseMs += 86400000;
    while (riseMs >= dayStart + 86400000) riseMs -= 86400000;
    while (setMs < dayStart) setMs += 86400000;
    while (setMs >= dayStart + 86400000) setMs -= 86400000;
    return { rise: new Date(riseMs), set: new Date(setMs) };
  }

  // 'light' | 'dark' plus the timestamp of the next change, for a location.
  function daylightState(now, lat, lng) {
    var today = sunTimesFor(now, lat, lng);
    if (today.polar) return { effective: today.polar === 'up' ? 'light' : 'dark', next: startOfTomorrow(now) };
    var t = now.getTime();
    if (t < today.rise.getTime()) return { effective: 'dark', next: today.rise.getTime() };
    if (t < today.set.getTime()) return { effective: 'light', next: today.set.getTime() };
    var tmrw = sunTimesFor(new Date(t + 86400000), lat, lng);
    return { effective: 'dark', next: tmrw.polar ? startOfTomorrow(now) : tmrw.rise.getTime() };
  }
  function startOfTomorrow(now) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5).getTime();
  }

  // ---------- resolve what to show ---------------------------------------
  function systemPrefersDark() {
    try { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; }
    catch (_) { return false; }
  }

  function location() {
    var loc = lsJson(LOC_KEY);
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;
    if (Date.now() - (loc.ts || 0) > LOC_MAX_AGE_MS && loc.source !== 'zip') return null;
    return loc;
  }

  // Returns { effective, next|null, basis }.
  function compute(now) {
    var m = mode();
    if (m === 'light' || m === 'dark') return { effective: m, next: null, basis: 'fixed' };
    var loc = location();
    if (loc) {
      var s = daylightState(now, loc.lat, loc.lng);
      return { effective: s.effective, next: s.next, basis: loc.source || 'location' };
    }
    if (window.matchMedia) return { effective: systemPrefersDark() ? 'dark' : 'light', next: null, basis: 'system' };
    return { effective: 'dark', next: null, basis: 'default' };
  }

  function applyDom(effective, animate) {
    var html = document.documentElement;
    var prev = html.getAttribute('data-theme');
    if (animate && prev !== effective) {
      html.classList.add('theme-transition');
      setTimeout(function () { html.classList.remove('theme-transition'); }, 300);
    }
    html.setAttribute('data-theme', effective);
    var meta = document.querySelector && document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = effective === 'dark' ? META_DARK : META_LIGHT;
  }

  var lastEffective = null;
  function apply(animate) {
    var now = new Date();
    var r = compute(now);
    applyDom(r.effective, animate);
    schedule(r.next);
    var changed = r.effective !== lastEffective;
    lastEffective = r.effective;
    var payload = { mode: mode(), effective: r.effective, basis: r.basis };
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](payload, changed); } catch (_) {}
    }
    return payload;
  }

  function schedule(nextMs) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!nextMs) return;
    var delay = Math.max(1000, Math.min(nextMs - Date.now() + 1500, 6 * 3600000));
    timer = setTimeout(function () { apply(true); }, delay);
  }

  // ---------- location acquisition ---------------------------------------
  function saveLocation(lat, lng, source) {
    if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) return false;
    lsSet(LOC_KEY, JSON.stringify({ lat: +lat.toFixed(3), lng: +lng.toFixed(3), ts: Date.now(), source: source }));
    return true;
  }

  function isNative() {
    try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
    catch (_) { return false; }
  }

  // Resolves to true if a device fix was stored. Prompts only when asked to.
  function tryDeviceLocation(prompt) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(ok) { if (!done) { done = true; resolve(!!ok); } }
      var opts = { enableHighAccuracy: false, timeout: 8000, maximumAge: 3600000 };
      try {
        var geo = isNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation;
        if (geo) {
          geo.checkPermissions().then(function (p) {
            var state = p && (p.location || p.coarseLocation);
            if (state !== 'granted' && !prompt) return finish(false);
            var go = function () {
              geo.getCurrentPosition(opts).then(function (pos) {
                finish(saveLocation(pos.coords.latitude, pos.coords.longitude, 'device'));
              }).catch(function () { finish(false); });
            };
            if (state === 'granted') go();
            else geo.requestPermissions().then(function (q) {
              (q && (q.location === 'granted' || q.coarseLocation === 'granted')) ? go() : finish(false);
            }).catch(function () { finish(false); });
          }).catch(function () { finish(false); });
          return;
        }
        if (!navigator.geolocation) return finish(false);
        var ask = function () {
          navigator.geolocation.getCurrentPosition(function (pos) {
            finish(saveLocation(pos.coords.latitude, pos.coords.longitude, 'device'));
          }, function () { finish(false); }, opts);
        };
        if (prompt) return ask();
        if (navigator.permissions && navigator.permissions.query) {
          navigator.permissions.query({ name: 'geolocation' }).then(function (p) {
            p.state === 'granted' ? ask() : finish(false);
          }).catch(function () { finish(false); });
        } else finish(false);
      } catch (_) { finish(false); }
      setTimeout(function () { finish(false); }, 10000);
    });
  }

  // Profile ZIP → centroid through the existing /api/geocode function.
  function tryZipLocation() {
    var client = window.supabaseClient;
    if (!client || !client.auth || !client.from) return Promise.resolve(false);
    return client.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session) return false;
      return client.from('profiles').select('zip_code').eq('id', session.user.id).maybeSingle().then(function (r) {
        var zip = r && r.data && r.data.zip_code;
        if (!zip) return false;
        var base = (window.MCC_CONFIG && window.MCC_CONFIG.apiBaseUrl) || '';
        return fetch(base + '/api/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
          body: JSON.stringify({ zip: String(zip) })
        }).then(function (resp) { return resp.ok ? resp.json() : null; }).then(function (g) {
          if (!g || g.lat == null || g.lng == null) return false;
          var loc = { lat: +(+g.lat).toFixed(3), lng: +(+g.lng).toFixed(3), ts: Date.now(), source: 'zip', zip: String(zip) };
          lsSet(LOC_KEY, JSON.stringify(loc));
          return true;
        });
      });
    }).catch(function () { return false; });
  }

  // Run the location ladder once; re-applies when something new lands.
  function resolveLocation(prompt) {
    if (mode() !== 'auto') return Promise.resolve(false);
    if (resolving && !prompt) return resolving;
    resolving = tryDeviceLocation(prompt).then(function (ok) {
      if (ok) return true;
      if (location()) return true;        // an older zip fix is still fine
      return tryZipLocation();
    }).then(function (ok) {
      resolving = null;
      if (ok) apply(true);
      return ok;
    });
    return resolving;
  }

  // ---------- public API ---------------------------------------------------
  var api = {
    mode: mode,
    effective: function () { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; },
    set: function (m, opts) {
      if (!VALID[m]) return;
      lsSet(KEY, m);
      apply(true);
      if (m === 'auto') resolveLocation(!!(opts && opts.prompt));
    },
    cycle: function () {
      var order = ['auto', 'light', 'dark'];
      api.set(order[(order.indexOf(mode()) + 1) % order.length]);
    },
    toggle: function () {
      api.set(api.effective() === 'dark' ? 'light' : 'dark');
    },
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    refresh: function () { return apply(true); },
    sunTimes: function () {
      var loc = location();
      if (!loc) return null;
      var s = sunTimesFor(new Date(), loc.lat, loc.lng);
      return s.polar ? null : s;
    },
    location: location,
    setLocation: function (lat, lng) { if (saveLocation(lat, lng, 'app')) apply(true); },
    status: function () {
      var m = mode();
      if (m !== 'auto') return m === 'dark' ? 'Always dark' : 'Always light';
      var loc = location();
      if (!loc) return 'Following your device setting until a location is known';
      var s = api.sunTimes();
      var where = loc.zip ? 'near ' + loc.zip : 'where you are';
      if (!s) return 'Following sunrise and sunset ' + where;
      var fmt = function (d) { try { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (_) { return ''; } };
      return 'Light from ' + fmt(s.rise) + ' to ' + fmt(s.set) + ' ' + where;
    },
    _internals: { sunTimesFor: sunTimesFor, daylightState: daylightState, compute: compute }
  };
  window.MCC_THEME = api;

  // ---------- boot -----------------------------------------------------------
  // Legacy default: a saved 'dark'/'light' is honoured; nothing saved → auto.
  apply(false);

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  onReady(function () {
    // Give supabaseclient.js / Capacitor a moment to exist before the ladder.
    setTimeout(function () { resolveLocation(false); }, 1500);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') apply(true);
    });
    window.addEventListener('focus', function () { apply(true); });
    document.addEventListener('resume', function () { apply(true); });  // Capacitor
    try {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq && mq.addEventListener) mq.addEventListener('change', function () { apply(true); });
    } catch (_) {}
  });
})();
