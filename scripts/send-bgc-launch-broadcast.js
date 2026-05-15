#!/usr/bin/env node
 
// ─────────────────────────────────────────────────────────────────────────────
// Task #164 — Send the MCC Verified launch announcement emails to customers
// and providers via Resend.
//
// What it does:
//   • Segments recipients via the `profiles` table:
//       customer audience → role IN ('member', 'pending_member')
//       provider audience → role IN ('provider', 'pending_provider')
//   • Honors suppressions:
//       - email_unsubscribes (global suppression list)
//       - outreach_leads.status IN ('unsubscribed', 'bounced')
//       - member_notification_preferences.marketing_emails = false
//       - bgc_launch_email_sends (per-audience dedupe across reruns)
//   • Renders www/email-templates/bgc-launch-customer.html and
//     bgc-launch-provider.html with first_name / provider_name / browse_url /
//     get_verified_url / unsubscribe_url merged in.
//   • Sends through Resend (https://api.resend.com/emails) with a
//     List-Unsubscribe header for one-click unsubscribe.
//   • Logs every send into bgc_launch_email_sends so:
//       - retries skip already-sent recipients,
//       - the existing Resend webhook can flip rows to bounced/complained.
//
// Required env:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY                  (omit in --dry-run mode)
//
// Optional env:
//   PUBLIC_BASE_URL                 default https://www.mycarconcierge.com
//   LAUNCH_FROM_ADDRESS             default "My Car Concierge <noreply@mycarconcierge.com>"
//
// CLI flags:
//   --audience=members|providers|both     default both
//   --dry-run                              do everything except send + log
//   --preview-to=email[,email...]          send a single preview of each
//                                          template to the given team
//                                          address(es) — does NOT touch the
//                                          live recipient lists
//   --limit=N                              cap the number of recipients per
//                                          audience (useful for staged sends)
//   --rate=N                               throttle: max sends per second
//                                          (default 8 — well under the
//                                          Resend default of 10 rps)
//   --verbose                              log per-recipient lines
//
// Usage:
//   # Always start with a team preview before pulling the trigger.
//   node scripts/send-bgc-launch-broadcast.js --preview-to=team@mycarconcierge.com
//
//   # Then dry-run the full broadcast to see who would receive it.
//   node scripts/send-bgc-launch-broadcast.js --dry-run
//
//   # Real broadcast.
//   node scripts/send-bgc-launch-broadcast.js
//
// Apply www/migrations/launch_email_broadcast.sql before the first run.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

// ----------------------------- CLI parsing ---------------------------------
function parseArgs(argv) {
  const out = { audience: 'both', dryRun: false, previewTo: [], limit: null, rate: 8, verbose: false, continueAfterPreview: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--verbose') out.verbose = true;
    else if (arg === '--continue') out.continueAfterPreview = true;
    else if (arg.startsWith('--audience=')) out.audience = arg.split('=')[1];
    else if (arg.startsWith('--preview-to=')) out.previewTo = arg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean);
    else if (arg.startsWith('--limit=')) out.limit = Math.max(1, Number.parseInt(arg.split('=')[1], 10) || 0);
    else if (arg.startsWith('--rate=')) out.rate = Math.max(1, Number.parseInt(arg.split('=')[1], 10) || 0);
    else if (arg === '--help' || arg === '-h') { printHelp(); process.exit(0); }
    else { console.error('Unknown flag:', arg); printHelp(); process.exit(2); }
  }
  if (!['members', 'providers', 'both'].includes(out.audience)) {
    console.error('--audience must be one of: members, providers, both');
    process.exit(2);
  }
  return out;
}

function printHelp() {
  console.log(`
Send the MCC Verified launch announcement.

  --audience=members|providers|both   default both
  --dry-run                           render + segment but do not send
  --preview-to=a@x,b@y                send a preview of each template
                                       (exits after previews unless
                                        --continue is also passed)
  --continue                          when combined with --preview-to,
                                       proceeds to the live broadcast
                                       after the previews succeed
  --limit=N                           cap recipients per audience
  --rate=N                            throttle (sends/sec, default 8)
  --verbose                           per-recipient log lines
`);
}

