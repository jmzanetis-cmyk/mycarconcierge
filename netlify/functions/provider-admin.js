// ============================================================================
// provider-admin
//
// Privileged provider lifecycle endpoints. Replaces the browser-side
// supabaseClient.from('profiles').update({ suspension_reason, suspended_at })
// calls in www/admin.js so suspend/activate cannot be performed by anyone who
// just happens to reach the admin page — the ADMIN_PASSWORD header is required
// and every action leaves an admin_audit_log row.
//
// Routes (mounted at /.netlify/functions/provider-admin/* and proxied from
// /api/admin/provider-actions/* via www/_redirects):
//
//   POST /suspend           { provider_ids: uuid[], reason: string }
//   POST /activate          { provider_ids: uuid[] }
//   POST /check-low-rated   { rating_threshold?: number, autosuspend?: boolean, reason?: string }
//
// All routes require the x-admin-password header to match ADMIN_PASSWORD.
// All routes use the service-role Supabase client so they bypass RLS.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'My Car Concierge <noreply@mycarconcierge.com>';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function authenticateAdmin(event) {
  const headers = event.headers || {};
  const pw = (headers['x-admin-password'] || headers['X-Admin-Password'] || '').trim();
  const tk = (headers['x-admin-token']    || headers['X-Admin-Token']    || '').trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return pw === adminPassword || tk === adminPassword;
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, x-admin-token, X-Admin-Password, x-admin-password',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

function isUuid(v) {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// Best-effort audit row writer. Never throws — audit failures must not block the
// privileged action they describe (the action already happened).
async function audit(supabase, row) {
  try {
    await supabase.from('admin_audit_log').insert(row);
  } catch (e) {
    console.error('[provider-admin] audit write failed:', e.message);
  }
}

// Best-effort email send. Returns boolean. Never throws.
async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return false;
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    return true;
  } catch (e) {
    console.error('[provider-admin] email send failed:', e.message);
    return false;
  }
}

async function suspendProviders(supabase, providerIds, reason, source = 'manual') {
  // Returns { updated: N, failed: [{id,error}], updated_ids: [...] } per the
  // task spec contract. updated_ids is included for the admin UI's audit trail
  // but the canonical "did it work" signal is the numeric `updated` count.
  const updatedIdsArr = [];
  const failed = [];
  const suspendedAt = new Date().toISOString();

  // Batch update in a single statement — atomic for the matched rows.
  const { data, error } = await supabase
    .from('profiles')
    .update({ suspension_reason: reason, suspended_at: suspendedAt })
    .in('id', providerIds)
    .select('id, email, full_name, business_name');

  if (error) {
    return { updated: 0, failed: providerIds.map(id => ({ id, error: error.message })), updated_ids: [] };
  }

  const returnedIds = new Set((data || []).map(r => r.id));
  for (const id of providerIds) {
    if (returnedIds.has(id)) updatedIdsArr.push(id);
    else failed.push({ id, error: 'profile not found' });
  }

  // Fan out: audit + email + notification per provider. All best-effort, in
  // parallel. Email failures must not roll back the suspend.
  await Promise.all((data || []).map(async (p) => {
    await audit(supabase, {
      action: source === 'autosuspend' ? 'autosuspend_low_rated' : 'suspend_provider',
      target_id: p.id, target_type: 'profile',
      reason, metadata: { source, suspended_at: suspendedAt },
      performed_by: 'admin'
    });
    if (p.email) {
      await sendEmail(p.email,
        'Your My Car Concierge provider account has been suspended',
        `<p>Hi ${p.full_name || p.business_name || 'there'},</p>
         <p>Your provider account on My Car Concierge has been suspended for the following reason:</p>
         <blockquote style="border-left:3px solid #b8942d; padding-left:12px; color:#555;">${reason}</blockquote>
         <p>You will not receive new bookings while suspended. Please reply to this email or contact support if you'd like to discuss reinstatement.</p>
         <p>— My Car Concierge</p>`);
    }
    // In-app notification mirrors the email so providers see it on next login.
    try {
      await supabase.from('notifications').insert({
        user_id: p.id, type: 'account_suspended',
        title: 'Account Suspended',
        message: `Your provider account has been suspended. Reason: ${reason}`
      });
    } catch (e) { /* non-critical */ }
  }));

  return { updated: updatedIdsArr.length, failed, updated_ids: updatedIdsArr };
}

