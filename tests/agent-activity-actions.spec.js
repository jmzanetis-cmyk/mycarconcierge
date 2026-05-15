'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Task #288 — Lock in the contract for the inline Approve / Reject / Replay
// buttons rendered by www/admin-agent-activity.js (fleetActionButtons +
// bindActionButtons + postAction + fleetApplyability + the Task #278
// one-click "Approve & Apply" chained flow).
//
// The Task #277 spec covered the read-only drawer sections. None of the
// click handlers were exercised, so a regression in postAction(), the
// chained /apply call, the dead-letter Replay path, or the partial-
// failure re-render would have shipped silently.
//
// This spec mounts the helper into a tiny in-page fixture (same pattern
// as agent-activity-drawer.spec.js) and intercepts every endpoint the
// helper touches. It covers:
//
//   1. Approve on a Matchmaker rank with a non-null recommended_winner_bid_id
//      → POST /review { decision: 'approved' } then chained POST /apply.
//      Status span shows the bid-acceptance summary; panel re-renders.
//   2. Reject → window.confirm() prompt, then POST /review { decision:
//      'rejected' }. Confirm-cancel suppresses the request entirely.
//   3. Replay → button only appears when the card's event_id is in the
//      open dead-letter mock; click POSTs /dead-letter/:dlqId/replay.
//   4. Partial failure — /review 200, /apply 500 → status span shows
//      "Failed: Approved, but apply failed: …" and the panel re-renders
//      after the 4s grace period so the now-stale Approve button hides.
// ─────────────────────────────────────────────────────────────────────────────

const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('./helpers');

async function mountFixture(page, { containerId = 'aap-test-container' } = {}) {
  await page.goto(`${BASE_URL}/`);
  await page.evaluate((id) => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    localStorage.setItem('mcc_admin_pass', 'test-password');
  }, containerId);
  await page.addScriptTag({ url: '/admin-agent-activity.js' });
  await page.waitForFunction(() => typeof globalThis.renderAgentActivityPanel === 'function');
}

// Build a Matchmaker rank row that fleetApplyability() flags applyable=true
// (recommended_winner_bid_id non-null). status='proposed' + needs_review=true
// so the canReview gate in fleetActionButtons opens.
function applyableMatchmakerRow(overrides = {}) {
  return Object.assign({
    id: 7001,
    agent_slug: 'matchmaker',
    action_type: 'rank',
    status: 'proposed',
    needs_review: true,
    reviewed_at: null,
    review_status: null,
    reasoning: 'Bid #42 is the highest-rated, lowest-price option in budget.',
    decision: { recommendation: 'accept', recommended_winner_bid_id: 42 },
    confidence: 0.9,
    autonomy_used: 'propose',
    cost_usd: 0.01,
    duration_ms: 700,
    event_id: 555,
    created_at: '2026-05-14T11:00:00Z'
  }, overrides);
}

