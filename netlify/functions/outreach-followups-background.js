const { createSupabaseClient, initEngineState, runFollowUpDrafts } = require('./outreach-engine-core');

exports.handler = async function(event, context) {
  console.log('[OutreachEngine] Background follow-ups function triggered');

  const supabase = createSupabaseClient();
  if (!supabase) {
    console.error('[OutreachEngine] Supabase not configured');
    return { statusCode: 500, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  await initEngineState(supabase);
  const result = await runFollowUpDrafts(supabase);
  console.log('[OutreachEngine] Background follow-ups complete:', JSON.stringify(result));

  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
};
