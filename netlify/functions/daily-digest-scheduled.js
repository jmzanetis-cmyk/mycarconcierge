const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function aiOpsSendSMS(toPhone, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from || !toPhone) return { sent: false };
  try {
    const clean = toPhone.replace(/\D/g, '');
    const to = clean.startsWith('1') ? `+${clean}` : `+1${clean}`;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const form = new URLSearchParams({ To: to, From: from, Body: body });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    return r.ok ? { sent: true } : { sent: false };
  } catch { return { sent: false }; }
}

async function callAI(prompt, maxTokens = 256) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await r.json();
      return { text: data.content?.[0]?.text || '' };
    } catch {}
  }
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await r.json();
      return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' };
    } catch {}
  }
  throw new Error('No AI provider available');
}

exports.handler = async function(event, context) {
  console.log('[DailyDigest] Scheduled run triggered at', new Date().toISOString());
  const t0 = Date.now();

  const supabase = getSupabase();
  if (!supabase) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_database' }) };
  }

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: actions } = await supabase
      .from('ai_action_log')
      .select('module, action_type, outcome, confidence, auto_executed, escalated, created_at')
      .gte('created_at', since);

    const byModule = {};
    for (const a of (actions || [])) {
      if (!byModule[a.module]) byModule[a.module] = { total: 0, auto_executed: 0, escalated: 0, outcomes: {} };
      byModule[a.module].total++;
      if (a.auto_executed) byModule[a.module].auto_executed++;
      if (a.escalated) byModule[a.module].escalated++;
      byModule[a.module].outcomes[a.outcome] = (byModule[a.module].outcomes[a.outcome] || 0) + 1;
    }

    const totalActions = (actions || []).length;
    const today = new Date().toISOString().split('T')[0];

    let narrative = `AI Ops Daily Digest — ${today}. Total actions: ${totalActions}`;
    if (totalActions > 0) {
      try {
        const r = await callAI(`Write a 2-3 sentence daily digest for My Car Concierge AI Ops. Stats: ${JSON.stringify(byModule)}. Keep concise and informative for the admin.`, 256);
        if (r.text) narrative = r.text;
      } catch {}
    }

    const { error: upsertErr } = await supabase.from('ai_daily_digests').upsert({
      date: today,
      narrative,
      stats: byModule,
      sent_sms: false,
      created_at: new Date().toISOString()
    }, { onConflict: 'date' });

    if (upsertErr) console.error('[DailyDigest] Upsert error:', upsertErr.message);

    // Send SMS to admin
    const adminPhone = process.env.ADMIN_PHONE_NUMBER;
    let smsSent = false;
    if (adminPhone) {
      const escalated = Object.values(byModule).reduce((s, m) => s + (m.escalated || 0), 0);
      const autoExec = Object.values(byModule).reduce((s, m) => s + (m.auto_executed || 0), 0);
      const smsBody = `MCC AI Ops | ${today} | Actions: ${totalActions} | Auto-exec: ${autoExec} | Escalated: ${escalated}. ${narrative.slice(0, 100)}`;
      const smsResult = await aiOpsSendSMS(adminPhone, smsBody);
      smsSent = smsResult.sent;
      if (smsSent) {
        await supabase.from('ai_daily_digests').update({ sent_sms: true }).eq('date', today);
      }
    }

    const result = { success: true, date: today, totalActions, sms_sent: smsSent, ms: Date.now() - t0 };
    console.log('[DailyDigest] Complete:', JSON.stringify(result));
    return { statusCode: 200, body: JSON.stringify(result) };

  } catch (err) {
    console.error('[DailyDigest] Error:', err.message);
    return { statusCode: 200, body: JSON.stringify({ error: err.message }) };
  }
};
