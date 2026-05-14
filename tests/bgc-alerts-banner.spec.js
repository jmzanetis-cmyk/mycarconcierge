'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Task #160 — UI coverage for the BGC dashboard alert banner.
//
// scripts/bgc-reminders-smoke.js already covers the back-end half of the
// expiring-check pipeline (notifications + provider_alerts rows). This
// spec covers the front end:
//
//   • The banner slot at the top of #overview (#bgc-alerts-panel-overview)
//     is populated from provider_alerts on every dashboard load (see
//     www/bgc-compliance.js → refreshAlertsOnly()).
//   • The Compliance section's per-employee table renders an "in Nd" pill
//     next to any current clear check expiring in <=30 days (see
//     www/bgc-compliance.js → loadEmployees()).
//
// We sign in as the seeded test provider, attach one fresh employee + one
// clear background check expiring in ~20 days + one matching provider_alerts
// row, then assert both UI surfaces render. Everything seeded is cleaned up
// in afterAll regardless of test outcome.
// ─────────────────────────────────────────────────────────────────────────────

const { test, expect } = require('@playwright/test');
const {
  BASE_URL, SUPABASE_SERVICE_KEY,
  TEST_PROVIDER_EMAIL, TEST_PROVIDER_PASS,
  getSupabaseAdmin, loginViaUI, navigateToSection, dismissOverlays
} = require('./helpers');

// Days until expiry — keep this between 8 and 30 so the renderer chooses
// the warning palette (>=8 days) and the alerts panel surfaces a 'reminder'
// row, not the critical/expired one.
const DAYS_UNTIL_EXPIRY = 20;

// Use a unique surname so the seeded row is unambiguous when other tests
// (or prior interrupted runs) leave employee rows behind.
const STAMP = Date.now();
const EMP_FIRST = 'BgcBanner';
const EMP_LAST  = `Test${STAMP}`;
const EMP_FULL  = `${EMP_FIRST} ${EMP_LAST}`;

// Title rendered by netlify/functions/bgc-send-reminders.js for a 20-day
// reminder. We hand-craft the row so the spec doesn't depend on running
// the cron handler in-process.
const ALERT_TITLE = `${EMP_FULL}'s background check expires in ${DAYS_UNTIL_EXPIRY} days`;

