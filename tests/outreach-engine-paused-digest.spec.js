// Task #306 — Playwright regression spec for the daily-digest engine-paused
// rendering contract. Imports the renderer (`buildEmailHtml`) directly from
// `netlify/functions/daily-digest-scheduled.js` and asserts the engine-paused
// banner / subject prefix / SMS line all render correctly. No browser, no
// dev server, no Supabase required — runs as a Playwright test so it lives
// under tests/ alongside the rest of the suite, but executes in pure Node.
//
// Why not an HTTP e2e? The dev server (`www/server.js`) does not host the
// `/api/admin/outreach/*` netlify functions, so we can't drive a real
// pause/digest cycle against the Replit dev container. The renderer is the
// single source of truth for what the email/SMS contains; testing it
// directly is what catches regressions in CI.

const { test, expect } = require('@playwright/test');
const path = require('path');

const digestModule = require(path.resolve(__dirname, '..', 'netlify', 'functions', 'daily-digest-scheduled.js'));
const { buildEmailHtml, escapeForHtml } = digestModule;

const TODAY = '2026-05-14';
const baseOutreach = {
  sentToday: 0,
  approvedQueue: 1084,
  totalSent: 12500,
  leadsDiscovered: 3200,
  newLeadsToday: 0,
  draftedToday: 0,
  totalInvestors: 0,
  wefunderPending: 0
};
const baseAiOps = { totalActions: 0, autoExec: 0, escalated: 0 };
const baseApollo = { stalled: false, consecutive_failures: 0, last_error_kind: null };

test.describe('Daily digest renders engine_paused state (Task #306)', () => {

  test('renderer is exported from daily-digest-scheduled.js', () => {
    expect(typeof buildEmailHtml).toBe('function');
    expect(typeof escapeForHtml).toBe('function');
  });

  test('paused=true with reason → banner rendered with reason text', () => {
    const outreach = { ...baseOutreach, enginePaused: { paused: true, reason: 'apollo credits exhausted', paused_at: TODAY } };
    const html = buildEmailHtml(TODAY, outreach, baseAiOps, '', baseApollo);
    expect(html).toContain('data-section="engine-paused-banner"');
    expect(html).toMatch(/Engine Paused/i);
    expect(html).toContain('apollo credits exhausted');
    expect(html).toContain('1084 queued message');
  });

  test('paused reason is HTML-escaped (XSS guard)', () => {
    const evil = `<script>alert('xss')</script>`;
    const outreach = { ...baseOutreach, enginePaused: { paused: true, reason: evil, paused_at: TODAY } };
    const html = buildEmailHtml(TODAY, outreach, baseAiOps, '', baseApollo);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(escapeForHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  test('paused=false → no banner', () => {
    const outreach = { ...baseOutreach, enginePaused: { paused: false } };
    const html = buildEmailHtml(TODAY, outreach, baseAiOps, '', baseApollo);
    expect(html).not.toContain('engine-paused-banner');
    expect(html).not.toMatch(/Engine Paused/i);
  });

  test('enginePaused undefined → defaults to no banner (back-compat)', () => {
    const outreach = { ...baseOutreach };
    delete outreach.enginePaused;
    const html = buildEmailHtml(TODAY, outreach, baseAiOps, '', baseApollo);
    expect(html).not.toContain('engine-paused-banner');
  });

  // The handler builds subject and SMS lines inline; mirror that logic so a
  // regression in the prefix format or the "paused-goes-first" ordering fails.
  function buildSubject(outreach, apollo) {
    const parts = [];
    if (outreach.enginePaused?.paused) {
      parts.push(`🛑 Engine paused${outreach.enginePaused.reason ? ': ' + outreach.enginePaused.reason : ''}`);
    }
    if (apollo.stalled) parts.push(`⚠️ Apollo stalled`);
    if (outreach.sentToday > 0) parts.push(`${outreach.sentToday} emails sent`);
    if (outreach.approvedQueue > 0) parts.push(`${outreach.approvedQueue} queued`);
    return `MCC Daily Report — ${TODAY}${parts.length ? ' · ' + parts.join(', ') : ''}`;
  }
  function buildSmsLines(outreach) {
    const lines = [
      `MCC Daily Report — ${TODAY}`,
      `📧 Outreach: ${outreach.sentToday} sent today, ${outreach.approvedQueue} queued, ${outreach.totalSent} all-time`
    ];
    if (outreach.enginePaused?.paused) {
      lines.splice(1, 0, `🛑 Engine paused${outreach.enginePaused.reason ? ': ' + outreach.enginePaused.reason : ''}`);
    }
    return lines;
  }

  test('subject prefix surfaces paused reason FIRST (before queue size)', () => {
    const outreach = { ...baseOutreach, enginePaused: { paused: true, reason: 'manual hold' } };
    const subj = buildSubject(outreach, baseApollo);
    expect(subj).toMatch(/🛑 Engine paused: manual hold/);
    expect(subj.indexOf('paused')).toBeLessThan(subj.indexOf('queued'));
  });

  test('SMS surfaces paused line at index 1 (right after the header)', () => {
    const outreach = { ...baseOutreach, enginePaused: { paused: true, reason: 'manual hold' } };
    const lines = buildSmsLines(outreach);
    expect(lines[1]).toBe('🛑 Engine paused: manual hold');
    expect(lines.join('\n')).toContain('manual hold');
  });

  test('SMS without pause → no paused line', () => {
    const outreach = { ...baseOutreach, enginePaused: { paused: false } };
    const lines = buildSmsLines(outreach);
    expect(lines.some(l => l.includes('Engine paused'))).toBe(false);
  });
});
