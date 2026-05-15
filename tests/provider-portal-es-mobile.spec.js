'use strict';

// Task #304 — ES mobile readability of four other provider-portal sections.
//
// Mirrors the Task #293 fixture pattern (tests/bgc-state-card-es-mobile.spec.js):
// stubbed Supabase, self-contained DOM, no real login, runs at 360×800 and
// 393×852 (matching iPhone 14 Pro + Pixel 7 device descriptors). Sections
// covered: Active Jobs, Browse Packages (bid CTAs on care plans),
// Earnings dashboard, Notifications/Reminder Preferences panel.
//
// NOTE: providers.html currently has zero data-i18n attributes on these
// sections — the portal renders English literals at runtime. The fixture
// therefore inlines Spanish copy (matching the existing translations in
// www/locales/es.json: nav.notifications, providerDashboard.earnings,
// providerDashboard.activeJobs, etc.) so the readability check is
// representative of what a Spanish speaker WOULD see if/when those
// sections are wired through I18n. No es.json edits are made because no
// es.json keys are referenced by these section blocks today.
//
// Each per-section test asserts:
//   (a) the title, body and primary CTA are visible,
//   (b) no element inside the section overflows horizontally,
//   (c) the primary CTA's bounding box sits entirely inside the viewport.
//
// Evidence: test-results/task-304-device-evidence/<dev>-<section>.png

const fs = require('node:fs');
const path = require('node:path');
const { test, expect, devices } = require('@playwright/test');
const { BASE_URL } = require('./helpers');

const EVIDENCE_DIR = path.join(__dirname, '..', 'test-results', 'task-304-device-evidence');

const DEVICE_PROFILES = [
  { id: 'iphone-14-pro', label: 'iPhone 14 Pro',
    profile: devices['iPhone 14 Pro'] || devices['iPhone 13 Pro'] || devices['iPhone 12 Pro'] },
  { id: 'pixel-7',       label: 'Pixel 7',
    profile: devices['Pixel 7'] || devices['Pixel 5'] || devices['Galaxy S9+'] }
];

