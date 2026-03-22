const { createSupabaseClient, checkSchemaExists, runWefunderBlastForEligible } = require('./outreach-engine-core');

exports.handler = async function(event, context) {
  console.log('[WefunderBlast] Scheduled weekly blast triggered at', new Date().toISOString());
  const t0 = Date.now();

  const supabase = createSupabaseClient();
  if (!supabase) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_database' }) };
  }

  const schemaReady = await checkSchemaExists(supabase);
  if (!schemaReady) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'schema_not_ready' }) };
  }

  try {
    const result = await runWefunderBlastForEligible(supabase, { notify: true });
    const ms = Date.now() - t0;

    try {
      await supabase.from('outreach_activity_log').insert({
        event_type: 'wefunder_blast_scheduled',
        metadata: { ...result, triggered_at: new Date().toISOString(), ms }
      });
    } catch (_) {}

    console.log('[WefunderBlast] Complete in', ms, 'ms:', JSON.stringify(result));
    return { statusCode: 200, body: JSON.stringify({ ...result, ms }) };
  } catch (err) {
    console.error('[WefunderBlast] Error:', err.message);
    return { statusCode: 200, body: JSON.stringify({ error: err.message }) };
  }
};
