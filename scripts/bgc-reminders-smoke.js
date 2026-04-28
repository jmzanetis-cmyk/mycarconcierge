#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Task #113 — Smoke test for the BGC reminder + alert engine.
//
// Inserts a synthetic clear background check that expires in exactly 30 days
// against a fake provider + employee, runs the bgc-send-reminders handler
// twice, and asserts:
//
//   • exactly 1 row in bgc_notifications  (notification_type = 'reminder_30')
//   • exactly 1 row in provider_alerts    (alert_type = 'bgc_expiring')
//   • a second handler run is a no-op (dedupe works)
//
// Run with:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/bgc-reminders-smoke.js
//
// RESEND_API_KEY is intentionally NOT required: the handler runs in dry-run
// mode if it is unset, which is exactly what we want for a smoke test.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(2);
}

// Force dry-run for emails so the smoke test never hits Resend.
delete process.env.RESEND_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

const handler = require(path.join(__dirname, '..', 'netlify', 'functions', 'bgc-send-reminders.js')).handler;

function fail(msg) { console.error('FAIL:', msg); process.exit(1); }
function pass(msg) { console.log('PASS:', msg); }

async function main() {
  const stamp = Date.now();
  const providerEmail = `bgc-smoke-${stamp}@example.test`;
  const employeeEmail = `bgc-emp-${stamp}@example.test`;

  // Provider profile (uses a real auth user id would be ideal, but profiles
  // table commonly accepts arbitrary UUIDs in dev). We use a random uuid.
  const providerId = (require('crypto').randomUUID());
  const employeeId = (require('crypto').randomUUID());
  const checkId    = (require('crypto').randomUUID());

  console.log('Seeding synthetic provider', providerId);

  // 1. Provider profile.
  const { error: pErr } = await supabase.from('profiles').insert({
    id: providerId,
    email: providerEmail,
    full_name: 'BGC Smoke Provider',
    business_name: 'Smoke Test Garage',
    role: 'provider'
  });
  if (pErr) fail('insert profile: ' + pErr.message);

  // 2. Employee.
  const { error: eErr } = await supabase.from('provider_employees').insert({
    id: employeeId,
    provider_id: providerId,
    first_name: 'Smoke',
    last_name: 'Test',
    email: employeeEmail
  });
  if (eErr) { await cleanup(); fail('insert employee: ' + eErr.message); }

  // 3. Clear check expiring in exactly 30 days at start-of-day UTC.
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);
  expiresAt.setUTCHours(12, 0, 0, 0);

  const { error: cErr } = await supabase.from('employee_background_checks').insert({
    id: checkId,
    employee_id: employeeId,
    provider_id: providerId,
    status: 'clear',
    is_current: true,
    expires_at: expiresAt.toISOString()
  });
  if (cErr) { await cleanup(); fail('insert check: ' + cErr.message); }

  // 4. Run handler — first invocation should create 1 notification + 1 alert.
  const r1 = await handler({});
  console.log('Run 1 →', r1.body);

  const { data: notifs1 } = await supabase
    .from('bgc_notifications')
    .select('id, notification_type')
    .eq('employee_id', employeeId)
    .eq('bgc_check_id', checkId);
  const { data: alerts1 } = await supabase
    .from('provider_alerts')
    .select('id, alert_type, severity')
    .eq('provider_id', providerId)
    .is('resolved_at', null);

  // In dry-run (no Resend key), the handler still writes the dedupe row
  // because no email was actually sent. So we expect exactly 1.
  if ((notifs1 || []).length !== 1) { await cleanup(); fail(`expected 1 notification after run 1, got ${notifs1?.length}`); }
  if ((notifs1 || [])[0].notification_type !== 'reminder_30') { await cleanup(); fail('wrong notification_type: ' + notifs1[0].notification_type); }
  if ((alerts1 || []).length !== 1) { await cleanup(); fail(`expected 1 alert after run 1, got ${alerts1?.length}`); }
  if ((alerts1 || [])[0].alert_type !== 'bgc_expiring') { await cleanup(); fail('wrong alert_type: ' + alerts1[0].alert_type); }
  if ((alerts1 || [])[0].severity !== 'warning') { await cleanup(); fail('wrong severity: ' + alerts1[0].severity); }
  pass('run 1 created 1 reminder_30 notification + 1 bgc_expiring alert (warning)');

  // 5. Run handler again — should be a no-op (dedupe).
  const r2 = await handler({});
  console.log('Run 2 →', r2.body);

  const { data: notifs2 } = await supabase
    .from('bgc_notifications')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('bgc_check_id', checkId);
  const { data: alerts2 } = await supabase
    .from('provider_alerts')
    .select('id')
    .eq('provider_id', providerId)
    .is('resolved_at', null);

  if ((notifs2 || []).length !== 1) { await cleanup(); fail(`expected 1 notification after run 2 (dedupe), got ${notifs2?.length}`); }
  if ((alerts2 || []).length !== 1) { await cleanup(); fail(`expected 1 alert after run 2 (dedupe), got ${alerts2?.length}`); }
  pass('run 2 was a no-op (dedupe held)');

  await cleanup();
  console.log('\nSMOKE TEST OK');
  process.exit(0);

  async function cleanup() {
    await supabase.from('bgc_notifications').delete().eq('employee_id', employeeId);
    await supabase.from('provider_alerts').delete().eq('provider_id', providerId);
    await supabase.from('employee_background_checks').delete().eq('id', checkId);
    await supabase.from('provider_employees').delete().eq('id', employeeId);
    await supabase.from('profiles').delete().eq('id', providerId);
  }
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