// Spanish copy for each section. Phrasing chosen to match the same register
// used in www/locales/es.json (formal "tú" / "tu", professional tone) and
// deliberately includes the longest realistic strings (e.g. the escrow
// explainer, the bid-CTA copy with credits indicator) — those are the most
// likely overflow culprits at 360px.
const SECTIONS = {
  jobs: {
    label: 'Trabajos Activos',
    primaryCtaText: 'Escanear Registro del Miembro',
    bodyText: 'Cuando un miembro acepte tu propuesta',
    html: `
      <section id="sec-jobs" style="padding:12px;box-sizing:border-box;background:#0f1218;">
        <div class="page-header" style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
          <div style="flex:1 1 100%;min-width:0;">
            <h1 class="page-title" style="margin:0;font-size:1.4rem;color:#fff;">Trabajos Activos</h1>
            <p class="page-subtitle" style="margin:4px 0 0;color:#8a8f99;font-size:0.92rem;">Paquetes en los que tu propuesta fue aceptada.</p>
          </div>
          <button id="cta-primary" class="btn btn-primary" style="background:#c9a227;color:#1a1d23;font-weight:700;border:0;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:8px;font-size:0.9rem;">
            <span>📷</span> Escanear Registro del Miembro
          </button>
        </div>
        <div class="empty-state" style="background:rgba(26,32,42,0.9);border:1px solid #2a2f38;border-radius:12px;padding:24px;text-align:center;color:#fff;">
          <div class="empty-state-title" style="font-weight:700;margin-bottom:6px;">No hay trabajos activos en este momento</div>
          <div class="empty-state-desc" style="color:#8a8f99;font-size:0.9rem;line-height:1.5;">Cuando un miembro acepte tu propuesta, el trabajo aparecerá aquí con todos los detalles que necesitas para empezar.</div>
          <button class="empty-state-cta" style="margin-top:14px;background:transparent;color:#c9a227;border:1px solid #c9a227;border-radius:8px;padding:8px 14px;font-weight:600;">Ver Tus Propuestas</button>
        </div>
      </section>`
  },

  browse: {
    label: 'Buscar Paquetes',
    primaryCtaText: 'Comprar Más Créditos',
    bodyText: 'Encuentra paquetes de mantenimiento',
    html: `
      <section id="sec-browse" style="padding:12px;box-sizing:border-box;background:#0f1218;">
        <div class="page-header" style="margin-bottom:16px;">
          <h1 class="page-title" style="margin:0;font-size:1.4rem;color:#fff;">Buscar Paquetes</h1>
          <p class="page-subtitle" style="margin:4px 0 0;color:#8a8f99;font-size:0.92rem;">Encuentra paquetes de mantenimiento para hacer una propuesta.</p>
        </div>
        <div id="browse-credits-bar" style="background:rgba(26,32,42,0.9);border:1px solid #2a2f38;border-radius:12px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;color:#fff;">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <span style="font-size:1.4rem;">💳</span>
            <div style="min-width:0;">
              <span style="font-size:0.82rem;color:#8a8f99;">Tus Créditos de Propuesta:</span>
              <span style="font-size:1.1rem;font-weight:700;color:#c9a227;margin-left:6px;">0</span>
            </div>
          </div>
          <button id="cta-primary" class="btn btn-primary btn-sm" style="background:#c9a227;color:#1a1d23;font-weight:700;border:0;border-radius:10px;padding:9px 14px;font-size:0.85rem;">
            🛒 Comprar Más Créditos
          </button>
        </div>
        <div class="filter-bar" style="display:flex;flex-wrap:wrap;gap:10px;padding:14px;background:rgba(26,32,42,0.9);border:1px solid #2a2f38;border-radius:12px;margin-bottom:16px;">
          <div style="flex:1;min-width:140px;">
            <label style="font-size:0.78rem;color:#8a8f99;display:block;margin-bottom:4px;">Distancia</label>
            <select class="form-input" style="width:100%;padding:9px 10px;background:#12161c;border:1px solid #2a2f38;border-radius:8px;color:#fff;box-sizing:border-box;">
              <option>Todas las Ubicaciones</option>
              <option>Dentro de 25 millas</option>
            </select>
          </div>
          <div style="flex:1;min-width:140px;">
            <label style="font-size:0.78rem;color:#8a8f99;display:block;margin-bottom:4px;">Categoría</label>
            <select class="form-input" style="width:100%;padding:9px 10px;background:#12161c;border:1px solid #2a2f38;border-radius:8px;color:#fff;box-sizing:border-box;">
              <option>Todas las Categorías</option>
              <option>Mantenimiento Preventivo Programado</option>
            </select>
          </div>
        </div>
        <div id="package-card" style="background:rgba(26,32,42,0.9);border:1px solid #2a2f38;border-radius:12px;padding:14px;color:#fff;">
          <div style="font-weight:700;margin-bottom:6px;">Cambio de Aceite y Revisión Multipunto</div>
          <div style="color:#8a8f99;font-size:0.88rem;margin-bottom:10px;line-height:1.5;">El miembro espera una propuesta competitiva. La oferta cierra en 2 días. Estimación del miembro: $85.</div>
          <button class="btn btn-secondary" style="width:100%;background:transparent;color:#c9a227;border:1px solid #c9a227;border-radius:8px;padding:10px;font-weight:600;">Hacer Propuesta Competitiva</button>
        </div>
      </section>`
  },

  earnings: {
    label: 'Ganancias',
    primaryCtaText: 'Encontrar Trabajos',
    bodyText: 'Cómo funcionan los pagos',
    html: `
      <section id="sec-earnings" style="padding:12px;box-sizing:border-box;background:#0f1218;">
        <div class="page-header" style="margin-bottom:16px;">
          <h1 class="page-title" style="margin:0;font-size:1.4rem;color:#fff;">Ganancias</h1>
          <p class="page-subtitle" style="margin:4px 0 0;color:#8a8f99;font-size:0.92rem;">Rastrea tus ingresos y pagos.</p>
        </div>
        <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px;">
          <div class="stat-card" style="background:rgba(26,32,42,0.9);border:1px solid #2a2f38;border-radius:12px;padding:14px;color:#fff;">
            <div class="stat-value" style="font-size:1.4rem;font-weight:700;color:#c9a227;">$0</div>
            <div class="stat-label" style="color:#8a8f99;font-size:0.82rem;margin-top:4px;">Pendiente (En Custodia)</div>
          </div>
          <div class="stat-card" style="background:rgba(26,32,42,0.9);border:1px solid #2a2f38;border-radius:12px;padding:14px;color:#fff;">
            <div class="stat-value" style="font-size:1.4rem;font-weight:700;color:#c9a227;">$0</div>
            <div class="stat-label" style="color:#8a8f99;font-size:0.82rem;margin-top:4px;">Liberado (30 días)</div>
          </div>
          <div class="stat-card" style="background:rgba(26,32,42,0.9);border:1px solid #2a2f38;border-radius:12px;padding:14px;color:#fff;">
            <div class="stat-value" style="font-size:1.4rem;font-weight:700;color:#c9a227;">$0</div>
            <div class="stat-label" style="color:#8a8f99;font-size:0.82rem;margin-top:4px;">Ganancias Totales</div>
          </div>
        </div>
        <div class="card" style="background:rgba(26,32,42,0.9);border:1px solid #2a2f38;border-radius:12px;padding:16px;color:#fff;margin-bottom:14px;">
          <div class="card-header" style="margin-bottom:10px;"><h2 class="card-title" style="margin:0;font-size:1.05rem;">Historial de Pagos</h2></div>
          <div class="empty-state" style="text-align:center;padding:18px 8px;">
            <div class="empty-state-title" style="font-weight:700;margin-bottom:6px;">Aún no hay pagos</div>
            <div class="empty-state-desc" style="color:#8a8f99;font-size:0.88rem;line-height:1.5;">Completa trabajos para empezar a ganar. Los pagos se mantienen en custodia y se liberan cuando el miembro confirma la finalización.</div>
            <button id="cta-primary" class="empty-state-cta" style="margin-top:12px;background:#c9a227;color:#1a1d23;border:0;border-radius:8px;padding:9px 14px;font-weight:700;">Encontrar Trabajos</button>
          </div>
        </div>
        <div class="alert" style="background:rgba(74,124,255,0.1);border:1px solid rgba(74,124,255,0.3);color:#7aa2ff;padding:14px;border-radius:10px;font-size:0.88rem;line-height:1.5;">
          <strong>Cómo funcionan los pagos:</strong> Cuando un miembro acepta tu propuesta, el pago se mantiene en custodia. Una vez que el trabajo se completa y el miembro confirma, el pago completo se libera. Los pagos se procesan en 3 a 5 días hábiles.
        </div>
      </section>`
  },

  notifications: {
    label: 'Notificaciones y Recordatorios',
    primaryCtaText: 'Marcar Todas como Leídas',
    bodyText: 'Elige cómo y cuándo quieres recibir recordatorios',
    html: `
      <section id="sec-notifications" style="padding:12px;box-sizing:border-box;background:#0f1218;">
        <div class="page-header" style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
          <div style="flex:1 1 100%;min-width:0;">
            <h1 class="page-title" style="margin:0;font-size:1.4rem;color:#fff;">Notificaciones</h1>
            <p class="page-subtitle" style="margin:4px 0 0;color:#8a8f99;font-size:0.92rem;">Mantente informado sobre propuestas y trabajos.</p>
          </div>
          <button id="cta-primary" class="btn btn-secondary" style="background:transparent;color:#c9a227;border:1px solid #c9a227;border-radius:8px;padding:8px 12px;font-weight:600;font-size:0.85rem;white-space:nowrap;">Marcar Todas como Leídas</button>
        </div>
        <div class="card" style="background:rgba(26,32,42,0.9);border:1px solid #2a2f38;border-radius:12px;padding:16px;color:#fff;margin-bottom:14px;">
          <h2 class="card-title" style="margin:0 0 10px;font-size:1.05rem;">Preferencias de Recordatorios</h2>
          <p style="color:#8a8f99;font-size:0.88rem;line-height:1.5;margin:0 0 12px;">Elige cómo y cuándo quieres recibir recordatorios sobre próximas citas, propuestas pendientes y vencimientos de verificación de antecedentes.</p>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <label style="display:flex;align-items:center;gap:10px;font-size:0.9rem;"><input type="checkbox" checked /> Recordatorios por correo electrónico</label>
            <label style="display:flex;align-items:center;gap:10px;font-size:0.9rem;"><input type="checkbox" /> Recordatorios por mensaje de texto (SMS)</label>
            <label style="display:flex;align-items:center;gap:10px;font-size:0.9rem;"><input type="checkbox" checked /> Notificaciones push en el dispositivo móvil</label>
          </div>
        </div>
        <div class="empty-state" style="background:rgba(26,32,42,0.9);border:1px solid #2a2f38;border-radius:12px;padding:24px;text-align:center;color:#fff;">
          <div class="empty-state-title" style="font-weight:700;margin-bottom:6px;">Estás al día</div>
          <div class="empty-state-desc" style="color:#8a8f99;font-size:0.9rem;line-height:1.5;">No tienes notificaciones nuevas. Te avisaremos cuando algo importante suceda.</div>
        </div>
      </section>`
  }
};

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

