#!/usr/bin/env node
// scripts/run-migrations.js
//
// Applies live-tracking migrations + demo seed via the Supabase Management API.
//
// Get a personal access token at:
//   https://supabase.com/dashboard/account/tokens
//
// Usage:
//   SUPABASE_ACCESS_TOKEN='sbp_...' node scripts/run-migrations.js

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('ERROR: set SUPABASE_ACCESS_TOKEN (get one at supabase.com/dashboard/account/tokens)');
  process.exit(1);
}

const REF  = 'ifbyjxuaclwmadqbjcyp';
const HOST = 'api.supabase.com';
const PATH = `/v1/projects/${REF}/database/query`;

const MIGRATION_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const SEED_DIR      = path.join(__dirname, '..', '..', 'mcc_driver', 'scripts', 'sql');

const FILES = [
  { file: path.join(MIGRATION_DIR, '20260611b_tracking_server.sql'), label: '20260611b_tracking_server' },
  { file: path.join(MIGRATION_DIR, '20260611c_demo_job.sql'),        label: '20260611c_demo_job' },
  { file: path.join(SEED_DIR,      'seed-demo-concierge-job.sql'),   label: 'seed-demo-concierge-job' },
];

function query(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req  = https.request({
      hostname: HOST,
      path:     PATH,
      method:   'POST',
      headers:  {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function run() {
  for (const { file, label } of FILES) {
    const sql = fs.readFileSync(file, 'utf8');
    console.log(`▶ ${label} …`);
    try {
      await query(sql);
      console.log(`  ✓ done\n`);
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}\n`);
      process.exit(1);
    }
  }
  console.log('All done.');
}

run().catch(err => { console.error(err); process.exit(1); });
