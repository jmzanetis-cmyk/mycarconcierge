'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Task #154 — Automated tests for the Matchmaker review-and-approve flow.
//
// Two layers of coverage so regressions in either path are caught:
//
//   1. DB-side apply path. Seeds a real care_plan + 2 plan_bids + a synthetic
//      'proposed' agent_actions row, then invokes applyMatchmakerRank()
//      directly against the live Supabase service-role client and asserts:
//        • winning bid    → status='accepted'
//        • losing bid(s)  → status='rejected'
//        • care_plan      → status='awarded'
//        • agent_actions  → review_status='executed'
//        • follow-up audit row inserted with action_type='apply'.
//      Gated on SUPABASE_SERVICE_ROLE_KEY.
//
//   2. UI-side review queue. Mocks every /api/admin/agent-fleet/* route the
//      detail page touches (the dev server doesn't proxy Netlify functions),
//      logs into /admin/agent-fleet-detail.html?slug=matchmaker with the
//      admin password, and verifies that:
//        • the review queue card renders for the matchmaker slug,
//        • a synthetic proposed action shows an "Accept winning bid" button,
//        • clicking the button POSTs /actions/<id>/apply with the right ID.
//      Gated on ADMIN_PASSWORD.
//
// Resend is stubbed via require.cache before agent-fleet-admin loads so the
// best-effort award emails don't try to hit the real provider during the
// DB-side test. Mirrors scripts/matchmaker-award-notify-test.js.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const { test, expect } = require('@playwright/test');
const { BASE_URL, SUPABASE_SERVICE_KEY, ADMIN_PASSWORD, getSupabaseAdmin } = require('./helpers');

// Stub Resend BEFORE requiring agent-fleet-admin so the email send no-ops.
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

const { applyMatchmakerRank } = require('../netlify/functions/agent-fleet-admin').__test;

