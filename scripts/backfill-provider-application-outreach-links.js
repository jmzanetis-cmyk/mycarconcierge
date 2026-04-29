#!/usr/bin/env node
 

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
 * AMBIGUITY (backfill-only):
 *   The live trigger fires once per signup and just picks the oldest matching
 *   lead — it has no second chance. The backfill, however, is a one-shot pass
 *   over historical data, so wrong attribution is permanent. To avoid that, we
 *   detect when MORE THAN ONE distinct lead matches a given application
 *   (e.g. email match → lead A, phone match → lead B; or two leads share the
 *   same email) and SKIP the write, counting it under `ambiguous`. These rows
 *   are surfaced in the dry-run output so a human can resolve them by hand
 *   (typically by deleting the dupe lead, then re-running with --apply).
 *
 * IMPORTANT — contact-info source:
 *   The live trigger fires on `profiles INSERT` and reads NEW.email / NEW.phone
 *   from the profile row. `provider_applications` itself has NO `email` column
 *   (only `phone`, which is the business phone — often different from the
 *   personal phone on the profile). So to faithfully reproduce trigger
 *   semantics for the backfill we must look up the linked `profiles` row via
 *   `user_id` and match using the profile's email/phone — NOT the
 *   application's `phone` column.
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

// Look up candidate outreach_leads that satisfy the same predicates as the
// live `auto_link_outreach_lead` trigger:
//   crm_profile_id IS NULL AND crm_sync_status != 'duplicate'
// AND match the given email/phone.
//
// Returns one of:
//   { status: 'no_match' }
//   { status: 'matched',   lead, matchedOn }
//   { status: 'ambiguous', leadIds: [...], matchedOn }   // ≥2 distinct leads
//
// Ambiguity rule: if email-match and phone-match resolve to DIFFERENT lead
// ids, OR if email alone matches ≥2 leads, OR phone alone matches ≥2 leads,
// we surface it as ambiguous instead of silently picking one. Email is still
// queried first (preferred), and within a single contact channel we pull
// limit:2 and order by created_at so a true single-match case is unaffected.
async function findCandidateLead(supabase, email, phone) {
  const sel = 'id, email, phone, created_at, crm_profile_id, crm_sync_status';
  let emailMatches = [];
  let phoneMatches = [];

  if (email) {
    const { data, error } = await supabase
      .from('outreach_leads')
      .select(sel)
      .ilike('email', email)
      .is('crm_profile_id', null)
      .neq('crm_sync_status', 'duplicate')
      .order('created_at', { ascending: true })
      .limit(2);
    if (error) throw error;
    emailMatches = data || [];
  }

  if (phone) {
    const { data, error } = await supabase
      .from('outreach_leads')
      .select(sel)
      .eq('phone', phone)
      .is('crm_profile_id', null)
      .neq('crm_sync_status', 'duplicate')
      .order('created_at', { ascending: true })
      .limit(2);
    if (error) throw error;
    phoneMatches = data || [];
  }

  // Email wins over phone (matches trigger ordering of the OR clauses).
  if (emailMatches.length >= 2) {
    return { status: 'ambiguous', leadIds: emailMatches.map((l) => l.id), matchedOn: 'email' };
  }
  if (emailMatches.length === 1) {
    const emailLead = emailMatches[0];
    // If phone resolves to a DIFFERENT lead, that's also ambiguous.
    const phoneOther = phoneMatches.find((l) => l.id !== emailLead.id);
    if (phoneOther) {
      return { status: 'ambiguous', leadIds: [emailLead.id, phoneOther.id], matchedOn: 'email+phone' };
    }
    return { status: 'matched', lead: emailLead, matchedOn: 'email' };
  }
  if (phoneMatches.length >= 2) {
    return { status: 'ambiguous', leadIds: phoneMatches.map((l) => l.id), matchedOn: 'phone' };
  }
  if (phoneMatches.length === 1) {
    return { status: 'matched', lead: phoneMatches[0], matchedOn: 'phone' };
  }

  return { status: 'no_match' };
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

  // Detailed breakdown — kept for operator visibility. The condensed
  // { scanned, matched, ambiguous, skipped } summary required by Task #136 is
  // derived from this at the end.
  const stats = {
    scanned: 0,
    matched_by_email: 0,
    matched_by_phone: 0,
    ambiguous: 0,
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

   
  while (true) {
    let q = supabase
      .from('provider_applications')
      .select('id, user_id, phone, created_at, outreach_lead_id')
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

    // Batch-fetch the linked profiles for this page so we get email/phone from
    // the SAME source the live trigger uses (NEW.email / NEW.phone on profiles
    // INSERT). provider_applications has no `email` column of its own.
    const userIds = apps.map((a) => a.user_id).filter(Boolean);
    const profilesById = new Map();
    if (userIds.length > 0) {
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id, email, phone')
        .in('id', userIds);
      if (pErr) {
        console.error('Profile lookup failed:', pErr.message);
        stats.errors++;
        break;
      }
      for (const p of profs || []) profilesById.set(p.id, p);
    }

    for (const app of apps) {
      stats.scanned++;
      cursorTs = app.created_at;
      cursorId = app.id;

      const profile = app.user_id ? profilesById.get(app.user_id) : null;
      // Prefer profile contact info (trigger-faithful); fall back to the
      // application's `phone` column only when the profile has no phone.
      const email = normEmail(profile && profile.email);
      const phone = normPhone((profile && profile.phone) || app.phone);
      if (!email && !phone) { stats.skipped_no_contact++; continue; }

      let candidate;
      try {
        candidate = await findCandidateLead(supabase, email, phone);
      } catch (e) {
        console.error(`  app ${app.id}: lead lookup failed: ${e.message || e}`);
        stats.errors++;
        continue;
      }

      if (candidate.status === 'no_match') { stats.skipped_no_match++; continue; }

      if (candidate.status === 'ambiguous') {
        stats.ambiguous++;
        if (stats.ambiguous <= 10) {
          console.log(
            `  [ambiguous] app ${app.id} matches multiple leads on ${candidate.matchedOn}: ${candidate.leadIds.join(', ')} — skipping`
          );
        }
        continue;
      }

      // candidate.status === 'matched'
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

  const totalMatched = stats.matched_by_email + stats.matched_by_phone;

  // Spec-required condensed summary (Task #136). `skipped` rolls up rows that
  // had no contact info OR no candidate lead — i.e. anything we passed over
  // that wasn't a match and wasn't ambiguous.
  const summary = {
    scanned: stats.scanned,
    matched: totalMatched,
    ambiguous: stats.ambiguous,
    skipped: stats.skipped_no_contact + stats.skipped_no_match
  };
  console.log('\nSummary:');
  console.log(JSON.stringify(summary, null, 2));

  console.log('\nDetail:');
  console.log(JSON.stringify(stats, null, 2));

  if (!APPLY && totalMatched > 0) {
    console.log(`\n${totalMatched} potential matches found. Re-run with --apply to commit.`);
  }
  if (stats.ambiguous > 0) {
    console.log(
      `\n${stats.ambiguous} application(s) matched more than one lead and were skipped. ` +
      'Resolve those leads manually (e.g. mark dupes as crm_sync_status=duplicate) and re-run.'
    );
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