async function activateProviders(supabase, providerIds) {
  const updatedIdsArr = [];
  const failed = [];

  const { data, error } = await supabase
    .from('profiles')
    .update({ suspension_reason: null, suspended_at: null })
    .in('id', providerIds)
    .select('id, email, full_name, business_name');

  if (error) {
    return { updated: 0, failed: providerIds.map(id => ({ id, error: error.message })), updated_ids: [] };
  }

  const returnedIds = new Set((data || []).map(r => r.id));
  for (const id of providerIds) {
    if (returnedIds.has(id)) updatedIdsArr.push(id);
    else failed.push({ id, error: 'profile not found' });
  }

  await Promise.all((data || []).map(async (p) => {
    await audit(supabase, {
      action: 'activate_provider',
      target_id: p.id, target_type: 'profile',
      performed_by: 'admin'
    });
    if (p.email) {
      await sendEmail(p.email,
        'Your My Car Concierge provider account is reactivated',
        `<p>Hi ${p.full_name || p.business_name || 'there'},</p>
         <p>Good news — your provider account has been reactivated. You'll start receiving new booking opportunities again right away.</p>
         <p>— My Car Concierge</p>`);
    }
    try {
      await supabase.from('notifications').insert({
        user_id: p.id, type: 'account_reactivated',
        title: 'Account Reactivated',
        message: 'Your provider account has been reactivated and you will receive new bookings.'
      });
    } catch (e) { /* non-critical */ }
  }));

  return { updated: updatedIdsArr.length, failed, updated_ids: updatedIdsArr };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  if (!authenticateAdmin(event)) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  // Strip both the netlify-functions prefix and the /api/admin/provider-actions
  // proxy prefix so the same handler works from either entry point.
  const route = (event.path || '')
    .replace(/^\/?\.netlify\/functions\/provider-admin\/?/, '')
    .replace(/^\/?api\/admin\/provider-actions\/?/, '')
    .replace(/^\/+/, '');
  const method = event.httpMethod;
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch { return jsonResponse(400, { error: 'invalid JSON body' }); }
  }

  try {
    if (route === 'suspend' && method === 'POST') {
      const ids = Array.isArray(body.provider_ids) ? body.provider_ids.filter(isUuid) : [];
      const reason = (body.reason || '').toString().trim();
      if (ids.length < 1 || ids.length > 100) return jsonResponse(400, { error: 'provider_ids must be 1-100 valid uuids' });
      if (reason.length < 5 || reason.length > 500) return jsonResponse(400, { error: 'reason must be 5-500 characters' });
      const result = await suspendProviders(supabase, ids, reason, 'manual');
      return jsonResponse(200, result);
    }

    if (route === 'activate' && method === 'POST') {
      const ids = Array.isArray(body.provider_ids) ? body.provider_ids.filter(isUuid) : [];
      if (ids.length < 1 || ids.length > 100) return jsonResponse(400, { error: 'provider_ids must be 1-100 valid uuids' });
      const result = await activateProviders(supabase, ids);
      return jsonResponse(200, result);
    }

    if (route === 'check-low-rated' && method === 'POST') {
      const threshold = Number.isFinite(body.rating_threshold) ? body.rating_threshold : 4;
      const autosuspend = !!body.autosuspend;
      const reason = (body.reason || `Rating below ${threshold} stars - automatic suspension`).toString().trim();

      // Server-side query — fetch low-rated stats first, then join to profiles
      // by id. Avoids a PostgREST embed ambiguity ("more than one relationship
      // was found for 'profiles' and 'provider_stats'") on this schema.
      const { data: stats, error: statsErr } = await supabase
        .from('provider_stats')
        .select('provider_id, average_rating, suspended')
        .lt('average_rating', threshold)
        .not('average_rating', 'is', null);
      if (statsErr) return jsonResponse(500, { error: statsErr.message });

      const candidateIds = (stats || []).filter(s => !s.suspended).map(s => s.provider_id);
      let profiles = [];
      if (candidateIds.length > 0) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, business_name, email, suspension_reason')
          .in('id', candidateIds)
          .is('suspension_reason', null);
        if (error) return jsonResponse(500, { error: error.message });
        profiles = data || [];
      }
      const ratingByProviderId = new Map((stats || []).map(s => [s.provider_id, s.average_rating]));
      const lowRated = profiles.map(p => ({ ...p, avg_rating: ratingByProviderId.get(p.id) }));

      await audit(supabase, {
        action: 'check_low_rated',
        target_type: 'profile',
        metadata: { threshold, found: lowRated.length, autosuspend },
        performed_by: 'admin'
      });

      if (autosuspend && lowRated.length > 0) {
        const ids = lowRated.map(p => p.id);
        const result = await suspendProviders(supabase, ids, reason, 'autosuspend');
        return jsonResponse(200, {
          found: lowRated.length, threshold,
          providers: lowRated.map(p => ({ id: p.id, name: p.business_name || p.full_name, avg_rating: p.avg_rating })),
          autosuspend: true,
          suspended: result.updated, failed: result.failed
        });
      }

      return jsonResponse(200, {
        found: lowRated.length, threshold,
        providers: lowRated.map(p => ({ id: p.id, name: p.business_name || p.full_name, avg_rating: p.avg_rating })),
        autosuspend: false
      });
    }

    return jsonResponse(404, { error: 'Not found', path: route, method });
  } catch (e) {
    console.error('[provider-admin] handler error:', e);
    return jsonResponse(500, { error: e.message });
  }
};
