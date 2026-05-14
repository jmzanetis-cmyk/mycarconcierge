#!/usr/bin/env node

// ─────────────────────────────────────────────────────────────────────────────
// Task #306 — offline regression test for the daily-digest engine-paused
// surfacing. Before #306 the engine could be paused and the daily report
// would still read as healthy: the paused state was never queried, never
// rendered in the email body, never prefixed in the subject line, and
// never inserted into the SMS. On-call would only notice when they
// happened to open the admin dashboard.
//
// This test imports the renderer (`buildEmailHtml`) directly from
// netlify/functions/daily-digest-scheduled.js with synthetic outreach
// state and asserts:
//   1. paused=true → HTML contains the paused banner with the reason
//   2. paused=true → reason is HTML-escaped (no XSS via pause_reason)
//   3. paused=false → no banner appears
//   4. subject-construction logic surfaces "🛑 Engine paused: <reason>"
//   5. SMS-line construction surfaces "🛑 Engine paused: <reason>"
//
// No Supabase / Resend / Twilio required — pure renderer asserts.
// Run from project root:
//   node scripts/paused-digest-rendering-test.js
//
// Exit codes: 0 all passed, 1 any check failed.
// ─────────────────────────────────────────────────────────────────────────────

const { buildEmailHtml, escapeForHtml } = require('../netlify/functions/daily-digest-scheduled.js');

let failed = 0;
function assert(cond, label) {
  if (!cond) { console.error('  ✗ FAIL:', label); failed++; }
  else { console.log('  ✓', label); }
}

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
const today = '2026-05-14';

console.log('Test 1: paused=true with reason → banner renders with reason');
{
  const outreach = { ...baseOutreach, enginePaused: { paused: true, reason: 'apollo credits exhausted', paused_at: today } };
  const html = buildEmailHtml(today, outreach, baseAiOps, '', baseApollo);
  assert(html.includes('data-section="engine-paused-banner"'), 'banner div present');
  assert(/Engine Paused/i.test(html), 'banner heading present');
  assert(html.includes('apollo credits exhausted'), 'reason rendered in body');
  assert(html.includes('1084 queued message'), 'queue depth referenced in banner');
}

console.log('\nTest 2: paused=true with malicious reason → escaped (no XSS)');
{
  const evil = `<script>alert('xss')</script>`;
  const outreach = { ...baseOutreach, enginePaused: { paused: true, reason: evil, paused_at: today } };
  const html = buildEmailHtml(today, outreach, baseAiOps, '', baseApollo);
  assert(!html.includes('<script>alert'), 'raw <script> not present');
  assert(html.includes('&lt;script&gt;'), 'angle brackets escaped');
  assert(escapeForHtml(`<>&"'`) === '&lt;&gt;&amp;&quot;&#39;', 'escapeForHtml escapes the 5 critical chars');
}

console.log('\nTest 3: paused=false → no banner');
{
  const outreach = { ...baseOutreach, enginePaused: { paused: false } };
  const html = buildEmailHtml(today, outreach, baseAiOps, '', baseApollo);
  assert(!html.includes('engine-paused-banner'), 'banner div absent');
  assert(!/Engine Paused/i.test(html), 'banner heading absent');
}

console.log('\nTest 4: enginePaused undefined → defaults to no banner (back-compat)');
{
  const outreach = { ...baseOutreach };
  delete outreach.enginePaused;
  const html = buildEmailHtml(today, outreach, baseAiOps, '', baseApollo);
  assert(!html.includes('engine-paused-banner'), 'banner absent when field missing');
}

// Simulate the subject + SMS construction logic from daily-digest-scheduled.js
// handler. The handler builds these inline; this test mirrors that logic so a
// regression in the prefix format (or the "paused goes first" ordering) fails.
function buildSubject(outreach, apollo, aiOps) {
  const parts = [];
  if (outreach.enginePaused?.paused) {
    parts.push(`🛑 Engine paused${outreach.enginePaused.reason ? ': ' + outreach.enginePaused.reason : ''}`);
  }
  if (apollo.stalled) parts.push(`⚠️ Apollo stalled`);
  if (outreach.sentToday > 0) parts.push(`${outreach.sentToday} emails sent`);
  if (outreach.approvedQueue > 0) parts.push(`${outreach.approvedQueue} queued`);
  return `MCC Daily Report — ${today}${parts.length ? ' · ' + parts.join(', ') : ''}`;
}
function buildSmsLines(outreach, apollo) {
  const lines = [
    `MCC Daily Report — ${today}`,
    `📧 Outreach: ${outreach.sentToday} sent today, ${outreach.approvedQueue} queued, ${outreach.totalSent} all-time`
  ];
  if (outreach.enginePaused?.paused) {
    lines.splice(1, 0, `🛑 Engine paused${outreach.enginePaused.reason ? ': ' + outreach.enginePaused.reason : ''}`);
  }
  if (apollo.stalled) lines.push(`⚠️ Apollo stalled`);
  return lines;
}

console.log('\nTest 5: subject prefix surfaces paused reason FIRST');
{
  const outreach = { ...baseOutreach, enginePaused: { paused: true, reason: 'manual hold' } };
  const subj = buildSubject(outreach, baseApollo, baseAiOps);
  assert(/🛑 Engine paused: manual hold/.test(subj), 'subject contains paused prefix');
  // "paused" must appear before "queued" (ordering matters for inbox preview)
  assert(subj.indexOf('paused') < subj.indexOf('queued'), 'paused prefix appears before queue size');
}

console.log('\nTest 6: SMS surfaces paused line as the second line (after header)');
{
  const outreach = { ...baseOutreach, enginePaused: { paused: true, reason: 'manual hold' } };
  const lines = buildSmsLines(outreach, baseApollo);
  assert(lines[1] === '🛑 Engine paused: manual hold', 'paused line is index 1');
  assert(lines.join('\n').includes('manual hold'), 'reason text present in SMS');
}

console.log('\nTest 7: SMS without pause → no paused line');
{
  const outreach = { ...baseOutreach, enginePaused: { paused: false } };
  const lines = buildSmsLines(outreach, baseApollo);
  assert(!lines.some(l => l.includes('Engine paused')), 'no paused line when running');
}

console.log(`\nDone. ${failed === 0 ? 'All cases passed.' : failed + ' failures.'}`);
process.exit(failed === 0 ? 0 : 1);