// ----------------------------- Constants -----------------------------------
const { BGC_PRICE_DISPLAY } = require('../lib/bgc-pricing');

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://www.mycarconcierge.com').replace(/\/$/, '');
const FROM_ADDRESS = process.env.LAUNCH_FROM_ADDRESS || 'My Car Concierge <noreply@mycarconcierge.com>';
const BROWSE_URL = `${PUBLIC_BASE_URL}/providers-directory.html?verified=true`;
const GET_VERIFIED_URL = `${PUBLIC_BASE_URL}/providers.html#bgc-state-card`;

const TEMPLATES_DIR = path.join(__dirname, '..', 'www', 'email-templates');
const CUSTOMER_TEMPLATE = path.join(TEMPLATES_DIR, 'bgc-launch-customer.html');
const PROVIDER_TEMPLATE = path.join(TEMPLATES_DIR, 'bgc-launch-provider.html');
const CUSTOMER_TEMPLATE_ES = path.join(TEMPLATES_DIR, 'bgc-launch-customer-es.html');
const PROVIDER_TEMPLATE_ES = path.join(TEMPLATES_DIR, 'bgc-launch-provider-es.html');

// Recipients with profiles.preferred_language === 'es' get the Spanish
// template + subject. Anything else (including null) falls back to English.
function pickLanguage(profile) {
  const pref = (profile && profile.preferred_language || '').toLowerCase();
  return pref === 'es' ? 'es' : 'en';
}

// Default opt-out preference for the customer audience: members are skipped
// only when they have explicitly set marketing_emails = false. A missing row
// still receives the broadcast (one-time launch announcement). This matches
// `getMemberNotificationPreferences` behavior in www/server.js.

// ----------------------------- Helpers -------------------------------------
function loadTemplate(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  // Strip the editorial HTML comment header so it never leaks into inboxes.
  return raw.replace(/^<!--[\s\S]*?-->\s*/, '');
}

function renderTemplate(template, vars) {
  return template.replaceAll(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}

function extractMeta(template, name) {
  const m = template.match(new RegExp(`<meta[^>]+name="${name}"[^>]+content="([^"]+)"`, 'i'));
  return m ? m[1] : '';
}

function pickFirstName(profile) {
  const fn = (profile.first_name || '').trim();
  if (fn) return fn;
  const full = (profile.full_name || '').trim();
  if (full) return full.split(/\s+/)[0];
  return 'there';
}

function pickProviderName(profile) {
  const biz = (profile.business_name || '').trim();
  if (biz) return biz;
  const full = (profile.full_name || '').trim();
  if (full) return full;
  const fn = (profile.first_name || '').trim();
  if (fn) return fn;
  return 'there';
}

function unsubscribeUrlFor(email, audience) {
  const params = new URLSearchParams({ email, source: `launch_${audience}` });
  return `${PUBLIC_BASE_URL}/unsubscribe?${params.toString()}`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ----------------------------- Resend send ---------------------------------
async function resendSend({ apiKey, from, to, subject, html, headers }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to, subject, html, headers })
  });
  const text = await resp.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!resp.ok) {
    return { ok: false, status: resp.status, error: body };
  }
  return { ok: true, id: body.id || null, body };
}

// ----------------------------- Audience segmentation -----------------------
async function loadSuppressions(supabase) {
  const suppressed = new Set();
  let cursor = null;
  while (true) {
    let q = supabase.from('email_unsubscribes').select('email').limit(1000);
    if (cursor) q = q.gt('email', cursor);
    q = q.order('email', { ascending: true });
    const { data, error } = await q;
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        console.warn('[WARN] email_unsubscribes table missing — apply www/migrations/launch_email_broadcast.sql first.');
        break;
      }
      throw error;
    }
    if (!data || data.length === 0) break;
    for (const row of data) suppressed.add((row.email || '').toLowerCase());
    cursor = data[data.length - 1].email;
    if (data.length < 1000) break;
  }
  return suppressed;
}

async function loadOutreachOptOuts(supabase) {
  const out = new Set();
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('outreach_leads')
      .select('email, status')
      .in('status', ['unsubscribed', 'bounced'])
      .range(from, from + page - 1);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') break;
      throw error;
    }
    if (!data || data.length === 0) break;
    for (const row of data) if (row.email) out.add(row.email.toLowerCase());
    if (data.length < page) break;
    from += page;
  }
  return out;
}