test.describe('Agent Activity action buttons — Approve / Reject / Replay (T#288)', () => {
  test('Approve on applyable card chains /review → /apply and re-renders', async ({ page }) => {
    let bytargetCalls = 0;
    let reviewCalls = 0;
    let applyCalls = 0;
    let lastReviewBody = null;
    let lastApplyHadEmptyBody = null;
    // Capture call order so a regression that fires /apply BEFORE /review
    // (or omits /review entirely) can't sneak through with both counters
    // eventually reaching 1.
    const callOrder = [];
    const proposed = applyableMatchmakerRow();
    // Second by-target call (the post-success re-render) returns the row in
    // its executed/reviewed state so canReview flips false and the
    // Approve/Reject buttons disappear, mirroring real server behaviour.
    const executed = applyableMatchmakerRow({
      status: 'executed',
      needs_review: false,
      reviewed_at: '2026-05-14T11:01:00Z',
      review_status: 'approved'
    });

    await page.route('**/api/admin/agent-fleet/actions/by-target**', async (route) => {
      bytargetCalls += 1;
      const row = bytargetCalls === 1 ? proposed : executed;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ actions: [row] }) });
    });
    await page.route('**/api/admin/agent-fleet/actions/7001/review', async (route) => {
      reviewCalls += 1;
      callOrder.push('review');
      lastReviewBody = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, action: { id: 7001, review_status: 'approved' } }) });
    });
    await page.route('**/api/admin/agent-fleet/actions/7001/apply', async (route) => {
      applyCalls += 1;
      callOrder.push('apply');
      // postAction sends '{}' rather than no body so the server can
      // Content-Type-sniff. Verify that contract.
      lastApplyHadEmptyBody = (route.request().postData() === '{}');
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, accepted_bid_id: 42, amount: 125.50, rejected_count: 3 }) });
    });
    await page.route('**/api/admin/agent-fleet/dead-letter**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ entries: [] }) });
    });

    await mountFixture(page);
    await page.evaluate(() => {
      globalThis.renderAgentActivityPanel('aap-test-container', {
        targetId: 'plan-1', targetKind: 'care_plan', limit: 10, showEmpty: true
      });
    });

    const approveBtn = page.locator('button.aap-action-approve');
    await expect(approveBtn).toBeVisible({ timeout: 10000 });
    // Applyable cards render the "Approve & Apply" label.
    await expect(approveBtn).toHaveText(/Approve\s*&\s*Apply/);
    await expect(approveBtn).toHaveAttribute('data-aap-applyable', '1');

    // Sanity: nothing fired before the click.
    expect(reviewCalls).toBe(0);
    expect(applyCalls).toBe(0);

    await approveBtn.click();

    // Both endpoints fire, in order.
    await expect.poll(() => reviewCalls, { timeout: 5000 }).toBe(1);
    await expect.poll(() => applyCalls, { timeout: 5000 }).toBe(1);
    expect(lastReviewBody).toEqual({ decision: 'approved' });
    expect(lastApplyHadEmptyBody).toBe(true);
    // Strict order: /review must land before /apply, never the other way.
    expect(callOrder).toEqual(['review', 'apply']);

    const statusSpan = page.locator('[data-aap-status]').first();
    // Bid-accept summary from the helper's appliedSummary branch.
    await expect(statusSpan).toContainText('Approved & Applied');
    // Task #303 — accepted bid id must be surfaced inline so admins
    // don't have to open the drawer to cross-reference it.
    await expect(statusSpan).toContainText('Bid #42 accepted');
    await expect(statusSpan).toContainText('$125.50');
    await expect(statusSpan).toContainText('3 other bid(s) rejected');
    await expect(statusSpan).toHaveAttribute('data-aap-state', 'success');

    // The 250ms post-success re-render fires by-target a second time.
    await expect.poll(() => bytargetCalls, { timeout: 5000 }).toBe(2);
    // Buttons are gone because the re-rendered row is no longer needs_review.
    await expect(page.locator('button.aap-action-approve')).toHaveCount(0);
    await expect(page.locator('button.aap-action-reject')).toHaveCount(0);
  });

  test('Reject prompts confirm; cancel suppresses the request, accept POSTs /review', async ({ page }) => {
    let reviewCalls = 0;
    let lastReviewBody = null;
    const row = applyableMatchmakerRow({ id: 7002 });

    await page.route('**/api/admin/agent-fleet/actions/by-target**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ actions: [row] }) });
    });
    await page.route('**/api/admin/agent-fleet/actions/7002/review', async (route) => {
      reviewCalls += 1;
      lastReviewBody = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true }) });
    });
    await page.route('**/api/admin/agent-fleet/actions/7002/apply', async (route) => {
      // Rejecting must NOT chain /apply — fail loudly if it does.
      await route.fulfill({ status: 500, contentType: 'application/json',
        body: JSON.stringify({ error: 'apply must not be called for reject' }) });
    });
    await page.route('**/api/admin/agent-fleet/dead-letter**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ entries: [] }) });
    });

    await mountFixture(page);
    await page.evaluate(() => {
      globalThis.renderAgentActivityPanel('aap-test-container', {
        targetId: 'plan-2', targetKind: 'care_plan', limit: 10, showEmpty: true
      });
    });

    const rejectBtn = page.locator('button.aap-action-reject');
    await expect(rejectBtn).toBeVisible({ timeout: 10000 });

    // First click — dismiss the confirm. No request must fire.
    let dismissedOnce = false;
    const dismissOnce = async (dialog) => {
      dismissedOnce = true;
      await dialog.dismiss();
      page.off('dialog', dismissOnce);
    };
    page.on('dialog', dismissOnce);
    await rejectBtn.click();
    await page.waitForTimeout(300);
    expect(dismissedOnce, 'confirm() should have been shown on Reject').toBe(true);
    expect(reviewCalls, 'cancelled confirm must not POST /review').toBe(0);

    // Second click — accept the confirm. /review fires with the reject body.
    page.once('dialog', (d) => d.accept());
    await rejectBtn.click();
    await expect.poll(() => reviewCalls, { timeout: 5000 }).toBe(1);
    expect(lastReviewBody).toEqual({ decision: 'rejected' });

    const statusSpan = page.locator('[data-aap-status]').first();
    await expect(statusSpan).toContainText('Rejected');
    await expect(statusSpan).toHaveAttribute('data-aap-state', 'success');
  });

  test('Replay button appears only for cards with an open dead-letter row and POSTs /dead-letter/:id/replay', async ({ page }) => {
    let replayCalls = 0;
    let replayedDlqId = null;
    // Two rows — only #7003 has a matching DLQ entry, so only it should
    // render a Replay button.
    const rowWithDlq = applyableMatchmakerRow({
      id: 7003, event_id: 901, status: 'failed', needs_review: false
    });
    const rowWithoutDlq = applyableMatchmakerRow({
      id: 7004, event_id: 902, status: 'failed', needs_review: false
    });

    await page.route('**/api/admin/agent-fleet/actions/by-target**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ actions: [rowWithDlq, rowWithoutDlq] }) });
    });
    // Replay POST is wired via a regex below. Use a regex here too so
    // the more-specific replay route can win the match (Playwright
    // evaluates routes in reverse-registration order; we register the
    // narrow one second).
    await page.route(/\/api\/admin\/agent-fleet\/dead-letter(\?|$)/, async (route) => {
      // Task #302 — after a successful replay the panel re-renders and
      // re-fetches dead-letter. The newly-replayed row should still be
      // returned (it sticks around in the table, just with replayed_at
      // populated) so the front end can show a "REPLAYED at <time>"
      // pill instead of the row vanishing without explanation.
      const replayedAt = replayCalls > 0 ? '2026-05-14T11:05:00Z' : null;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ entries: [
          // Matches event_id=901 → Replay button on row 7003 (when
          // replayed_at IS NULL); becomes the REPLAYED pill once it has
          // been replayed.
          { id: 'dlq-555', event_id: 901, replayed_at: replayedAt }
        ] }) });
    });
    await page.route('**/api/admin/agent-fleet/dead-letter/dlq-555/replay', async (route) => {
      replayCalls += 1;
      replayedDlqId = 'dlq-555';
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, replayed_at: '2026-05-14T11:05:00Z' }) });
    });

    await mountFixture(page);
    await page.evaluate(() => {
      globalThis.renderAgentActivityPanel('aap-test-container', {
        targetId: 'plan-3', targetKind: 'care_plan', limit: 10, showEmpty: true
      });
    });

    // Wait for the cards to render.
    await expect(page.locator('.agent-activity-card')).toHaveCount(2, { timeout: 10000 });
    // Only one Replay button — bound to the DLQ id from the mock.
    const replayBtns = page.locator('button.aap-action-replay');
    await expect(replayBtns).toHaveCount(1);
    await expect(replayBtns.first()).toHaveAttribute('data-aap-dlq-id', 'dlq-555');

    await replayBtns.first().click();
    await expect.poll(() => replayCalls, { timeout: 5000 }).toBe(1);
    expect(replayedDlqId).toBe('dlq-555');

    const statusSpan = page.locator('[data-aap-status]').first();
    await expect(statusSpan).toContainText('Replayed');
    await expect(statusSpan).toHaveAttribute('data-aap-state', 'success');

    // Task #302 — after the 250ms post-replay re-render, the success
    // state must survive the panel repaint. The Replay button on the
    // matching card disappears (the DLQ row's replayed_at is now set)
    // but a green "REPLAYED <time>" pill takes its place so admins on
    // slow connections don't think the click did nothing.
    const replayedPill = page.locator('[data-aap-replayed-pill="1"]');
    await expect(replayedPill).toHaveCount(1, { timeout: 5000 });
    await expect(replayedPill.first()).toContainText(/REPLAYED/);
    // Replay button is gone now that replayed_at is populated.
    await expect(page.locator('button.aap-action-replay')).toHaveCount(0);
  });

  test('Partial failure: /review 200 + /apply 500 surfaces the failure and re-renders to hide stale buttons', async ({ page }) => {
    let bytargetCalls = 0;
    let reviewCalls = 0;
    let applyCalls = 0;
    const proposed = applyableMatchmakerRow({ id: 7005 });
    // Server-side state after the partial failure: the /review write DID
    // land (review_status='approved', reviewed_at set) even though /apply
    // 500'd. The helper's 4s re-render should pick this up so the now-
    // stale Approve/Reject buttons disappear (canReview gate flips false
    // because reviewed_at is set).
    const reviewedNotApplied = applyableMatchmakerRow({
      id: 7005, status: 'proposed', needs_review: false,
      reviewed_at: '2026-05-14T11:02:00Z', review_status: 'approved'
    });

    await page.route('**/api/admin/agent-fleet/actions/by-target**', async (route) => {
      bytargetCalls += 1;
      const row = bytargetCalls === 1 ? proposed : reviewedNotApplied;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ actions: [row] }) });
    });
    await page.route('**/api/admin/agent-fleet/actions/7005/review', async (route) => {
      reviewCalls += 1;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true }) });
    });
    await page.route('**/api/admin/agent-fleet/actions/7005/apply', async (route) => {
      applyCalls += 1;
      await route.fulfill({ status: 500, contentType: 'application/json',
        body: JSON.stringify({ error: 'bid no longer available' }) });
    });
    await page.route('**/api/admin/agent-fleet/dead-letter**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ entries: [] }) });
    });

    await mountFixture(page);
    await page.evaluate(() => {
      globalThis.renderAgentActivityPanel('aap-test-container', {
        targetId: 'plan-4', targetKind: 'care_plan', limit: 10, showEmpty: true
      });
    });

    const approveBtn = page.locator('button.aap-action-approve');
    await expect(approveBtn).toBeVisible({ timeout: 10000 });
    await approveBtn.click();

    // Both endpoints fire — review succeeds, apply 500s.
    await expect.poll(() => reviewCalls, { timeout: 5000 }).toBe(1);
    await expect.poll(() => applyCalls, { timeout: 5000 }).toBe(1);

    const statusSpan = page.locator('[data-aap-status]').first();
    await expect(statusSpan).toHaveAttribute('data-aap-state', 'error');
    // The helper composes "Failed: Approved, but apply failed: <server msg>".
    await expect(statusSpan).toContainText('Approved, but apply failed');
    await expect(statusSpan).toContainText('bid no longer available');

    // 4-second re-render path. Generous timeout absorbs the 4s setTimeout
    // plus the by-target round-trip.
    await expect.poll(() => bytargetCalls, { timeout: 10000 }).toBe(2);
    // Buttons are gone because reviewed_at is set on the re-fetched row.
    await expect(page.locator('button.aap-action-approve')).toHaveCount(0);
    await expect(page.locator('button.aap-action-reject')).toHaveCount(0);
    // Apply must not be retried by the re-render.
    expect(applyCalls).toBe(1);
  });
});
