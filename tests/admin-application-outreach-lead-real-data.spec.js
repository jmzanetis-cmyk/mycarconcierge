'use strict';

// Task #250 — End-to-end test for the admin source badge with real data.
//
// The companion spec (admin-application-outreach-lead.spec.js) covers the
// renderer in isolation against synthetic inputs. This spec goes one step
// further: it seeds real rows in `outreach_leads` + `provider_applications`
// via the service-role Supabase client, then loads admin.html as a real
// admin and asserts the rendered badge text inside the actual table.
//
// Task #400 wired `/api/admin/provider-application/*` into the dev server
// (`www/server.js`) so it forwards to the netlify handler the same way
// `_redirects` does in production. The previous `page.route` bridge that
// invoked the handler in-process is no longer needed — the admin page's
// fetch flows through the dev server, which calls the real netlify handler,
// which talks to the real Supabase project and returns the rows we seeded.

const { test, expect } = require('@playwright/test');
const {
  BASE_URL,
  SUPABASE_SERVICE_KEY,
  ADMIN_PASSWORD,
  getSupabaseAdmin,
  injectAdminSession
} = require('./helpers');

// Stable identifiers so cleanup is deterministic even if the test crashes
// mid-run and we re-run later.
const RUN_TAG = `t250-${Date.now()}`;
const LINKED_BUSINESS = `MCC E2E Linked ${RUN_TAG}`;
const DIRECT_BUSINESS = `MCC E2E Direct ${RUN_TAG}`;

let leadRow = null;
let linkedAppId = null;
let directAppId = null;