async function loadAlreadySent(supabase, audience) {
  const sent = new Set();
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('bgc_launch_email_sends')
      .select('email, status')
      .eq('audience', audience)
      .neq('status', 'failed')
      .range(from, from + page - 1);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') break;
      throw error;
    }
    if (!data || data.length === 0) break;
    for (const row of data) if (row.email) sent.add(row.email.toLowerCase());
    if (data.length < page) break;
    from += page;
  }
  return sent;
}

async function loadMembers(supabase) {
  const all = [];
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, full_name, role, preferred_language')
      .in('role', ['member', 'pending_member'])
      .not('email', 'is', null)
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return all;
}

async function loadProviders(supabase) {
  const all = [];
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, full_name, business_name, role, preferred_language')
      .in('role', ['provider', 'pending_provider'])
      .not('email', 'is', null)
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return all;
}

async function loadMarketingOptOuts(supabase) {
  const out = new Set();
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('member_notification_preferences')
      .select('member_id, marketing_emails')
      .eq('marketing_emails', false)
      .range(from, from + page - 1);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') break;
      throw error;
    }
    if (!data || data.length === 0) break;
    for (const row of data) if (row.member_id) out.add(row.member_id);
    if (data.length < page) break;
    from += page;
  }
  return out;
}

// ----------------------------- Broadcast core ------------------------------
// Walk the audience profiles once and bucket each into either an eligible
// send target or a skip-reason counter. Pure function — returns the
// eligible[] list and the recorded skip stats.
function _filterEligibleRecipients({ profiles, audience, suppressedEmails, marketingOptOutMemberIds, alreadySent }) {
  const skipReasons = {};
  let skipped = 0;
  const recordSkip = reason => { skipReasons[reason] = (skipReasons[reason] || 0) + 1; skipped++; };

  const seenEmails = new Set();
  const eligible = [];
  for (const profile of profiles) {
    const rawEmail = (profile.email || '').trim();
    if (!rawEmail) { recordSkip('no_email'); continue; }
    const email = rawEmail.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { recordSkip('invalid_email'); continue; }
    if (seenEmails.has(email)) { recordSkip('duplicate_in_audience'); continue; }
    seenEmails.add(email);
    if (suppressedEmails.has(email)) { recordSkip('suppressed'); continue; }
    if (alreadySent.has(email)) { recordSkip('already_sent'); continue; }
    if (audience === 'customer' && marketingOptOutMemberIds.has(profile.id)) { recordSkip('marketing_opt_out'); continue; }
    eligible.push({ profile, email });
  }
  return { eligible, skipped, skipReasons };
}

