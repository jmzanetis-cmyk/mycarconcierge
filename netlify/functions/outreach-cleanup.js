const { createSupabaseClient, initEngineState, runPipelineCleanup } = require('./outreach-engine-core');

exports.handler = async function(event, context) {
  console.log('[OutreachEngine] Scheduled cleanup triggered');

  const supabase = createSupabaseClient();
  if (!supabase) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_database' }) };
  }

  await initEngineState(supabase);

  const results = {};

  const pipelineResult = await runPipelineCleanup(supabase);
  results.pipeline_cleaned = pipelineResult.cleaned || 0;

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: staleLeads, error: fetchError } = await supabase
      .from('outreach_leads')
      .select('id')
      .in('status', ['new', 'pending', 'draft_ready'])
      .lt('created_at', sevenDaysAgo)
      .is('last_contacted_at', null);

    if (fetchError) {
      console.error('[OutreachEngine] Error fetching stale leads:', fetchError.message);
      results.stale_leads_error = fetchError.message;
    } else if (staleLeads?.length > 0) {
      const staleIds = staleLeads.map(l => l.id);

      await supabase
        .from('outreach_activity_log')
        .delete()
        .in('lead_id', staleIds);

      const { data: deleted, error: deleteError } = await supabase
        .from('outreach_leads')
        .delete()
        .in('id', staleIds)
        .select('id');

      if (deleteError) {
        console.error('[OutreachEngine] Error purging stale leads:', deleteError.message);
        results.stale_leads_error = deleteError.message;
      } else {
        results.stale_leads_purged = deleted?.length || 0;
        console.log(`[OutreachEngine] Purged ${results.stale_leads_purged} stale leads (uncontacted, >7 days old)`);
      }
    } else {
      results.stale_leads_purged = 0;
    }
  } catch (err) {
    console.error('[OutreachEngine] Stale lead cleanup error:', err.message);
    results.stale_leads_error = err.message;
  }

  console.log('[OutreachEngine] Cleanup complete:', JSON.stringify(results));

  return {
    statusCode: 200,
    body: JSON.stringify(results)
  };
};
