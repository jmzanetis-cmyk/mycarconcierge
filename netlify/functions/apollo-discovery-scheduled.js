const { createSupabaseClient, checkSchemaExists, runApolloDiscoveryCycle } = require('./outreach-engine-core');

// Rate-limit credit alerts to once per 24 hours so a stuck key doesn't spam.
const CREDIT_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

async function maybeSendApolloCreditAlert(supabase) {
  // Check for payment_required errors logged in the last 30 minutes
  const windowStart = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: errors } = await supabase
    .from('outreach_activity_log')
    .select('id, metadata, created_at')
    .eq('event_type', 'apollo_discovery_error')
    .gte('created_at', windowStart)
    .limit(10);

  const creditErrors = (errors || []).filter(
    e => e.metadata && e.metadata.error_kind === 'payment_required'
  );
  if (creditErrors.length === 0) return { alerted: false, reason: 'no_credit_errors' };

  // Rate-limit check
  const cooldownStart = new Date(Date.now() - CREDIT_ALERT_COOLDOWN_MS).toISOString();
  const { data: recent } = await supabase
    .from('ai_action_log')
    .select('id')
    .eq('module', 'apollo_credit_alert')
    .eq('outcome', 'sent')
    .gte('created_at', cooldownStart)
    .limit(1);
  if (recent && recent.length > 0) return { alerted: false, reason: 'rate_limited' };

  const apiKey    = process.env.RESEND_API_KEY;
  const toEmail   = process.env.ADMIN_EMAIL || process.env.MCC_FROM_EMAIL;
  const fromEmail = process.env.MCC_FROM_EMAIL || 'no-reply@mycarconcierge.com';

  let emailOutcome = 'no_email_config';
  if (apiKey && toEmail) {
    const sample = creditErrors[0]?.metadata || {};
    const html =
      '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;color:#222;">'
      + '<h2 style="color:#c0392b;margin:0 0 12px;">Apollo credit exhausted</h2>'
      + '<p>The Apollo API returned a <strong>402 Payment Required</strong> (or credit-quota) error during the discovery cycle. '
      + 'Outreach lead discovery is now paused until credits are topped up.</p>'
      + '<p style="margin:12px 0;"><strong>Last error:</strong> HTTP '
      + (sample.http_status || '402') + ' — ' + (sample.response_body || 'credits exhausted').slice(0, 300) + '</p>'
      + '<h3 style="font-size:14px;margin:16px 0 8px;">Next steps</h3>'
      + '<ol style="font-size:13px;line-height:1.7;">'
      + '<li>Log in to <a href="https://app.apollo.io">app.apollo.io</a> and top up the credit balance.</li>'
      + '<li>The next scheduled cycle will retry automatically once credits are available.</li>'
      + '<li>If credits appear available but the error persists, rotate APOLLO_API_KEY in the Netlify env vars.</li>'
      + '</ol>'
      + '<p style="font-size:12px;color:#888;margin-top:20px;">Detected at ' + new Date().toISOString() + '</p>'
      + '</div>';

    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          from: 'My Car Concierge Ops <' + fromEmail + '>',
          to: [toEmail],
          subject: '[MCC] Apollo credits exhausted — outreach paused',
          html,
          text: 'Apollo API returned 402 (credits exhausted). Top up at app.apollo.io to resume lead discovery.'
        })
      });
      emailOutcome = r.ok ? 'sent' : 'resend_error_' + r.status;
    } catch (e) {
      emailOutcome = 'exception_' + e.message.slice(0, 80);
    }
  }

  await supabase.from('ai_action_log').insert({
    module: 'apollo_credit_alert',
    action_type: 'credit_exhausted',
    target_id: null,
    decision: 'alert_admin',
    confidence: 1.0,
    auto_executed: true,
    escalated: true,
    outcome: emailOutcome === 'sent' ? 'sent' : 'failed',
    error_details: { email_outcome: emailOutcome, credit_errors: creditErrors.length },
    created_at: new Date().toISOString()
  }).catch(() => {});

  return { alerted: true, email_outcome: emailOutcome, credit_errors: creditErrors.length };
}

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

    // Check for credit exhaustion and alert admin if needed
    const creditAlert = await maybeSendApolloCreditAlert(supabase).catch(err => {
      console.warn('[ApolloDiscovery] Credit alert check failed:', err.message);
      return { alerted: false, reason: 'check_error' };
    });

    return { statusCode: 200, body: JSON.stringify({ ...result, ms, credit_alert: creditAlert }) };
  } catch (err) {
    console.error('[ApolloDiscovery] Error:', err.message);
    return { statusCode: 200, body: JSON.stringify({ error: err.message }) };
  }
};
