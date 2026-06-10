// GET /api/appointments/:id/ical — download .ics calendar file for a confirmed service appointment
const { createClient } = require('@supabase/supabase-js');

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function errJson(status, msg) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' },
    body: JSON.stringify({ error: msg }),
  };
}

async function getUser(event, sb) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: errJson(401, 'Missing token') };
  const { data: { user }, error } = await sb.auth.getUser(m[1].trim());
  if (error || !user) return { error: errJson(401, 'Invalid token') };
  return { user };
}

function icsDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const d = dateStr.replace(/-/g, '');
  if (!timeStr) return d; // all-day
  const t = timeStr.replace(/:/g, '').substring(0, 6).padEnd(6, '0');
  return `${d}T${t}`;
}

function escapeIcs(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }, body: '' };
  }
  if (event.httpMethod !== 'GET') return errJson(405, 'Method not allowed');

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  // Path: /api/appointments/:id/ical
  const apptId = (event.path || '').replace(/.*\/api\/appointments\//, '').replace(/\/ical\/?$/, '').trim();
  if (!apptId) return errJson(400, 'Appointment ID required');

  const { data: appt, error: apptErr } = await sb
    .from('service_appointments')
    .select('id, package_id, member_id, provider_id, confirmed_date, confirmed_time_start, confirmed_time_end, member_notes')
    .eq('id', apptId)
    .single();

  if (apptErr || !appt) return errJson(404, 'Appointment not found');
  if (appt.member_id !== auth.user.id && appt.provider_id !== auth.user.id) return errJson(403, 'Forbidden');

  let title = 'Service Appointment';
  if (appt.package_id) {
    const { data: pkg } = await sb.from('maintenance_packages').select('title').eq('id', appt.package_id).single();
    if (pkg?.title) title = pkg.title;
  }

  const dtStart = icsDateTime(appt.confirmed_date, appt.confirmed_time_start);
  const dtEnd   = icsDateTime(appt.confirmed_date, appt.confirmed_time_end);
  const now     = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//My Car Concierge//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${appt.id}@mycarconcierge.com`,
    `DTSTAMP:${now}`,
    dtStart
      ? `DTSTART:${dtStart}`
      : `DTSTART;VALUE=DATE:${(appt.confirmed_date || '').replace(/-/g, '')}`,
    dtEnd ? `DTEND:${dtEnd}` : null,
    `SUMMARY:${escapeIcs(title)}`,
    appt.member_notes ? `DESCRIPTION:${escapeIcs(appt.member_notes)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="mcc-appointment.ics"',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
    body: lines,
  };
};
