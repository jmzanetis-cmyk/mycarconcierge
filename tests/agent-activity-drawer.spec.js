'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Task #277 — Lock in the contract for the agent activity drawer (Task #144).
//
// The "Show details" drawer in www/admin-agent-activity.js is the only
// operator-facing surface for an agent action's full reasoning, full
// decision JSON, and the originating event payload it ingested. There was
// no automated coverage for this helper, so a refactor could silently
// regress any of the three sections.
//
// This spec mounts the helper into a tiny in-page fixture (no admin sign-in
// dance) and intercepts every API the helper touches. It asserts:
//
//   1. Fleet card → drawer renders all three sections, reasoning text shows,
//      decision JSON is pretty-printed and matches the row.
//   2. Source section is lazy: NO request to /actions/:id until the
//      <details> is expanded. After expand, the request fires exactly once
//      and the event payload renders as pretty-printed JSON.
//   3. Re-toggling never re-fires the source request (data-loaded cache).
//   4. Legacy (ai-ops) card → drawer hits /api/admin/ai-ops/actions/:id on
//      expand instead of the fleet endpoint.
//   5. A row with no reasoning shows the "No reasoning recorded." fallback.
// ─────────────────────────────────────────────────────────────────────────────

const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('./helpers');

// Mounts the helper script into a blank page on the same origin so relative
// fetch URLs match the page.route patterns. Returns nothing — the caller
// must register routes BEFORE calling this so first paint sees the mocks.
async function mountFixture(page, { containerId = 'aap-test-container' } = {}) {
  // Any served page works — we just need an http://localhost:5000 origin so
  // the helper's relative fetches go through page.route. Use a tiny static
  // file (the homepage) and replace its body with our fixture.
  await page.goto(`${BASE_URL}/`);
  await page.evaluate((id) => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    // Fake admin creds so authHeaders() stamps the requests; the mocks
    // don't validate them, but we want to mirror what the real page does.
    localStorage.setItem('mcc_admin_pass', 'test-password');
  }, containerId);
  await page.addScriptTag({ url: '/admin-agent-activity.js' });
  await page.waitForFunction(() => typeof window.renderAgentActivityPanel === 'function');
}

