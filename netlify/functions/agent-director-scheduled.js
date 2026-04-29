// ============================================================================
// MCC Agent Fleet — Director (acquisition-focused chief of staff)
//
// Scheduled every 15 minutes (cron in netlify.toml). The Director's mission
// is NOT to babysit infrastructure — it's to make sure the other agents are
// actually pulling customers through the funnel (leads → applications →
// bookings → completed jobs) and to page the admin with the SPECIFIC next
// action the moment any acquisition lever stalls.
//
// Checks (each returns null on healthy, a finding on stalled):
//   1. checkGatekeeperFailing    — Gatekeeper errors stack up → providers
//                                  are getting silently dropped on the floor.
//                                  Detects Anthropic-credit, auth, and
//                                  generic failures and surfaces the
//                                  matching fix in next_action.
//   2. checkPromoterBacklog      — drafts pile up unpublished → reach lost.
//   3. checkPromoterIdle         — no drafts in 7d → social went dark.
//   4. checkHunterStalled        — fresh social_leads not getting scored
//                                  within 2h → top-of-funnel routing broken.
//   5. checkSocialMonitorDry     — channels enabled but 0 new leads in 24h
//                                  → channels misconfigured or returning
//                                  nothing useful.
//   6. checkMatchmakerSilent     — closed auctions sitting >1h without a
//                                  Matchmaker rank → members waiting blind.
//   7. checkFunnelDrop           — last-24h signups < 50% of trailing 7d
//                                  daily avg → top-of-funnel anomaly.
//
// Daily digest at 11:00 UTC (~7am ET): one summary text + email even on
// quiet days so silence is unambiguous ("3 leads, 1 provider approved,
// 0 new members yesterday").
//
// Dedupe: each finding has a stable alert_key. The first fire pages
// immediately; subsequent fires of the same open alert only re-page if the
// severity is 'critical' AND ≥6h have passed since the last page. When the
// underlying condition clears, the Director sets resolved_at; a future
// re-occurrence is then treated as a new first-fire and pages again.
//
// Quiet hours (default 02:00-11:00 UTC ≈ 10pm-7am ET): non-critical alerts
// are still recorded but the SMS/email is suppressed. Critical alerts
// (Gatekeeper failing, Hunter stalled) ALWAYS page through. The morning
// digest fires at the 11:00 UTC tick to greet the operator.
//
// Auth: same model as agent-orchestrator — scheduled invocations OR an
// admin-password header for on-demand runs from the admin console.
//
// Cost: $0/run. The Director uses no LLM calls — it's pure DB scans plus
// Twilio + Resend egress.
// ============================================================================

const {
  getSupabase, authorizeAgentInvocation, jsonResponse, logAction
} = require('./agent-fleet-runtime');

const SLUG = 'director';
const MCC_APP_URL = process.env.MCC_APP_URL || 'https://mycarconcierge.com';

// Defaults — overridable per-deploy via the agents.config jsonb (Director
// reads its own row at the top of every run; absent values fall back here).
const DEFAULTS = {
  quiet_hours_utc: { start: 2, end: 11 },  // 02:00-11:00 UTC = 10pm-7am ET
  digest_hour_utc: 11,
  dedupe_repage_hours: 6,
  thresholds: {
    gatekeeper_error_min_in_6h: 2,
    promoter_drafts_pile_min:   5,
    promoter_idle_days:         7,
    hunter_unscored_min_2h:     1,
    social_dry_window_h:        24,
    matchmaker_unranked_min_h:  1,
    signup_drop_pct:            50
  }
};

function isoMinusHours(h) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

function isoMinusDays(d) {
  return new Date(Date.now() - d * 86400 * 1000).toISOString();
}