test.describe('Admin source badge — real data E2E (Task #250)', () => {
  test.skip(
    !SUPABASE_SERVICE_KEY || !ADMIN_PASSWORD,
    'Requires SUPABASE_SERVICE_ROLE_KEY and ADMIN_PASSWORD'
  );

  test.beforeAll(async () => {
    const sb = getSupabaseAdmin();

    // 1. Seed an outreach lead the linked application will point to.
    //    `source: 'hunter'` → "Hunter" badge label, `location: 'Boston, MA'`
    //    and the fixed created_at give us deterministic text to assert.
    const { data: lead, error: leadErr } = await sb
      .from('outreach_leads')
      .insert({
        type: 'provider',
        name: `Linked Lead ${RUN_TAG}`,
        email: `linked.lead.${RUN_TAG}@mcc-test.com`,
        source: 'hunter',
        location: 'Boston, MA',
        status: 'converted',
        created_at: '2026-03-12T12:00:00Z'
      })
      .select('id, name, email, created_at')
      .single();
    if (leadErr) throw new Error(`seed outreach_leads failed: ${leadErr.message}`);
    leadRow = lead;

    // 2. Seed two applications: one references the lead, the other doesn't.
    //    business_name embeds RUN_TAG so we can locate the rows in the table.
    const { data: linked, error: linkedErr } = await sb
      .from('provider_applications')
      .insert({
        business_name: LINKED_BUSINESS,
        business_type: 'Mechanic',
        city: 'Boston',
        state: 'MA',
        status: 'pending',
        outreach_lead_id: leadRow.id
      })
      .select('id')
      .single();
    if (linkedErr) throw new Error(`seed linked application failed: ${linkedErr.message}`);
    linkedAppId = linked.id;

    const { data: direct, error: directErr } = await sb
      .from('provider_applications')
      .insert({
        business_name: DIRECT_BUSINESS,
        business_type: 'Detailer',
        city: 'Worcester',
        state: 'MA',
        status: 'pending',
        outreach_lead_id: null
      })
      .select('id')
      .single();
    if (directErr) throw new Error(`seed direct application failed: ${directErr.message}`);
    directAppId = direct.id;
  });

  test.afterAll(async () => {
    const sb = getSupabaseAdmin();
    if (linkedAppId) await sb.from('provider_applications').delete().eq('id', linkedAppId);
    if (directAppId) await sb.from('provider_applications').delete().eq('id', directAppId);
    if (leadRow?.id) await sb.from('outreach_leads').delete().eq('id', leadRow.id);
  });

  test('renders Hunter source badge for linked application and Direct signup for unlinked', async ({ page }) => {
    // The dev server (Task #400) now proxies
    // /api/admin/provider-application/* directly to the netlify handler, so
    // the page fetch hits real Supabase without any in-process bridge.

    // Sign in as admin and pre-seed the admin-password local-storage entry
    // so getAdminHeaders() attaches x-admin-password to the outreach-leads
    // fetch (the password modal is bypassed by the injected supabase session).
    await injectAdminSession(page);
    await page.addInitScript((pw) => {
      try { localStorage.setItem('mcc_admin_pass', pw); } catch { /* ignore */ }
    }, ADMIN_PASSWORD);

    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForLoadState('domcontentloaded');

    // Wait until admin.js has finished bootstrapping and exposed showSection.
    await page.waitForFunction(
      () => typeof globalThis.showSection === 'function' &&
            typeof globalThis.renderApplicationLeadBadge === 'function',
      { timeout: 15000 }
    );

    // Switch to the Applications section. Use the "all" filter so seeded
    // pending rows render even if a previous tab state filtered them out.
    await page.evaluate(async () => {
      await globalThis.showSection('applications');
      if (typeof globalThis.filterApplications === 'function') {
        globalThis.filterApplications('all');
      }
    });

    // Wait for at least our two seeded rows to appear in the table.
    const linkedRow = page.locator('#applications-table tr', { hasText: LINKED_BUSINESS }).first();
    const directRow = page.locator('#applications-table tr', { hasText: DIRECT_BUSINESS }).first();
    await expect(linkedRow).toBeVisible({ timeout: 15000 });
    await expect(directRow).toBeVisible({ timeout: 15000 });

    // The unlinked row must show the muted "Direct signup" chip.
    await expect(directRow).toContainText('Direct signup');

    // The linked row must show the rich badge with the source label,
    // location, and locale-formatted created_at date. The renderer uses
    // toLocaleDateString() — under the chromium default locale that is
    // "3/12/2026" for 2026-03-12. We assert each fragment independently
    // so a locale tweak doesn't cause a brittle whole-string match.
    const linkedBadge = linkedRow.locator('a.mcc-outreach-lead-link');
    await expect(linkedBadge).toBeVisible();
    const badgeText = (await linkedBadge.innerText()).trim();
    expect(badgeText).toContain('Hunter');
    expect(badgeText).toContain('Boston, MA');
    expect(badgeText).toMatch(/2026/);
    // Also assert the data attributes round-trip through to the link so
    // the delegated click handler can find the lead.
    await expect(linkedBadge).toHaveAttribute('data-lead-id', leadRow.id);
    await expect(linkedBadge).toHaveAttribute('data-lead-email', leadRow.email);
  });

  test('clicking the badge navigates to Marketing → Outreach → Leads with the email pre-filled', async ({ page }) => {
    // Dev server proxies /api/admin/provider-application/* to the netlify
    // handler (Task #400) — no in-process bridge required.

    // Stub loadLeads so clicking through doesn't trigger a real outreach
    // engine fetch (that endpoint is out of scope for this assertion).
    await page.addInitScript(() => {
      globalThis.__mccLoadLeadsCalls = 0;
      globalThis.loadLeads = async function() { globalThis.__mccLoadLeadsCalls += 1; };
    });

    await injectAdminSession(page);
    await page.addInitScript((pw) => {
      try { localStorage.setItem('mcc_admin_pass', pw); } catch { /* ignore */ }
    }, ADMIN_PASSWORD);

    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => typeof globalThis.showSection === 'function',
      { timeout: 15000 }
    );

    await page.evaluate(async () => {
      await globalThis.showSection('applications');
      if (typeof globalThis.filterApplications === 'function') {
        globalThis.filterApplications('all');
      }
    });

    const linkedRow = page.locator('#applications-table tr', { hasText: LINKED_BUSINESS }).first();
    await expect(linkedRow).toBeVisible({ timeout: 15000 });
    const badge = linkedRow.locator('a.mcc-outreach-lead-link');
    await expect(badge).toBeVisible();

    // The password-gate modal sometimes lingers as a backdrop layer even
    // though the injected admin session bypasses its purpose. Hide it so
    // it doesn't intercept the click on the badge below.
    await page.evaluate(() => {
      const m = document.getElementById('admin-password-modal');
      if (m) { m.style.display = 'none'; m.style.pointerEvents = 'none'; }
    });

    // Click the badge — this should call viewOutreachLead, switch sections,
    // activate the Leads sub-tab, and prefill #leads-search with the email.
    await badge.click();

    // Wait for the marketing-outreach section to become active.
    await page.waitForFunction(
      () => document.getElementById('marketing-outreach')?.classList.contains('active'),
      { timeout: 10000 }
    );

    // The Leads sub-tab uses #leads-search for its filter input. There are
    // two copies in the markup (one inside Outreach Engine → Leads, one in
    // an alternate layout) — the click handler queries by id, which returns
    // the first one. viewOutreachLead sets the value after a short delay,
    // so wait until at least one input picks up the email.
    await page.waitForFunction(
      (email) => Array.from(document.querySelectorAll('#leads-search'))
        .some(el => el.value === email),
      leadRow.email,
      { timeout: 10000 }
    );
    const searchValues = await page.$$eval('#leads-search', els => els.map(e => e.value));
    expect(searchValues).toContain(leadRow.email);

    // Confirm the Leads sub-tab inside Outreach Engine was activated.
    const leadsTabActive = await page.evaluate(() =>
      Boolean(document.querySelector('.outreach-tab[data-tab="leads"]')?.classList.contains('active'))
    );
    expect(leadsTabActive).toBe(true);
  });
});
