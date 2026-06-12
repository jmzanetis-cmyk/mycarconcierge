'use strict';
//
// Task #447 — Client-side smoke test for the live driver map broadcast
// handler in www/members-extras.js. We can't load the full browser
// module under Node, so we re-implement the small private helpers
// (_mccApplyPing, _mccDisposeMap) here against the SAME contract the
// production code uses and exercise the three behaviors the task spec
// calls out:
//
//   - a realtime payload for the right job updates the marker position
//   - a payload whose job_id doesn't match is rejected (defense in depth)
//   - dispose() cleans up the channel (calls supabaseClient.removeChannel)
//     and the slow ETA timer (clearInterval) and drops the map entry
//
// If www/members-extras.js drifts away from this contract, this test
// will still pass (it tests a local copy) — so the contract is also
// pinned by a structural assertion that the production file exports
// the __mccConciergeTracking test hooks AND that the production
// _mccApplyPing rejects mismatched job_id and the production
// _mccDisposeMap clears etaTimer + rtChannel via removeChannel.
//

const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'www', 'members-extras.js'),
  'utf8'
);

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log('  ok  ', name)) : (fail++, console.error('  FAIL', name)); }
function eq(name, a, b) { ok(name + ` (got=${JSON.stringify(a)} expected=${JSON.stringify(b)})`, a === b); }

// ── 1. Production file exposes the test hooks ─────────────────────────────
ok('members-extras exposes __mccConciergeTracking',
   /window\.__mccConciergeTracking\s*=\s*window\.__mccConciergeTracking\s*\|\|\s*\{\}/.test(SRC));
ok('members-extras exposes applyPing hook',
   /__mccConciergeTracking\.applyPing\s*=\s*_mccApplyPing/.test(SRC));
ok('members-extras exposes dispose hook',
   /__mccConciergeTracking\.dispose\s*=\s*_mccDisposeMap/.test(SRC));

// ── 2. Contract: _mccApplyPing rejects mismatched job_id ──────────────────
ok('production _mccApplyPing checks job_id ownership',
   /if\s*\(\s*ping\.job_id\s*&&\s*ping\.job_id\s*!==\s*jobId\s*\)\s*return/.test(SRC));

// ── 3. Contract: _mccDisposeMap removes rtChannel via removeChannel ───────
ok('production _mccDisposeMap removes realtime channel',
   /removeChannel\(\s*m\.rtChannel\s*\)/.test(SRC));
ok('production _mccDisposeMap clears the slow ETA timer',
   /clearInterval\(\s*m\.etaTimer\s*\)/.test(SRC));

// ── 4. Contract: ETA timer cadence is 60s (NOT the old 18s poll) ─────────
ok('startConciergeTracking uses 60s ETA cadence (no 18s polling)',
   /setInterval\(\s*\(\)\s*=>\s*\{[\s\S]*?_mccUpdateConciergeMap\(jobId\)[\s\S]*?\}\s*,\s*60000\s*\)/.test(SRC));
ok('startConciergeTracking no longer uses 18000ms cadence',
   !/_mccUpdateConciergeMap\(jobId\)[\s\S]*?\}\s*,\s*18000\s*\)/.test(SRC));

// ── 5. Contract: client opens broadcast channel from server descriptor ───
ok('client subscribes via supabaseClient.channel(tr.realtime.channel)',
   /supabaseClient\s*\.channel\(\s*tr\.realtime\.channel\s*\)/.test(SRC));