function isInQuietHours(d, cfg) {
  const h = d.getUTCHours();
  return h >= cfg.start && h < cfg.end;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replaceAll(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}

// ---------------------------------------------------------------------------
// Health checks. Every check returns either `null` (healthy) or a
// `finding` object: { alert_key, severity, title, body, next_action, payload }
// ---------------------------------------------------------------------------

async function checkGatekeeperFailing(supabase, t) {
  const { data: errors, error } = await supabase
    .from('agent_actions')
    .select('id, error_message, created_at')
    .eq('agent_slug', 'gatekeeper')
    .eq('status', 'error')
    .gte('created_at', isoMinusHours(6))
    .order('created_at', { ascending: false })
    .limit(20);
  if (error || !errors || errors.length < t.gatekeeper_error_min_in_6h) return null;

  const lastErr = (errors[0].error_message || '').trim();
  let nextAction = `Open the Agent Fleet console (${MCC_APP_URL}/admin/agent-fleet.html), inspect the most recent Gatekeeper rows, and re-trigger the failed events once the underlying issue is fixed.`;

  if (/credit balance|insufficient.*credit|low.*credit/i.test(lastErr)) {
    nextAction = `Anthropic credits are exhausted. Top up at https://console.anthropic.com/settings/billing — Gatekeeper resumes automatically on the next event after billing is restored.`;
  } else if (/authentication|unauthorized|invalid.*api.*key/i.test(lastErr)) {
    nextAction = `ANTHROPIC_API_KEY appears to have been rotated or revoked. Update the secret in Replit Secrets, then redeploy.`;
  } else if (/rate.*limit/i.test(lastErr)) {
    nextAction = `Anthropic is rate-limiting us. Usually transient — wait 15 minutes and re-trigger the failed events from ${MCC_APP_URL}/admin/agent-fleet.html.`;
  } else if (/model_not_found|invalid_request_error/i.test(lastErr)) {
    nextAction = `A Claude model used by Gatekeeper has been deprecated. Run the Anthropic health check from the AI Ops admin page to identify the failing model and rotate it in code.`;
  }

  return {
    alert_key: 'gatekeeper_failing',
    severity: 'critical',
    title: 'Gatekeeper is dropping new providers on the floor',
    body: `${errors.length} Gatekeeper failure${errors.length === 1 ? '' : 's'} in the last 6h. New provider applications, background-check results, and flag reviews are NOT getting AI recommendations — your provider supply pipeline is stalled. Last error: "${lastErr.slice(0, 160)}".`,
    next_action: nextAction,
    payload: { error_count: errors.length, last_error: lastErr }
  };
}

async function checkPromoterBacklog(supabase, t) {
  const { count, error } = await supabase
    .from('agent_actions')
    .select('id', { count: 'exact', head: true })
    .eq('agent_slug', 'promoter')
    .eq('needs_review', true)
    .is('reviewed_at', null)
    .lte('created_at', isoMinusHours(48));
  if (error || !count || count < t.promoter_drafts_pile_min) return null;

  return {
    alert_key: 'promoter_drafts_pile',
    severity: 'warning',
    title: 'Social posts are piling up unpublished',
    body: `${count} Promoter draft${count === 1 ? '' : 's'} have been waiting 48h+ for your review. Every day they sit unpublished, you're losing top-of-funnel reach that the agent already paid Claude tokens to draft.`,
    next_action: `Open ${MCC_APP_URL}/admin/agent-fleet.html, review each draft, and click Approve to publish (or Dismiss to clear the queue).`,
    payload: { unpublished_count: count }
  };
}

async function checkPromoterIdle(supabase, t) {
  const { count, error } = await supabase
    .from('agent_actions')
    .select('id', { count: 'exact', head: true })
    .eq('agent_slug', 'promoter')
    .gte('created_at', isoMinusDays(t.promoter_idle_days));
  if (error || (count || 0) > 0) return null;

  return {
    alert_key: 'promoter_idle',
    severity: 'warning',
    title: 'Your social presence has gone dark',
    body: `Promoter has not drafted a single post in ${t.promoter_idle_days} days. No social posts means no organic reach, which means no new members finding you.`,
    next_action: `From ${MCC_APP_URL}/admin/agent-fleet.html, click "Request a draft", pick a platform + audience, and Promoter will queue one within minutes. Even one post per channel per week meaningfully moves the funnel.`,
    payload: { days_idle: t.promoter_idle_days }
  };
}

async function checkHunterStalled(supabase, t) {
  // social_leads is optional — if the table doesn't exist or no enabled
  // channels, treat as healthy. We surface the dry-channel case in
  // checkSocialMonitorDry below.
  let leads;
  try {
    const { data, error } = await supabase
      .from('social_leads')
      .select('id, status, created_at')
      .gte('created_at', isoMinusHours(2))
      .eq('status', 'new')
      .limit(20);
    if (error) return null;
    leads = data;
  } catch { return null; }

  if (!leads || leads.length < t.hunter_unscored_min_2h) return null;

  return {
    alert_key: 'hunter_not_scoring',
    severity: 'critical',
    title: 'Hunter is not scoring inbound leads',
    body: `${leads.length} social lead${leads.length === 1 ? '' : 's'} arrived in the last 2 hours but Hunter has not scored ${leads.length === 1 ? 'it' : 'them'}. Unscored leads never reach outreach — they sit dormant.`,
    next_action: `Check the most recent Hunter rows at ${MCC_APP_URL}/admin/agent-fleet.html. If you see "credit balance" errors, top up Anthropic at https://console.anthropic.com/settings/billing. If the rows are missing entirely, the orchestrator subscription for social.lead_discovered may have been disabled.`,
    payload: { unscored_lead_count: leads.length }
  };
}

async function checkSocialMonitorDry(supabase, t) {
  let count;
  try {
    const r = await supabase
      .from('social_leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', isoMinusHours(t.social_dry_window_h));
    if (r.error) return null;
    count = r.count;
  } catch { return null; }
  if ((count || 0) > 0) return null;

  // Only fire if at least one social channel is enabled — otherwise
  // "zero leads" is the expected baseline, not an alert.
  let enabledCount = 0;
  try {
    const r = await supabase
      .from('social_channels')
      .select('id', { count: 'exact', head: true })
      .eq('enabled', true);
    enabledCount = r.count || 0;
  } catch { return null; }
  if (enabledCount === 0) return null;

  return {
    alert_key: 'social_monitor_dry',
    severity: 'warning',
    title: `Social monitor harvested 0 leads in ${t.social_dry_window_h}h`,
    body: `${enabledCount} social channel${enabledCount === 1 ? '' : 's'} ${enabledCount === 1 ? 'is' : 'are'} enabled, but social-monitor surfaced zero new leads in the last ${t.social_dry_window_h} hours. Either the search filters are too narrow, the source platform is rate-limiting us, or the monitor function is failing silently.`,
    next_action: `Open ${MCC_APP_URL}/admin/agent-fleet.html → Social Channels, broaden the keyword/handle filters on at least one channel, and click "Run monitor now" to test.`,
    payload: { window_hours: t.social_dry_window_h, enabled_channels: enabledCount }
  };
}

async function checkMatchmakerSilent(supabase, t) {
  let events;
  try {
    const r = await supabase
      .from('agent_events')
      .select('id, payload, created_at')
      .eq('event_type', 'care_plan.auction_closed')
      .gte('created_at', isoMinusHours(12))
      .lte('created_at', isoMinusHours(t.matchmaker_unranked_min_h))
      .limit(50);
    if (r.error) return null;
    events = r.data;
  } catch { return null; }
  if (!events || events.length === 0) return null;

  const planIds = events
    .map(e => e.payload && e.payload.care_plan_id)
    .filter(Boolean)
    .map(String);
  if (planIds.length === 0) return null;

  let ranks;
  try {
    const r = await supabase
      .from('agent_actions')
      .select('decision')
      .eq('agent_slug', 'matchmaker')
      .in('action_type', ['rank', 'recommend'])
      .gte('created_at', isoMinusHours(12));
    if (r.error) return null;
    ranks = r.data;
  } catch { return null; }

  const ranked = new Set();
  for (const r of (ranks || [])) {
    const id = r.decision && r.decision.care_plan_id;
    if (id) ranked.add(String(id));
  }
  const unranked = planIds.filter(id => !ranked.has(id));
  if (unranked.length === 0) return null;

  return {
    alert_key: 'matchmaker_unranked',
    severity: 'warning',
    title: 'Closed auctions are not getting bid recommendations',
    body: `${unranked.length} care plan auction${unranked.length === 1 ? '' : 's'} closed >${t.matchmaker_unranked_min_h}h ago without a Matchmaker recommendation. Members are waiting for you to award without the AI rank-and-reasoning to back you up.`,
    next_action: `Open ${MCC_APP_URL}/admin/agent-fleet.html, find Matchmaker errors near ${new Date().toISOString().slice(0, 16)}, fix the underlying issue (most often Anthropic credits), then re-trigger the events.`,
    payload: { unranked_count: unranked.length, sample_plan_ids: unranked.slice(0, 5) }
  };
}

async function checkFunnelDrop(supabase, t) {
  const since24 = isoMinusHours(24);
  const since7d = isoMinusDays(7);
  const [r24, r7d] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', since24),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', since7d)
  ]);
  if (r24.error || r7d.error) return null;
  const last24 = r24.count || 0;
  const total7d = r7d.count || 0;
  const dailyAvg = total7d / 7;
  if (dailyAvg < 1) return null;  // baseline too small to be statistically meaningful

  const ratio = last24 / dailyAvg;
  if (ratio >= (1 - t.signup_drop_pct / 100)) return null;

  const dropPct = Math.round((1 - ratio) * 100);
  return {
    alert_key: 'signup_funnel_drop',
    severity: 'warning',
    title: `New member signups dropped ${dropPct}% vs 7-day avg`,
    body: `Last 24h: ${last24} new signup${last24 === 1 ? '' : 's'}. 7-day daily average: ${dailyAvg.toFixed(1)}. Either traffic dipped or the signup form broke for somebody.`,
    next_action: `Spot-check the live signup flow at ${MCC_APP_URL}/onboarding-member.html (incognito), then review traffic at ${MCC_APP_URL}/admin/analytics. If traffic is normal but signups are down, the form is broken.`,
    payload: { last_24h: last24, daily_avg_7d: dailyAvg, drop_pct: dropPct }
  };
}

