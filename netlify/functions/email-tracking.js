var { createClient } = require('@supabase/supabase-js');

var PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSupabase() {
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

exports.handler = async function(event) {
  var params = event.queryStringParameters || {};
  var msgId = params.m;
  var action = params.a;

  if (!msgId || !UUID_REGEX.test(msgId)) {
    if (action === 'open') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' },
        body: PIXEL_GIF.toString('base64'),
        isBase64Encoded: true
      };
    }
    return { statusCode: 302, headers: { 'Location': 'https://mycarconcierge.com' } };
  }

  var supabase = getSupabase();
  if (supabase) {
    try {
      var result = await supabase
        .from('outreach_messages')
        .select('id, lead_id, opened_at, clicked_at')
        .eq('id', msgId)
        .single();

      var msg = result.data;

      if (action === 'open' && msg && !msg.opened_at) {
        await supabase.from('outreach_messages').update({ opened_at: new Date().toISOString() }).eq('id', msgId);
        await supabase.from('outreach_activity_log').insert({
          lead_id: msg.lead_id,
          message_id: msgId,
          event_type: 'opened',
          metadata: {}
        });
      }

      if (action === 'click' && msg && !msg.clicked_at) {
        await supabase.from('outreach_messages').update({ clicked_at: new Date().toISOString() }).eq('id', msgId);
        await supabase.from('outreach_activity_log').insert({
          lead_id: msg.lead_id,
          message_id: msgId,
          event_type: 'clicked',
          metadata: { destination: params.u || 'https://mycarconcierge.com' }
        });
      }
    } catch (e) {}
  }

  if (action === 'open') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' },
      body: PIXEL_GIF.toString('base64'),
      isBase64Encoded: true
    };
  }

  var dest = params.u || 'https://mycarconcierge.com';
  return { statusCode: 302, headers: { 'Location': dest } };
};
