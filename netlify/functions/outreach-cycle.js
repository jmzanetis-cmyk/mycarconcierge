const { createSupabaseClient, checkSchemaExists } = require('./outreach-engine-core');

exports.handler = async function(event, context) {
  console.log('[OutreachEngine] Scheduled cycle trigger fired');

  const supabase = createSupabaseClient();
  if (!supabase) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_database' }) };
  }

  const schemaReady = await checkSchemaExists(supabase);
  if (!schemaReady) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'schema_not_ready' }) };
  }

  const { data: state } = await supabase.from('engine_state').select('is_running').eq('id', 1).single();
  if (!state?.is_running) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'engine_paused' }) };
  }

  const siteUrl = process.env.URL || 'https://mycarconcierge.com';
  try {
    const response = await fetch(`${siteUrl}/.netlify/functions/outreach-cycle-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggered_at: new Date().toISOString() })
    });
    console.log('[OutreachEngine] Background function invoked, status:', response.status);
  } catch (err) {
    console.error('[OutreachEngine] Failed to invoke background function:', err.message);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ triggered: true, timestamp: new Date().toISOString() })
  };
};
