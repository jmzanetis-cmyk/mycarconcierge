'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Task #293 — Confirm the provider compliance dashboard renders correctly in
// Spanish at real mobile widths.
//
// The task asks for a hands-on phone walk-through. We can't drive a real
// device from CI, but we CAN drive the same DOM at the same physical
// viewport widths a phone uses, in Spanish, across all four state-card
// states + the alerts panel + the employees-table action column. This
// spec is the automated half of that confirmation: it fails the build if
// any localised string overflows its container, the percentage badge wraps,
// the alerts CTA spills, or the table action button gets clipped.
//
// Two viewports cover the modern-handset spread without us having to ship
// a Playwright project just for this:
//   • iPhone 14 Pro: 393×852 css px (Apple's mid/large device width)
//   • Compact Android: 360×800 css px (Pixel 6a, Galaxy A-series, etc.)
//
// We mount the bgc-compliance.js helper into a self-contained fixture
// rather than driving providers.html so the test is deterministic and
// doesn't need a logged-in provider — _stateCopy + _renderStateCard read
// only the cached profile columns we feed in via a stubbed supabase
// client.
// ─────────────────────────────────────────────────────────────────────────────

const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('./helpers');

const VIEWPORTS = [
  { name: 'iPhone 14 Pro', width: 393, height: 852 },
  { name: 'Compact Android', width: 360, height: 800 }
];

// All four states + the alerts panel + a representative 2-row employees
// table. Drives the cached profile columns _stateCopy reads.
const STATES = [
  {
    key: 'not_enrolled', total: 0, compliant: 0, pct: 0, badge: false,
    expectTitle: 'Obtén la insignia MCC Verificado',
    expectPill: 'No inscrito'
  },
  {
    key: 'activating', total: 5, compliant: 5, pct: 100, badge: false,
    expectTitle: 'MCC Verificado — Activando',
    expectPill: 'Activando'
  },
  {
    key: 'at_risk', total: 10, compliant: 8, pct: 85, badge: false,
    expectTitle: 'MCC Verificado — En riesgo',
    expectPill: '⚠ En riesgo'
  },
  {
    key: 'inactive', total: 5, compliant: 3, pct: 60, badge: false,
    expectTitle: 'MCC Verificado — Inactivo ✗',
    expectPill: '✗ Inactivo'
  }
];

const ALERTS = [
  { id: 'a1', alert_type: 'expiring', severity: 'critical',
    title: 'Verificación de antecedentes próxima a vencer',
    body:  'La verificación de María González vence en 3 días. Renuévala para mantener tu insignia activa.',
    action_url: '/providers.html#compliance', created_at: '2026-05-14T11:00:00Z' }
];

const EMPLOYEES = [
  { id: 'e1', first_name: 'María',     last_name: 'González', role: 'Mecánica', is_customer_facing: true,  is_active: true },
  { id: 'e2', first_name: 'Sebastián', last_name: 'Rodríguez', role: 'Asistente', is_customer_facing: true, is_active: true }
];
const CHECKS = [
  { employee_id: 'e1', status: 'clear', expires_at: '2026-05-17T00:00:00Z',
    completed_at: '2025-05-17T00:00:00Z', is_current: true },
  { employee_id: 'e2', status: 'pending', expires_at: null, completed_at: null, is_current: true }
];

// Build the in-page supabase stub. The bgc-compliance.js script reads
// only a handful of tables; chain whatever combination of .select / .eq /
// .is / .order / .in / .maybeSingle each path uses and resolve with the
// canned data for the current state.
function buildFixtureScript(state) {
  return `
    window.localStorage.setItem('mcc_language', 'es');
    document.documentElement.lang = 'es';
    const STATE = ${JSON.stringify(state)};
    const ALERTS = ${JSON.stringify(ALERTS)};
    const EMPLOYEES = ${JSON.stringify(EMPLOYEES)};
    const CHECKS = ${JSON.stringify(CHECKS)};
    const PROFILE = {
      bgc_total_employees: STATE.total,
      bgc_compliant_employees: STATE.compliant,
      bgc_compliance_pct: STATE.pct,
      bgc_badge_verified: STATE.badge,
      phone: '+15555550100'
    };

    function chain(rows) {
      const api = {
        _rows: rows,
        select: () => api,
        eq:     () => api,
        is:     () => api,
        in:     () => api,
        order:  () => api,
        maybeSingle: async () => ({ data: api._rows[0] || null, error: null }),
        then: (resolve) => resolve({ data: api._rows, error: null })
      };
      return api;
    }

    window.supabaseClient = {
      auth: { getUser: async () => ({ data: { user: { id: 'fixture-provider' } } }) },
      from: (table) => {
        if (table === 'profiles') return chain([PROFILE]);
        if (table === 'provider_alerts') return chain(ALERTS);
        if (table === 'provider_employees') return chain(EMPLOYEES);
        if (table === 'employee_background_checks') return chain(CHECKS);
        if (table === 'provider_notification_prefs') return chain([]);
        return chain([]);
      },
      rpc: async () => ({ data: null, error: null })
    };
  `;
}

// Detects horizontal overflow (text getting cut off) on a node and any of
// its descendants. Returns an array of [tag/cls, text] for any offender.
async function findOverflow(page, scopeSelector) {
  return await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [{ where: 'root-missing', text: sel }];
    const out = [];
    const walk = (el) => {
      // Only check elements that have actual layout.
      if (el.nodeType !== 1) return;
      // scrollWidth > clientWidth + 1px tolerance ⇒ horizontal clip.
      if (el.scrollWidth - el.clientWidth > 1) {
        out.push({
          where: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').join('.') : ''),
          text: (el.innerText || '').slice(0, 80),
          scroll: el.scrollWidth,
          client: el.clientWidth
        });
      }
      for (const c of el.children) walk(c);
    };
    walk(root);
    return out;
  }, scopeSelector);
}