// ─────────────────────────────────────────────────────────────────────────────
// DB-side apply path
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Agent Matchmaker — apply rank against the real DB', () => {
  // Track everything we insert so afterEach can clean up regardless of pass/fail.
  let seeded = null;

  async function findExistingUser(sb, role) {
    const { data, error } = await sb.from('profiles')
      .select('id').eq('role', role).limit(1).maybeSingle();
    if (error) throw new Error(`profiles lookup (${role}) failed: ${error.message}`);
    return data ? data.id : null;
  }

  async function createDisposableUser(sb, label) {
    const email = `mm-test-${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@mcc-test.example.com`;
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password: 'TempPass123!Test',
      email_confirm: true,
      user_metadata: { full_name: `MM Test ${label}`, mm_test: true }
    });
    if (error) throw new Error(`auth.admin.createUser (${label}) failed: ${error.message}`);
    return { id: data.user.id, email };
  }

  test.beforeEach(async () => {
    test.skip(!SUPABASE_SERVICE_KEY, 'SUPABASE_SERVICE_ROLE_KEY required for DB seeding');
    const sb = getSupabaseAdmin();
    resendCalls = [];

    // Re-use existing users when possible to keep auth.users tidy; fall back
    // to disposable users so the spec also passes on a fresh DB.
    const member = { id: await findExistingUser(sb, 'member'),   created: false };
    const provA  = { id: await findExistingUser(sb, 'provider'), created: false };
    let provB    = { id: null, created: false };

    if (!member.id) {
      const u = await createDisposableUser(sb, 'member');
      member.id = u.id; member.created = true;
    }
    if (!provA.id) {
      const u = await createDisposableUser(sb, 'provA');
      provA.id = u.id; provA.created = true;
    }
    // Always create a second disposable provider — we need TWO distinct
    // provider ids and plan_bids has UNIQUE(care_plan_id, provider_id).
    {
      const u = await createDisposableUser(sb, 'provB');
      provB = { id: u.id, created: true };
    }
    if (provA.id === provB.id) throw new Error('provider ids collided');

    // Care plan in 'open' state (apply will flip to 'awarded').
    const { data: planRow, error: planErr } = await sb.from('care_plans').insert({
      member_id: member.id,
      title: 'MM Test — Brake Pads & Inspection',
      description: 'Synthetic care plan for matchmaker apply-path test',
      services: [{ type: 'brakes' }],
      service_types: ['brakes'],
      value_min: 200,
      value_max: 400,
      city: 'New York', state: 'NY', zip_code: '10001',
      status: 'open',
      bid_closes_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    }).select('id, member_id, status, title').single();
    if (planErr) throw new Error(`care_plans insert failed: ${planErr.message}`);

    // Two pending bids on the plan.
    const { data: bidRows, error: bidsErr } = await sb.from('plan_bids').insert([
      { care_plan_id: planRow.id, provider_id: provA.id, amount: 250, note: 'Winner bid', status: 'pending' },
      { care_plan_id: planRow.id, provider_id: provB.id, amount: 320, note: 'Higher bid',  status: 'pending' }
    ]).select('id, provider_id, status, amount');
    if (bidsErr) throw new Error(`plan_bids insert failed: ${bidsErr.message}`);
    if (!bidRows || bidRows.length !== 2) throw new Error('expected 2 plan_bids inserted');

    const winner = bidRows.find(b => b.provider_id === provA.id);
    const loser  = bidRows.find(b => b.provider_id === provB.id);

    // Synthetic 'proposed' matchmaker agent_action targeting the winner.
    // Mirrors what netlify/functions/agent-matchmaker.js writes after the
    // LLM call — see logAction(... action_type:'rank', status:'proposed').
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
          { bid_id: winner.id, score: 0.91, why: 'Best price + verified BGC' },
          { bid_id: loser.id,  score: 0.62, why: 'Higher price, fewer reviews' }
        ],
        concerns: []
      },
      reasoning: 'Test fixture — winner is provider A.'
    }).select('id, agent_slug, action_type, status, review_status, decision').single();
    if (actErr) throw new Error(`agent_actions insert failed: ${actErr.message}`);

    seeded = { member, provA, provB, plan: planRow, winner, loser, action: actionRow };
  });

  test.afterEach(async () => {
    if (!seeded) return;
    const sb = getSupabaseAdmin();

    // Audit row(s) the apply path appended (action_type='apply').
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

    // Best-effort: nuke notifications the apply path inserted — but ONLY for
    // users we created in this test, never for pre-existing reused fixtures
    // (otherwise we'd churn real data on shared envs).
    const disposableIds = [seeded.member, seeded.provA, seeded.provB]
      .filter((u) => u?.created && u.id)
      .map((u) => u.id);
    if (disposableIds.length) {
      try { await sb.from('notifications').delete().in('user_id', disposableIds); }
      catch (_) { /* table may not exist on every env */ }
    }

    // Only delete users we created (don't nuke real test fixtures).
    for (const u of [seeded.member, seeded.provA, seeded.provB]) {
      if (u?.created && u.id) {
        try { await sb.auth.admin.deleteUser(u.id); } catch (_) {}
        try { await sb.from('profiles').delete().eq('id', u.id); } catch (_) {}
      }
    }
    seeded = null;
  });

  test('applyMatchmakerRank promotes the winning bid and rejects the rest', async () => {
    const sb = getSupabaseAdmin();
    const result = await applyMatchmakerRank(sb, seeded.action.id, seeded.action);

    expect(result.error, `apply error: ${result.error}`).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.care_plan_id).toBe(seeded.plan.id);
    expect(result.accepted_bid_id).toBe(seeded.winner.id);
    expect(result.rejected_count).toBe(1);

    // ── DB assertions ──────────────────────────────────────────────────────
    const { data: bidsAfter, error: bidsErr } = await sb.from('plan_bids')
      .select('id, status').eq('care_plan_id', seeded.plan.id);
    expect(bidsErr).toBeNull();
    const byId = bidsAfter.reduce((m, b) => { m[b.id] = b.status; return m; }, {});
    expect(byId[seeded.winner.id]).toBe('accepted');
    expect(byId[seeded.loser.id]).toBe('rejected');

    const { data: planAfter, error: planErr } = await sb.from('care_plans')
      .select('id, status').eq('id', seeded.plan.id).single();
    expect(planErr).toBeNull();
    expect(planAfter.status).toBe('awarded');

    const { data: origAction, error: aErr } = await sb.from('agent_actions')
      .select('id, review_status, reviewed_by, needs_review').eq('id', seeded.action.id).single();
    expect(aErr).toBeNull();
    expect(origAction.review_status).toBe('executed');
    expect(origAction.reviewed_by).toBe('admin');
    expect(origAction.needs_review).toBe(false);

    const { data: auditRows } = await sb.from('agent_actions')
      .select('id, action_type, status, decision')
      .eq('agent_slug', 'matchmaker')
      .eq('action_type', 'apply')
      .filter('decision->>care_plan_id', 'eq', seeded.plan.id);
    expect(Array.isArray(auditRows) && auditRows.length).toBeGreaterThan(0);
    const audit = auditRows[0];
    expect(audit.status).toBe('executed');
    expect(audit.decision.applied_action_id).toBe(seeded.action.id);
    expect(audit.decision.accepted_bid_id).toBe(seeded.winner.id);
    expect(Array.isArray(audit.decision.rejected_bid_ids)).toBe(true);
    expect(audit.decision.rejected_bid_ids).toContain(seeded.loser.id);
  });

  test('Re-applying an already-executed action returns 409 and does not re-mutate bids', async () => {
    const sb = getSupabaseAdmin();
    // First apply (must succeed).
    const first = await applyMatchmakerRank(sb, seeded.action.id, seeded.action);
    expect(first.ok).toBe(true);

    // Reload the action row so the second call sees review_status='executed'.
    // applyMatchmakerRank itself short-circuits on that flag via applyAction(),
    // but the unit-level helper checks the bid status — assert that BOTH the
    // bid-already-accepted guard AND the no-op behaviour are wired correctly.
    const { data: refreshed } = await sb.from('agent_actions')
      .select('*').eq('id', seeded.action.id).single();
    const second = await applyMatchmakerRank(sb, seeded.action.id, refreshed);
    expect(second.ok).toBeUndefined();
    expect(second.status).toBe(409);
    expect(String(second.error || '')).toMatch(/no longer pending|already/i);

    // Bids stayed where the first apply put them.
    const { data: bidsAfter } = await sb.from('plan_bids')
      .select('id, status').eq('care_plan_id', seeded.plan.id);
    const byId = bidsAfter.reduce((m, b) => { m[b.id] = b.status; return m; }, {});
    expect(byId[seeded.winner.id]).toBe('accepted');
    expect(byId[seeded.loser.id]).toBe('rejected');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UI-side review queue rendering + click wiring
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Agent Matchmaker — detail page review queue UI', () => {
  test.beforeEach(async () => {
    test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD not set');
  });

  // Build the canned API responses the detail page asks for. Returning a
  // single matchmaker proposal lets us verify the "Accept winning bid"
  // affordance without standing up the Netlify function in dev.
  function makeMockServer({ actionId, carePlanId, winnerBidId }) {
    const actionRow = {
      id: actionId,
      agent_slug: 'matchmaker',
      action_type: 'rank',
      status: 'proposed',
      autonomy_used: 'propose',
      needs_review: true,
      reviewed_at: null,
      review_status: null,
      decision: {
        event_type: 'care_plan.auction_closed',
        payload: { care_plan_id: carePlanId },
        recommended_winner_bid_id: winnerBidId,
        ranked_bids: [{ bid_id: winnerBidId, score: 0.9, why: 'Best price' }],
        concerns: []
      },
      reasoning: 'Recommend winner — best price + verified BGC.',
      cost_usd: 0.0042,
      tokens_in: 320,
      tokens_out: 180,
      duration_ms: 540,
      created_at: new Date().toISOString()
    };

    const agentRow = {
      slug: 'matchmaker',
      display_name: 'Matchmaker',
      description: 'Ranks bids on closed auctions and recommends a winner.',
      enabled: true,
      autonomy: 'propose',
      model: 'claude-3-5-sonnet-20241022',
      daily_spend_cap_usd: 5,
      handles_events: ['care_plan.auction_closed'],
      triggers: ['care_plan.auction_closed'],
      today_spend: { actual_usd: 0.01, reserved_usd: 0, call_count: 1 }
    };

    return {
      applyCalls: [],
      actionRow,
      agentRow
    };
  }

  test('Review queue shows "Accept winning bid" and click POSTs the apply route', async ({ page }) => {
    const carePlanId  = '11111111-1111-4111-8111-111111111111';
    const winnerBidId = '22222222-2222-4222-8222-222222222222';
    const actionId    = 9001;
    const ctx = makeMockServer({ actionId, carePlanId, winnerBidId });

    // Mock every admin-fleet route the page touches. Anything not explicitly
    // listed here returns an empty/204-style payload so the page can render.
    await page.route('**/api/admin/agent-fleet/**', async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();

      // Auth check — every request must carry the admin password header.
      const headers = req.headers();
      const pwHeader = headers['x-admin-password'] || '';
      if (!pwHeader) {
        return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Unauthorized' }) });
      }

      const pathPart = url.split('/api/admin/agent-fleet')[1] || '';

      // GET /agents
      if (method === 'GET' && pathPart.startsWith('/agents') && !pathPart.includes('/prompt')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ agents: [ctx.agentRow] }) });
      }
      // GET /agents/:slug/prompt
      if (method === 'GET' && /\/agents\/[^/]+\/prompt$/.test(pathPart)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: null }) });
      }
      // GET /agents/:slug/prompt-history
      if (method === 'GET' && /\/agents\/[^/]+\/prompt-history$/.test(pathPart)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ versions: [] }) });
      }
      // GET /actions?...
      if (method === 'GET' && pathPart.startsWith('/actions')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          actions: [ctx.actionRow], total: 1, limit: 50, offset: 0
        }) });
      }
      // GET /spend
      if (method === 'GET' && pathPart.startsWith('/spend')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ days: [] }) });
      }
      // GET /memory
      if (method === 'GET' && pathPart.startsWith('/memory')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], total: 0 }) });
      }
      // GET /briefing
      if (method === 'GET' && pathPart.startsWith('/briefing')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ briefing: null }) });
      }
      // POST /actions/:id/apply  ← the path we're verifying
      const applyMatch = pathPart.match(/^\/actions\/(\d+)\/apply$/);
      if (method === 'POST' && applyMatch) {
        ctx.applyCalls.push({ id: Number.parseInt(applyMatch[1], 10), body: req.postData() });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          ok: true,
          care_plan_id: carePlanId,
          accepted_bid_id: winnerBidId,
          rejected_count: 1
        }) });
      }

      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    // Auto-confirm the "Are you sure?" prompt the page shows before applying.
    page.on('dialog', d => d.accept());

    await page.goto(`${BASE_URL}/admin/agent-fleet-detail.html?slug=matchmaker`);
    await page.waitForLoadState('domcontentloaded');

    // Login gate.
    await expect(page.locator('#loginShell')).toBeVisible();
    await page.locator('#pwInput').fill(ADMIN_PASSWORD);
    await page.locator('#pwSubmit').click();

    // App shell visible after login.
    await expect(page.locator('#appShell')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#agentTitle')).toHaveText(/Matchmaker/i, { timeout: 10000 });

    // Review queue card is shown (matchmaker is one of the gated slugs).
    const reviewCard = page.locator('#reviewQueueCard');
    await expect(reviewCard).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#reviewQueueHelp'))
      .toContainText('Closed auctions Matchmaker has scored');

    // The synthetic action renders an "Accept winning bid" button.
    const acceptBtn = page.locator(`#reviewQueueBody [data-q-apply="${actionId}"][data-q-kind="matchmaker"]`);
    await expect(acceptBtn).toBeVisible({ timeout: 10000 });
    await expect(acceptBtn).toContainText('Accept winning bid');

    // Click the button → apply route is hit with the right id.
    await acceptBtn.click();

    // Wait for the toast to confirm the click round-tripped.
    await expect(page.locator('#toast')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#toast')).toContainText(/Bid accepted/i);

    expect(ctx.applyCalls.length, 'apply route must be called exactly once').toBe(1);
    expect(ctx.applyCalls[0].id).toBe(actionId);
  });

  test('Login is gated by admin password — wrong password keeps loginShell visible', async ({ page }) => {
    await page.route('**/api/admin/agent-fleet/**', async (route) => {
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Unauthorized' }) });
    });

    await page.goto(`${BASE_URL}/admin/agent-fleet-detail.html?slug=matchmaker`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('#loginShell')).toBeVisible();
    await page.locator('#pwInput').fill('wrong-password');
    await page.locator('#pwSubmit').click();

    // 401 → page calls showLogin() and stays on the gate.
    await expect(page.locator('#loginShell')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#appShell')).toBeHidden();
  });
});
