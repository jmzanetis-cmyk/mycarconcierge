// ============================================================
// MCC Provider — Live Tracking (Step 6)
//
// Road-test broadcaster: provider broadcasts on track:job:{id}
// with event_kind:'road_test' while the mechanic drives the car.
// No tracking_pings DB write (RLS is driver-only); Realtime
// broadcast only. road_test_events row written best-effort.
//
// Arrival geofence: 150 m, 2 consecutive pings → banner.
// Inbound watch subscribes to the Realtime channel so the
// geofence fires from live pings, not just the 60-s HTTP poll.
// ============================================================

(function () {
  'use strict';

  // ── Road-test broadcaster ─────────────────────────────────────────────────

  // jobId → { watchId, ch, driverId }
  var _ptrRoadTest = new Map();

  window.startProviderRoadTest = async function (jobId) {
    if (!jobId || !navigator.geolocation) return;
    if (!globalThis.supabaseClient) return;
    if (_ptrRoadTest.has(jobId)) return;

    var sessionResult = await globalThis.supabaseClient.auth.getSession();
    var session = sessionResult && sessionResult.data && sessionResult.data.session;
    if (!session) { if (typeof showToast === 'function') showToast('Please sign in to start a road test.', 'error'); return; }

    // Write road_test_events start row (best-effort — may not exist yet).
    try {
      await globalThis.supabaseClient.from('road_test_events').insert({
        job_id: jobId, driver_id: session.user.id, kind: 'start',
      });
    } catch (_) { /* non-fatal */ }

    var ch;
    try {
      ch = globalThis.supabaseClient
        .channel('track:job:' + jobId, { config: { broadcast: { self: false } } })
        .subscribe();
    } catch (_) { return; }

    var userId = session.user.id;
    var watchId = navigator.geolocation.watchPosition(
      function (pos) {
        var payload = {
          ts:             pos.timestamp,
          lat:            pos.coords.latitude,
          lng:            pos.coords.longitude,
          heading:        pos.coords.heading || null,
          speed:          pos.coords.speed || null,
          speed_smoothed: pos.coords.speed || null,
          accuracy:       pos.coords.accuracy || null,
          subject:        'driver_vehicle',
          driver_role:    'primary',
          driver_id:      userId,
          event_kind:     'road_test',
          low_power:      false,
          mock:           false,
        };
        try { ch.send({ type: 'broadcast', event: 'loc_ping', payload: payload }); } catch (_) {}
        _ptrCheckArrival(jobId, payload);
      },
      function (err) { console.warn('[road-test] GPS error', err); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 4000 }
    );

    _ptrRoadTest.set(jobId, { watchId: watchId, ch: ch, driverId: userId });
    _ptrSetRoadTestBtn(jobId, true);
    if (typeof showToast === 'function') showToast('Road test started — your location is being shared.', 'success');
  };

  window.stopProviderRoadTest = async function (jobId) {
    var s = _ptrRoadTest.get(jobId);
    if (!s) return;
    try { navigator.geolocation.clearWatch(s.watchId); } catch (_) {}
    try { await globalThis.supabaseClient.removeChannel(s.ch); } catch (_) {}
    // Write road_test_events stop row (best-effort).
    try {
      var sessionResult = await globalThis.supabaseClient.auth.getSession();
      var session = sessionResult && sessionResult.data && sessionResult.data.session;
      if (session) {
        await globalThis.supabaseClient.from('road_test_events').insert({
          job_id: jobId, driver_id: session.user.id, kind: 'stop',
        });
      }
    } catch (_) {}
    _ptrRoadTest.delete(jobId);
    _ptrArrivalCount.delete(jobId);
    _ptrSetRoadTestBtn(jobId, false);
    if (typeof showToast === 'function') showToast('Road test stopped.', 'info');
  };

  // ── Inbound watch (arrival geofence for incoming vehicles) ───────────────

  // jobId → supabase channel
  var _ptrInbound = new Map();

  window.startProviderInboundWatch = function (jobId) {
    if (!jobId || !globalThis.supabaseClient) return;
    if (_ptrInbound.has(jobId)) return;
    try {
      var ch = globalThis.supabaseClient
        .channel('track:job:' + jobId)
        .on('broadcast', { event: 'loc_ping' }, function (msg) {
          var p = msg && msg.payload;
          if (p && typeof p.lat === 'number') _ptrCheckArrival(jobId, p);
        })
        .subscribe();
      _ptrInbound.set(jobId, ch);
    } catch (_) {}
  };

  window.stopProviderInboundWatch = function (jobId) {
    var ch = _ptrInbound.get(jobId);
    if (!ch) return;
    try { globalThis.supabaseClient.removeChannel(ch); } catch (_) {}
    _ptrInbound.delete(jobId);
    _ptrArrivalCount.delete(jobId);
  };

  // ── Arrival geofence ─────────────────────────────────────────────────────

  var _ptrArrivalCount = new Map(); // jobId → consecutive close-ping count
  var _ptrArrivalFired = new Set(); // jobIds where banner was already shown

  function _ptrCheckArrival(jobId, ping) {
    if (_ptrArrivalFired.has(jobId)) return;
    var provLoc = _ptrProviderLocation();
    if (!provLoc) return;
    var distM = _ptrHaversine(provLoc, { lat: ping.lat, lng: ping.lng });
    if (distM == null) return;
    var count = _ptrArrivalCount.get(jobId) || 0;
    if (distM < 150) {
      var next = count + 1;
      _ptrArrivalCount.set(jobId, next);
      if (next >= 2) {
        _ptrArrivalFired.add(jobId);
        _ptrShowArrivalBanner(jobId);
      }
    } else {
      _ptrArrivalCount.set(jobId, 0);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function _ptrProviderLocation() {
    // Prefer the existing GPS tracking state (from providers-core GPS watch).
    if (typeof lastTrackingPosition === 'object' && lastTrackingPosition &&
        lastTrackingPosition.lat != null) {
      return { lat: lastTrackingPosition.lat, lng: lastTrackingPosition.lng };
    }
    if (typeof providerLocation === 'object' && providerLocation &&
        providerLocation.lat != null) {
      return providerLocation;
    }
    return null;
  }

  function _ptrHaversine(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    var R = 6371000;
    var rad = function (d) { return d * Math.PI / 180; };
    var dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function _ptrSetRoadTestBtn(jobId, active) {
    var btn = document.getElementById('ptr-roadtest-btn-' + jobId);
    if (!btn) return;
    if (active) {
      btn.innerHTML = '&#9632; Stop Road Test';
      btn.style.background = 'var(--accent-red, #dc2626)';
      btn.setAttribute('onclick', "window.stopProviderRoadTest('" + jobId + "')");
    } else {
      btn.innerHTML = '&#128663; Start Road Test';
      btn.style.background = 'var(--accent-blue, #3b82f6)';
      btn.setAttribute('onclick', "window.startProviderRoadTest('" + jobId + "')");
    }
  }

  function _ptrShowArrivalBanner(jobId) {
    var slot = document.getElementById('ptr-arrival-' + jobId);
    if (slot) {
      slot.innerHTML = '<div style="padding:10px 14px;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.4);border-radius:6px;font-size:0.85rem;color:#15803d;font-weight:600;">&#128663; Vehicle arriving — intake scan ready</div>';
    }
    if (typeof showToast === 'function') showToast('Vehicle arriving — intake scan ready!', 'success');
  }

})();
