// Task #306 — Playwright regression: verifies the engine-paused signal that
// the daily digest reads to render its "engine paused" narrative.
//
// The daily digest (`netlify/functions/daily-digest-scheduled.js`) is a
// scheduled function with no public HTTP trigger, so it can't be invoked
// directly from a Playwright spec. Instead we verify the *contract* the
// digest depends on:
//
//   1. Pausing the engine via /api/admin/outreach/engine-toggle correctly
//      flips engine_state.is_running → false and records pause metadata.
//   2. Triggering /api/admin/outreach/engine-cycle while paused returns
//      `{ skipped: true, reason: 'engine_paused' }` — this is the exact
//      signal the digest's queue-health probe + narrative branch on.
//   3. The /api/admin/outreach/engine-state diagnostics block (added in
//      Task #306) surfaces the paused state for the admin panel.
//
// If any of these break, the digest can no longer render "engine paused"
// correctly. Auth-protected; requires ADMIN_PASSWORD to match server env.

const { test, expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password';
const AUTH = { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' };

test.describe('Outreach engine_paused digest signal (Task #306)', () => {
  test.describe.configure({ mode: 'serial' });

  let priorRunning = null;

  test.beforeAll(async ({ request }) => {
    // Snapshot the current state so we can restore it in afterAll regardless
    // of which assertion fails — never leave the engine paused on a real env.
    const r = await request.get(`${BASE}/api/admin/outreach/engine-state`, { headers: AUTH });
    if (r.status() === 200) {
      const d = await r.json();
      priorRunning = d.is_running;
    }
  });

  test.afterAll(async ({ request }) => {
    if (priorRunning === true) {
      await request.post(`${BASE}/api/admin/outreach/engine-toggle`, {
        headers: AUTH,
        data: { is_running: true }
      });
    }
  });

  test('pause + cycle returns skipped engine_paused, then resume restores running', async ({ request }) => {
    test.skip(priorRunning === null, 'engine-state endpoint not reachable — needs SUPABASE_URL/SERVICE_ROLE_KEY in dev env');

    // 1. Pause the engine.
    const pause = await request.post(`${BASE}/api/admin/outreach/engine-toggle`, {
      headers: AUTH,
      data: { is_running: false, pause_reason: 'task-306 regression test' }
    });
    expect(pause.status()).toBe(200);
    const pauseBody = await pause.json();
    expect(pauseBody.is_running).toBe(false);

    // 2. engine-state must now reflect paused + diagnostics block must
    // expose it (this is what the admin panel + digest both read).
    const state = await request.get(`${BASE}/api/admin/outreach/engine-state`, { headers: AUTH });
    expect(state.status()).toBe(200);
    const stateBody = await state.json();
    expect(stateBody.is_running).toBe(false);
    expect(stateBody.pause_reason).toContain('task-306');
    expect(stateBody.diagnostics).toBeTruthy();
    expect(stateBody.diagnostics.is_running).toBe(false);
    expect(stateBody.diagnostics.pause_reason).toContain('task-306');

    // 3. Triggering a cycle while paused MUST return the engine_paused
    // sentinel — the daily digest narrative + queue-health probe both
    // depend on outreach-cycle.js returning this exact shape.
    const cycle = await request.post(`${BASE}/api/admin/outreach/engine-cycle`, {
      headers: AUTH,
      data: {}
    });
    expect(cycle.status()).toBe(200);
    const cycleBody = await cycle.json();
    expect(cycleBody.skipped).toBe(true);
    expect(cycleBody.reason).toBe('engine_paused');

    // 4. Resume — and confirm the diagnostics block flips back.
    const resume = await request.post(`${BASE}/api/admin/outreach/engine-toggle`, {
      headers: AUTH,
      data: { is_running: true }
    });
    expect(resume.status()).toBe(200);
    const resumeBody = await resume.json();
    expect(resumeBody.is_running).toBe(true);

    const stateAfter = await request.get(`${BASE}/api/admin/outreach/engine-state`, { headers: AUTH });
    const stateAfterBody = await stateAfter.json();
    expect(stateAfterBody.is_running).toBe(true);
    expect(stateAfterBody.diagnostics.is_running).toBe(true);
    expect(stateAfterBody.pause_reason).toBeFalsy();
  });
});
