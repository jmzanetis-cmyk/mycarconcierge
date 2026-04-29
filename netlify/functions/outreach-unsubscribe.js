const { createSupabaseClient } = require('./outreach-engine-core');

async function addToResendSuppressionList(email) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !email) return;
  try {
    await fetch('https://api.resend.com/audiences/suppression', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });
  } catch (err) {
    console.warn('[Unsubscribe] Resend suppression API error:', err.message);
  }
}

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    return { statusCode: 500, headers, body: 'Service unavailable' };
  }

  const params = event.queryStringParameters || {};

  if (event.httpMethod === 'GET') {
    const email = params.email || '';
    const leadId = params.id || '';
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribe — My Car Concierge</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#12161c;color:#e5e5e5;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px;}
.card{background:#1a1f2e;border-radius:12px;padding:40px;max-width:480px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.4);}
h1{color:#c9a84c;font-size:24px;margin-bottom:16px;}
p{color:#9ca3af;line-height:1.6;}
button{background:#c9a84c;color:#12161c;border:none;padding:14px 32px;font-size:16px;font-weight:600;border-radius:8px;cursor:pointer;margin-top:20px;}
button:hover{background:#b8942d;}
.done{color:#4ade80;font-weight:600;}
</style></head><body>
<div class="card">
<h1>Unsubscribe</h1>
<p>We're sorry to see you go. Click below to unsubscribe from My Car Concierge outreach emails.</p>
<form method="POST" action="/unsubscribe">
<input type="hidden" name="email" value="${email.replaceAll('"', '&quot;')}">
<input type="hidden" name="id" value="${leadId.replaceAll('"', '&quot;')}">
<button type="submit">Unsubscribe Me</button>
</form>
</div></body></html>`
    };
  }

  if (event.httpMethod === 'POST') {
    let email = '';
    let leadId = '';

    const contentType = event.headers['content-type'] || '';
    if (contentType.includes('application/x-www-form-urlencoded') && event.body) {
      const formParams = new URLSearchParams(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body);
      email = formParams.get('email') || '';
      leadId = formParams.get('id') || '';
    } else if (event.body) {
      try {
        const body = JSON.parse(event.body);
        email = body.email || '';
        leadId = body.id || '';
      } catch (e) {}
    }

    if (leadId) {
      const { data: lead } = await supabase.from('outreach_leads').select('email').eq('id', leadId).maybeSingle();
      const resolvedEmail = email || lead?.email || '';
      await supabase.from('outreach_leads').update({ status: 'unsubscribed' }).eq('id', leadId);
      await supabase.from('outreach_activity_log').insert({
        lead_id: leadId, event_type: 'unsubscribed', metadata: { email: resolvedEmail, method: 'link' }
      });
      if (resolvedEmail) {
        await addToResendSuppressionList(resolvedEmail);
      }
    } else if (email) {
      const { data: leads } = await supabase.from('outreach_leads').select('id').eq('email', email);
      for (const lead of (leads || [])) {
        await supabase.from('outreach_leads').update({ status: 'unsubscribed' }).eq('id', lead.id);
        await supabase.from('outreach_activity_log').insert({
          lead_id: lead.id, event_type: 'unsubscribed', metadata: { email, method: 'link' }
        });
      }
      await addToResendSuppressionList(email);
    }

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribed — My Car Concierge</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#12161c;color:#e5e5e5;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px;}
.card{background:#1a1f2e;border-radius:12px;padding:40px;max-width:480px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.4);}
h1{color:#4ade80;font-size:24px;margin-bottom:16px;}
p{color:#9ca3af;line-height:1.6;}
</style></head><body>
<div class="card">
<h1>You've been unsubscribed</h1>
<p>You will no longer receive outreach emails from My Car Concierge. This may take up to 24 hours to fully process.</p>
<p style="margin-top:24px;font-size:14px;">If this was a mistake, contact us at <a href="mailto:jordan@mycarconcierge.com" style="color:#c9a84c;">jordan@mycarconcierge.com</a></p>
</div></body></html>`
    };
  }

  return { statusCode: 405, headers, body: 'Method not allowed' };
};
