const { createSupabaseClient, checkSchemaExists, runApolloDiscoveryCycle } = require('./outreach-engine-core');

exports.handler = async function(event, context) {
  console.log('[ApolloDiscovery] Scheduled cycle triggered at', new Date().toISOString());
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
    const result = await runApolloDiscoveryCycle(supabase);
    const ms = Date.now() - t0;
    console.log('[ApolloDiscovery] Cycle complete in', ms, 'ms:', JSON.stringify(result));
    return { statusCode: 200, body: JSON.stringify({ ...result, ms }) };
  } catch (err) {
    console.error('[ApolloDiscovery] Error:', err.message);
    return { statusCode: 200, body: JSON.stringify({ error: err.message }) };
  }
};
