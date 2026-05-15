'use strict';

// Task #305 — Arabic RTL mobile readability of the BGC compliance dashboard.
// Mirrors tests/bgc-state-card-es-mobile.spec.js but flips the locale to
// Arabic and the document direction to RTL. Arabic has no compliance copy
// of its own in www/bgc-compliance.js (no STATE_COPY_AR), so the rendered
// titles + pills remain English — this spec is strictly a LAYOUT check
// for the dir="rtl" flip:
//   • zero horizontal overflow on the state card at 360×800 + 393×852
//   • percentage figure stays on one line
//   • after the flex flip, the percent column sits on the LEFT visually
//   • progress-bar fill is anchored at the visually-leading edge (right
//     in RTL — i.e. the fill's right edge touches the track's right edge)
// Evidence screenshots: test-results/task-305-device-evidence/.

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('./helpers');

const EVIDENCE_DIR = path.join(__dirname, '..', 'test-results', 'task-305-device-evidence');

// Explicit viewport sizes called out by the task (360×800 small Android,
// 393×852 iPhone-class). Use bare viewport contexts rather than device
// descriptors so the widths are exact and reproducible across CI machines.
const VIEWPORTS = [
  { id: 'small-360x800', label: '360×800 (small Android)',
    profile: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true,
      deviceScaleFactor: 2,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 4a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' } },
  { id: 'iphone-393x852', label: '393×852 (iPhone-class)',
    profile: { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true,
      deviceScaleFactor: 3,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } }
];

// Arabic falls back to STATE_COPY_EN inside bgc-compliance.js (there is
// no STATE_COPY_AR), so the titles/pills below match the English copy on
// purpose. The RTL flip we care about is layout, not strings.
const STATES = [
  { key: 'not_enrolled', total: 0,  compliant: 0,  pct: 0,
    expectTitle: 'Get MCC Verified',           expectPill: 'Not enrolled' },
  { key: 'activating',   total: 5,  compliant: 5,  pct: 100,
    expectTitle: 'MCC Verified — Activating',  expectPill: 'Activating' },
  { key: 'at_risk',      total: 10, compliant: 8,  pct: 85,
    expectTitle: 'MCC Verified — At Risk',     expectPill: '⚠ At Risk' },
  { key: 'inactive',     total: 5,  compliant: 3,  pct: 60,
    expectTitle: 'MCC Verified — Inactive ✗', expectPill: '✗ Inactive' }
];

function buildFixtureScript(state) {
  return `
    window.localStorage.setItem('mcc_language', 'ar');
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
    const STATE = ${JSON.stringify(state)};
    const PROFILE = {
      bgc_total_employees: STATE.total,
      bgc_compliant_employees: STATE.compliant,
      bgc_compliance_pct: STATE.pct,
      bgc_badge_verified: false,
      phone: '+15555550100'
    };
    function chain(rows) {
      const api = {
        _rows: rows,
        select: () => api, eq: () => api, is: () => api, in: () => api, order: () => api,
        maybeSingle: async () => ({ data: api._rows[0] || null, error: null }),
        then: (resolve) => resolve({ data: api._rows, error: null })
      };
      return api;
    }
    window.supabaseClient = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'fixture-provider' } } }),
        getSession: async () => ({ data: { session: { user: { id: 'fixture-provider' } } } })
      },
      from: (table) => {
        if (table === 'profiles') return chain([PROFILE]);
        return chain([]);
      },
      rpc: async () => ({ data: null, error: null })
    };
  `;
}

async function findOverflow(page, scopeSelector) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [{ where: 'root-missing', text: sel }];
    const out = [];
    const walk = (el) => {
      if (el.nodeType !== 1) return;
      if (el.scrollWidth - el.clientWidth > 1) {
        out.push({
          where: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').join('.') : ''),
          scroll: el.scrollWidth, client: el.clientWidth
        });
      }
      for (const c of el.children) walk(c);
    };
    walk(root);
    return out;
  }, scopeSelector);
}

