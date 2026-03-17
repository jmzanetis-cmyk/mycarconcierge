const { createSupabaseClient, initEngineState, runPipelineCleanup } = require('./outreach-engine-core');

exports.handler = async function(event, context) {
  console.log('[OutreachEngine] Scheduled cleanup triggered');

  const supabase = createSupabaseClient();
  if (!supabase) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_database' }) };
  }

  await initEngineState(supabase);
  const result = await runPipelineCleanup(supabase);
  console.log('[OutreachEngine] Cleanup complete:', JSON.stringify(result));

  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
};
