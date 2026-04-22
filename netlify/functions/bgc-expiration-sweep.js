// ─────────────────────────────────────────────────────────────────────────────
// Task #112 — Daily expiration sweep
//
// Scheduled function (cron defined in netlify.toml). Finds clear, current
// background checks whose expires_at has passed, flips them to 'expired',
// and recomputes compliance for each affected provider.
//
// Notification side-effects (emails / portal alerts) are intentionally NOT
// here — they belong to Task #113.
// ─────────────────────────────────────────────────────────────────────────────

const { createSupabaseClient } = require('./utils');

exports.handler = async function() {
  const supabase = createSupabaseClient();
  if (!supabase) {
    console.error('[BGC sweep] Supabase unavailable');
    return { statusCode: 500, body: 'db_unavailable' };
  }

  const nowIso = new Date().toISOString();

  const { data: expired, error } = await supabase
    .from('employee_background_checks')
    .select('id, provider_id')
    .eq('is_current', true)
    .eq('status', 'clear')
    .lt('expires_at', nowIso);

  if (error) {
    console.error('[BGC sweep] query failed:', error.message);
    return { statusCode: 500, body: 'query_failed' };
  }

  if (!expired || expired.length === 0) {
    console.log('[BGC sweep] no checks expired');
    return { statusCode: 200, body: JSON.stringify({ expired: 0, providers: 0 }) };
  }

  const ids = expired.map(r => r.id);
  const providerIds = Array.from(new Set(expired.map(r => r.provider_id)));

  const { error: updErr } = await supabase
    .from('employee_background_checks')
    .update({ status: 'expired' })
    .in('id', ids);

  if (updErr) {
    console.error('[BGC sweep] flip-to-expired failed:', updErr.message);
    return { statusCode: 500, body: 'update_failed' };
  }

  let recomputeErrors = 0;
  for (const pid of providerIds) {
    const { error: rpcErr } = await supabase.rpc('calculate_provider_compliance', {
      p_provider_id: pid
    });
    if (rpcErr) {
      recomputeErrors++;
      console.error('[BGC sweep] recompute failed for', pid, rpcErr.message);
    }
  }

  console.log('[BGC sweep] expired', ids.length, 'checks across', providerIds.length, 'providers');
  return {
    statusCode: 200,
    body: JSON.stringify({
      expired: ids.length,
      providers: providerIds.length,
      recompute_errors: recomputeErrors
    })
  };
};
