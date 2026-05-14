'use strict';

// Task #189 — Surface the originating cold-outreach lead on each provider
// application in the admin review queue.
//
// What we cover here:
//   1. Static HTML: the applications-table now has a "Source" column header
//      and the empty-state row spans 7 columns instead of 6.
//   2. Browser script presence: renderApplicationLeadBadge,
//      hydrateApplicationOutreachLeads, and viewOutreachLead are all defined.
//   3. Functional: renderApplicationLeadBadge produces a "Direct signup"
//      chip for an application with no outreach_lead_id, a rich source chip
//      for an application that has been hydrated with a lead, and a fallback
//      "Lead linked" chip when the lead row could not be loaded.
//   4. Endpoint contract: the new POST /outreach-leads route in
//      provider-application-review.js requires admin auth, validates input,
//      and returns the expected shape.
//
// We deliberately avoid asserting on production data — both pieces are
// rendered/handled deterministically given the inputs we feed in.

const { test, expect } = require('@playwright/test');
const path = require('node:path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

test.describe('Admin provider applications — originating outreach lead (Task #189)', () => {
  test('admin.html applications table has the new Source column header', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForLoadState('domcontentloaded');

    // Source column header lives inside the applications section.
    const headers = await page.locator('#applications table thead th').allInnerTexts();
    expect(headers).toEqual(
      expect.arrayContaining(['Business', 'Type', 'Location', 'Submitted', 'Source', 'Status', 'Action'])
    );

    // Empty-state row must span all 7 columns.
    const emptyTd = page.locator('#applications-table td.empty-state').first();
    await expect(emptyTd).toBeAttached();
    const colspan = await emptyTd.getAttribute('colspan');
    expect(colspan).toBe('7');
  });

  test('admin.js exposes renderApplicationLeadBadge / hydrateApplicationOutreachLeads / viewOutreachLead', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/admin.js`);
    expect(res.status()).toBe(200);
    const src = await res.text();

    expect(src, 'renderApplicationLeadBadge is defined').toMatch(/function renderApplicationLeadBadge\b/);
    expect(src, 'hydrateApplicationOutreachLeads is defined').toMatch(/function hydrateApplicationOutreachLeads\b/);
    expect(src, 'viewOutreachLead is defined and exposed on window').toMatch(/window\.viewOutreachLead\s*=\s*viewOutreachLead/);
    expect(src, 'loadApplications hydrates outreach leads').toMatch(/await hydrateApplicationOutreachLeads\(/);
    expect(src, 'renderApplications puts the badge in a table cell').toMatch(/renderApplicationLeadBadge\(app\)/);
    expect(src, 'fetch points at the new outreach-leads endpoint').toMatch(/\/api\/admin\/provider-application\/outreach-leads/);

    // XSS guard: the badge must NOT call viewOutreachLead via an inline
    // onclick string (which would break / be exploitable on apostrophes in
    // untrusted lead names/emails). It must use data-* attributes + a
    // delegated click handler.
    expect(src, 'no inline onclick="viewOutreachLead(...)"').not.toMatch(/onclick\s*=\s*"[^"]*viewOutreachLead\s*\(/);
    expect(src, 'badge uses data-lead-id attribute').toMatch(/data-lead-id="\$\{safeId\}"/);
    expect(src, 'badge has the delegated-handler class').toMatch(/class="mcc-outreach-lead-link"/);
    expect(src, 'delegated click handler is wired').toMatch(/closest\(['"]\.mcc-outreach-lead-link['"]\)/);
  });

  test('renderApplicationLeadBadge produces the right markup for each case', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForLoadState('domcontentloaded');
    // Wait for admin.js to evaluate and expose the renderer test seam.
    await page.waitForFunction(
      () => typeof globalThis.renderApplicationLeadBadge === 'function',
      { timeout: 10000 }
    );

    const cases = await page.evaluate(() => {
      const r = globalThis.renderApplicationLeadBadge;
      return {
        direct: r({ id: 'a', outreach_lead_id: null }),
        linked: r({ id: 'b', outreach_lead_id: '11111111-1111-1111-1111-111111111111' }),
        rich: r({
          id: 'c',
          outreach_lead_id: '22222222-2222-2222-2222-222222222222',
          _outreach_lead: {
            id: '22222222-2222-2222-2222-222222222222',
            name: "Test Provider",
            source: 'hunter',
            location: 'Boston, MA',
            created_at: '2026-03-12T00:00:00Z',
            type: 'provider',
            email: 'lead@example.com'
          }
        }),
        // Adversarial: name with apostrophe, double-quote, angle brackets,
        // and a script-like payload. Confirms the data-* + delegated-handler
        // path neither breaks markup parsing nor injects script.
        nasty: r({
          id: 'd',
          outreach_lead_id: '33333333-3333-3333-3333-333333333333',
          _outreach_lead: {
            id: '33333333-3333-3333-3333-333333333333',
            name: `O'Brien "x" <script>alert(1)</script>`,
            source: 'apollo',
            location: 'NYC',
            created_at: '2026-04-01T00:00:00Z',
            email: `quote'inject"<bad>@example.com`
          }
        })
      };
    });

    // Direct signup: muted badge, no link, no data attrs.
    expect(cases.direct).toMatch(/Direct signup/);
    expect(cases.direct).not.toMatch(/mcc-outreach-lead-link/);

    // Linked-but-unhydrated: blue "Lead linked" chip, still no link
    // (clicking is only meaningful when we know which lead to open).
    expect(cases.linked).toMatch(/Lead linked/);

    // Hydrated: gold link with the source/location/date label and proper
    // data attributes wired for the delegated click handler.
    expect(cases.rich).toMatch(/class="mcc-outreach-lead-link"/);
    expect(cases.rich).toMatch(/data-lead-id="22222222-2222-2222-2222-222222222222"/);
    expect(cases.rich).toMatch(/data-lead-email="lead@example\.com"/);
    expect(cases.rich).toMatch(/Hunter/);
    expect(cases.rich).toMatch(/Boston, MA/);
    // No inline JS handlers anywhere on the rendered link.
    expect(cases.rich).not.toMatch(/onclick=/i);

    // Adversarial inputs: must HTML-escape into attributes and must NOT
    // appear as live markup (no raw <script> tag, no broken attribute).
    expect(cases.nasty).toMatch(/class="mcc-outreach-lead-link"/);
    expect(cases.nasty).not.toMatch(/<script>/i);
    expect(cases.nasty).not.toMatch(/onclick=/i);
    // The renderer must not let an apostrophe in name/email break the
    // attribute boundary. Parse the actual DOM to make sure exactly one
    // anchor exists and its dataset round-trips back to the original
    // strings.
    const parsed = await page.evaluate((html) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = html;
      const a = wrap.querySelector('a.mcc-outreach-lead-link');
      return a ? {
        count: wrap.querySelectorAll('a').length,
        leadId: a.dataset.leadId,
        leadName: a.dataset.leadName,
        leadEmail: a.dataset.leadEmail,
        href: a.getAttribute('href')
      } : null;
    }, cases.nasty);
    expect(parsed).not.toBeNull();
    expect(parsed.count).toBe(1);
    expect(parsed.leadId).toBe('33333333-3333-3333-3333-333333333333');
    expect(parsed.leadName).toBe(`O'Brien "x" <script>alert(1)</script>`);
    expect(parsed.leadEmail).toBe(`quote'inject"<bad>@example.com`);
    expect(parsed.href).toBe('#');
  });

  test('clicking the badge invokes viewOutreachLead via the delegated handler', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => typeof globalThis.renderApplicationLeadBadge === 'function' && typeof globalThis.viewOutreachLead === 'function',
      { timeout: 10000 }
    );

    // Inject a freshly-rendered badge into the page and stub viewOutreachLead
    // to capture the args. This proves the delegated click handler reads the
    // data-* attributes correctly even when they contain quotes/apostrophes.
    // We also hide the unauthenticated admin-password modal so its backdrop
    // doesn't intercept the click. We append the host high in the z-stack to
    // be safe.
    await page.evaluate(() => {
      const modal = document.getElementById('admin-password-modal');
      if (modal) { modal.style.display = 'none'; modal.style.pointerEvents = 'none'; }
      const html = globalThis.renderApplicationLeadBadge({
        id: 'app-x',
        outreach_lead_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        _outreach_lead: {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          name: `O'Brien "Q"`,
          source: 'hunter',
          location: 'Boston, MA',
          created_at: '2026-03-12T00:00:00Z',
          email: `o'brien@example.com`
        }
      });
      const host = document.createElement('div');
      host.id = 'mcc-test-badge-host';
      host.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;background:#fff;padding:8px;';
      host.innerHTML = html;
      document.body.appendChild(host);
      globalThis.__mccTestCalls = [];
      globalThis.viewOutreachLead = function(id, name, email) {
        globalThis.__mccTestCalls.push({ id, name, email });
      };
    });

    await page.click('#mcc-test-badge-host a.mcc-outreach-lead-link', { force: true });

    const calls = await page.evaluate(() => globalThis.__mccTestCalls);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: `O'Brien "Q"`,
      email: `o'brien@example.com`
    });
  });

  test('outreach-leads handler enforces auth and validates input (unit)', async () => {
    // Direct unit test of the netlify handler so we don't depend on the dev
    // server proxying /.netlify/functions/* — that proxy is production-only.
    // We assert the auth gate, the empty-input fast path, and the size cap.
    // The "happy path" reads from supabase, which we cover end-to-end in
    // production via the existing admin smoke tests; mocking the supabase
    // client here would require destructure-time interception that the SDK
    // does not support cleanly.
    const handlerPath = path.resolve(__dirname, '..', 'netlify', 'functions', 'provider-application-review.js');
    delete require.cache[require.resolve(handlerPath)];

    const prevPw = process.env.ADMIN_PASSWORD;
    const prevUrl = process.env.SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.ADMIN_PASSWORD = 'unit-test-pw';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    try {
      const mod = require(handlerPath);

      // 1. 401 without admin password.
      const noAuth = await mod.handler({
        httpMethod: 'POST',
        path: '/.netlify/functions/provider-application-review/outreach-leads',
        body: JSON.stringify({ lead_ids: [] })
      });
      expect(noAuth.statusCode).toBe(401);

      // 2. Invalid lead_ids (non-uuid, wrong types) → empty leads, 200.
      //    Importantly this doesn't call supabase, so no network needed.
      const empty = await mod.handler({
        httpMethod: 'POST',
        path: '/.netlify/functions/provider-application-review/outreach-leads',
        headers: { 'x-admin-password': 'unit-test-pw' },
        body: JSON.stringify({ lead_ids: ['not-a-uuid', 123, null] })
      });
      expect(empty.statusCode).toBe(200);
      expect(JSON.parse(empty.body)).toEqual({ leads: [] });

      // 3. Too many ids → 400 (size cap, also runs before any supabase call).
      const tooMany = {
        lead_ids: Array.from({ length: 501 }, (_, i) => {
          const hex = i.toString(16).padStart(12, '0');
          return `00000000-0000-0000-0000-${hex}`;
        })
      };
      const big = await mod.handler({
        httpMethod: 'POST',
        path: '/.netlify/functions/provider-application-review/outreach-leads',
        headers: { 'x-admin-password': 'unit-test-pw' },
        body: JSON.stringify(tooMany)
      });
      expect(big.statusCode).toBe(400);

      // 4. Wrong method on a known route → 404 from the route table, not a
      //    supabase call. Confirms the new route is wired only for POST.
      const wrongMethod = await mod.handler({
        httpMethod: 'GET',
        path: '/.netlify/functions/provider-application-review/outreach-leads',
        headers: { 'x-admin-password': 'unit-test-pw' }
      });
      expect(wrongMethod.statusCode).toBe(404);
    } finally {
      if (prevPw === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = prevPw;
      if (prevUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prevUrl;
      if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
      delete require.cache[require.resolve(handlerPath)];
    }
  });
});
