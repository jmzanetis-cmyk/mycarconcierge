// ============================================================================
// maintenance-reminders-scheduled — daily vehicle maintenance reminder sender
//
// Runs daily at 08:00 UTC. For each maintenance_reminders row where:
//   - status = 'pending'
//   - reminder_date <= today (due or overdue)
//
// Checks the member's notification preferences and sends via:
//   - Email (Resend) if maintenance_reminder_emails pref is true (default on)
//   - SMS (Twilio) if maintenance_reminder_sms pref is true (default off)
//
// Marks reminder status = 'sent' and sets sent_at on success.
// ============================================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');
const { sendSms } = require('./_shared/sms');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function sendReminderEmail({ to, name, vehicleInfo, reminderType, notes, serviceDate }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.MCC_FROM_EMAIL || 'My Car Concierge <noreply@mycarconcierge.com>';
  if (!apiKey || !to) return { sent: false, reason: 'not_configured' };

  const serviceLabel = (reminderType || 'maintenance').replace(/_/g, ' ');
  const dueLine = serviceDate
    ? `due on ${new Date(serviceDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
    : 'due now';

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e;">
      <div style="background:linear-gradient(135deg,#1e2d5a,#0f172a);padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:1.4rem;">My Car Concierge</h1>
        <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:0.9rem;">Vehicle Maintenance Reminder</p>
      </div>
      <div style="background:#fff;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">
        <p style="margin:0 0 16px;">Hi ${name || 'there'},</p>
        <p style="margin:0 0 16px;">
          Your <strong>${vehicleInfo || 'vehicle'}</strong> has a <strong>${serviceLabel}</strong> service ${dueLine}.
        </p>
        ${notes ? `<p style="margin:0 0 16px;padding:12px 16px;background:#f8fafc;border-left:4px solid #22d3ee;border-radius:4px;font-size:0.92rem;">${notes}</p>` : ''}
        <p style="margin:0 0 24px;">Log in to My Car Concierge to get competing quotes from vetted local providers.</p>
        <a href="https://www.mycarconcierge.com/members.html" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#22d3ee,#0ea5e9);color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.95rem;">Get Service Quotes</a>
        <p style="margin:24px 0 0;font-size:0.82rem;color:#6b7280;">
          To update your reminder preferences, visit <a href="https://www.mycarconcierge.com/members-settings.html" style="color:#22d3ee;">notification settings</a>.
        </p>
      </div>
    </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: `Reminder: ${serviceLabel} due for your ${vehicleInfo || 'vehicle'}`, html }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[maintenance-reminders] Resend error:', err);
      return { sent: false, reason: 'resend_error' };
    }
    return { sent: true };
  } catch (e) {
    console.error('[maintenance-reminders] email error:', e.message);
    return { sent: false, reason: e.message };
  }
}

exports.handler = async function() {
  const supabase = getSupabase();
  if (!supabase) {
    console.error('[maintenance-reminders] Supabase not configured');
    return { statusCode: 200, body: JSON.stringify({ sent: 0, error: 'no_db' }) };
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Find due reminders
  const { data: reminders, error: rErr } = await supabase
    .from('maintenance_reminders')
    .select('id, member_id, vehicle_id, reminder_type, reminder_date, notes, status, customer_email, customer_phone, customer_name, vehicle_info, service_date')
    .eq('status', 'pending')
    .lte('reminder_date', today)
    .limit(100);

  if (rErr) {
    console.error('[maintenance-reminders] query error:', rErr.message);
    return { statusCode: 200, body: JSON.stringify({ sent: 0, error: rErr.message }) };
  }

  if (!reminders?.length) {
    console.log('[maintenance-reminders] no due reminders');
    return { statusCode: 200, body: JSON.stringify({ sent: 0 }) };
  }

  // Batch-load member notification preferences
  const memberIds = [...new Set(reminders.map(r => r.member_id).filter(Boolean))];
  let prefMap = {};
  if (memberIds.length) {
    const { data: prefs } = await supabase
      .from('member_notification_preferences')
      .select('member_id, maintenance_reminder_emails, maintenance_reminder_sms')
      .in('member_id', memberIds);
    for (const p of prefs || []) prefMap[p.member_id] = p;
  }

  let totalSent = 0;
  const now = new Date().toISOString();

  for (const r of reminders) {
    const prefs = prefMap[r.member_id] || {};
    const emailEnabled = prefs.maintenance_reminder_emails !== false; // default on
    const smsEnabled   = prefs.maintenance_reminder_sms   === true;  // default off

    const name        = r.customer_name  || 'Member';
    const email       = r.customer_email || null;
    const phone       = r.customer_phone || null;
    const vehicleInfo = r.vehicle_info   || 'your vehicle';

    let anySent = false;

    if (emailEnabled && email) {
      const res = await sendReminderEmail({
        to: email, name, vehicleInfo,
        reminderType: r.reminder_type,
        notes: r.notes,
        serviceDate: r.service_date,
      });
      if (res.sent) anySent = true;
    }

    if (smsEnabled && phone) {
      const serviceLabel = (r.reminder_type || 'maintenance').replace(/_/g, ' ');
      const msg = `MCC: ${serviceLabel} reminder for ${vehicleInfo}. Log in to get service quotes: mycarconcierge.com`;
      const res = await sendSms({ to: phone, body: msg }, supabase);
      if (res.sent) anySent = true;
    }

    if (anySent || (!emailEnabled && !smsEnabled)) {
      await supabase
        .from('maintenance_reminders')
        .update({ status: 'sent', sent_at: now })
        .eq('id', r.id);
      totalSent++;
    }
  }

  console.log(`[maintenance-reminders] sent ${totalSent} of ${reminders.length} reminders`);
  return { statusCode: 200, body: JSON.stringify({ sent: totalSent, checked: reminders.length }) };
};
