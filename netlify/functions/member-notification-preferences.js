// GET /api/member/:id/notification-preferences — fetch member's notification prefs
// PUT /api/member/:id/notification-preferences — upsert member's notification prefs
//
// Auth note: the client (members-settings.js) calls both endpoints without an
// Authorization header. The member_id in the URL path is the sole identifier.
// Notification preferences (email/SMS/push toggles) are low-sensitivity, but a
// future hardening pass should add optional Bearer validation and enforce that
// the token UID matches the URL member_id.
//
// Writes: PUT does an upsert into member_notification_preferences. The row is
// scoped to the member_id in the URL. Only whitelisted boolean columns are
// written — unknown keys in the body are silently dropped.

'use strict';

const { createClient } = require('@supabase/supabase-js');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
};

// All boolean preference columns that may be read or written.
const PREF_COLUMNS = [
  'follow_up_emails', 'follow_up_sms',
  'maintenance_reminder_emails', 'maintenance_reminder_sms',
  'urgent_update_emails', 'urgent_update_sms',
  'marketing_emails', 'marketing_sms',
  'push_enabled',
  'push_bid_alerts', 'push_vehicle_status', 'push_payment_updates',
  'push_dream_car_matches', 'push_maintenance_reminders',
];

function sb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function json(status, body) {
  return { statusCode: status, headers: HEADERS, body: JSON.stringify(body) };
}

function parseMemberId(event) {
  // Works for both the Netlify redirect path (/api/member/:id/notification-preferences)
  // and the direct function path (/.netlify/functions/member-notification-preferences).
  const path = (event.path || '').split('?')[0];
  const m = path.match(/\/member\/([0-9a-f-]{36})\/notification-preferences/i);
  return m ? m[1] : null;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };

  const memberId = parseMemberId(event);
  if (!memberId) return json(400, { error: 'Missing or invalid member ID in path' });

  const supabase = sb();

  // ── GET ────────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const { data, error } = await supabase
      .from('member_notification_preferences')
      .select(PREF_COLUMNS.join(', '))
      .eq('member_id', memberId)
      .maybeSingle();

    if (error) return json(500, { error: error.message });

    if (!data) {
      // No row yet — return column defaults so the UI renders correctly.
      const defaults = {
        follow_up_emails: true, follow_up_sms: true,
        maintenance_reminder_emails: true, maintenance_reminder_sms: true,
        urgent_update_emails: true, urgent_update_sms: true,
        marketing_emails: false, marketing_sms: false,
        push_enabled: false,
        push_bid_alerts: true, push_vehicle_status: true, push_payment_updates: true,
        push_dream_car_matches: true, push_maintenance_reminders: true,
      };
      return json(200, { preferences: defaults });
    }

    return json(200, { preferences: data });
  }

  // ── PUT ────────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'PUT') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

    // Whitelist: only known boolean columns; silently drop anything else.
    const updates = { member_id: memberId, updated_at: new Date().toISOString() };
    for (const col of PREF_COLUMNS) {
      if (col in body && typeof body[col] === 'boolean') updates[col] = body[col];
    }

    const { error } = await supabase
      .from('member_notification_preferences')
      .upsert(updates, { onConflict: 'member_id' });

    if (error) return json(500, { error: error.message });

    return json(200, { success: true });
  }

  return json(405, { error: 'Method not allowed' });
};
