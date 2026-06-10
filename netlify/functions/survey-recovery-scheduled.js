// ============================================================================
// survey-recovery-scheduled — daily abandoned-signup recovery email
//
// Runs daily at 10:00 UTC. Queries abandoned_signups where:
//   - recovery_email_sent_at IS NULL
//   - recovered = false
//
// Sends one recovery email per row via Resend, then sets recovery_email_sent_at.
// Max 200 rows per run to stay within Resend rate limits.
//
// Env: RESEND_API_KEY, MCC_FROM_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function sendRecoveryEmail({ to, firstName }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.MCC_FROM_EMAIL || 'My Car Concierge <noreply@mycarconcierge.com>';
  if (!apiKey || !to) return { sent: false, reason: 'not_configured' };

  const greeting = firstName ? `Hi ${firstName}` : 'Hi there';

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e;">
      <div style="background:linear-gradient(135deg,#1e2d5a,#0f172a);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:1.4rem;">My Car Concierge</h1>
        <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:0.9rem;">Your car care, simplified</p>
      </div>
      <div style="background:#fff;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">
        <p style="font-size:1rem;margin:0 0 16px;">${greeting},</p>
        <p style="margin:0 0 16px;">You started signing up for My Car Concierge but didn't quite finish. We'd love to have you.</p>
        <p style="margin:0 0 24px;">With MCC you get a personal automotive advisor, trusted provider access, and a full vehicle history — all in one place.</p>
        <a href="https://app.mycarconcierge.co/survey" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#c9a227,#e6b84a);color:#12161c;font-weight:700;border-radius:100px;text-decoration:none;font-size:0.95rem;">Complete My Signup</a>
        <p style="margin:24px 0 0;font-size:0.8rem;color:#6b7280;">Questions? Reply to this email and we'll help you out.</p>
      </div>
    </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: 'Complete your My Car Concierge signup', html }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[survey-recovery] Resend non-2xx:', res.status, txt.slice(0, 200));
      return { sent: false, reason: `resend_error:${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error('[survey-recovery] email send threw:', e.message);
    return { sent: false, reason: 'exception' };
  }
}

exports.handler = async function() {
  const supabase = getSupabase();
  if (!supabase) {
    console.error('[survey-recovery] Supabase not configured');
    return { statusCode: 200, body: JSON.stringify({ sent: 0, error: 'no_db' }) };
  }

  const { data: rows, error: qErr } = await supabase
    .from('abandoned_signups')
    .select('id, email, type')
    .is('recovery_email_sent_at', null)
    .eq('recovered', false)
    .limit(200);

  if (qErr) {
    console.error('[survey-recovery] query error:', qErr.message);
    return { statusCode: 200, body: JSON.stringify({ sent: 0, error: qErr.message }) };
  }

  let sent = 0;
  let failed = 0;
  const now = new Date().toISOString();

  for (const row of rows || []) {
    const result = await sendRecoveryEmail({ to: row.email, firstName: null });
    if (result.sent) {
      await supabase.from('abandoned_signups')
        .update({ recovery_email_sent_at: now })
        .eq('id', row.id);
      sent++;
    } else {
      console.warn('[survey-recovery] email skipped for row', row.id, ':', result.reason);
      failed++;
    }
  }

  console.log(`[survey-recovery] done — sent=${sent} failed=${failed}`);
  return { statusCode: 200, body: JSON.stringify({ sent, failed }) };
};
