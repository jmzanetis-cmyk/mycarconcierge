const crypto = require('crypto');
const { createSupabaseClient } = require('./outreach-engine-core');

function verifyResendWebhookSignature(rawBody, headers) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn('[OutreachEngine] RESEND_WEBHOOK_SECRET not configured; skipping signature verification');
    return { valid: true, reason: null };
  }

  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { valid: false, reason: 'Missing Svix signature headers' };
  }

  const timestampMs = parseInt(svixTimestamp, 10) * 1000;
  const fiveMinutes = 5 * 60 * 1000;
  if (Math.abs(Date.now() - timestampMs) > fiveMinutes) {
    return { valid: false, reason: 'Webhook timestamp too old or too new (replay attack prevention)' };
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const secretBytes = Buffer.from(webhookSecret.replace(/^whsec_/, ''), 'base64');
  const hmac = crypto.createHmac('sha256', secretBytes);
  hmac.update(signedContent);
  const computedSig = `v1,${hmac.digest('base64')}`;

  const providedSigs = svixSignature.split(' ');
  const isValid = providedSigs.some(sig => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(computedSig));
    } catch {
      return false;
    }
  });

  return { valid: isValid, reason: isValid ? null : 'Signature mismatch' };
}

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,svix-id,svix-timestamp,svix-signature',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const rawBody = event.body || '';
  const headers = event.headers || {};

  const verification = verifyResendWebhookSignature(rawBody, headers);
  if (!verification.valid) {
    console.warn('[OutreachEngine] Resend webhook rejected:', verification.reason);
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Webhook signature invalid', reason: verification.reason })
    };
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    return { statusCode: 200, body: 'ok' };
  }

  try {
    const body = JSON.parse(rawBody);
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