test.describe('Task #293 — Compliance dashboard ES mobile readability', () => {
  for (const vp of VIEWPORTS) {
    for (const state of STATES) {
      test(`${vp.name} (${vp.width}×${vp.height}) · ${state.key}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });

        // Land on a same-origin blank-ish page so /bgc-compliance.js loads
        // from the dev server.
        await page.goto(`${BASE_URL}/`);
        await page.evaluate((scriptStr) => {
          // Reset DOM, install fixtures.
          document.body.innerHTML = `
            <div style="max-width:100%;padding:12px;box-sizing:border-box;">
              <div id="bgc-alerts-panel" style="display:none;margin-bottom:18px;"></div>
              <div class="card" id="bgc-state-card" style="margin-bottom:18px;background:#1a1d23;border:1px solid #2a2f38;border-radius:12px;padding:18px;"></div>
              <!-- Mirror the real wrapper from providers.html (overflow-x:auto)
                   so the 5-column table is reachable via horizontal scroll
                   on narrow viewports — this is the existing responsive
                   contract, not a Spanish-copy concern. -->
              <div id="bgc-employees-scroll" style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;background:#1a1d23;border-radius:8px;">
                  <thead>
                    <tr>
                      <th style="text-align:left;padding:10px 14px;font-size:0.78rem;color:#8a8f99;">Empleado</th>
                      <th style="text-align:left;padding:10px 14px;font-size:0.78rem;color:#8a8f99;">Cargo</th>
                      <th style="text-align:left;padding:10px 14px;font-size:0.78rem;color:#8a8f99;">Estado</th>
                      <th style="text-align:left;padding:10px 14px;font-size:0.78rem;color:#8a8f99;">Vence</th>
                      <th style="text-align:right;padding:10px 14px;font-size:0.78rem;color:#8a8f99;">Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="bgc-employees-tbody"></tbody>
                </table>
              </div>
            </div>`;
          const s = document.createElement('script');
          s.textContent = scriptStr;
          document.head.appendChild(s);
        }, buildFixtureScript(state));

        // Add the helper after the fixtures are installed.
        await page.addScriptTag({ url: '/bgc-compliance.js' });
        await page.waitForFunction(() => !!(window.bgcCompliance && window.bgcCompliance.refresh));

        // Drive a render.
        await page.evaluate(() => window.bgcCompliance.refresh());

        // 1. State card: title is correct + nothing inside overflows.
        const card = page.locator('#bgc-state-card');
        await expect(card).toContainText(state.expectTitle, { timeout: 5000 });
        await expect(card).toContainText(state.expectPill);

        // 2. The big percentage figure must stay on one visual line. We
        //    check the line-box height equals the rendered font's line
        //    height (no wrap). A wrap doubles the box height.
        const pctMetrics = await card.locator('div').filter({ hasText: /^\d+%$/ }).first()
          .evaluate((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return { h: r.height, fs: parseFloat(cs.fontSize), lh: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2 };
          });
        expect(pctMetrics.h, 'percent figure must stay on one line').toBeLessThan(pctMetrics.lh * 1.5);

        // 3. State card must not horizontally overflow at this width.
        const stateOverflow = await findOverflow(page, '#bgc-state-card');
        expect(stateOverflow, `state card overflow: ${JSON.stringify(stateOverflow)}`).toEqual([]);

        // 4. Alerts panel renders with its CTA and doesn't overflow.
        const alertsPanel = page.locator('#bgc-alerts-panel');
        await expect(alertsPanel).toBeVisible();
        await expect(alertsPanel).toContainText('próxima a vencer');
        await expect(alertsPanel.locator('a', { hasText: 'Renovar ahora' }).first()).toBeVisible();
        const alertsOverflow = await findOverflow(page, '#bgc-alerts-panel');
        expect(alertsOverflow, `alerts overflow: ${JSON.stringify(alertsOverflow)}`).toEqual([]);

        // 5. Employees table action column is REACHABLE on mobile. The
        //    real markup in providers.html wraps the 5-column table in
        //    overflow-x:auto, so the action button is reachable via
        //    horizontal scroll. We mirror that wrapper above and assert:
        //      (a) the wrapper IS scrollable (scrollWidth > clientWidth),
        //      (b) every action button can be scrolled into view, and
        //      (c) once scrolled, every action button sits inside the
        //          viewport horizontally.
        const tbody = page.locator('#bgc-employees-tbody');
        await expect(tbody.locator('tr')).toHaveCount(EMPLOYEES.length);
        const actionBtns = tbody.locator('tr td:last-child button');
        await expect(actionBtns).toHaveCount(EMPLOYEES.length);
        const wrapperScrollable = await page.locator('#bgc-employees-scroll').evaluate((el) => ({
          scroll: el.scrollWidth, client: el.clientWidth, canScroll: el.scrollWidth > el.clientWidth
        }));
        expect(wrapperScrollable.canScroll,
          `employees table must be horizontally scrollable on a ${vp.width}px screen`).toBe(true);
        for (let i = 0; i < EMPLOYEES.length; i += 1) {
          const btn = actionBtns.nth(i);
          await btn.scrollIntoViewIfNeeded();
          // After scrolling, the button is inside the wrapper's viewport box.
          const post = await btn.evaluate((el, vw) => {
            const r = el.getBoundingClientRect();
            return { right: r.right, left: r.left, vw };
          }, vp.width);
          expect(post.right, `row ${i} button right ≤ vw after scroll`).toBeLessThanOrEqual(post.vw + 1);
          expect(post.left, `row ${i} button left ≥ 0 after scroll`).toBeGreaterThanOrEqual(-1);
        }
      });
    }
  }
});