// Send one rendered message and persist the per-message audit row. Updates
// the shared counters in place.
async function _sendAndLogOne({ supabase, audience, apiKey, subject, profile, email, mergeVars, html, counters, args }) {
  const result = await resendSend({
    apiKey,
    from: FROM_ADDRESS,
    to: email,
    subject,
    html,
    headers: {
      'List-Unsubscribe': `<${mergeVars.unsubscribe_url}>, <mailto:unsubscribe@mycarconcierge.com?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-MCC-Broadcast': `bgc-launch-${audience}`
    }
  });

  if (result.ok) {
    counters.sent++;
    if (args.verbose) console.log(`[${audience}] sent → ${email} (id=${result.id})`);
    const { error: insErr } = await supabase.from('bgc_launch_email_sends').insert({
      audience,
      recipient_id: profile.id || null,
      email,
      resend_message_id: result.id,
      merge_vars: mergeVars,
      status: 'sent'
    });
    if (insErr && insErr.code !== '23505') {
      console.warn(`[${audience}] send-log insert failed for ${email}: ${insErr.message}`);
    }
    return;
  }
  counters.failed++;
  console.error(`[${audience}] FAILED → ${email}: ${JSON.stringify(result.error)}`);
  const { error: insErr } = await supabase.from('bgc_launch_email_sends').insert({
    audience,
    recipient_id: profile.id || null,
    email,
    merge_vars: mergeVars,
    status: 'failed',
    error_message: typeof result.error === 'string' ? result.error : JSON.stringify(result.error).slice(0, 800)
  });
  if (insErr && insErr.code !== '23505') {
    console.warn(`[${audience}] failure-log insert failed for ${email}: ${insErr.message}`);
  }
}

async function broadcast({ supabase, args, audience, profiles, templates, subjects, mergeVarsFor, suppressedEmails, marketingOptOutMemberIds, alreadySent }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!args.dryRun && !apiKey) {
    throw new Error('RESEND_API_KEY is required (or pass --dry-run).');
  }

  const intervalMs = Math.max(1, Math.floor(1000 / Math.max(1, args.rate)));
  const { eligible, skipped, skipReasons } = _filterEligibleRecipients({
    profiles, audience, suppressedEmails, marketingOptOutMemberIds, alreadySent
  });
  const counters = { eligible: eligible.length, skipped, sent: 0, failed: 0, dryRun: 0, byLanguage: { en: 0, es: 0 } };

  console.log(`[${audience}] eligible=${eligible.length} skipped=${skipped} totalProfiles=${profiles.length}`);
  if (Object.keys(skipReasons).length) {
    console.log(`[${audience}] skip reasons: ${JSON.stringify(skipReasons)}`);
  }

  const queue = args.limit ? eligible.slice(0, args.limit) : eligible;
  if (args.limit && eligible.length > args.limit) {
    console.log(`[${audience}] --limit=${args.limit} → sending to ${queue.length} of ${eligible.length} eligible recipients`);
  }

  for (const { profile, email } of queue) {
    const lang = pickLanguage(profile);
    const template = templates[lang] || templates.en;
    const subject = subjects[lang] || subjects.en;
    const mergeVars = mergeVarsFor(profile, email);
    const html = renderTemplate(template, mergeVars);
    counters.byLanguage[lang] = (counters.byLanguage[lang] || 0) + 1;

    if (args.dryRun) {
      counters.dryRun++;
      if (args.verbose) console.log(`[${audience}] DRY-RUN → ${email} lang=${lang} (${JSON.stringify(mergeVars)})`);
      continue;
    }

    await _sendAndLogOne({ supabase, audience, apiKey, subject, profile, email, mergeVars, html, counters, args });
    await sleep(intervalMs);
  }

  return counters;
}

// ----------------------------- Preview send --------------------------------
// Sends BOTH the EN and ES variants of each template to every preview address
// so the operator can sanity-check both subject lines / bodies before pulling
// the trigger on the live broadcast.
async function sendPreviews({ args, customerTemplates, customerSubjects, providerTemplates, providerSubjects }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is required for previews.');

  const fakeFirstName = 'Jordan';
  const fakeProviderName = 'Sample Garage Co.';

  for (const to of args.previewTo) {
    const customerVars = {
      first_name: fakeFirstName,
      browse_url: BROWSE_URL,
      unsubscribe_url: unsubscribeUrlFor(to, 'customer')
    };
    const providerVars = {
      provider_name: fakeProviderName,
      get_verified_url: GET_VERIFIED_URL,
      unsubscribe_url: unsubscribeUrlFor(to, 'provider'),
      bgc_price: BGC_PRICE_DISPLAY
    };

    for (const lang of ['en', 'es']) {
      const customerHtml = renderTemplate(customerTemplates[lang], customerVars);
      const providerHtml = renderTemplate(providerTemplates[lang], providerVars);

      const r1 = await resendSend({
        apiKey,
        from: FROM_ADDRESS,
        to,
        subject: `[PREVIEW ${lang.toUpperCase()}] ${customerSubjects[lang]}`,
        html: customerHtml,
        headers: { 'X-MCC-Broadcast': `bgc-launch-preview-customer-${lang}` }
      });
      const r1Status = r1.ok ? `sent id=${r1.id}` : `FAILED ${JSON.stringify(r1.error)}`;
      console.log(`[preview] customer (${lang}) → ${to}: ${r1Status}`);

      const r2 = await resendSend({
        apiKey,
        from: FROM_ADDRESS,
        to,
        subject: `[PREVIEW ${lang.toUpperCase()}] ${providerSubjects[lang]}`,
        html: providerHtml,
        headers: { 'X-MCC-Broadcast': `bgc-launch-preview-provider-${lang}` }
      });
      const r2Status = r2.ok ? `sent id=${r2.id}` : `FAILED ${JSON.stringify(r2.error)}`;
      console.log(`[preview] provider (${lang}) → ${to}: ${r2Status}`);
    }
  }
}

// ----------------------------- Entrypoint ----------------------------------
async function main() {
  const args = parseArgs(process.argv);

  const customerTemplates = {
    en: loadTemplate(CUSTOMER_TEMPLATE),
    es: loadTemplate(CUSTOMER_TEMPLATE_ES)
  };
  const providerTemplates = {
    en: loadTemplate(PROVIDER_TEMPLATE),
    es: loadTemplate(PROVIDER_TEMPLATE_ES)
  };
  const customerSubjects = {
    en: extractMeta(customerTemplates.en, 'x-resend-subject') ||
      'Now you can see which providers are background-checked',
    es: extractMeta(customerTemplates.es, 'x-resend-subject') ||
      'Ya puedes ver qué proveedores tienen verificación de antecedentes'
  };
  const providerSubjects = {
    en: extractMeta(providerTemplates.en, 'x-resend-subject') ||
      'Introducing MCC Verified — earn the badge that wins more bids',
    es: extractMeta(providerTemplates.es, 'x-resend-subject') ||
      'Presentamos MCC Verificado — obtén la insignia que gana más ofertas'
  };

  if (args.previewTo.length > 0) {
    console.log(`Sending previews to: ${args.previewTo.join(', ')}`);
    await sendPreviews({ args, customerTemplates, customerSubjects, providerTemplates, providerSubjects });
    if (!args.continueAfterPreview) {
      // Default behavior: exit after previews so the operator can review
      // them in their inbox before pulling the trigger on the live blast.
      // Pass --continue to chain straight into the broadcast.
      console.log('Preview complete. Re-run without --preview-to (or add --continue) to broadcast.');
      return;
    }
    console.log('--continue flag set — proceeding to live broadcast after previews.');
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(2);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  console.log(`Mode: ${args.dryRun ? 'DRY-RUN' : 'LIVE'} | audience=${args.audience} | rate=${args.rate}/sec | base=${PUBLIC_BASE_URL}`);

  console.log('Loading suppression lists…');
  const [globalSupp, outreachOptOuts, marketingOptOuts] = await Promise.all([
    loadSuppressions(supabase),
    loadOutreachOptOuts(supabase),
    loadMarketingOptOuts(supabase)
  ]);
  const suppressedEmails = new Set([...globalSupp, ...outreachOptOuts]);
  console.log(`Suppression set: ${suppressedEmails.size} emails (global=${globalSupp.size}, outreach=${outreachOptOuts.size}); marketing opt-outs (members): ${marketingOptOuts.size}`);

  const summary = {};

  if (args.audience === 'members' || args.audience === 'both') {
    console.log('Loading members…');
    const members = await loadMembers(supabase);
    const alreadySent = await loadAlreadySent(supabase, 'customer');
    console.log(`Members loaded: ${members.length} (already sent: ${alreadySent.size})`);
    summary.customer = await broadcast({
      supabase, args,
      audience: 'customer',
      profiles: members,
      templates: customerTemplates,
      subjects: customerSubjects,
      suppressedEmails,
      marketingOptOutMemberIds: marketingOptOuts,
      alreadySent,
      mergeVarsFor: (profile, email) => ({
        first_name: pickFirstName(profile),
        browse_url: BROWSE_URL,
        unsubscribe_url: unsubscribeUrlFor(email, 'customer')
      })
    });
  }

  if (args.audience === 'providers' || args.audience === 'both') {
    console.log('Loading providers…');
    const providers = await loadProviders(supabase);
    const alreadySent = await loadAlreadySent(supabase, 'provider');
    console.log(`Providers loaded: ${providers.length} (already sent: ${alreadySent.size})`);
    summary.provider = await broadcast({
      supabase, args,
      audience: 'provider',
      profiles: providers,
      templates: providerTemplates,
      subjects: providerSubjects,
      suppressedEmails,
      marketingOptOutMemberIds: new Set(), // marketing opt-out check is members-only
      alreadySent,
      mergeVarsFor: (profile, email) => ({
        provider_name: pickProviderName(profile),
        get_verified_url: GET_VERIFIED_URL,
        unsubscribe_url: unsubscribeUrlFor(email, 'provider'),
        bgc_price: BGC_PRICE_DISPLAY
      })
    });
  }

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main().catch(err => {
    console.error('FATAL:', err.stack || err.message || err);
    process.exit(1);
  });
}

module.exports = { renderTemplate, pickFirstName, pickProviderName, pickLanguage, unsubscribeUrlFor, extractMeta, loadTemplate, main };