// ---------------------------------------------------------------------------
// Daily digest — one always-fires summary at the morning slot so silence is
// never ambiguous. Builds the same KPIs the operator would scan manually.
// ---------------------------------------------------------------------------
async function buildDailyDigest(supabase) {
  const since24 = isoMinusHours(24);

  async function safeCount(table, filters) {
    try {
      let q = supabase.from(table).select('id', { count: 'exact', head: true });
      for (const [k, v] of Object.entries(filters || {})) {
        if (k === '_gte') q = q.gte('created_at', v);
        else q = q.eq(k, v);
      }
      const { count, error } = await q;
      return error ? null : (count || 0);
    } catch { return null; }
  }

  const [signups, leads, gkReviews, mmRanks, completed, errors] = await Promise.all([
    safeCount('profiles',        { _gte: since24 }),
    safeCount('social_leads',    { _gte: since24 }),
    safeCount('agent_actions',   { _gte: since24, agent_slug: 'gatekeeper', action_type: 'review', status: 'proposed' }),
    safeCount('agent_actions',   { _gte: since24, agent_slug: 'matchmaker' }),
    safeCount('agent_actions',   { _gte: since24, status: 'completed' }),
    safeCount('agent_actions',   { _gte: since24, status: 'error' })
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const fmt = n => n == null ? '—' : String(n);

  return {
    alert_key: `daily_digest_${today}`,
    severity: 'digest',
    title: 'Good morning — your fleet + funnel digest',
    body: `Last 24h:\n• ${fmt(signups)} new member${signups === 1 ? '' : 's'}\n• ${fmt(leads)} social leads found\n• ${fmt(gkReviews)} provider applications reviewed by Gatekeeper\n• ${fmt(mmRanks)} bid auctions evaluated by Matchmaker\n• ${fmt(completed)} total agent actions completed\n• ${fmt(errors)} agent error${errors === 1 ? '' : 's'} (open alerts will follow if any are still unresolved)`,
    next_action: errors && errors > 0
      ? `Open ${MCC_APP_URL}/admin/agent-fleet.html to see which agents errored.`
      : null,
    payload: { signups, leads, gatekeeper_reviews: gkReviews, matchmaker_ranks: mmRanks, completed_actions: completed, errors_24h: errors }
  };
}

// ---------------------------------------------------------------------------
// Dedupe + dispatch
// ---------------------------------------------------------------------------
async function recordAndPage(supabase, finding, ctx) {
  const { alert_key, severity } = finding;

  const { data: existing } = await supabase
    .from('agent_director_alerts')
    .select('id, fire_count, sms_sent_at, email_sent_at')
    .eq('alert_key', alert_key)
    .is('resolved_at', null)
    .maybeSingle();

  let alertId;
  let shouldPage;

  if (existing) {
    await supabase.from('agent_director_alerts')
      .update({
        last_fired_at: new Date().toISOString(),
        fire_count: existing.fire_count + 1,
        title: finding.title,
        body: finding.body,
        next_action: finding.next_action,
        payload: finding.payload,
        severity
      })
      .eq('id', existing.id);
    alertId = existing.id;

    // Re-page only on critical alerts, capped to one re-page per
    // dedupe_repage_hours window.
    const lastPageStr = existing.sms_sent_at || existing.email_sent_at;
    const hoursSinceLast = lastPageStr
      ? (Date.now() - new Date(lastPageStr).getTime()) / 3600000
      : Infinity;
    shouldPage = severity === 'critical' && hoursSinceLast >= ctx.dedupeHours;
  } else {
    const ins = await supabase.from('agent_director_alerts')
      .insert({
        alert_key,
        severity,
        title: finding.title,
        body: finding.body,
        next_action: finding.next_action,
        payload: finding.payload
      })
      .select('id')
      .single();
    if (ins.error) {
      // Race with a concurrent insert (partial unique index) — re-fetch and treat as existing.
      const { data: re } = await supabase
        .from('agent_director_alerts')
        .select('id')
        .eq('alert_key', alert_key)
        .is('resolved_at', null)
        .maybeSingle();
      alertId = re && re.id;
      shouldPage = false;
    } else {
      alertId = ins.data.id;
      shouldPage = true;  // first fire always pages
    }
  }

  // Quiet hours suppress non-critical alerts. Critical alerts and the
  // morning digest always page through.
  if (ctx.isQuietHours && severity !== 'critical' && severity !== 'digest') {
    return { alert_id: alertId, paged: false, reason: 'quiet_hours' };
  }
  if (!shouldPage) return { alert_id: alertId, paged: false, reason: 'deduped' };

  const [smsResult, emailResult] = await Promise.all([sendSms(finding), sendEmail(finding)]);

  if (alertId) {
    const update = {};
    if (smsResult.sent)   { update.sms_sent_at   = new Date().toISOString(); update.sms_error   = null; }
    else                  { update.sms_error   = smsResult.error || 'unknown'; }
    if (emailResult.sent) { update.email_sent_at = new Date().toISOString(); update.email_error = null; }
    else                  { update.email_error = emailResult.error || 'unknown'; }
    await supabase.from('agent_director_alerts').update(update).eq('id', alertId);
  }

  return { alert_id: alertId, paged: smsResult.sent || emailResult.sent,
           sms: smsResult.sent, email: emailResult.sent };
}

async function sendSms(finding) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_PHONE_NUMBER;
  const to    = process.env.ADMIN_ALERT_PHONE;
  if (!sid || !token || !from || !to) return { sent: false, error: 'twilio_not_configured' };

  const tag = finding.severity === 'critical' ? '[MCC URGENT]'
            : finding.severity === 'digest'   ? '[MCC Digest]'
            : '[MCC]';
  let body = `${tag} ${finding.title}\n\n${finding.body}`;
  if (finding.next_action) body += `\n\nNext: ${finding.next_action}`;
  if (body.length > 1500) body = body.slice(0, 1497) + '...';

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const form = new URLSearchParams({ To: to, From: from, Body: body });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return { sent: false, error: `twilio_${r.status}: ${txt.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e.message };
  }
}

async function sendEmail(finding) {
  const apiKey   = process.env.RESEND_API_KEY;
  const toEmail  = process.env.ADMIN_EMAIL || process.env.MCC_FROM_EMAIL;
  const fromEmail = process.env.MCC_FROM_EMAIL || 'no-reply@mycarconcierge.com';
  if (!apiKey || !toEmail) return { sent: false, error: 'email_not_configured' };

  const headerColor = finding.severity === 'critical' ? '#c0392b'
                    : finding.severity === 'digest'   ? '#1e3a5f'
                    : '#b8942d';
  const tag = finding.severity === 'critical' ? '[MCC URGENT]'
            : finding.severity === 'digest'   ? '[MCC Digest]'
            : '[MCC]';
  const subject = `${tag} ${finding.title}`;

  const html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#222;">'
    + `<h2 style="color:${headerColor};margin:0 0 12px;">${escapeHtml(finding.title)}</h2>`
    + `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(finding.body)}</p>`
    + (finding.next_action
        ? `<div style="background:#fff8e6;border-left:4px solid #b8942d;padding:14px 16px;margin:16px 0;border-radius:4px;">`
          + `<strong style="color:#1e3a5f;">Next step</strong><br>`
          + `<span style="font-size:14px;">${escapeHtml(finding.next_action)}</span></div>`
        : '')
    + `<p style="font-size:12px;color:#888;margin-top:24px;">From the Director agent. Inspect the fleet at <a href="${MCC_APP_URL}/admin/agent-fleet.html">${MCC_APP_URL}/admin/agent-fleet.html</a>.</p>`
    + '</div>';
  const text = `${finding.title}\n\n${finding.body}` + (finding.next_action ? `\n\nNext: ${finding.next_action}` : '');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: `My Car Concierge Director <${fromEmail}>`,
        to: [toEmail],
        subject,
        html,
        text
      })
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return { sent: false, error: `resend_${r.status}: ${txt.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Resolution sweep — close any open alert whose underlying condition has
// cleared. Digests are one-shot and never auto-resolve.
// ---------------------------------------------------------------------------
async function sweepResolutions(supabase, currentFindings) {
  const openKeys = new Set(currentFindings.map(f => f.alert_key));
  const { data: open } = await supabase
    .from('agent_director_alerts')
    .select('id, alert_key')
    .is('resolved_at', null)
    .neq('severity', 'digest');
  if (!open) return [];
  const resolved = [];
  for (const row of open) {
    if (!openKeys.has(row.alert_key)) {
      await supabase.from('agent_director_alerts')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', row.id);
      resolved.push(row.alert_key);
    }
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Config loader — reads agents.config and merges over DEFAULTS.
// ---------------------------------------------------------------------------
async function loadConfig(supabase) {
  try {
    const { data } = await supabase.from('agents').select('config').eq('slug', SLUG).maybeSingle();
    const cfg = (data && data.config) || {};
    return {
      quietHours:    Object.assign({}, DEFAULTS.quiet_hours_utc,  cfg.quiet_hours_utc || {}),
      digestHourUtc: cfg.digest_hour_utc != null ? cfg.digest_hour_utc : DEFAULTS.digest_hour_utc,
      dedupeHours:   cfg.dedupe_repage_hours || DEFAULTS.dedupe_repage_hours,
      thresholds:    Object.assign({}, DEFAULTS.thresholds, cfg.thresholds || {})
    };
  } catch {
    return {
      quietHours:    DEFAULTS.quiet_hours_utc,
      digestHourUtc: DEFAULTS.digest_hour_utc,
      dedupeHours:   DEFAULTS.dedupe_repage_hours,
      thresholds:    DEFAULTS.thresholds
    };
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
exports.handler = async function(event) {
  const auth = authorizeAgentInvocation(event);
  if (!auth) return jsonResponse(401, { error: 'unauthorized' });

  const supabase = getSupabase();
  const startedAt = Date.now();
  const cfg = await loadConfig(supabase);
  const now = new Date();
  const isQuietHours  = isInQuietHours(now, cfg.quietHours);
  const isDigestSlot  = now.getUTCHours() === cfg.digestHourUtc && now.getUTCMinutes() < 15;

  const checks = [
    checkGatekeeperFailing,
    checkPromoterBacklog,
    checkPromoterIdle,
    checkHunterStalled,
    checkSocialMonitorDry,
    checkMatchmakerSilent,
    checkFunnelDrop
  ];

  const findings = [];
  const checkErrors = [];
  for (const fn of checks) {
    try {
      const f = await fn(supabase, cfg.thresholds);
      if (f) findings.push(f);
    } catch (e) {
      checkErrors.push({ check: fn.name, error: e.message });
    }
  }

  const dispatched = [];
  for (const f of findings) {
    try {
      const r = await recordAndPage(supabase, f, { isQuietHours, dedupeHours: cfg.dedupeHours });
      dispatched.push({ alert_key: f.alert_key, severity: f.severity, paged: r.paged, reason: r.reason || null, sms: r.sms || false, email: r.email || false });
    } catch (e) {
      checkErrors.push({ alert_key: f.alert_key, error: e.message });
    }
  }

  let digestResult = null;
  if (isDigestSlot) {
    try {
      const digest = await buildDailyDigest(supabase);
      const r = await recordAndPage(supabase, digest, { isQuietHours: false, dedupeHours: cfg.dedupeHours });
      digestResult = { alert_key: digest.alert_key, paged: r.paged, sms: r.sms || false, email: r.email || false };
    } catch (e) {
      checkErrors.push({ check: 'daily_digest', error: e.message });
    }
  }

  const resolved = await sweepResolutions(supabase, findings).catch(e => {
    checkErrors.push({ check: 'sweepResolutions', error: e.message });
    return [];
  });

  const summary = {
    findings_count:   findings.length,
    paged_count:      dispatched.filter(d => d.paged).length,
    suppressed_count: dispatched.filter(d => !d.paged).length,
    resolved_count:   resolved.length,
    digest:           digestResult,
    quiet_hours:      isQuietHours,
    check_errors:     checkErrors,
    duration_ms:      Date.now() - startedAt
  };

  await logAction(supabase, {
    agentSlug: SLUG,
    actionType: 'sweep',
    status: checkErrors.length > 0 && findings.length === 0 ? 'error' : 'completed',
    decision: { findings: findings.map(f => ({ key: f.alert_key, severity: f.severity })),
                dispatched, resolved, digest: digestResult, quiet_hours: isQuietHours },
    durationMs: Date.now() - startedAt,
    errorMessage: checkErrors.length > 0
      ? `${checkErrors.length} check error(s); first: ${checkErrors[0].error || checkErrors[0].check}`
      : null
  });

  return jsonResponse(200, Object.assign({ ok: true }, summary));
};
