const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

exports.handler = async (event) => {
  const leadId = event.queryStringParameters?.id;

  if (leadId) {
    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from('outreach_activity_log').insert({
          lead_id: leadId,
          event_type: 'ref_click',
          metadata: { lead_id: leadId, timestamp: new Date().toISOString() }
        });
        const { data: lead } = await supabase.from('outreach_leads').select('status').eq('id', leadId).maybeSingle();
        if (lead && (lead.status === 'new' || lead.status === 'contacted')) {
          await supabase.from('outreach_leads').update({ status: 'clicked' }).eq('id', leadId);
        }
      }
    } catch (err) {
      console.error('[outreach-ref] Error logging ref click:', err.message);
    }
  }

  return {
    statusCode: 302,
    headers: { Location: 'https://mycarconcierge.com/join' }
  };
};
