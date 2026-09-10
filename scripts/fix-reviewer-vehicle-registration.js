#!/usr/bin/env node
// scripts/fix-reviewer-vehicle-registration.js
//
// One-off, idempotent fix: flips registration_verified -> true on every
// vehicle owned by the App Store reviewer/demo account(s). These vehicles
// predate the registration-verification gate added 2026-09 (members-packages.js
// savePackage()), which now blocks "New Service Request" on any vehicle
// that hasn't been through the AI-OCR registration upload flow. A synthetic
// demo car has no real registration document to upload, so without this
// fix Apple's reviewer (or anyone testing the demo account) is dead-ended
// the moment they try to create a fresh request instead of just opening
// the two pre-seeded ones.
//
// Deliberately narrower than re-running seed-app-store-reviewer.js: this
// touches ONLY vehicles.registration_verified and does not reset the
// reviewer accounts' passwords (which would require updating App Store
// Connect's saved sign-in credential too).
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/fix-reviewer-vehicle-registration.js
//
// Safe to re-run.

'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ifbyjxuaclwmadqbjcyp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const REVIEWER_EMAILS = [
  'demo@mycarconcierge.com',
  'reviewer-member@mycarconcierge.com',
  'reviewer-provider@mycarconcierge.com',
];

async function findUserByEmail(email) {
  const https = require('https');
  const url = `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=10`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const users = json.users || [];
          resolve(users.find(u => u.email === email) || null);
        } catch (e) {
          reject(new Error(`findUserByEmail parse error: ${e.message} — body: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
  });
}

async function main() {
  console.log('=== Fix reviewer vehicle registration_verified ===\n');
  for (const email of REVIEWER_EMAILS) {
    const user = await findUserByEmail(email);
    if (!user) {
      console.log(`  [skip] ${email}: no auth user found`);
      continue;
    }
    const { data: vehicles, error: selErr } = await supabase
      .from('vehicles')
      .select('id, year, make, model, registration_verified')
      .eq('owner_id', user.id);
    if (selErr) {
      console.error(`  [error] ${email}: ${selErr.message}`);
      continue;
    }
    if (!vehicles || vehicles.length === 0) {
      console.log(`  [skip] ${email}: no vehicles`);
      continue;
    }
    for (const v of vehicles) {
      if (v.registration_verified) {
        console.log(`  [ok]     ${email} — ${v.year} ${v.make} ${v.model} (${v.id}) already verified`);
        continue;
      }
      const { error: updErr } = await supabase
        .from('vehicles')
        .update({ registration_verified: true })
        .eq('id', v.id);
      if (updErr) {
        console.error(`  [error]  ${email} — ${v.id}: ${updErr.message}`);
      } else {
        console.log(`  [fixed]  ${email} — ${v.year} ${v.make} ${v.model} (${v.id})`);
      }
    }
  }
  console.log('\nDone.');
}

main().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
