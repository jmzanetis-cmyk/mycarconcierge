const { createSupabaseClient, initEngineState, runEngineCycle } = require('./outreach-engine-core');

exports.handler = async function(event, context) {
  console.log('[OutreachEngine] Background cycle function triggered');

  const supabase = createSupabaseClient();
  if (!supabase) {
    console.error('[OutreachEngine] Supabase not configured');
    return { statusCode: 500, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  await initEngineState(supabase);
  const result = await runEngineCycle(supabase);
  console.log('[OutreachEngine] Background cycle complete:', JSON.stringify(result));

  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
};