test.describe('Agent Activity drawer — reasoning / decision / source (T#277)', () => {
  test('fleet card: all three sections render; source lazy-loads on first expand only', async ({ page }) => {
    const fleetRow = {
      id: 9001,
      agent_slug: 'matchmaker',
      action_type: 'rank',
      status: 'executed',
      needs_review: false,
      reviewed_at: '2026-05-01T12:00:00Z',
      review_status: 'approved',
      reasoning: 'Bid #42 has the highest provider rating and lowest price within budget.',
      decision: { recommendation: 'accept', recommended_winner_bid_id: 42, score: 0.91 },
      confidence: 0.91,
      autonomy_used: 'propose',
      cost_usd: 0.0123,
      duration_ms: 842,
      event_id: 555,
      created_at: '2026-05-01T11:59:00Z'
    };
    const eventPayload = { auction_id: 'auc-77', bid_count: 5, member_id: 'mem-1' };

    let bytargetCalls = 0;
    let detailCalls = 0;
    let legacyListCalls = 0;
    let dlqCalls = 0;

    await page.route('**/api/admin/agent-fleet/actions/by-target**', async (route) => {
      bytargetCalls += 1;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ actions: [fleetRow] }) });
    });

    await page.route('**/api/admin/agent-fleet/actions/9001', async (route) => {
      detailCalls += 1;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({
          action: fleetRow,
          event: { id: 555, event_type: 'auction.closed', source: 'matchmaker.tick',
                   created_at: '2026-05-01T11:58:00Z', payload: eventPayload }
        }) });
    });

    await page.route('**/api/admin/agent-fleet/dead-letter**', async (route) => {
      dlqCalls += 1;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ entries: [] }) });
    });

    await page.route('**/api/admin/ai-ops/actions?**', async (route) => {
      legacyListCalls += 1;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ actions: [] }) });
    });

    await mountFixture(page);

    await page.evaluate(() => {
      window.renderAgentActivityPanel('aap-test-container', {
        targetId: 'prov-abc', targetKind: 'provider', limit: 10, showEmpty: true
      });
    });

    // Wait for the card to render.
    const card = page.locator('.agent-activity-card').first();
    await expect(card).toBeVisible({ timeout: 10000 });

    // Card rendered → by-target was called exactly once.
    expect(bytargetCalls, 'fleet by-target endpoint should be called once').toBe(1);

    const drawer = card.locator('details.agent-activity-details');
    await expect(drawer).toHaveAttribute('data-src', 'fleet');
    await expect(drawer).toHaveAttribute('data-id', '9001');

    // Section 1 — Full reasoning.
    const reasoningSection = drawer.locator('.aap-drawer-section', { hasText: 'Full reasoning' });
    await expect(reasoningSection.locator('.aap-drawer-text'))
      .toHaveText(fleetRow.reasoning);

    // Section 2 — Decision (JSON), pretty-printed.
    const decisionSection = drawer.locator('.aap-drawer-section', { hasText: 'Decision (JSON)' });
    const decisionPre = decisionSection.locator('pre.aap-drawer-pre');
    const decisionText = (await decisionPre.textContent()) || '';
    expect(decisionText).toContain(JSON.stringify(fleetRow.decision, null, 2));
    // Sanity: it really is multiline (pretty-printed, not collapsed).
    expect(decisionText.split('\n').length).toBeGreaterThan(2);

    // Section 3 — Source / prompt placeholder until expand.
    const sourceSection = drawer.locator('[data-source-slot="1"]');
    await expect(sourceSection.locator('.aap-drawer-source'))
      .toContainText('Click "Show details" to load');

    // Critical: lazy. No detail request before expand.
    expect(detailCalls, 'detail endpoint must NOT fire until drawer is opened').toBe(0);

    // Expand the drawer → fires the detail request once.
    await drawer.locator('summary.aap-drawer-summary').click();
    await expect(drawer).toHaveAttribute('open', '');

    await expect.poll(() => detailCalls, { timeout: 5000 })
      .toBe(1);

    // Source section now shows the event header line + payload pre.
    await expect(sourceSection).toContainText('event #555');
    await expect(sourceSection).toContainText('auction.closed');
    const sourcePre = sourceSection.locator('pre.aap-drawer-pre');
    const sourceText = (await sourcePre.textContent()) || '';
    expect(sourceText).toContain(JSON.stringify(eventPayload, null, 2));

    // Toggle closed then open again — must NOT re-fire (data-loaded cache).
    await drawer.locator('summary.aap-drawer-summary').click(); // close
    await drawer.locator('summary.aap-drawer-summary').click(); // re-open
    await page.waitForTimeout(300);
    expect(detailCalls, 'detail endpoint must be cached after first expand').toBe(1);

    // Sibling endpoints were also exercised exactly once each.
    expect(dlqCalls, 'dead-letter endpoint should be called once for the event_id').toBe(1);
    expect(legacyListCalls, 'legacy list endpoint must be skipped when no includeAiOpsModule is set')
      .toBe(0); // fetchLegacy returns [] early without ever firing the request
  });

  test('legacy ai-ops card: drawer hits /api/admin/ai-ops/actions/:id on expand', async ({ page }) => {
    // ai_action_log.id is a UUID in Supabase (see supabase migrations) —
    // mirror that here so the mocked detail route matches the real shape
    // (`netlify/functions/ai-ops-admin.js` matches `[0-9a-f-]{8,}`).
    const legacyId = 'a1b2c3d4-5e6f-7777-8888-99aabbccddee';
    const legacyRow = {
      id: legacyId,
      module: 'payment_tracker',
      action_type: 'reconcile',
      outcome: 'completed',
      auto_executed: true,
      escalated: false,
      target_id: 'pay-12345',
      execution_time_ms: 412,
      decision: { reasoning: 'Refund $25 — duplicate charge detected.', refund_amount_cents: 2500 },
      confidence: 0.88,
      created_at: '2026-05-01T11:00:00Z'
    };

    let aiopsDetailCalls = 0;

    await page.route('**/api/admin/agent-fleet/actions/by-target**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ actions: [] }) });
    });
    await page.route('**/api/admin/agent-fleet/actions?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ actions: [] }) });
    });
    await page.route('**/api/admin/agent-fleet/dead-letter**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ entries: [] }) });
    });
    await page.route('**/api/admin/ai-ops/actions?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ actions: [legacyRow] }) });
    });
    await page.route(`**/api/admin/ai-ops/actions/${legacyId}`, async (route) => {
      aiopsDetailCalls += 1;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ action: legacyRow }) });
    });

    await mountFixture(page);

    // Use agentSlug + includeAiOpsModule so fetchLegacy actually runs.
    await page.evaluate(() => {
      window.renderAgentActivityPanel('aap-test-container', {
        agentSlug: 'treasurer',
        includeAiOpsModule: 'payment_tracker',
        limit: 10, showEmpty: true
      });
    });

    const card = page.locator('.agent-activity-card').first();
    await expect(card).toBeVisible({ timeout: 10000 });

    const drawer = card.locator('details.agent-activity-details');
    await expect(drawer).toHaveAttribute('data-src', 'legacy');
    await expect(drawer).toHaveAttribute('data-id', legacyId);

    // Reasoning is pulled from decision.reasoning for legacy rows.
    await expect(drawer.locator('.aap-drawer-section', { hasText: 'Full reasoning' })
      .locator('.aap-drawer-text'))
      .toHaveText(legacyRow.decision.reasoning);

    // No detail request before expand.
    expect(aiopsDetailCalls).toBe(0);

    await drawer.locator('summary.aap-drawer-summary').click();
    await expect.poll(() => aiopsDetailCalls, { timeout: 5000 }).toBe(1);

    // Source slot must render the legacy-specific note + target_id row so
    // operators don't think the missing prompt is a bug. Mirrors the
    // `else` branch of loadSourceForCard in www/admin-agent-activity.js.
    const sourceSection = drawer.locator('[data-source-slot="1"]');
    await expect(sourceSection)
      .toContainText("Legacy AI Ops actions don't capture a separate prompt");
    await expect(sourceSection).toContainText('target_id:');
    await expect(sourceSection).toContainText(legacyRow.target_id);
    await expect(sourceSection).toContainText(`${legacyRow.execution_time_ms}ms`);
  });

  test('row with no reasoning shows the "No reasoning recorded." fallback', async ({ page }) => {
    const fleetRow = {
      id: 4242,
      agent_slug: 'gatekeeper',
      action_type: 'review',
      status: 'proposed',
      needs_review: true,
      reasoning: null, // ← the case under test
      decision: { recommendation: 'manual_review' },
      confidence: 0.4,
      autonomy_used: 'propose',
      cost_usd: 0.0001,
      duration_ms: 200,
      event_id: 99,
      created_at: '2026-05-01T10:00:00Z'
    };

    await page.route('**/api/admin/agent-fleet/actions/by-target**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ actions: [fleetRow] }) });
    });
    await page.route('**/api/admin/agent-fleet/dead-letter**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ entries: [] }) });
    });
    await page.route('**/api/admin/ai-ops/actions?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ actions: [] }) });
    });

    await mountFixture(page);

    await page.evaluate(() => {
      window.renderAgentActivityPanel('aap-test-container', {
        targetId: 'app-1', targetKind: 'application', limit: 10, showEmpty: true
      });
    });

    const drawer = page.locator('details.agent-activity-details').first();
    await expect(drawer).toBeVisible({ timeout: 10000 });

    const reasoningSection = drawer.locator('.aap-drawer-section', { hasText: 'Full reasoning' });
    await expect(reasoningSection.locator('.aap-drawer-empty'))
      .toHaveText('No reasoning recorded.');

    // Decision section still renders (pretty-printed JSON for the recommendation).
    const decisionPre = drawer.locator('.aap-drawer-section', { hasText: 'Decision (JSON)' })
      .locator('pre.aap-drawer-pre');
    expect(await decisionPre.textContent()).toContain('"manual_review"');
  });
});