test.describe('Task #305 — AR/RTL mobile compliance dashboard (fixture)', () => {
  for (const dev of VIEWPORTS) {
    for (const state of STATES) {
      test(`${dev.label} · ${state.key}`, async ({ browser }, testInfo) => {
        const context = await browser.newContext({ ...dev.profile });
        const page = await context.newPage();
        try {
          await page.goto(`${BASE_URL}/`);
          await page.evaluate((scriptStr) => {
            document.documentElement.dir = 'rtl';
            document.documentElement.lang = 'ar';
            document.body.dir = 'rtl';
            document.body.innerHTML = `
              <div style="max-width:100%;padding:12px;box-sizing:border-box;">
                <div class="card" id="bgc-state-card" style="margin-bottom:18px;background:#1a1d23;border:1px solid #2a2f38;border-radius:12px;padding:18px;"></div>
              </div>`;
            const s = document.createElement('script');
            s.textContent = scriptStr;
            document.head.appendChild(s);
          }, buildFixtureScript(state));
          await page.addScriptTag({ url: '/bgc-compliance.js' });
          await page.waitForFunction(() => !!(globalThis.bgcCompliance && globalThis.bgcCompliance.refresh));
          await page.evaluate(() => globalThis.bgcCompliance.refresh());

          const card = page.locator('#bgc-state-card');
          await expect(card).toContainText(state.expectTitle, { timeout: 5000 });
          await expect(card).toContainText(state.expectPill);

          // (a) Document is actually in RTL.
          const dir = await page.evaluate(() => document.documentElement.dir);
          expect(dir).toBe('rtl');

          // (b) State card has zero horizontal overflow at this viewport.
          const stateOverflow = await findOverflow(page, '#bgc-state-card');
          expect(stateOverflow,
            `state card overflow on ${dev.label}: ${JSON.stringify(stateOverflow)}`).toEqual([]);

          // (c) Percentage figure stays on one line.
          const pctEl = card.locator('div').filter({ hasText: /^\d+\s*%$/ }).first();
          const pctMetrics = await pctEl.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return { h: r.height, fs: Number.parseFloat(cs.fontSize),
              lh: Number.parseFloat(cs.lineHeight) || Number.parseFloat(cs.fontSize) * 1.2 };
          });
          expect(pctMetrics.h, 'percent figure must stay on one line').toBeLessThan(pctMetrics.lh * 1.5);

          // (d) Percent column is end-aligned (resolves to "right" in LTR
          //     and "left" in RTL — both are acceptable; "right" alone is
          //     the bug we're guarding against because it means the inline
          //     style was hard-coded LTR).
          const pctColAlign = await pctEl.evaluate((el) => getComputedStyle(el.parentElement).textAlign);
          expect(['end', 'left', 'start'],
            `percent column textAlign must be logical (end) — got "${pctColAlign}". \
A literal "right" means the RTL flip silently broke.`).toContain(pctColAlign);

          // (e) After the flex flip, the percent figure must hug the
          //     visually-leading edge — which in RTL means the right side
          //     of the card. Two valid layouts:
          //       (i) row layout (no wrap): pct column sits LEFT of the
          //           text column (flex children swap under dir=rtl with
          //           justify-content:space-between), and the numerals
          //           inside it hug its own right (end) edge.
          //      (ii) wrapped layout (narrow viewport): pct column stacks
          //           below the text column, both pinned to the leading
          //           (right) edge of the card.
          //     Either way, the percent NUMERALS' right edge must be
          //     close to the card's right edge.
          const layout = await card.evaluate((el) => {
            const flex = el.firstElementChild;
            const children = flex ? Array.from(flex.children) : [];
            const cardRect = el.getBoundingClientRect();
            const txt = children[0]?.getBoundingClientRect();
            const pct = children[1]?.getBoundingClientRect();
            // Locate the inner percentage numerals div (the gold figure).
            let pctNumeralsRight = null;
            if (children[1]) {
              const numerals = children[1].firstElementChild;
              if (numerals) pctNumeralsRight = numerals.getBoundingClientRect().right;
            }
            return {
              cardRight: cardRect.right,
              text: txt ? { top: txt.top, left: txt.left, right: txt.right } : null,
              pct:  pct ? { top: pct.top, left: pct.left, right: pct.right } : null,
              pctNumeralsRight,
              wrapped: txt && pct ? Math.abs(txt.top - pct.top) > 4 : null
            };
          });
          expect(layout.text && layout.pct,
            'state card must have a two-column flex header').toBeTruthy();
          // Percent numerals must visually hug the card's right (leading)
          // edge under RTL — within the card's padding budget (~24px).
          expect(layout.cardRight - layout.pctNumeralsRight,
            `percent numerals must hug the right (leading) edge of the card under dir=rtl: \
cardRight=${layout.cardRight} numeralsRight=${layout.pctNumeralsRight}`)
            .toBeLessThan(40);
          if (!layout.wrapped) {
            // Same-line case: the flex flip must put the pct column LEFT
            // of the text column. (Tested only when the layout actually
            // fits on one row at this viewport.)
            expect(layout.pct.left,
              'unwrapped row layout: pct column must sit LEFT of text column under dir=rtl')
              .toBeLessThan(layout.text.left);
          }

          // (f) Progress-bar fill is anchored at the visually-leading edge
          //     (right edge in RTL). When pct < 100 the fill is narrower
          //     than the track, so its right edge should hug the track's
          //     right edge and its left edge should sit strictly inside.
          if (state.pct > 0 && state.pct < 100) {
            const bar = await card.evaluate((el) => {
              const track = el.children[1]; // the progress-bar wrapper
              const fill  = track && track.firstElementChild;
              if (!track || !fill) return null;
              const tr = track.getBoundingClientRect();
              const fr = fill.getBoundingClientRect();
              return { trackLeft: tr.left, trackRight: tr.right,
                fillLeft: fr.left, fillRight: fr.right };
            });
            expect(bar, 'progress-bar wrapper + fill must exist').toBeTruthy();
            expect(Math.abs(bar.fillRight - bar.trackRight),
              `progress fill right edge must hug track right edge (RTL leading edge): \
fillRight=${bar.fillRight} trackRight=${bar.trackRight}`).toBeLessThanOrEqual(1);
            expect(bar.fillLeft,
              'progress fill should not span the full width when pct<100')
              .toBeGreaterThan(bar.trackLeft + 1);
          }

          // Visual evidence.
          const shotName = `${dev.id}-${state.key}-fixture.png`;
          fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
          await page.screenshot({ path: path.join(EVIDENCE_DIR, shotName), fullPage: true });
          await testInfo.attach(shotName, {
            path: path.join(EVIDENCE_DIR, shotName), contentType: 'image/png'
          });
        } finally {
          await context.close();
        }
      });
    }
  }
});
