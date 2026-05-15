'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Task #203 — UI coverage for the 4-state Compliance Card (#bgc-state-card).
//
// Task #160 covered the alert banner + per-employee expiring pill, but the
// state card itself (rendered by www/bgc-compliance.js → _renderStateCard via
// _stateCopy) had no test coverage. The state copy is verbatim from a PDF
// spec and silent regressions (e.g. losing the "Renew now" CTA, or showing
// the wrong pill) would degrade the verification flow without tripping any
// existing checks.
//
// _stateCopy reads ONLY from the cached profile columns
// (bgc_total_employees, bgc_compliance_pct, bgc_badge_verified). So instead
// of seeding employees + background-check rows for every state, we drive
// each state by writing those cached columns directly with the service role
// and reloading the page. We snapshot + restore the original values in
// before/afterAll so the test provider's profile is left untouched.
//
// Three states are covered (the fourth, "Active", is exercised implicitly
// by the existing badge tests in background-check-badge.spec.js):
//   • 0 employees           → "Get MCC Verified" / "Not enrolled" pill
//   • compliance_pct < 80   → "MCC Verified — Inactive ✗" / "Renew now" CTA
//   • compliance_pct 80..89 → "MCC Verified — At Risk"   / "View details"
// ─────────────────────────────────────────────────────────────────────────────

const { test, expect } = require('@playwright/test');
const {
  BASE_URL, SUPABASE_SERVICE_KEY,
  TEST_PROVIDER_EMAIL, TEST_PROVIDER_PASS,
  getSupabaseAdmin, loginViaUI, navigateToSection, dismissOverlays
} = require('./helpers');

const BGC_FIELDS = 'bgc_total_employees,bgc_compliant_employees,bgc_compliance_pct,bgc_badge_verified';

// Drive the state card by writing the cached profile columns then refreshing
// in-page (we re-run window.bgcCompliance.refresh after the update so the
// card re-renders without a full reload).
async function setStateAndRefresh(page, sb, providerId, fields) {
  const { error } = await sb.from('profiles').update(fields).eq('id', providerId);
  if (error) throw new Error('failed to set bgc state: ' + error.message);
  // Trigger a re-render of the compliance section. The compliance section
  // must already be visible (its DOM nodes need to exist) for this to do
  // any work — callers navigate there first.
  await page.evaluate(() => globalThis.bgcCompliance && globalThis.bgcCompliance.refresh());
}

async function openComplianceSection(page) {
  await loginViaUI(page, TEST_PROVIDER_EMAIL, TEST_PROVIDER_PASS, 'provider');
  if (!page.url().includes('providers.html')) {
    await page.goto(`${BASE_URL}/providers.html`);
  }
  await page.waitForLoadState('domcontentloaded');
  await dismissOverlays(page);
  await navigateToSection(page, 'compliance');
  // Wait for the state card slot to be present + ready to be populated.
  await expect(page.locator('#bgc-state-card')).toBeAttached({ timeout: 15000 });
  // Wait for bgcCompliance to be wired up so setStateAndRefresh can call it.
  await page.waitForFunction(
    () => !!(globalThis.bgcCompliance && typeof globalThis.bgcCompliance.refresh === 'function'),
    { timeout: 15000 }
  );
}

test.describe('Task #203 — BGC Compliance Card states (Not enrolled / At Risk / Inactive)', () => {
  test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY for seeding');

  let providerId      = null;
  let originalFields  = null;
  let bgcTablesReady  = false;

  test.beforeAll(async () => {
    const sb = getSupabaseAdmin();

    const { data: prof } = await sb.from('profiles')
      .select('id, role, ' + BGC_FIELDS)
      .eq('email', TEST_PROVIDER_EMAIL)
      .maybeSingle();
    if (!prof?.id || prof.role !== 'provider') return;
    providerId = prof.id;

    // Probe the BGC tables / cached columns. If the compliance migration
    // hasn't been applied to this environment, skip the suite gracefully —
    // the spec is still valid where it has shipped.
    if (prof.bgc_total_employees === undefined) return;
    bgcTablesReady = true;

    originalFields = {
      bgc_total_employees:     prof.bgc_total_employees     ?? 0,
      bgc_compliant_employees: prof.bgc_compliant_employees ?? 0,
      bgc_compliance_pct:      prof.bgc_compliance_pct      ?? 0,
      bgc_badge_verified:      prof.bgc_badge_verified      ?? false
    };
  });

  // Restore on every test exit so a mid-suite abort can't leave the
  // provider's cached compliance columns stuck in an inactive/at-risk
  // state for other suites. afterAll keeps a final safety-net restore.
  test.afterEach(async () => {
    if (!SUPABASE_SERVICE_KEY || !providerId || !originalFields) return;
    const sb = getSupabaseAdmin();
    await sb.from('profiles').update(originalFields).eq('id', providerId);
  });

  test.afterAll(async () => {
    if (!SUPABASE_SERVICE_KEY || !providerId || !originalFields) return;
    const sb = getSupabaseAdmin();
    await sb.from('profiles').update(originalFields).eq('id', providerId);
  });

  test('Not enrolled: 0 employees shows "Get MCC Verified" + "Not enrolled" pill', async ({ page }) => {
    test.skip(!bgcTablesReady, 'BGC compliance columns not present in this environment');
    test.setTimeout(60000);

    await openComplianceSection(page);
    const sb = getSupabaseAdmin();
    await setStateAndRefresh(page, sb, providerId, {
      bgc_total_employees:     0,
      bgc_compliant_employees: 0,
      bgc_compliance_pct:      0,
      bgc_badge_verified:      false
    });

    const card = page.locator('#bgc-state-card');
    await expect(card).toContainText('Get MCC Verified', { timeout: 10000 });
    await expect(card).toContainText('Not enrolled');
    // The Not-enrolled CTA is a button (kicks off enrollment), not a link.
    const cta = card.locator('button', { hasText: /Start the verification process/ }).first();
    await expect(cta).toBeVisible();
  });

  test('Inactive: < 80% compliance shows "Inactive ✗" + "Renew now" CTA', async ({ page }) => {
    test.skip(!bgcTablesReady, 'BGC compliance columns not present in this environment');
    test.setTimeout(60000);

    await openComplianceSection(page);
    const sb = getSupabaseAdmin();
    await setStateAndRefresh(page, sb, providerId, {
      bgc_total_employees:     5,
      bgc_compliant_employees: 3, // 60%
      bgc_compliance_pct:      60,
      bgc_badge_verified:      false
    });

    const card = page.locator('#bgc-state-card');
    await expect(card).toContainText('MCC Verified — Inactive', { timeout: 10000 });
    await expect(card).toContainText('✗ Inactive');
    const cta = card.locator('a', { hasText: /Renew now/ }).first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', /#compliance/);
  });

  test('At Risk: 80–89% compliance shows "At Risk" + "View details" CTA', async ({ page }) => {
    test.skip(!bgcTablesReady, 'BGC compliance columns not present in this environment');
    test.setTimeout(60000);

    await openComplianceSection(page);
    const sb = getSupabaseAdmin();
    await setStateAndRefresh(page, sb, providerId, {
      bgc_total_employees:     10,
      bgc_compliant_employees: 8, // 80%
      bgc_compliance_pct:      80,
      bgc_badge_verified:      false
    });

    const card = page.locator('#bgc-state-card');
    await expect(card).toContainText('MCC Verified — At Risk', { timeout: 10000 });
    await expect(card).toContainText('At Risk');
    const cta = card.locator('a', { hasText: /View details/ }).first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', /#compliance/);
  });
});