test.describe('Task #160 — Expiring BGC banner + per-employee pill', () => {
  test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY for seeding');

  let providerId      = null;
  let employeeId      = null;
  let bgcCheckId      = null;
  let alertId         = null;
  let bgcTablesReady  = false;

  test.beforeAll(async () => {
    const sb = getSupabaseAdmin();

    // 1. Confirm the seeded test provider profile exists (the same one used
    //    by member-bid-payment.spec.js and admin-portal.spec.js).
    const { data: prof } = await sb.from('profiles')
      .select('id, role').eq('email', TEST_PROVIDER_EMAIL).maybeSingle();
    if (!prof?.id || prof.role !== 'provider') {
      // Leaving providerId null so the per-test skip below kicks in.
      return;
    }
    providerId = prof.id;

    // 2. Probe the BGC tables. If the migration that introduced them
    //    (supabase/migrations/20260422_bgc_*.sql) hasn't been applied to
    //    this environment, skip the suite gracefully instead of failing —
    //    the spec is still valid on environments where it has shipped.
    const probe = await sb.from('provider_employees').select('id').limit(1);
    if (probe.error && /schema cache|does not exist/i.test(probe.error.message || '')) {
      return;
    }
    bgcTablesReady = true;

    // 3. Seed the employee.
    const { data: emp, error: eErr } = await sb.from('provider_employees').insert({
      provider_id: providerId,
      first_name: EMP_FIRST,
      last_name: EMP_LAST,
      role: 'Mobile Mechanic',
      is_customer_facing: true,
      is_active: true
    }).select('id').single();
    if (eErr) throw new Error('seed employee failed: ' + eErr.message);
    employeeId = emp.id;

    // 4. Seed a clear background check expiring in ~20 days. We bias the
    //    timestamp by +12h so daysUntil() (Math.round) lands on 20, not 19,
    //    on the per-employee pill assertion.
    const expiresAt = new Date();
    expiresAt.setUTCHours(expiresAt.getUTCHours() + (DAYS_UNTIL_EXPIRY * 24) + 12);

    const { data: chk, error: cErr } = await sb.from('employee_background_checks').insert({
      employee_id: employeeId,
      provider_id: providerId,
      status: 'clear',
      is_current: true,
      completed_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString()
    }).select('id').single();
    if (cErr) throw new Error('seed bgc check failed: ' + cErr.message);
    bgcCheckId = chk.id;

    // 5. Seed the provider_alerts row that the dashboard banner reads. We
    //    write it directly rather than running the cron handler so the spec
    //    stays focused on UI rendering. action_url is what triggers the
    //    "Renew now →" CTA in www/bgc-compliance.js → _renderAlertsHtml().
    const { data: alert, error: aErr } = await sb.from('provider_alerts').insert({
      provider_id:  providerId,
      employee_id:  employeeId,
      bgc_check_id: bgcCheckId,
      alert_type:   'bgc_expiring',
      severity:     'warning',
      title:        ALERT_TITLE,
      body:         `Renew before ${expiresAt.toISOString().slice(0,10)} to keep your MCC Verified badge.`,
      action_url:   `${BASE_URL}/providers.html#compliance`,
      is_dismissed: false
    }).select('id').single();
    if (aErr) throw new Error('seed alert failed: ' + aErr.message);
    alertId = alert.id;
  });

  test.afterAll(async () => {
    if (!SUPABASE_SERVICE_KEY) return;
    const sb = getSupabaseAdmin();
    if (alertId)    await sb.from('provider_alerts').delete().eq('id', alertId);
    if (bgcCheckId) await sb.from('employee_background_checks').delete().eq('id', bgcCheckId);
    if (employeeId) await sb.from('provider_employees').delete().eq('id', employeeId);
  });

  test('Dashboard alert banner renders the expiring-check title + Renew now CTA on /providers.html', async ({ page }) => {
    test.skip(!bgcTablesReady, 'BGC tables not present in this environment');
    test.setTimeout(60000);

    await loginViaUI(page, TEST_PROVIDER_EMAIL, TEST_PROVIDER_PASS, 'provider');
    if (!page.url().includes('providers.html')) {
      await page.goto(`${BASE_URL}/providers.html`);
    }
    await page.waitForLoadState('domcontentloaded');
    await dismissOverlays(page);

    // refreshAlertsOnly() polls every 200ms for up to ~6s waiting for the
    // Supabase client to be ready, then issues the query. Wait for the
    // panel slot to be revealed (display flips from 'none' to '').
    const banner = page.locator('#bgc-alerts-panel-overview');
    await expect(banner).toBeAttached({ timeout: 15000 });
    await expect(banner).toBeVisible({ timeout: 15000 });

    // Title comes from the seeded alert row; the panel renders one
    // alert-card per open row, so we scope assertions to the card that
    // matches our seeded title to avoid coupling to other open alerts.
    await expect(banner).toContainText(ALERT_TITLE, { timeout: 5000 });

    const cta = banner.locator('a', { hasText: /Renew now/ }).first();
    await expect(cta).toHaveText(/Renew now/, { timeout: 5000 });
    const href = await cta.getAttribute('href');
    expect(href).toMatch(/#compliance/);
  });

  // ── Task #204 ──────────────────────────────────────────────────────────
  // Click the × dismiss button on the rendered banner and assert:
  //   1. provider_alerts.is_dismissed flips to true for the seeded row.
  //   2. On a fresh dashboard load, #bgc-alerts-panel-overview is hidden
  //      (loadAlerts() returns 0 rows → panel.style.display = 'none').
  //
  // This guards against an RLS regression that would let dismissed alerts
  // re-surface, or a column rename on provider_alerts that would silently
  // no-op the dismiss write.
  test('Dismiss × hides the alert and persists is_dismissed=true', async ({ page }) => {
    test.skip(!bgcTablesReady, 'BGC tables not present in this environment');
    test.skip(!alertId, 'Seeded alert row missing — earlier test consumed it?');
    test.setTimeout(60000);

    const sb = getSupabaseAdmin();

    // Make sure the seeded row is in the un-dismissed state in case a
    // previous run of this test (re-using the same providerId between
    // workers) flipped it. We only touch our own seeded alertId.
    await sb.from('provider_alerts').update({ is_dismissed: false }).eq('id', alertId);

    await loginViaUI(page, TEST_PROVIDER_EMAIL, TEST_PROVIDER_PASS, 'provider');
    if (!page.url().includes('providers.html')) {
      await page.goto(`${BASE_URL}/providers.html`);
    }
    await page.waitForLoadState('domcontentloaded');
    await dismissOverlays(page);

    const banner = page.locator('#bgc-alerts-panel-overview');
    await expect(banner).toBeVisible({ timeout: 15000 });
    await expect(banner).toContainText(ALERT_TITLE, { timeout: 5000 });

    // Scope to the alert-card that matches our seeded title so we don't
    // accidentally dismiss someone else's open alert.
    const ourCard = banner.locator('div', { hasText: ALERT_TITLE })
      .filter({ has: page.locator('button[title="Dismiss"]') })
      .first();
    await expect(ourCard).toBeVisible();
    await ourCard.locator('button[title="Dismiss"]').click();

    // dismissAlert() writes to Supabase then re-runs loadAlerts(); wait
    // until our card is gone from the panel. With only one seeded open
    // alert, this means the panel is empty / display flips back to 'none'.
    await expect(banner).not.toContainText(ALERT_TITLE, { timeout: 10000 });

    // Assert the DB row actually flipped — this is the contract the test
    // exists to protect.
    const { data: row, error: rowErr } = await sb
      .from('provider_alerts')
      .select('is_dismissed')
      .eq('id', alertId)
      .single();
    expect(rowErr).toBeFalsy();
    expect(row?.is_dismissed).toBe(true);

    // Reload and assert the banner stays hidden — i.e. dismissed alerts
    // are not re-surfaced by the next loadAlerts() pass.
    await page.goto(`${BASE_URL}/providers.html`);
    await page.waitForLoadState('domcontentloaded');
    await dismissOverlays(page);

    // refreshAlertsOnly() polls Supabase readiness for ~6s before issuing
    // its query. Use condition-based waits (not a fixed sleep) so the
    // assertion fires as soon as loadAlerts() sets display:none. We assert
    // both contracts: the seeded title is absent AND the panel slot
    // (hard-coded in providers.html, so always attached) is hidden.
    const reloadedBanner = page.locator('#bgc-alerts-panel-overview');
    await expect(reloadedBanner).toBeAttached();
    await expect(reloadedBanner).toBeHidden({ timeout: 20000 });
    await expect(reloadedBanner).not.toContainText(ALERT_TITLE);
  });

  test('Compliance section shows the "in Nd" pill on the seeded employee row', async ({ page }) => {
    test.skip(!bgcTablesReady, 'BGC tables not present in this environment');
    test.setTimeout(60000);

    await loginViaUI(page, TEST_PROVIDER_EMAIL, TEST_PROVIDER_PASS, 'provider');
    if (!page.url().includes('providers.html')) {
      await page.goto(`${BASE_URL}/providers.html`);
    }
    await page.waitForLoadState('domcontentloaded');
    await dismissOverlays(page);

    // Open the Compliance section. navigateToSection clicks the nav item;
    // bgc-compliance.js listens for that click and runs refresh() (which
    // populates the employee table). Give it a beat to fetch + render.
    await navigateToSection(page, 'compliance');
    await page.waitForFunction(
      () => {
        const tbody = document.getElementById('bgc-employees-tbody');
        return tbody && tbody.children.length > 0 && !/No employees yet/.test(tbody.textContent);
      },
      { timeout: 15000 }
    );

    const row = page.locator('#bgc-employees-tbody tr', { hasText: EMP_FULL }).first();
    await expect(row).toBeAttached({ timeout: 10000 });

    // The pill text format is `in Nd` (rendered by loadEmployees() when
    // daysUntil(expires_at) is between 0 and 30). Accept any single/double
    // digit so a slight rounding skew (19d vs 20d at midnight UTC) doesn't
    // cause a flake.
    const pillText = await row.innerText();
    expect(pillText).toMatch(/in \d{1,2}d/);
  });
});
