#!/usr/bin/env node


/**
 * backfill-provider-geocoding.js
 * ------------------------------
 * One-shot maintenance script: populate `profiles.lat`/`profiles.lng` for
 * every provider so the Step 1d-1b-5 distance gate has coordinates to
 * compare against the job's care_plans.lat/lng.
 *
 * Why: The 1d-1b distance gate compares provider coords vs job coords
 * using the native pg `point<@>point` operator (statute miles). Both
 * profiles and care_plans now have lat/lng columns (migrations
 * 20260622a/b/c, applied 2026-06-21), but the columns are empty.
 * This script populates them for the existing provider universe.
 *
 * GEOCODE PRIORITY (delegates to netlify/functions/geocode.js
 * geocodeAddress for full pipeline parity with runtime):
 *   1. Street-precise via Nominatim — if the provider's
 *      provider_applications row has address_line1 + city + state,
 *      assemble + geocode street-level. Result: precision='street'.
 *   2. Zip-centroid fallback — if step 1 misses (no street, no city,
 *      or Nominatim returned empty), look up the zip in zip_centroids.
 *      Zip source priority: provider_applications.zip first, then
 *      profiles.zip_code. Result: precision='zip'.
 *   3. Both miss — log as 'NONE'. profiles.lat/lng stay null.
 *      The 1b-5 distance gate is null-safe and SKIPS the distance
 *      check entirely for null-coord providers (the never-block rule
 *      from the 1d-1b playbook — coords fill in over time without
 *      ever ungating).
 *
 * IMPORTANT — real column names on provider_applications:
 *   The codebase has DRIFT — earlier code references phantom
 *   `street_address`/`zip_code` columns that DON'T EXIST. The real
 *   columns are:
 *     address_line1, address_line2, city, state, zip
 *   This script uses the real names. Stage 1d-1b-2 will fix the
 *   in-app drift (signup-provider.html collects `street_address` →
 *   server-side provider-application.js whitelists `street_address`,
 *   but the table has `address_line1`). For now, the field has been
 *   landing somewhere — verify in Studio before relying on the data.
 *   As of 2026-06-21: 0/10 provider_applications rows have
 *   address_line1 populated (city only), so in practice every
 *   provider falls to step 2 today.
 *
 * NO PRECISION COLUMN persisted: the playbook discussed storing a
 * 'street'|'zip'|null precision marker on profiles. The 20260622b
 * migration didn't add such a column — only lat/lng. This script
 * LOGS precision per-provider but does NOT persist it. If we want
 * persistence later, add `profiles.coord_precision text` in a future
 * migration; this script can be re-run to backfill it (idempotent).
 *
 * PREREQUISITES:
 *   - supabase/migrations/20260622a_care_plans_street_address.sql applied
 *   - supabase/migrations/20260622b_profiles_latlng.sql applied
 *   - supabase/migrations/20260622c_zip_centroids.sql applied
 *   - zip_centroids loaded via Studio CSV import (~33.7k rows)
 *   - netlify/functions/geocode.js + utils.js present on disk
 *     (this script require()s them in-process)
 *
 * BEHAVIOR:
 *   - Idempotent. By default processes only providers WHERE
 *     lat IS NULL. Re-running is safe; nothing geocoded twice.
 *   - --force re-geocodes EVERY provider (including already-coord'd
 *     ones — overwrites). Use only if you want to refresh after a
 *     Nominatim accuracy improvement or after providers update
 *     addresses in bulk.
 *   - --apply actually writes. WITHOUT --apply, dry-run mode prints
 *     what it WOULD write but performs no UPDATEs. Per-provider
 *     output is identical between modes except for the verb prefix.
 *   - Per-provider log line: index, email, precision, source,
 *     coords (or NONE).
 *   - Summary at end: counts by precision + write_errors total.
 *
 * RATE LIMIT:
 *   Nominatim allows ≤1 req/sec. geocode.js enforces a module-level
 *   ≥1s spacing across calls within a single process — this script
 *   inherits it because we require() geocode.js. With 0/N street
 *   addresses today the script is pure zip-centroid lookups (fast,
 *   no Nominatim). If street geocodes start to fire (post-1b-2),
 *   expect ~1s per provider with a street address.
 *
 * Env required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   # Dry-run (default — see what WOULD happen):
 *   node scripts/backfill-provider-geocoding.js
 *
 *   # Apply for real (writes profiles.lat/lng):
 *   node scripts/backfill-provider-geocoding.js --apply
 *
 *   # Re-geocode everyone, including already-coord'd providers:
 *   node scripts/backfill-provider-geocoding.js --apply --force
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const { geocodeAddress } = require('../netlify/functions/geocode.js');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');

const HR = '─'.repeat(72);

function fmtCoords(lat, lng) {
  if (lat === null || lng === null) return '(null, null)';
  return `(${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)})`;
}

function describeInput({ street, city, state, zip, zipFromApp, hasApp }) {
  if (street && city && state) {
    return `street="${street}, ${city}, ${state}${zip ? ' ' + zip : ''}"`;
  }
  if (zip) {
    return `zip="${zip}" (src: ${zipFromApp ? 'app' : 'profile'})`;
  }
  if (hasApp) return 'NO INPUT (app present but no usable address)';
  return 'NO INPUT (no app row, no profile zip)';
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
    process.exit(2);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  console.log(HR);
  console.log(`backfill-provider-geocoding`);
  console.log(`  mode:  ${APPLY ? 'APPLY (writes profiles.lat/lng)' : 'DRY-RUN (no writes)'}`);
  console.log(`  scope: ${FORCE ? 'ALL providers (--force; overwrites existing coords)' : 'providers with lat IS NULL only (idempotent)'}`);
  console.log(HR);

  // 1) Fetch target provider profiles
  let providersQuery = sb.from('profiles')
    .select('id, email, zip_code, lat, lng')
    .eq('role', 'provider');
  if (!FORCE) providersQuery = providersQuery.is('lat', null);

  const { data: providers, error: pErr } = await providersQuery.order('email', { ascending: true });
  if (pErr) {
    console.error('fetch profiles failed:', pErr.message);
    process.exit(1);
  }
  if (!providers || providers.length === 0) {
    console.log('no providers to process — exit.');
    return;
  }

  // 2) Bulk-fetch their provider_applications rows
  const ids = providers.map((p) => p.id);
  const { data: apps, error: aErr } = await sb.from('provider_applications')
    .select('user_id, address_line1, address_line2, city, state, zip')
    .in('user_id', ids);
  if (aErr) {
    console.error('fetch provider_applications failed:', aErr.message);
    process.exit(1);
  }
  const appByUserId = new Map((apps || []).map((a) => [a.user_id, a]));

  console.log(`processing ${providers.length} provider${providers.length === 1 ? '' : 's'}...`);
  console.log('');

  const stats = { street: 0, zip: 0, none: 0, write_errors: 0 };

  let i = 0;
  for (const p of providers) {
    i++;
    const app = appByUserId.get(p.id);
    const street = app && app.address_line1 ? String(app.address_line1).trim() : '';
    const city   = app && app.city          ? String(app.city).trim()          : '';
    const state  = app && app.state         ? String(app.state).trim()         : '';
    const appZip = app && app.zip           ? String(app.zip).trim()           : '';
    const profZip = p.zip_code ? String(p.zip_code).trim() : '';
    const zip = appZip || profZip;
    const zipFromApp = !!appZip;

    const result = await geocodeAddress({ street, city, state, zip });

    const precisionLabel = result.precision || 'NONE';
    const coordsLabel = fmtCoords(result.lat, result.lng);
    const inputDesc = describeInput({ street, city, state, zip, zipFromApp, hasApp: !!app });

    if (result.precision === 'street') stats.street++;
    else if (result.precision === 'zip') stats.zip++;
    else stats.none++;

    const prefix = `[${String(i).padStart(2)}/${providers.length}]`;
    const verb = APPLY ? '→ wrote' : '→ would write';

    if (result.lat !== null && result.lng !== null) {
      if (APPLY) {
        const { error: uErr } = await sb.from('profiles')
          .update({ lat: result.lat, lng: result.lng })
          .eq('id', p.id);
        if (uErr) {
          console.log(`${prefix} ${p.email} | ${precisionLabel} | input: ${inputDesc} | ${coordsLabel} | WRITE FAILED: ${uErr.message}`);
          stats.write_errors++;
          continue;
        }
      }
      console.log(`${prefix} ${p.email} | ${precisionLabel} | input: ${inputDesc} | ${verb} ${coordsLabel}`);
    } else {
      console.log(`${prefix} ${p.email} | ${precisionLabel} | input: ${inputDesc} | no coords (gate will skip — never-block rule)`);
    }
  }

  console.log('');
  console.log(HR);
  console.log(`summary (mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}):`);
  console.log(`  street precision: ${stats.street}`);
  console.log(`  zip precision:    ${stats.zip}`);
  console.log(`  no coords:        ${stats.none}`);
  console.log(`  write errors:     ${stats.write_errors}`);
  console.log(`  total processed:  ${providers.length}`);
  console.log(HR);
  if (!APPLY) {
    console.log('Dry-run only — no writes. Re-run with --apply to persist.');
  } else if (stats.write_errors > 0) {
    console.log(`WARN: ${stats.write_errors} write error(s) above — re-run to retry (idempotent).`);
  } else {
    console.log('Done. Spot-check with: SELECT email, lat, lng FROM profiles WHERE role=\'provider\' ORDER BY email;');
  }
}

main().catch((err) => {
  console.error('unexpected error:', err);
  process.exit(1);
});
