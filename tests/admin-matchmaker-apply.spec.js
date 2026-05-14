'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Task #198 — End-to-end test for the admin Matchmaker apply flow.
//
// Closes the gap left by scripts/matchmaker-award-notify-test.js: the unit
// test stubs Supabase + Resend in process so it doesn't exercise the click →
// fetch → /api/admin/agent-fleet/actions/<id>/apply route → handler path.
// This spec drives the real button on /admin/agent-fleet-detail.html, runs
// it through the actual exports.handler, and asserts the resulting Postgres
// rows. A regression in URL building, the netlify rewrite, parsePath, the
// admin-auth gate, applyMatchmakerRank, or notifyMatchmakerAward fails it.
//
// Resend is stubbed via require.cache before agent-fleet-admin loads. FCM is
// disabled by clearing FCM_SERVICE_ACCOUNT_JSON for the run so the push
// branch returns { sent:false, reason:'not_configured' } without hitting
// the network.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { BASE_URL, SUPABASE_SERVICE_KEY, ADMIN_PASSWORD, getSupabaseAdmin } = require('./helpers');

// Stub Resend BEFORE requiring agent-fleet-admin so award emails no-op.
const ADMIN_FN_PATH = require.resolve('../netlify/functions/agent-fleet-admin');
const RESEND_PATH = require.resolve('resend', { paths: [path.dirname(ADMIN_FN_PATH)] });
let resendCalls = [];
require.cache[RESEND_PATH] = {
  id: RESEND_PATH,
  filename: RESEND_PATH,
  loaded: true,
  exports: {
    Resend: class {
      constructor() {}
      get emails() {
        return {
          send: async (payload) => {
            resendCalls.push(payload);
            return { id: 'test-' + resendCalls.length };
          }
        };
      }
    }
  }
};

const adminFleetHandler = require('../netlify/functions/agent-fleet-admin').handler;

// Restore an env var the test temporarily mutated. Distinguishes "was unset"
// (delete) from "had a value" (re-assign) — without this, an originally
// undefined value gets restored as the literal string "undefined" and
// silently breaks downstream tests that rely on the variable being falsy.
function restoreEnv(key, savedValue) {
  if (savedValue === undefined) delete process.env[key];
  else process.env[key] = savedValue;
}

// Forward an intercepted Playwright request through the actual function
// handler. Mirrors the synthetic event Netlify constructs for HTTPS calls
// (httpMethod / path / headers / body / queryStringParameters) so parsePath()
// + authenticateAdmin() + the route table all behave identically to prod.
async function forwardToHandler(route) {
  const req = route.request();
  const url = new URL(req.url());
  const event = {
    httpMethod: req.method(),
    path: url.pathname,
    headers: req.headers(),
    body: req.postData() || '',
    queryStringParameters: Object.fromEntries(url.searchParams)
  };
  const result = await adminFleetHandler(event);
  await route.fulfill({
    status: result.statusCode || 200,
    headers: result.headers || { 'Content-Type': 'application/json' },
    body: result.body || ''
  });
}

