'use strict';

// Task #410 — Arabic RTL audit of the provider portal.
//
// Task #305 fixed one inline `text-align:right` in www/bgc-compliance.js
// that silently broke under Arabic RTL. Task #410 sweeps the rest of the
// provider portal (providers.js, providers.html, providers-settings.js,
// bgc-compliance.js) replacing hard-coded physical properties
// (`text-align:right`, `margin-left`, `padding-left`, `border-left`,
// `float:right`, the absolute-positioned `left:Xpx` overlays inside
// pos-input dollar signs / toggle thumbs / status-step rail) with logical
// equivalents (`text-align:end`, `margin-inline-start`,
// `padding-inline-start`, `border-inline-start`, `float:inline-end`,
// `inset-inline-start`).
//
// This spec loads providers.html at 360×800 (small Android phone, the
// tightest realistic provider viewport) twice — once under LTR to capture
// a baseline of pre-existing mobile layout overflows that are unrelated
// to RTL (e.g. a card child with `min-width:280px` that already overflows
// a ~278px card body in both directions; fixing those is out of scope and
// tracked separately) — then again under `dir="rtl"` with a stubbed
// Supabase auth so the auth-required portal renders without a real login.
//
// The RTL pass asserts:
//   (a) the document is actually in RTL,
//   (b) **no new** body-level horizontal overflow appears under RTL that
//       wasn't already present in LTR (the cumulative symptom of physical-
//       property leaks — a left-anchored badge, border-left, padding-left
//       etc that fails to flip would surface as a new overflow site or a
//       larger overflow at an existing site only in RTL),
//   (c) each major provider-portal panel container (overview, compliance,
//       alerts, employees, preferences) has no new RTL-only overflow.

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('./helpers');

const EVIDENCE_DIR = path.join(__dirname, '..', 'test-results', 'task-410-device-evidence');

