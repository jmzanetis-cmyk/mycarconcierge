// ============================================================================
// Social monitor — Scheduled Function (every 15 minutes per netlify.toml)
//
// Polls every enabled social_channels row through its platform adapter, dedupes
// against social_leads.external_id, inserts new rows with status='pending',
// then emits one `social.lead_discovered` event per new lead onto the
// agent_events bus. The Hunter handler consumes these events.
//
// Adapters return mock data when their credentials env vars are missing
// (see netlify/functions/social-adapters.js header) — that's intentional so
// the cron can ship dark and the operator can watch the pipeline before
// wiring real platform credentials per channel.
//
// Also exports `runOnce(supabase, { channelId })` so the admin "Run now"
// button can re-use the same logic for a single channel — bypassing the
// enabled flag (operator explicitly asked for it).
// ============================================================================

const { getSupabase, emitEvent, isScheduledInvocation } = require('./agent-fleet-runtime');
const { getAdapter } = require('./social-adapters');

const PER_CHANNEL_LIMIT = 10;

async function runOnce(supabase, opts = {}) {
  const { channelId = null } = opts;

  let q = supabase.from('social_channels').select('*');
  if (channelId) q = q.eq('id', channelId);
  else q = q.eq('enabled', true);

  const { data: channels, error } = await q;
  if (error) throw new Error('social_channels read failed: ' + error.message);

  const summary = { channels: 0, fetched: 0, inserted: 0, emitted: 0, errors: [] };
  if (!channels || !channels.length) return summary;

  const sinceFloor = new Date(Date.now() - 60 * 60 * 1000); // 1h lookback safety net
  const nowIso = new Date().toISOString();

  for (const ch of channels) {
    summary.channels++;
    let mentions = [];
    let runError = null;
    try {
      const adapter = getAdapter(ch.platform);
      mentions = await adapter.monitor({
        keywords: ch.monitor_keywords || [],
        since: ch.last_polled_at ? new Date(ch.last_polled_at) : sinceFloor,
        limit: PER_CHANNEL_LIMIT
      });
    } catch (e) {
      runError = e.message;
      summary.errors.push({ channel_id: ch.id, platform: ch.platform, message: e.message });
    }
    summary.fetched += mentions.length;

    for (const m of mentions) {
      // Dedupe via the unique (platform, external_id) constraint.
      const { data: ins, error: insErr } = await supabase
        .from('social_leads')
        .insert({
          platform: ch.platform,
          channel_id: ch.id,
          external_id: m.external_id,
          profile_url: m.profile_url,
          author_handle: m.author_handle,
          raw_text: m.text,
          context: m.context || {},
          lead_type: m.context?.lead_hint || 'unknown',
          status: 'pending'
        })
        .select('id')
        .single();
      if (insErr) {
        // 23505 = unique violation = already saw this lead. That's fine.
        if (insErr.code !== '23505') {
          summary.errors.push({ channel_id: ch.id, external_id: m.external_id, message: insErr.message });
        }
        continue;
      }
      summary.inserted++;

      const evt = await emitEvent(supabase, 'social.lead_discovered', {
        social_lead_id: ins.id,
        platform: ch.platform,
        channel_id: ch.id,
        author_handle: m.author_handle,
        profile_url: m.profile_url,
        text_preview: (m.text || '').slice(0, 280),
        lead_hint: m.context?.lead_hint || 'unknown'
      }, 'social-monitor');
      if (evt?.event_id) summary.emitted++;
    }

    // Stamp last_polled_at + run health into the channel row's config blob so
    // the admin UI can surface "last polled X ago / last error: Y / N errors in 24h".
    // We keep a small ring buffer of recent errors (cap 20) so the UI can
    // compute a 24h error count without needing a separate metrics table.
    const config = { ...(ch.config || {}) };
    config.last_run_at = nowIso;
    config.last_run_fetched = mentions.length;
    const errors = Array.isArray(config.recent_errors) ? config.recent_errors.slice() : [];
    if (runError) {
      config.last_error_at = nowIso;
      config.last_error_message = runError.slice(0, 500);
      errors.push({ at: nowIso, message: runError.slice(0, 500) });
    } else {
      delete config.last_error_at;
      delete config.last_error_message;
    }
    // Drop entries older than 48h and cap to last 20.
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    config.recent_errors = errors
      .filter(e => new Date(e.at).getTime() >= cutoff)
      .slice(-20);
    await supabase.from('social_channels')
      .update({ last_polled_at: nowIso, config })
      .eq('id', ch.id);
  }

  return summary;
}

exports.handler = async function(event) {
  // Allow scheduled invocation OR an admin-password-protected manual trigger
  // (handy from the admin console once a UI lands).
  const isScheduled = isScheduledInvocation(event);
  const adminPwd = event?.headers?.['x-admin-password'] || event?.headers?.['X-Admin-Password'];
  const ok = isScheduled || (adminPwd && adminPwd === process.env.ADMIN_PASSWORD);
  if (!ok) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

  try {
    const supabase = getSupabase();
    const summary = await runOnce(supabase);
    return { statusCode: 200, body: JSON.stringify({ ok: true, summary }) };
  } catch (e) {
    // Return 200 so repeated cron invocations don't generate HTTP-500 noise while
    // the social_channels table or pipeline is not yet wired up in this environment.
    console.error('[social-monitor] failed:', e);
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};

exports.runOnce = runOnce;
