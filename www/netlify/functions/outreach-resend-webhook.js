const { createSupabaseClient } = require('./outreach-engine-core');

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    return { statusCode: 200, body: 'ok' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const eventType = body.type;
    const data = body.data || {};

    if (eventType === 'email.bounced') {
      const emailId = data.email_id;
      if (emailId) {
        const { data: msg } = await supabase
          .from('outreach_messages')
          .select('id, lead_id')
          .eq('resend_message_id', emailId)
          .maybeSingle();

        if (msg) {
          await supabase.from('outreach_messages').update({ status: 'bounced' }).eq('id', msg.id);
          await supabase.from('outreach_leads').update({ status: 'bounced' }).eq('id', msg.lead_id);
          await supabase.from('outreach_activity_log').insert({
            lead_id: msg.lead_id,
            message_id: msg.id,
            event_type: 'bounced',
            metadata: { bounce_type: data.bounce?.type, reason: data.bounce?.message }
          });
        }
      }
    } else if (eventType === 'email.complained') {
      const emailId = data.email_id;
      if (emailId) {
        const { data: msg } = await supabase
          .from('outreach_messages')
          .select('id, lead_id')
          .eq('resend_message_id', emailId)
          .maybeSingle();

        if (msg) {
          await supabase.from('outreach_leads').update({ status: 'unsubscribed' }).eq('id', msg.lead_id);
          await supabase.from('outreach_activity_log').insert({
            lead_id: msg.lead_id,
            message_id: msg.id,
            event_type: 'complaint',
            metadata: {}
          });
        }
      }
    } else if (eventType === 'email.delivered') {
      const toEmail = data.to?.[0];
      if (toEmail) {
        const { data: leads } = await supabase
          .from('outreach_leads')
          .select('id')
          .eq('email', toEmail)
          .eq('status', 'contacted');

        if (leads && leads.length > 0) {
          const replyHeaders = data.headers || {};
          const inReplyTo = replyHeaders['in-reply-to'] || replyHeaders['In-Reply-To'];
          const references = replyHeaders['references'] || replyHeaders['References'];

          if (inReplyTo || references) {
            for (const lead of leads) {
              await supabase.from('outreach_leads').update({ status: 'responded' }).eq('id', lead.id);
              await supabase.from('opportunity_pipeline')
                .update({ stage: 'responded', last_action_at: new Date().toISOString() })
                .eq('lead_id', lead.id);
              await supabase.from('outreach_activity_log').insert({
                lead_id: lead.id,
                event_type: 'response_detected',
                metadata: { from: toEmail }
              });
            }
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ received: true })
    };
  } catch (err) {
    console.error('[OutreachEngine] Resend webhook error:', err.message);
    return { statusCode: 200, body: 'ok' };
  }
};