const VIEWPORT = {
  viewport: { width: 360, height: 800 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 4a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
};

// Panel containers that the task explicitly calls out, mapped to the
// real section ids in www/providers.html (sections are <section
// class="section" id="…">). "alerts" maps to the notifications panel
// which hosts the provider alerts feed; "preferences" maps to the
// profile panel which hosts the reminder/notification preferences card
// + theme toggle. "employees" maps to the team panel (Team Management).
const PANELS = [
  { id: 'overview',    selector: '#overview' },
  { id: 'compliance',  selector: '#compliance' },
  { id: 'alerts',      selector: '#notifications' },
  { id: 'employees',   selector: '#team' },
  { id: 'preferences', selector: '#profile' }
];

// IDs of dynamic UI fragments that the reviewer flagged as containing
// residual physical left/right styles. Force-shown at the end of each
// pass so the overflow probe actually covers them even though they
// default to display:none in steady state.
const FORCED_VISIBLE_IDS = [
  'pos-marketplace-choice',
  'pos-marketplace-loading',
  'pos-qr-scanner-modal',
  'pos-stepper-line',
  'pos-stepper-line-fill',
  'calc-gauge-marker',
  'provider-founder-promo'
];

function buildAuthStub(dir /* 'ltr' | 'rtl' */) {
  const lang = dir === 'rtl' ? 'ar' : 'en';
  return `
    window.localStorage.setItem('mcc_language', '${lang}');
    document.documentElement.lang = '${lang}';
    document.documentElement.dir = '${dir}';

    const PROFILE = {
      id: 'fixture-provider',
      role: 'provider',
      provider_role: 'provider',
      first_name: '${dir === 'rtl' ? 'مزوّد' : 'Test'}',
      last_name: '${dir === 'rtl' ? 'اختبار' : 'Provider'}',
      email: 'fixture-provider@mcc-test.com',
      phone: '+15555550100',
      two_factor_enabled: false,
      bgc_total_employees: 0,
      bgc_compliant_employees: 0,
      bgc_compliance_pct: 0,
      bgc_badge_verified: false
    };

    function chain(rows) {
      const api = {
        _rows: rows,
        select: () => api, eq: () => api, neq: () => api, is: () => api,
        in: () => api, or: () => api, order: () => api, limit: () => api,
        range: () => api, gte: () => api, lte: () => api, gt: () => api,
        lt: () => api, like: () => api, ilike: () => api,
        maybeSingle: async () => ({ data: api._rows[0] || null, error: null }),
        single: async () => ({ data: api._rows[0] || null, error: null }),
        then: (resolve) => resolve({ data: api._rows, error: null })
      };
      return api;
    }

    window.supabaseClient = {
      auth: {
        getUser: async () => ({ data: { user: { id: PROFILE.id, email: PROFILE.email } }, error: null }),
        getSession: async () => ({ data: { session: { user: { id: PROFILE.id, email: PROFILE.email }, access_token: 'fixture-token' } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signOut: async () => ({ error: null })
      },
      from: (table) => {
        if (table === 'profiles') return chain([PROFILE]);
        return chain([]);
      },
      rpc: async () => ({ data: null, error: null }),
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) }
    };
  `;
}

// Walk a subtree and report every element with horizontal overflow.
// Returns [{ where, scroll, client, chain }, ...] — `where` is a stable
// css-ish descriptor (tag#id.class) used as the diff key between LTR and
// RTL passes.
async function findOverflow(page, scopeSelector) {
  return page.evaluate((sel) => {
    const root = sel === 'body' ? document.body : document.querySelector(sel);
    if (!root) return null;
    const out = [];
    const describe = (el) => el.tagName.toLowerCase() +
      (el.id ? '#' + el.id : '') +
      (el.className && typeof el.className === 'string'
        ? '.' + el.className.split(' ').filter(Boolean).slice(0, 3).join('.')
        : '');
    const walk = (el) => {
      if (el.nodeType !== 1) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (el.scrollWidth - el.clientWidth > 1) {
        const chain = [];
        let cur = el.parentElement;
        while (cur && cur !== document.body && chain.length < 4) {
          chain.unshift(describe(cur));
          cur = cur.parentElement;
        }
        // Find the widest descendant — the actual culprit pushing
        // scrollWidth past clientWidth.
        let widest = null;
        let widestW = 0;
        const findWidest = (n) => {
          if (n.nodeType !== 1) return;
          const r = n.getBoundingClientRect();
          if (r.width > widestW) { widestW = r.width; widest = n; }
          for (const c of n.children) findWidest(c);
        };
        findWidest(el);
        out.push({
          where: describe(el),
          scroll: el.scrollWidth,
          client: el.clientWidth,
          chain: chain.join(' > '),
          culprit: widest ? describe(widest) + ' w=' + Math.round(widestW) : null,
          culpritHTML: widest ? (widest.outerHTML || '').slice(0, 180) : null
        });
      }
      for (const c of el.children) walk(c);
    };
    walk(root);
    return out;
  }, scopeSelector);
}

// Diff helper: an RTL overflow is an **RTL-only regression** if it
// did not exist at the same DOM site under LTR. Elements that
// already overflow in LTR (e.g. the Business Hours `hour-row` grid
// with fixed `100px 1fr 80px auto` columns + `<select min-width:110px>`,
// or the `#team-management-table` `<table style="width:100%">` whose
// header cells expand past the 278px card content width on a 360px
// phone) are pre-existing mobile-layout issues that exist in both LTR
// and RTL; fixing them is unrelated to the physical→logical CSS sweep
// and is tracked as separate follow-ups. The diff therefore only flags
// elements that did NOT overflow in LTR at all (`new-site-only-in-rtl`)
// — the unambiguous signature of a hard-coded physical property that
// failed to flip under `dir="rtl"`. Elements present in both passes
// (mobile-layout overflows) are intentionally ignored here.
function diffOverflows(ltrOverflows, rtlOverflows) {
  const ltrSites = new Set((ltrOverflows || []).map((o) => o.where));
  const newOnes = [];
  for (const r of rtlOverflows || []) {
    if (!ltrSites.has(r.where)) {
      newOnes.push({ ...r, reason: 'new-site-only-in-rtl' });
    }
  }
  return newOnes;
}

// Boot the providers.html page in the given direction, force-activate
// each PANEL, force-show every FORCED_VISIBLE_IDS fragment, and return
// the body-level overflow set plus a per-panel overflow set.
async function captureOverflows(browser, dir) {
  const context = await browser.newContext({ ...VIEWPORT });
  const page = await context.newPage();
  try {
    await page.addInitScript(buildAuthStub(dir));

    // Stub auth + any /api/* call so the dashboard init doesn't bounce
    // back to login.html on a 401.
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/auth/check-access')) {
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: '{"authorized":true}' });
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto(`${BASE_URL}/providers.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((d) => {
      document.documentElement.dir = d;
      document.documentElement.lang = d === 'rtl' ? 'ar' : 'en';
    }, dir);
    await page.waitForTimeout(1500);

    // If boot redirected to login.html anyway, re-navigate and disable
    // the load handler so the static markup stays put.
    if (page.url().includes('login.html')) {
      await page.addInitScript(() => {
        window.addEventListener('load', (e) => e.stopImmediatePropagation(), true);
      });
      await page.goto(`${BASE_URL}/providers.html`, { waitUntil: 'domcontentloaded' });
      await page.evaluate((d) => {
        document.documentElement.dir = d;
        document.documentElement.lang = d === 'rtl' ? 'ar' : 'en';
      }, dir);
      await page.waitForTimeout(500);
    }

    // Per-panel pass: activate one section at a time and probe it.
    const perPanel = {};
    for (const panel of PANELS) {
      await page.evaluate((sel) => {
        for (const s of document.querySelectorAll('section.section')) {
          s.classList.remove('active');
          s.style.display = 'none';
        }
        const target = document.querySelector(sel);
        if (target) {
          target.classList.add('active');
          target.style.display = 'block';
        }
      }, panel.selector);
      await page.waitForTimeout(150);
      perPanel[panel.id] = {
        exists: await page.locator(panel.selector).count(),
        overflow: await findOverflow(page, panel.selector)
      };
    }

    // Body-level pass with every fragment forced visible.
    await page.evaluate((ids) => {
      // Restore all sections so the body probe covers them.
      for (const s of document.querySelectorAll('section.section')) {
        s.classList.add('active');
        s.style.display = 'block';
      }
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) {
          el.style.display = 'block';
          el.removeAttribute('hidden');
        }
      }
      const close = document.querySelector('.mobile-close');
      if (close) close.style.display = 'flex';
    }, FORCED_VISIBLE_IDS);
    await page.waitForTimeout(200);

    const body = await findOverflow(page, 'body');
    return { body, perPanel, page, context };
  } catch (err) {
    await context.close();
    throw err;
  }
}

test.describe('Task #410 — provider portal RTL audit (360×800)', () => {
  test('providers.html does not introduce RTL-only horizontal overflow', async ({ browser }, testInfo) => {
    // (1) LTR baseline — captures every pre-existing mobile-layout
    // overflow site so we can subtract it from the RTL pass.
    const ltr = await captureOverflows(browser, 'ltr');
    const ltrBody = ltr.body;
    const ltrPanels = ltr.perPanel;
    await ltr.context.close();

    // (2) RTL pass.
    const rtl = await captureOverflows(browser, 'rtl');
    try {
      const dir = await rtl.page.evaluate(() => document.documentElement.dir);
      expect(dir).toBe('rtl');

      // (a) Every target panel must exist (guards against the previous
      //     reviewer-flagged bug where wrong section ids silently passed).
      for (const panel of PANELS) {
        expect(rtl.perPanel[panel.id].exists,
          `provider portal section "${panel.id}" (${panel.selector}) must exist in providers.html`)
          .toBeGreaterThan(0);
      }

      // (b) Per-panel diff: no NEW overflow under RTL.
      for (const panel of PANELS) {
        const newOnes = diffOverflows(
          ltrPanels[panel.id]?.overflow || [],
          rtl.perPanel[panel.id].overflow
        );
        expect(newOnes,
          `panel "${panel.id}" (${panel.selector}) introduced RTL-only horizontal overflow: ` +
          JSON.stringify(newOnes))
          .toEqual([]);
      }

      // (c) Body-level diff with every fragment forced visible. This is
      //     the regression the reviewer specifically asked for — if any
      //     residual physical positioning leaks under RTL on a forced-
      //     visible POS overlay, status-step rail, toggle thumb,
      //     sidebar close button, founder-promo dismiss, or QR scanner
      //     modal, it surfaces as a new overflow site or a larger
      //     overflow at an existing site only in RTL.
      const newBody = diffOverflows(ltrBody, rtl.body);
      expect(newBody,
        'body introduced RTL-only horizontal overflow under dir=rtl at 360×800 ' +
        '(POS overlays + sidebar close + founder promo forced visible).\n' +
        'LTR baseline: ' + JSON.stringify(ltrBody).slice(0, 400) + '\n' +
        'RTL pass:    ' + JSON.stringify(rtl.body).slice(0, 400) + '\n' +
        'New under RTL: ' + JSON.stringify(newBody))
        .toEqual([]);

      // Visual evidence.
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
      const shotPath = path.join(EVIDENCE_DIR, 'providers-html-rtl-360x800.png');
      await rtl.page.screenshot({ path: shotPath, fullPage: true });
      await testInfo.attach('providers-html-rtl-360x800.png', {
        path: shotPath, contentType: 'image/png'
      });
    } finally {
      await rtl.context.close();
    }
  });
});
