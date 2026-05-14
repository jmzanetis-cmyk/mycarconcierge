// Task #306 — Playwright regression: verifies the daily digest body, subject,
// and SMS lines all render the engine-paused reason when engine_state is
// paused. Triggers the dev daily-digest endpoint
// (POST /api/admin/ai-ops/daily-digest/run) which now returns the rendered
// digest artifacts on the response payload (Task #306 addition) so we can
// assert what would have been emailed/SMSed without intercepting
// Resend/Twilio.
//
// Auth-protected; requires ADMIN_PASSWORD to match server env.

const { test, expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password';
const AUTH = { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' };

test.describe('Daily digest renders engine_paused reason (Task #306)', () => {
  test.describe.configure({ mode: 'serial' });

  let priorRunning = null;

  test.beforeAll(async ({ request }) => {
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

  test('paused engine — digest html, subject and SMS all surface the paused reason', async ({ request }) => {
    test.skip(priorRunning === null, 'engine-state endpoint not reachable — needs Supabase env in dev');

    const PAUSE_REASON = 'task-306 regression test';

    // 1. Pause engine.
    const pause = await request.post(`${BASE}/api/admin/outreach/engine-toggle`, {
      headers: AUTH,
      data: { is_running: false, pause_reason: PAUSE_REASON }
    });
    expect(pause.status()).toBe(200);

    // 2. Cycle while paused must return engine_paused — this is what the
    // outreach-cycle scheduled function relies on.
    const cycle = await request.post(`${BASE}/api/admin/outreach/engine-cycle`, {
      headers: AUTH, data: {}
    });
    expect(cycle.status()).toBe(200);
    const cycleBody = await cycle.json();
    expect(cycleBody.skipped).toBe(true);
    expect(cycleBody.reason).toBe('engine_paused');

    // 3. Trigger the daily digest. The dev endpoint now returns the
    // rendered HTML, subject, and SMS lines on the response (Task #306).
    const digest = await request.post(`${BASE}/api/admin/ai-ops/daily-digest/run`, {
      headers: AUTH, data: {}
    });
    expect(digest.status()).toBe(200);
    const digestBody = await digest.json();

    // The digest may run in a no-resend dev env — only the artifacts that
    // come from rendering (not from sending) are asserted.
    expect(digestBody.digest).toBeTruthy();
    expect(digestBody.digest.engine_paused).toBeTruthy();
    expect(digestBody.digest.engine_paused.paused).toBe(true);
    expect(digestBody.digest.engine_paused.reason).toContain('task-306');

    // SMS lines always render (independent of Twilio creds).
    expect(Array.isArray(digestBody.digest.sms_lines)).toBe(true);
    const smsText = digestBody.digest.sms_lines.join('\n');
    expect(smsText).toMatch(/Engine paused/i);
    expect(smsText).toContain(PAUSE_REASON);

    // HTML + subject only present when Resend is configured. If they are,
    // they must include the paused reason.
    if (digestBody.digest.html) {
      expect(digestBody.digest.html).toMatch(/data-section="engine-paused-banner"/);
      expect(digestBody.digest.html).toMatch(/Engine Paused/i);
      expect(digestBody.digest.html).toContain(PAUSE_REASON);
    }
    if (digestBody.digest.subject) {
      expect(digestBody.digest.subject).toMatch(/Engine paused/i);
      expect(digestBody.digest.subject).toContain(PAUSE_REASON);
    }

    // 4. Outreach admin diagnostics block must also reflect the paused state.
    const state = await request.get(`${BASE}/api/admin/outreach/engine-state`, { headers: AUTH });
    const stateBody = await state.json();
    expect(stateBody.diagnostics).toBeTruthy();
    expect(stateBody.diagnostics.is_running).toBe(false);
    expect(stateBody.diagnostics.pause_reason).toContain('task-306');

    // 5. Resume.
    const resume = await request.post(`${BASE}/api/admin/outreach/engine-toggle`, {
      headers: AUTH, data: { is_running: true }
    });
    expect(resume.status()).toBe(200);

    // 6. After resume, a fresh digest run should NOT include the paused banner.
    const digest2 = await request.post(`${BASE}/api/admin/ai-ops/daily-digest/run`, {
      headers: AUTH, data: {}
    });
    const digest2Body = await digest2.json();
    expect(digest2Body.digest.engine_paused.paused).toBe(false);
    if (digest2Body.digest.html) {
      expect(digest2Body.digest.html).not.toMatch(/data-section="engine-paused-banner"/);
    }
    const sms2Text = (digest2Body.digest.sms_lines || []).join('\n');
    expect(sms2Text).not.toMatch(/🛑 Engine paused/);
  });
});