test.describe('Admin Matchmaker apply — end-to-end notification fan-out', () => {
  let seeded = null;
  let savedFcmEnv;
  let savedResendKey;

  async function createDisposableUser(sb, label) {
    const email = `mm-e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@mcc-test.example.com`;
    const fullName = `MM E2E ${label}`;
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password: 'TempPass123!Test',
      email_confirm: true,
      user_metadata: { full_name: fullName, mm_test: true }
    });
    if (error) throw new Error(`auth.admin.createUser (${label}) failed: ${error.message}`);
    return { id: data.user.id, email, full_name: fullName, created: true };
  }

  test.beforeEach(async () => {
    test.skip(!SUPABASE_SERVICE_KEY, 'SUPABASE_SERVICE_ROLE_KEY required for DB seeding');
    test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD required for admin auth');

    // Disable FCM so the push branch in notifyMatchmakerAward short-circuits
    // with reason 'not_configured' instead of hitting the network.
    savedFcmEnv = process.env.FCM_SERVICE_ACCOUNT_JSON;
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;

    // Force the Resend stub path to actually run. sendAwardEmail() returns
    // false immediately when RESEND_API_KEY is unset, so the test must set
    // a dummy key — the stubbed Resend class doesn't care what value it is.
    savedResendKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 'test-key-for-stubbed-resend';

    resendCalls = [];

    const sb = getSupabaseAdmin();

    // Always create disposable fixtures for every recipient — never reuse a
    // shared profile. plan_bids has UNIQUE(care_plan_id, provider_id), and
    // shared profiles can have null/legacy emails which would skew the
    // resendCalls / *_emailed assertions.
    const member = await createDisposableUser(sb, 'member');
    const provA  = await createDisposableUser(sb, 'provA');
    const provB  = await createDisposableUser(sb, 'provB');
    const provC  = await createDisposableUser(sb, 'provC');

    if (new Set([provA.id, provB.id, provC.id]).size !== 3) throw new Error('provider ids collided');

    const { data: planRow, error: planErr } = await sb.from('care_plans').insert({
      member_id: member.id,
      title: 'MM E2E — Brake Pads & Rotors',
      description: 'Synthetic care plan for matchmaker apply E2E test',
      services: [{ type: 'brakes' }],
      service_types: ['brakes'],
      value_min: 200,
      value_max: 500,
      city: 'New York', state: 'NY', zip_code: '10001',
      status: 'open',
      bid_closes_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    }).select('id, member_id, status, title').single();
    if (planErr) throw new Error(`care_plans insert failed: ${planErr.message}`);

    const { data: bidRows, error: bidsErr } = await sb.from('plan_bids').insert([
      { care_plan_id: planRow.id, provider_id: provA.id, amount: 250, note: 'Winner bid',  status: 'pending' },
      { care_plan_id: planRow.id, provider_id: provB.id, amount: 320, note: 'Higher bid',  status: 'pending' },
      { care_plan_id: planRow.id, provider_id: provC.id, amount: 410, note: 'Highest bid', status: 'pending' }
    ]).select('id, provider_id, status, amount');
    if (bidsErr) throw new Error(`plan_bids insert failed: ${bidsErr.message}`);
    if (!bidRows || bidRows.length !== 3) throw new Error('expected 3 plan_bids inserted');

    const winner = bidRows.find(b => b.provider_id === provA.id);
    const loserB = bidRows.find(b => b.provider_id === provB.id);
    const loserC = bidRows.find(b => b.provider_id === provC.id);

    // Synthetic 'proposed' matchmaker action — same shape agent-matchmaker.js
    // writes after its LLM call. needs_review:true makes the detail page
    // surface it in the review queue.
    const { data: actionRow, error: actErr } = await sb.from('agent_actions').insert({
      agent_slug: 'matchmaker',
      action_type: 'rank',
      status: 'proposed',
      autonomy_used: 'propose',
      needs_review: true,
      decision: {
        event_type: 'care_plan.auction_closed',
        payload: { care_plan_id: planRow.id },
        recommended_winner_bid_id: winner.id,
        ranked_bids: [
          { bid_id: winner.id, score: 0.94, why: 'Best price + verified BGC' },
          { bid_id: loserB.id, score: 0.71, why: 'Higher price, fewer reviews' },
          { bid_id: loserC.id, score: 0.55, why: 'Highest price, low rating' }
        ],
        concerns: []
      },
      reasoning: 'E2E fixture — winner is provider A.'
    }).select('id').single();
    if (actErr) throw new Error(`agent_actions insert failed: ${actErr.message}`);

    seeded = { member, provA, provB, provC, plan: planRow, winner, loserB, loserC, action: actionRow };
  });

  test.afterEach(async () => {
    restoreEnv('FCM_SERVICE_ACCOUNT_JSON', savedFcmEnv);
    restoreEnv('RESEND_API_KEY', savedResendKey);

    if (!seeded) return;
    const sb = getSupabaseAdmin();

    const userIds = [seeded.member.id, seeded.provA.id, seeded.provB.id, seeded.provC.id]
      .filter(Boolean);

    if (seeded.plan?.id) {
      try {
        await sb.from('notifications')
          .delete()
          .in('user_id', userIds)
          .eq('link_type', 'care_plan')
          .eq('link_id', seeded.plan.id);
      } catch (_) { /* notifications table may be absent on some envs */ }
    }

    if (seeded.plan?.id) {
      await sb.from('agent_actions')
        .delete()
        .eq('agent_slug', 'matchmaker')
        .eq('action_type', 'apply')
        .filter('decision->>care_plan_id', 'eq', seeded.plan.id);
    }
    if (seeded.action?.id) await sb.from('agent_actions').delete().eq('id', seeded.action.id);

    // care_plans cascade-deletes plan_bids via FK ON DELETE CASCADE.
    if (seeded.plan?.id) await sb.from('care_plans').delete().eq('id', seeded.plan.id);

    for (const u of [seeded.member, seeded.provA, seeded.provB, seeded.provC]) {
      if (u?.created && u.id) {
        try { await sb.auth.admin.deleteUser(u.id); } catch (_) {}
        try { await sb.from('profiles').delete().eq('id', u.id); } catch (_) {}
      }
    }
    seeded = null;
  });

  test('Click "Accept winning bid" → 4 notification rows + audit summary populated', async ({ page }) => {
    // Forward every admin-fleet API call to the real handler. The dev server
    // doesn't proxy Netlify functions, so without forwarding the page would
    // 404 on the actions list and never render the apply button.
    await page.route('**/api/admin/agent-fleet/**', forwardToHandler);

    page.on('dialog', d => d.accept());

    await page.goto(`${BASE_URL}/admin/agent-fleet-detail.html?slug=matchmaker`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('#loginShell')).toBeVisible();
    await page.locator('#pwInput').fill(ADMIN_PASSWORD);
    await page.locator('#pwSubmit').click();

    await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#agentTitle')).toHaveText(/Matchmaker/i, { timeout: 10000 });
    await expect(page.locator('#reviewQueueCard')).toBeVisible({ timeout: 15000 });

    const acceptBtn = page.locator(
      `#reviewQueueBody [data-q-apply="${seeded.action.id}"][data-q-kind="matchmaker"]`
    );
    await expect(acceptBtn).toBeVisible({ timeout: 15000 });
    await expect(acceptBtn).toContainText('Accept winning bid');

    await acceptBtn.click();

    // Toast confirms the round-trip succeeded; without it the next assertions
    // would race the DB writes the handler is still finishing.
    await expect(page.locator('#toast')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#toast')).toContainText(/Bid accepted/i);

    // ── Assert 4 in-app notifications inserted (winner, 2 losers, member) ──
    const sb = getSupabaseAdmin();
    const userIds = [seeded.provA.id, seeded.provB.id, seeded.provC.id, seeded.member.id];
    const { data: notifs, error: notifErr } = await sb.from('notifications')
      .select('user_id, type, title, link_type, link_id')
      .in('user_id', userIds)
      .eq('link_type', 'care_plan')
      .eq('link_id', seeded.plan.id);
    expect(notifErr).toBeNull();
    expect(Array.isArray(notifs)).toBe(true);
    expect(notifs.length).toBe(4);

    const byUser = notifs.reduce((m, n) => { (m[n.user_id] ||= []).push(n); return m; }, {});
    expect(byUser[seeded.provA.id]?.[0]?.type).toBe('bid_accepted');
    expect(byUser[seeded.provB.id]?.[0]?.type).toBe('bid_not_selected');
    expect(byUser[seeded.provC.id]?.[0]?.type).toBe('bid_not_selected');
    expect(byUser[seeded.member.id]?.[0]?.type).toBe('auction_awarded');

    // ── Assert the audit row's decision.notifications summary matches ──
    const { data: auditRows, error: auditErr } = await sb.from('agent_actions')
      .select('id, action_type, status, decision')
      .eq('agent_slug', 'matchmaker')
      .eq('action_type', 'apply')
      .filter('decision->>care_plan_id', 'eq', seeded.plan.id);
    expect(auditErr).toBeNull();
    expect(Array.isArray(auditRows) && auditRows.length).toBeGreaterThan(0);
    const audit = auditRows[0];
    expect(audit.status).toBe('executed');
    expect(audit.decision.applied_action_id).toBe(seeded.action.id);
    expect(audit.decision.accepted_bid_id).toBe(seeded.winner.id);

    const summary = audit.decision.notifications;
    expect(summary, 'audit decision must include a notifications summary').toBeTruthy();
    expect(summary.winner_notified).toBe(true);
    expect(summary.loser_notified_count).toBe(2);
    expect(summary.member_notified).toBe(true);
    expect(summary.winner_emailed).toBe(true);
    expect(summary.loser_emailed_count).toBe(2);
    expect(summary.member_emailed).toBe(true);
    expect(summary.winner_pushed).toBe(false);
    expect(summary.loser_pushed_count).toBe(0);
    expect(summary.member_pushed).toBe(false);
    expect(summary.push_skipped_reason).toBe('not_configured');
    expect(Array.isArray(summary.errors)).toBe(true);
    expect(summary.errors.length).toBe(0);

    // Sanity: the Resend stub captured one send per recipient (4 total).
    expect(resendCalls.length).toBe(4);
  });
});
