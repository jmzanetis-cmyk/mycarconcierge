#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * backfill-provider-application-outreach-links.js
 * ------------------------------------------------
 * One-shot maintenance script: connect historical `provider_applications` rows
 * to their originating `outreach_leads` row by matching on email or phone.
 *
 * Why: Task #134 added the `provider_applications.outreach_lead_id` column and
 * the `trg_auto_link_outreach_lead` trigger so that NEW provider signups get
 * auto-attributed back to the cold-outreach lead they came from. But every
 * provider_application created before that migration was deployed has
 * `outreach_lead_id = NULL`, so we can't measure the "lead -> application"
 * conversion rate for any historical data. This script fills those in using
 * the SAME predicates the live trigger uses (see `auto_link_outreach_lead` in
 * supabase/migrations/20260425_outreach_crm_bridge.sql lines 122-170).
 *
 * Trigger parity (must match):
 *   - Lead must have `crm_profile_id IS NULL` (not yet attributed to a profile)
 *   - Lead must have `crm_sync_status != 'duplicate'`
 *   - Email match: case-insensitive (ilike)
 *   - Phone match: exact string equality on whatever was stored
 *   - Email match wins over phone match
 *   - Oldest lead wins on ties
 *
 * PREREQUISITE: supabase/migrations/20260425_outreach_crm_bridge.sql must be
 * applied in the Supabase SQL Editor first (the column has to exist).
 *
 * Behavior:
 *   - Idempotent. Only touches rows where outreach_lead_id IS NULL. Re-running
 *     is safe and produces a row count of 0 matches on the second run.
 *   - Dry-run by default. Pass `--apply` to actually write.
 *   - Pagination uses (created_at, id) keyset to avoid skipping rows that
 *     share a created_at timestamp at a page boundary.
 *
 * Usage:
 *   node scripts/backfill-provider-application-outreach-links.js          # dry-run
 *   node scripts/backfill-provider-application-outreach-links.js --apply  # write
 *
 * Env required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const PAGE = 500;

function normEmail(e) {
  return (e || '').trim().toLowerCase() || null;
}
function normPhone(p) {
  // Match the auto-link trigger: exact-string match on whatever was stored.
  // We intentionally do NOT digit-normalize, because the trigger doesn't.
  const v = (p || '').trim();
  return v || null;
}

// Look up a candidate outreach_leads row that satisfies the same predicates
// as the live `auto_link_outreach_lead` trigger:
//   crm_profile_id IS NULL AND crm_sync_status != 'duplicate'
// AND matches the given email/phone, oldest first. Email is queried FIRST as
// its own request (deterministic) before falling back to phone.
async function findCandidateLead(supabase, email, phone) {
  const sel = 'id, email, phone, created_at, crm_profile_id, crm_sync_status';

  if (email) {
    const { data, error } = await supabase
      .from('outreach_leads')
      .select(sel)
      .ilike('email', email)
      .is('crm_profile_id', null)
      .neq('crm_sync_status', 'duplicate')
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) throw error;
    if (data && data.length > 0) return { lead: data[0], matchedOn: 'email' };
  }

  if (phone) {
    const { data, error } = await supabase
      .from('outreach_leads')
      .select(sel)
      .eq('phone', phone)
      .is('crm_profile_id', null)
      .neq('crm_sync_status', 'duplicate')
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) throw error;
    if (data && data.length > 0) return { lead: data[0], matchedOn: 'phone' };
  }

  return null;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Fast preflight: confirm the column exists. If the migration hasn't been
  // applied yet, fail loudly rather than scanning thousands of rows.
  {
    const { error } = await supabase
      .from('provider_applications')
      .select('outreach_lead_id')
      .limit(1);
    if (error && /column .*outreach_lead_id.* does not exist/i.test(error.message || '')) {
      console.error(
        '\n  ✗ provider_applications.outreach_lead_id column is missing.\n' +
        '    Apply supabase/migrations/20260425_outreach_crm_bridge.sql in the\n' +
        '    Supabase SQL Editor first, then re-run this script.\n'
      );
      process.exit(2);
    }
    if (error) {
      console.error('Preflight query failed:', error.message);
      process.exit(1);
    }
  }

  console.log(`Mode: ${APPLY ? 'APPLY (writes enabled)' : 'DRY-RUN (no writes; pass --apply to commit)'}`);

  const stats = {
    scanned: 0,
    matched_by_email: 0,
    matched_by_phone: 0,
    skipped_no_contact: 0,
    skipped_no_match: 0,
    written: 0,
    errors: 0
  };

  // Page through provider_applications where outreach_lead_id IS NULL using
  // a (created_at, id) keyset cursor so rows that share a timestamp at a page
  // boundary are not skipped.
  let cursorTs = null;
  let cursorId = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase
      .from('provider_applications')
      .select('id, email, phone, created_at, outreach_lead_id')
      .is('outreach_lead_id', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE);
    if (cursorTs) {
      // (created_at > cursorTs) OR (created_at = cursorTs AND id > cursorId)
      q = q.or(`created_at.gt.${cursorTs},and(created_at.eq.${cursorTs},id.gt.${cursorId})`);
    }

    const { data: apps, error } = await q;
    if (error) {
      console.error('Page query failed:', error.message);
      stats.errors++;
      break;
    }
    if (!apps || apps.length === 0) break;

    for (const app of apps) {
      stats.scanned++;
      cursorTs = app.created_at;
      cursorId = app.id;

      const email = normEmail(app.email);
      const phone = normPhone(app.phone);
      if (!email && !phone) { stats.skipped_no_contact++; continue; }

      let candidate;
      try {
        candidate = await findCandidateLead(supabase, email, phone);
      } catch (e) {
        console.error(`  app ${app.id}: lead lookup failed: ${e.message || e}`);
        stats.errors++;
        continue;
      }

      if (!candidate) { stats.skipped_no_match++; continue; }

      if (candidate.matchedOn === 'email') stats.matched_by_email++;
      else stats.matched_by_phone++;

      if (!APPLY) {
        if ((stats.matched_by_email + stats.matched_by_phone) <= 10) {
          console.log(`  [dry] app ${app.id} -> lead ${candidate.lead.id} (matched on ${candidate.matchedOn})`);
        }
        continue;
      }

      const { error: updErr } = await supabase
        .from('provider_applications')
        .update({ outreach_lead_id: candidate.lead.id })
        .eq('id', app.id)
        .is('outreach_lead_id', null); // re-check NULL — concurrent trigger safety
      if (updErr) {
        console.error(`  app ${app.id}: update failed: ${updErr.message}`);
        stats.errors++;
        continue;
      }
      stats.written++;
      if (stats.written % 50 === 0) console.log(`  ...wrote ${stats.written}`);
    }

    if (apps.length < PAGE) break;
  }

  console.log('\nSummary:');
  console.log(JSON.stringify(stats, null, 2));
  const totalMatched = stats.matched_by_email + stats.matched_by_phone;
  if (!APPLY && totalMatched > 0) {
    console.log(`\n${totalMatched} potential matches found. Re-run with --apply to commit.`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