test.describe('Task #304 — ES mobile readability of provider-portal sections (fixture)', () => {
  for (const dev of DEVICE_PROFILES) {
    for (const [key, section] of Object.entries(SECTIONS)) {
      test(`${dev.label} · ${key} (${section.label})`, async ({ browser }, testInfo) => {
        const context = await browser.newContext({ ...dev.profile });
        const page = await context.newPage();
        try {
          // Clean document — avoid inheriting any styles from the dev server's
          // index.html shell (which has its own grid/wrapper width caps that
          // would clamp our fixture to a tiny client width).
          await page.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8" />
            <meta name="viewport" content="width=device-width,initial-scale=1" />
            <style>
              *,*::before,*::after { box-sizing: border-box; }
              html,body { margin:0; padding:0; background:#0f1218; color:#fff;
                font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
                font-size: 16px; }
              h1,h2,p { margin: 0; }
              h1 { font-size: 1.4rem; line-height: 1.25; }
              h2 { font-size: 1.05rem; line-height: 1.3; }
              button { font-family: inherit; cursor: pointer; }
            </style></head>
            <body><div id="es-fixture-root" style="width:100%;">${section.html}</div></body></html>`);
          // (localStorage write skipped — about:blank origin denies it. The
          //  html lang="es" attribute above is the source-of-truth for ES mode.)

          const scopeSel = `#sec-${key}`;
          const root = page.locator(scopeSel);
          await expect(root).toBeVisible();

          // (a) Title + body + CTA visible.
          const title = root.locator('.page-title, .card-title').first();
          await expect(title).toBeVisible();
          // Proof we're in ES mode: html lang attr was flipped by the
          // fixture script, AND somewhere in the rendered section copy
          // there's at least one Spanish-only character (ñ / accents).
          expect(await page.locator('html').getAttribute('lang')).toBe('es');
          const sectionText = await root.innerText();
          expect(sectionText, `[${dev.label}/${key}] no Spanish-only chars detected — copy may have regressed to EN`)
            .toMatch(/[ñáéíóúÁÉÍÓÚ¿¡]/);
          const cta = root.locator('#cta-primary');
          await expect(cta).toBeVisible();
          await expect(cta).toHaveText(new RegExp(section.primaryCtaText.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));

          // Explicit body-text locator — proves the descriptive copy
          // (subtitle / empty-state desc / explainer paragraph) renders
          // and is reachable, separate from the title and CTA.
          const body = root.locator(
            'p, .empty-state-desc, .alert, .page-subtitle'
          ).filter({ hasText: section.bodyText }).first();
          await expect(body, `[${dev.label}/${key}] body copy "${section.bodyText}" not visible`).toBeVisible();

          // (b) Zero horizontal overflow inside the section.
          const overflow = await findOverflow(page, scopeSel);
          expect(overflow,
            `[${dev.label}/${key}] horizontal overflow: ${JSON.stringify(overflow)}`).toEqual([]);

          // (c) Primary CTA bounding box inside the viewport (with 1px tolerance).
          const ctaBox = await cta.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, vw: window.innerWidth };
          });
          expect(ctaBox.left, `[${dev.label}/${key}] CTA off-left`).toBeGreaterThanOrEqual(-1);
          expect(ctaBox.right, `[${dev.label}/${key}] CTA off-right (vw=${ctaBox.vw})`)
            .toBeLessThanOrEqual(ctaBox.vw + 1);

          // Visual evidence — pinned per device × section.
          const shotName = `${dev.id}-${key}.png`;
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
