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
// ============================================================================

const { getSupabase, emitEvent, isScheduledInvocation } = require('./agent-fleet-runtime');
const { getAdapter } = require('./social-adapters');

const PER_CHANNEL_LIMIT = 10;

async function runOnce(supabase) {
  const { data: channels, error } = await supabase
    .from('social_channels')
    .select('*')
    .eq('enabled', true);
  if (error) throw new Error('social_channels read failed: ' + error.message);

  const summary = { channels: 0, fetched: 0, inserted: 0, emitted: 0, errors: [] };
  if (!channels || !channels.length) return summary;

  const sinceFloor = new Date(Date.now() - 60 * 60 * 1000); // 1h lookback safety net

  for (const ch of channels) {
    summary.channels++;
    let mentions = [];
    try {
      const adapter = getAdapter(ch.platform);
      mentions = await adapter.monitor({
        keywords: ch.monitor_keywords || [],
        since: ch.last_polled_at ? new Date(ch.last_polled_at) : sinceFloor,
        limit: PER_CHANNEL_LIMIT
      });
    } catch (e) {
      summary.errors.push({ channel_id: ch.id, platform: ch.platform, message: e.message });
      continue;
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

    // Stamp last_polled_at regardless of inserts so we don't re-fetch the
    // same window forever even when everything dedupes.
    await supabase.from('social_channels')
      .update({ last_polled_at: new Date().toISOString() })
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
    console.error('[social-monitor] failed:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