ok('client listens for tr.realtime.event broadcast events',
   /\.on\(\s*'broadcast'\s*,\s*\{\s*event:\s*tr\.realtime\.event/.test(SRC));

// ── 5b. Regression: first paint must NOT be skipped when an entry
//        already exists holding only rtChannel / etaTimer. The init
//        branch must check `!entry.map` (not just `!entry`) AND merge
//        new fields into the existing entry rather than clobbering it.
ok('map-init checks !entry.map (not just !entry) — Task #447 ordering fix',
   /if\s*\(\s*!\s*entry\s*\|\|\s*!\s*entry\.map\s*\)/.test(SRC));
ok('map-init preserves pre-existing entry fields via Object.assign',
   /Object\.assign\(\s*entry\s*\|\|\s*\{\}\s*,\s*\{[\s\S]*?\bmap\b[\s\S]*?\btargetMarker\b[\s\S]*?\bdriverMarker\b[\s\S]*?\}\s*\)/.test(SRC));

// ── 6. Behavioral simulation of the apply/dispose contract ────────────────
// Mirror the production helpers locally so we can run them under Node.
function makeSim() {
  const maps = new Map();
  const removed = [];
  const cleared = [];
  const fakeSupabase = { removeChannel: (ch) => removed.push(ch) };
  // Patch globals just for this sim.
  globalThis.supabaseClient = fakeSupabase;
  const _orig = globalThis.clearInterval;
  globalThis.clearInterval = (t) => { cleared.push(t); return _orig(t); };

  function applyPing(jobId, ping) {
    if (!ping || ping.lat == null || ping.lng == null) return;
    if (ping.job_id && ping.job_id !== jobId) return;
    const entry = maps.get(jobId);
    if (!entry || !entry.map || !entry.driverMarker) return;
    if (ping.driver_id && Array.isArray(entry.driverIds) && entry.driverIds.length
        && !entry.driverIds.includes(ping.driver_id)) return;
    entry.driverMarker.setLatLng([ping.lat, ping.lng]);
  }
  function dispose(jobId) {
    const m = maps.get(jobId);
    if (!m) return;
    try { if (m.etaTimer) globalThis.clearInterval(m.etaTimer); } catch {}
    try { if (m.rtChannel && globalThis.supabaseClient) globalThis.supabaseClient.removeChannel(m.rtChannel); } catch {}
    try { if (m.map) m.map.remove(); } catch {}
    maps.delete(jobId);
  }
  return { maps, removed, cleared, applyPing, dispose, restore: () => { globalThis.clearInterval = _orig; } };
}

// 6a. Right-job payload moves the marker.
{
  const sim = makeSim();
  const positions = [];
  sim.maps.set('job-A', {
    map: { remove() {} },
    driverMarker: { setLatLng: (p) => positions.push(p) }
  });
  sim.applyPing('job-A', { job_id: 'job-A', lat: 10, lng: 20 });
  eq('right-job ping → marker moved', positions.length, 1);
  ok('right-job ping → correct coords', positions[0][0] === 10 && positions[0][1] === 20);
  sim.restore();
}

// 6b. Wrong-job payload is rejected.
{
  const sim = makeSim();
  const positions = [];
  sim.maps.set('job-A', {
    map: { remove() {} },
    driverMarker: { setLatLng: (p) => positions.push(p) }
  });
  sim.applyPing('job-A', { job_id: 'job-B-evil', lat: 99, lng: 99 });
  eq('wrong-job ping → marker NOT moved', positions.length, 0);
  sim.restore();
}

// 6b-bis. Whitelist: ping from a driver_id not on entry.driverIds is rejected.
{
  const sim = makeSim();
  const positions = [];
  sim.maps.set('job-A', {
    map: { remove() {} },
    driverMarker: { setLatLng: (p) => positions.push(p) },
    driverIds: ['driver-allowed']
  });
  sim.applyPing('job-A', { job_id: 'job-A', driver_id: 'driver-stranger', lat: 5, lng: 6 });
  eq('off-whitelist driver_id → marker NOT moved', positions.length, 0);
  sim.applyPing('job-A', { job_id: 'job-A', driver_id: 'driver-allowed', lat: 5, lng: 6 });
  eq('on-whitelist driver_id → marker moved', positions.length, 1);
  sim.restore();
}

// 6c. Missing-lat payload is rejected.
{
  const sim = makeSim();
  const positions = [];
  sim.maps.set('job-A', {
    map: { remove() {} },
    driverMarker: { setLatLng: (p) => positions.push(p) }
  });
  sim.applyPing('job-A', { job_id: 'job-A', lat: null, lng: 20 });
  eq('null-lat ping → marker NOT moved', positions.length, 0);
  sim.restore();
}

// 6d. dispose() removes the realtime channel AND clears the ETA timer.
{
  const sim = makeSim();
  const fakeTimer = setInterval(() => {}, 1_000_000);
  const fakeChannel = { _id: 'rt-ch-1' };
  let mapRemoved = false;
  sim.maps.set('job-A', {
    map: { remove: () => { mapRemoved = true; } },
    driverMarker: { setLatLng: () => {} },
    etaTimer: fakeTimer,
    rtChannel: fakeChannel
  });
  sim.dispose('job-A');
  ok('dispose → removeChannel called with rtChannel',
     sim.removed.length === 1 && sim.removed[0] === fakeChannel);
  ok('dispose → clearInterval called with etaTimer',
     sim.cleared.includes(fakeTimer));
  ok('dispose → map.remove() called', mapRemoved);
  ok('dispose → map entry dropped', !sim.maps.has('job-A'));
  sim.restore();
  clearInterval(fakeTimer);
}

// 6d-bis. Regression sim for the map-init ordering bug. Mirrors the
//          production initMapIfNeeded logic: when an entry already has
//          only rtChannel (because realtime subscribed before first
//          paint), the init branch MUST still create the map AND
//          preserve rtChannel.
{
  const sim = makeSim();
  // Production helper, transcribed verbatim from the post-fix code.
  function initMapIfNeeded(jobId, ping) {
    let entry = sim.maps.get(jobId);
    if (!entry || !entry.map) {
      const map = { _id: 'leaflet-map', remove() {} };
      const driverMarker = { _id: 'marker', setLatLng() {} };
      const targetMarker = null;
      entry = Object.assign(entry || {}, { map, driverMarker, targetMarker });
      sim.maps.set(jobId, entry);
    }
    return entry;
  }
  // Realtime subscribed first — entry has only rtChannel.
  sim.maps.set('job-A', { rtChannel: { _id: 'pre-existing-ch' } });
  const entry = initMapIfNeeded('job-A', { lat: 1, lng: 2 });
  ok('init creates map even when entry already exists',  entry.map && entry.map._id === 'leaflet-map');
  ok('init creates driverMarker even when entry already exists', entry.driverMarker && entry.driverMarker._id === 'marker');
  ok('init preserves pre-existing rtChannel',             entry.rtChannel && entry.rtChannel._id === 'pre-existing-ch');
  // Calling again with the map already present must NOT recreate it.
  const sameEntry = initMapIfNeeded('job-A', { lat: 3, lng: 4 });
  ok('second init is idempotent (same map instance)', sameEntry.map === entry.map);
  sim.restore();
}

// 6e. dispose() on an unknown jobId is a no-op (idempotent).
{
  const sim = makeSim();
  sim.dispose('never-registered');
  eq('dispose unknown → no removeChannel', sim.removed.length, 0);
  eq('dispose unknown → no clearInterval', sim.cleared.length, 0);
  sim.restore();
}

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
