const crypto = require('node:crypto');
const { createSupabaseClient } = require('./outreach-engine-core');

function verifyResendWebhookSignature(rawBody, headers) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return { valid: false, reason: 'RESEND_WEBHOOK_SECRET not configured' };
  }

  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { valid: false, reason: 'Missing Svix signature headers' };
  }

  const timestampMs = Number.parseInt(svixTimestamp, 10) * 1000;
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
    console.error('[outreach-resend-webhook] database not configured');
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'database not configured' }) };
  }

  try {
    const body = JSON.parse(rawBody);
    const eventType = body.type;
    const data = body.data || {};

    if (eventType === 'email.bounced') {
      const emailId = data.email_id;
      if (emailId) {
        // Task #222 — also flip the matching bgc_launch_email_sends row so
        // the launch-broadcast admin dashboard reflects bounces in real time.
        // Best-effort, missing-table errors are silenced; other errors are
        // logged for operability.
        try {
          const { error: bgcErr } = await supabase
            .from('bgc_launch_email_sends')
            .update({
              status: 'bounced',
              error_message: (data.bounce?.message || data.bounce?.type || 'bounced').slice(0, 800)
            })
            .eq('resend_message_id', emailId);
          if (bgcErr && !/relation .* does not exist|schema cache/i.test(bgcErr.message)) {
            console.warn('[outreach-resend-webhook] bgc_launch_email_sends bounce update failed:', bgcErr.message);
          }
        } catch (e) { console.warn('[outreach-resend-webhook] bounce mirror exception:', e.message); }

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
          supabase.from('outreach_email_events').insert({
            message_id: msg.id,
            lead_id: msg.lead_id,
            event_type: 'bounced',
            occurred_at: new Date().toISOString(),
            metadata: { bounce_type: data.bounce?.type, reason: data.bounce?.message }
          }).then(() => {}).catch(() => {});
        }
      }
    } else if (eventType === 'email.complained') {
      const emailId = data.email_id;
      if (emailId) {
        // Task #222 — mirror complaint into the launch-broadcast send log,
        // including any complaint reason Resend provides so the dashboard
        // doesn't render an empty reason column for complaints.
        try {
          const reason = (data.complaint?.message || data.complaint?.type || data.feedback_id || 'spam complaint').toString().slice(0, 800);
          const { error: bgcErr } = await supabase
            .from('bgc_launch_email_sends')
            .update({ status: 'complained', error_message: reason })
            .eq('resend_message_id', emailId);
          if (bgcErr && !/relation .* does not exist|schema cache/i.test(bgcErr.message)) {
            console.warn('[outreach-resend-webhook] bgc_launch_email_sends complaint update failed:', bgcErr.message);
          }
        } catch (e) { console.warn('[outreach-resend-webhook] complaint mirror exception:', e.message); }

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
          supabase.from('outreach_email_events').insert({
            message_id: msg.id,
            lead_id: msg.lead_id,
            event_type: 'complaint',
            occurred_at: new Date().toISOString()
          }).then(() => {}).catch(() => {});
        }
      }
    } else if (eventType === 'email.opened') {
      // Resend fires this when the 1x1 tracking pixel loads. Stamp opened_at
      // on the originating outreach_messages row (only if not already set, so
      // we record the FIRST open). Lead status is left at 'contacted' — opens
      // alone aren't strong enough signal to advance the pipeline.
      const emailId = data.email_id;
      if (emailId) {
        const { data: msg } = await supabase
          .from('outreach_messages')
          .select('id, lead_id, opened_at')
          .eq('resend_message_id', emailId)
          .maybeSingle();

        if (msg && !msg.opened_at) {
          await supabase.from('outreach_messages')
            .update({ opened_at: new Date().toISOString() })
            .eq('id', msg.id);
          await supabase.from('outreach_activity_log').insert({
            lead_id: msg.lead_id,
            message_id: msg.id,
            event_type: 'opened',
            metadata: {}
          });
          supabase.from('outreach_email_events').insert({
            message_id: msg.id,
            lead_id: msg.lead_id,
            event_type: 'opened',
            occurred_at: new Date().toISOString()
          }).then(() => {}).catch(() => {});
        }
      }
    } else if (eventType === 'email.clicked') {
      // Resend fires this when a recipient clicks any tracked link. Stamp
      // clicked_at and advance lead status to 'clicked' (a much stronger
      // engagement signal than open). Pipeline stage moves to 'engaged'.
      const emailId = data.email_id;
      if (emailId) {
        const { data: msg } = await supabase
          .from('outreach_messages')
          .select('id, lead_id, clicked_at')
          .eq('resend_message_id', emailId)
          .maybeSingle();

        if (msg) {
          if (!msg.clicked_at) {
            await supabase.from('outreach_messages')
              .update({ clicked_at: new Date().toISOString() })
              .eq('id', msg.id);
          }
          // Advance the lead — but never downgrade if already responded/converted.
          await supabase.from('outreach_leads')
            .update({ status: 'clicked', updated_at: new Date().toISOString() })
            .eq('id', msg.lead_id)
            .in('status', ['new', 'queued', 'contacted']);
          await supabase.from('opportunity_pipeline')
            .update({ stage: 'engaged', last_action_at: new Date().toISOString() })
            .eq('lead_id', msg.lead_id)
            .in('stage', ['new', 'draft_ready', 'message_queued', 'contacted']);
          await supabase.from('outreach_activity_log').insert({
            lead_id: msg.lead_id,
            message_id: msg.id,
            event_type: 'clicked',
            metadata: { url: data.click?.link || data.link }
          });
          supabase.from('outreach_email_events').insert({
            message_id: msg.id,
            lead_id: msg.lead_id,
            event_type: 'clicked',
            occurred_at: new Date().toISOString(),
            metadata: { url: data.click?.link || data.link }
          }).then(() => {}).catch(() => {});
        }
      }
    }
    // NOTE: We previously had an `email.delivered` branch that tried to detect
    // replies by sniffing `in-reply-to` headers. That logic was wrong — Resend's
    // delivered event fires when the receiving SMTP server accepts the message,
    // it has nothing to do with replies, and the headers it carries are the
    // OUTBOUND ones we set, not anything from the recipient. Removed to stop
    // false-positive 'responded' status flips. Real reply detection would need
    // Resend's inbound email feature or an IMAP poll on the From: address.

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
