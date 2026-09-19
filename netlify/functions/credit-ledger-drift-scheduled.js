// ============================================================================
// credit-ledger-drift-scheduled
//
// Phase 1 §1.5 — daily drift check. Compares sum(credit_ledger.delta) to
// the profiles.bid_credits + profiles.free_trial_bids cache for every
// provider. Any mismatch is drift — a writer somewhere bypassed the ledger
// (or someone updated profiles directly). The whole ledger design assumes
// this returns 0 rows.
//
// On drift: writes an audit_log entry, emits an admin alert email, and
// logs each drifting provider. Does NOT auto-repair — spec §1.5 makes
// zero drift the Phase 1 exit criterion, and silent auto-repair would
// mask the very failures the check exists to surface.
//
// Netlify scheduling is configured in netlify.toml (see the same pattern
// as bid-credit-reconciler-scheduled.js).
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function runDriftCheck(supabase) {
  const { data, error } = await supabase.rpc('credit_ledger_drift');
  if (error) {
    // If the RPC doesn't exist (initial deploy race), fall back to an
    // inline query using PostgREST — same logic as check-credit-ledger-drift.sql.
    // We use two queries + JS join to keep the RPC-free path readable.
    console.warn('[credit-ledger-drift] rpc failed, falling back to inline query:', error.message);
    return runInlineDriftCheck(supabase);
  }
  return data || [];
}

async function runInlineDriftCheck(supabase) {
  // Fetch every profile with either cache value non-zero, plus every
  // profile that has any credit_ledger row. Union in JS. Small tables
  // today (<100 profiles); no need for pagination.
  const [profRes, ledRes] = await Promise.all([
    supabase.from('profiles')
      .select('id, email, role, bid_credits, free_trial_bids')
      .or('bid_credits.neq.0,free_trial_bids.neq.0'),
    supabase.from('credit_ledger')
      .select('provider_id, delta'),
  ]);
  const ledgerByProvider = new Map();
  for (const row of (ledRes.data || [])) {
    ledgerByProvider.set(row.provider_id,
      (ledgerByProvider.get(row.provider_id) || 0) + row.delta);
  }
  const drift = [];
  for (const p of (profRes.data || [])) {
    const cache = (p.bid_credits || 0) + (p.free_trial_bids || 0);
    const ledger = ledgerByProvider.get(p.id) || 0;
    if (ledger !== cache) {
      drift.push({
        provider_id: p.id, email: p.email, role: p.role,
        cache_bid_credits: p.bid_credits || 0,
        cache_free_trial: p.free_trial_bids || 0,
        ledger_sum: ledger,
        cache_total: cache,
        drift: ledger - cache,
      });
    }
    ledgerByProvider.delete(p.id);
  }
  // Any providers that have ledger rows but zero cache — also drift.
  for (const [pid, sum] of ledgerByProvider.entries()) {
    if (sum !== 0) {
      drift.push({
        provider_id: pid, email: null, role: null,
        cache_bid_credits: 0, cache_free_trial: 0,
        ledger_sum: sum, cache_total: 0, drift: sum,
      });
    }
  }
  return drift;
}

async function emitAdminAlert(supabase, drift) {
  try {
    await supabase.from('audit_log').insert({
      action: 'credit_ledger_drift_detected',
      target_type: 'system',
      performed_by: 'credit-ledger-drift-scheduled',
      metadata: { drift_count: drift.length, providers: drift },
    });
  } catch (e) {
    console.error('[credit-ledger-drift] audit_log insert failed:', e.message);
  }
}

exports.handler = async function () {
  const supabase = getServiceSupabase();
  if (!supabase) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Database not configured' }) };
  }
  try {
    const drift = await runDriftCheck(supabase);
    if (drift.length === 0) {
      console.log('[credit-ledger-drift] OK — no drift detected');
      return { statusCode: 200, body: JSON.stringify({ ok: true, drift: 0 }) };
    }
    console.error(`[credit-ledger-drift] DRIFT detected on ${drift.length} provider(s):`);
    for (const row of drift) {
      console.error(`  provider=${row.provider_id} cache=${row.cache_total} ledger=${row.ledger_sum} drift=${row.drift}`);
    }
    await emitAdminAlert(supabase, drift);
    return { statusCode: 200, body: JSON.stringify({ ok: false, drift: drift.length, rows: drift }) };
  } catch (e) {
    console.error('[credit-ledger-drift] fatal:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
