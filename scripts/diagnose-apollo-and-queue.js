#!/usr/bin/env node
// Task #306 — one-shot production diagnostic for Apollo stall + outreach queue
// drain failure. Read-only. Hits prod Supabase via SUPABASE_SERVICE_ROLE_KEY.
//
//   node scripts/diagnose-apollo-and-queue.js

const { createClient } = require('../netlify/functions/node_modules/@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

(async () => {
  const out = {};

  const { data: state, error: stateErr } = await supabase
    .from('engine_state')
    .select('id, is_running, auto_send, paused_at, paused_by, pause_reason, total_messages_sent, total_leads_discovered, last_discovery_run, warmup_start_date, target_cities, metadata, updated_at')
    .eq('id', 1)
    .single();
  out.engine_state_error = stateErr?.message || null;
  if (state) {
    const cfg = state.metadata?.apollo_config || {};
    out.engine_state = {
      is_running: state.is_running,
      auto_send: state.auto_send,
      paused_at: state.paused_at,
      paused_by: state.paused_by,
      pause_reason: state.pause_reason,
      total_messages_sent: state.total_messages_sent,
      total_leads_discovered: state.total_leads_discovered,
      last_discovery_run: state.last_discovery_run,
      warmup_start_date: state.warmup_start_date,
      target_cities_count: (state.target_cities || []).length,
      city_rotation_index: state.metadata?.city_rotation_index,
      apollo_config: {
        enabled: cfg.enabled,
        interval_hours: cfg.interval_hours,
        per_page: cfg.per_page,
        auto_enrich: cfg.auto_enrich,
        last_run: cfg.last_run,
        last_successful_run: cfg.last_successful_run,
        last_successful_search_results: cfg.last_successful_search_results,
        last_successful_added: cfg.last_successful_added,
        last_successful_profile: cfg.last_successful_profile,
        city_rotation_index: cfg.city_rotation_index,
        page_rotation_index: cfg.page_rotation_index,
        profile_rotation_index: cfg.profile_rotation_index,
        running_since: cfg.running_since,
        running_nonce: cfg.running_nonce ? 'set' : null,
        search_profiles_count: (cfg.search_profiles || []).length,
        search_profile_names: (cfg.search_profiles || []).map(p => `${p.name} (${(p.cities || []).length} cities, ${(p.titles || []).length} titles, ${(p.industries || []).length} industries)`),
        instantly_auto_sync: cfg.instantly_auto_sync,
      },
    };
  }

  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const counts = {};
  for (const status of ['draft', 'approved', 'sent', 'failed', 'skipped', 'bounced']) {
    const { count } = await supabase
      .from('outreach_messages')
      .select('id', { count: 'exact', head: true })
      .eq('status', status);
    counts[status] = count || 0;
  }
  const { count: sentToday } = await supabase
    .from('outreach_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', todayStart.toISOString());
  const { count: sent24h } = await supabase
    .from('outreach_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', since24h);
  const { count: failed24h } = await supabase
    .from('outreach_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('created_at', since24h);
  const { count: approvedRecent } = await supabase
    .from('outreach_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .gte('created_at', since7d);
  out.message_counts = { ...counts, sent_today: sentToday || 0, sent_24h: sent24h || 0, failed_24h: failed24h || 0, approved_last_7d: approvedRecent || 0 };

  // Last 5 failed messages — root cause of "0 sent / 1084 queued"
  const { data: recentFailures } = await supabase
    .from('outreach_messages')
    .select('id, status, channel, subject, created_at, sent_at, lead_id')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(5);
  out.recent_failed_messages = recentFailures || [];

  // Last 5 send_failed activity rows — they carry the actual error string
  const { data: failActivity } = await supabase
    .from('outreach_activity_log')
    .select('event_type, metadata, created_at')
    .eq('event_type', 'send_failed')
    .order('created_at', { ascending: false })
    .limit(5);
  out.recent_send_failed_activity = failActivity || [];

  // Last 20 Apollo discovery cycle rows — confirms silent zero pattern
  const { data: apolloRows } = await supabase
    .from('outreach_activity_log')
    .select('event_type, metadata, created_at')
    .in('event_type', ['apollo_discovery_cycle', 'apollo_discovery_error'])
    .order('created_at', { ascending: false })
    .limit(20);
  out.apollo_recent_cycles = (apolloRows || []).map(r => ({
    when: r.created_at,
    type: r.event_type,
    error_kind: r.metadata?.error_kind,
    http_status: r.metadata?.http_status,
    error: r.metadata?.error,
    profile: r.metadata?.profile,
    city: r.metadata?.city,
    page: r.metadata?.page,
    search_results: r.metadata?.search_results,
    added: r.metadata?.added,
  }));

  // Was outreach-cycle even invoked recently? (look for recent outreach activity
  // of any kind to confirm cron reached the function)
  const { count: anyActivity24h } = await supabase
    .from('outreach_activity_log')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since24h);
  out.outreach_activity_rows_24h = anyActivity24h || 0;

  // Env presence (don't print values)
  out.env_presence = {
    APOLLO_API_KEY: Boolean(process.env.APOLLO_API_KEY),
    RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
