const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const ADMIN_EMAIL = 'jm.zanetis@gmail.com';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function getResend() {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

async function getAiOpsSettings(supabase) {
  const threshold = parseFloat(process.env.AI_CONFIDENCE_THRESHOLD || '1.0');
  const maxRefund = parseFloat(process.env.AI_MAX_AUTO_REFUND || '500');
  try {
    const { data: rows } = await supabase.from('ai_ops_settings').select('key,value');
    if (rows) {
      const s = {};
      for (const r of rows) {
        if (r.key === 'confidence_threshold') s.threshold = parseFloat(r.value);
        if (r.key === 'max_auto_refund') s.maxRefund = parseFloat(r.value);
      }
      return { threshold: s.threshold ?? threshold, maxRefund: s.maxRefund ?? maxRefund };
    }
  } catch {}
  return { threshold, maxRefund };
}

async function sendSMS(toPhone, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from || !toPhone) return false;
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
    return r.ok;
  } catch { return false; }
}

async function callAI(prompt, maxTokens = 300) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY_MCC_FLEET1 || process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await r.json();
      return data.content?.[0]?.text || '';
    } catch {}
  }
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await r.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch {}
  }
  return '';
}

async function getApolloHealth(supabase) {
  const out = {
    enabled: false,
    last_successful_run: null,
    last_successful_added: 0,
    last_successful_profile: null,
    hours_since_success: null,
    consecutive_failures: 0,
    recent_error_kinds: {},
    recent_cycles: 0,
    last_error_kind: null,
    stalled: false,
    status: 'disabled'
  };
  try {
    const { data: state } = await supabase
      .from('engine_state').select('metadata').eq('id', 1).single();
    const cfg = state?.metadata?.apollo_config || {};
    out.enabled = cfg.enabled === true;
    out.last_successful_run = cfg.last_successful_run || null;
    out.last_successful_added = cfg.last_successful_added || 0;
    out.last_successful_profile = cfg.last_successful_profile || null;
    if (out.last_successful_run) {
      out.hours_since_success = (Date.now() - new Date(out.last_successful_run)) / 3600000;
    }
  } catch (_) {}

  // Pull recent cycle log entries (most recent first) and tally error_kinds.
  try {
    const { data: rows } = await supabase
      .from('outreach_activity_log')
      .select('event_type, metadata, created_at')
      .in('event_type', ['apollo_discovery_cycle', 'apollo_discovery_error'])
      .order('created_at', { ascending: false })
      .limit(20);
    const list = rows || [];
    out.recent_cycles = list.length;

    let consec = 0;
    let stoppedCounting = false;
    for (const r of list) {
      const meta = r.metadata || {};
      const isError = r.event_type === 'apollo_discovery_error';
      const added = meta.added || 0;
      const enriched = meta.enriched || 0;
      const errorKind = meta.error_kind || (isError ? 'unknown_error' : null);
      const isFailure = isError || (added === 0 && enriched === 0);

      if (errorKind) {
        out.recent_error_kinds[errorKind] = (out.recent_error_kinds[errorKind] || 0) + 1;
      }
      if (!stoppedCounting) {
        if (isFailure) {
          consec++;
          if (consec === 1) out.last_error_kind = errorKind;
        } else {
          stoppedCounting = true;
        }
      }
    }
    out.consecutive_failures = consec;
  } catch (_) {}

  // Stall = enabled + 3+ consecutive failures OR no successful pull in 18+ hours
  if (out.enabled) {
    if (out.consecutive_failures >= 3 || (out.hours_since_success !== null && out.hours_since_success > 18)) {
      out.stalled = true;
      out.status = 'stalled';
    } else if (out.hours_since_success === null) {
      out.status = 'pending';
    } else {
      out.status = 'healthy';
    }
  }
  return out;
}

function explainErrorKind(kind) {
  switch (kind) {
    case 'auth_error': return 'API key rejected (401/403) — verify APOLLO_API_KEY is set and active';
    case 'payment_required': return 'Account credit exhausted or billing issue — top up Apollo balance';
    case 'rate_limit': return 'Hitting Apollo rate limits (429) — consider lowering interval/per_page';
    case 'server_error': return 'Apollo upstream errors (5xx) — likely transient, will self-heal';
    case 'network_error': return 'Network/fetch failure reaching Apollo';
    case 'no_results': return 'API responded OK but returned 0 results — usually credit exhaustion';
    case 'client_error': return 'Apollo rejected the request payload (4xx)';
    case 'unknown_error': return 'Unclassified error — check function logs';
    default: return null;
  }
}

function buildApolloHealthHtml(apollo) {
  if (!apollo.enabled) {
    return `<div style="margin-bottom:24px;">
      <div style="font-size:13px;color:#94a3b8;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px;">🔭 Apollo Discovery</div>
      <div style="background:#1e293b;border-radius:8px;padding:16px;color:#64748b;font-size:13px;">Discovery is disabled. Enable it from the admin panel to start auto-discovering provider and investor leads.</div>
    </div>`;
  }

  const statusColor = apollo.status === 'healthy' ? '#22c55e' : apollo.status === 'stalled' ? '#f59e0b' : '#94a3b8';
  const statusLabel = apollo.status === 'healthy' ? 'Healthy' : apollo.status === 'stalled' ? 'STALLED' : 'Pending first cycle';
  const lastSuccessLabel = apollo.last_successful_run
    ? (apollo.hours_since_success < 1
        ? `${Math.round(apollo.hours_since_success * 60)}m ago`
        : apollo.hours_since_success < 48
        ? `${apollo.hours_since_success.toFixed(1)}h ago`
        : `${Math.round(apollo.hours_since_success / 24)}d ago`)
    : 'Never';

  const errorRows = Object.entries(apollo.recent_error_kinds)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([kind, count]) => {
      const label = explainErrorKind(kind) || kind;
      return `<div style="display:flex;justify-content:space-between;font-size:12px;color:#cbd5e1;padding:4px 0;border-bottom:1px solid #334155;">
        <span>${kind} <span style="color:#64748b;">— ${label}</span></span>
        <span style="font-weight:600;color:#f1f5f9;">${count}×</span>
      </div>`;
    }).join('');

  const stallBanner = apollo.stalled
    ? `<div style="background:#431407;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:12px;">
        <div style="font-weight:600;color:#fcd34d;font-size:14px;margin-bottom:4px;">⚠️ Discovery has stalled</div>
        <div style="font-size:12px;color:#fde68a;line-height:1.5;">
          ${apollo.consecutive_failures} consecutive cycle${apollo.consecutive_failures === 1 ? '' : 's'} produced no leads.
          ${apollo.last_error_kind ? `Most recent issue: <strong>${apollo.last_error_kind}</strong> — ${explainErrorKind(apollo.last_error_kind) || 'see logs'}.` : ''}
        </div>
      </div>`
    : '';

  return `<div style="margin-bottom:24px;">
    <div style="font-size:13px;color:#94a3b8;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px;">🔭 Apollo Discovery</div>
    ${stallBanner}
    <div style="background:#1e293b;border-radius:8px;padding:16px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
        <span style="color:#94a3b8;font-size:14px;">Status</span>
        <span style="font-weight:600;color:${statusColor};">${statusLabel}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
        <span style="color:#94a3b8;font-size:14px;">Last successful pull</span>
        <span style="font-weight:600;color:#f1f5f9;">${lastSuccessLabel}${apollo.last_successful_added ? ` (+${apollo.last_successful_added} leads)` : ''}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
        <span style="color:#94a3b8;font-size:14px;">Consecutive failed cycles</span>
        <span style="font-weight:600;color:${apollo.consecutive_failures >= 3 ? '#f59e0b' : apollo.consecutive_failures > 0 ? '#fbbf24' : '#22c55e'};">${apollo.consecutive_failures}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#94a3b8;font-size:14px;">Cycles logged (recent 20)</span>
        <span style="font-weight:600;color:#f1f5f9;">${apollo.recent_cycles}</span>
      </div>
      ${errorRows ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #334155;">
        <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Recent error breakdown</div>
        ${errorRows}
      </div>` : ''}
    </div>
  </div>`;
}

function buildEmailHtml(today, outreach, aiOps, narrative, apollo) {
  const pct = outreach.totalSent > 0 ? Math.round((outreach.sentToday / outreach.totalSent) * 100) : 0;
  const queueColor = outreach.approvedQueue > 50 ? '#f59e0b' : outreach.approvedQueue > 0 ? '#3b82f6' : '#22c55e';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:13px;color:#c9a84c;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">My Car Concierge</div>
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#f1f5f9;">Daily Operations Report</h1>
      <div style="margin-top:6px;font-size:14px;color:#64748b;">${today} &nbsp;·&nbsp; Generated at 8:00 PM ET</div>
    </div>

    ${narrative ? `<div style="background:#1e293b;border-left:3px solid #c9a84c;border-radius:6px;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:13px;color:#c9a84c;font-weight:600;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">AI Summary</div>
      <div style="font-size:15px;line-height:1.6;color:#cbd5e1;">${narrative}</div>
    </div>` : ''}

    <div style="margin-bottom:24px;">
      <div style="font-size:13px;color:#94a3b8;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px;">📧 Outreach Campaign</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="background:#1e293b;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:32px;font-weight:700;color:#22c55e;">${outreach.sentToday}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">Emails Sent Today</div>
        </div>
        <div style="background:#1e293b;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:32px;font-weight:700;color:${queueColor};">${outreach.approvedQueue}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">Approved &amp; Queued</div>
        </div>
        <div style="background:#1e293b;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:32px;font-weight:700;color:#c9a84c;">${outreach.totalSent}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">All-Time Sent</div>
        </div>
        <div style="background:#1e293b;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:32px;font-weight:700;color:#818cf8;">${outreach.leadsDiscovered}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">Total Leads</div>
        </div>
      </div>
      ${outreach.newLeadsToday > 0 ? `<div style="margin-top:10px;font-size:13px;color:#64748b;text-align:center;">+${outreach.newLeadsToday} new leads discovered today &nbsp;·&nbsp; ${outreach.draftedToday} drafted</div>` : ''}
    </div>

    <div style="margin-bottom:24px;">
      <div style="font-size:13px;color:#94a3b8;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px;">💼 Wefunder Investor Pipeline</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="background:#1e293b;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:32px;font-weight:700;color:#818cf8;">${outreach.totalInvestors}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">Total Investor Leads</div>
        </div>
        <div style="background:#1e293b;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:32px;font-weight:700;color:${outreach.wefunderPending > 0 ? '#f59e0b' : '#64748b'};">${outreach.wefunderPending}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">Wefunder Drafts Pending</div>
        </div>
      </div>
      ${outreach.wefunderPending > 0 ? `<div style="margin-top:8px;background:#1c1a08;border:1px solid #f59e0b;border-radius:6px;padding:10px 14px;font-size:13px;color:#fcd34d;">📬 ${outreach.wefunderPending} Wefunder email draft${outreach.wefunderPending > 1 ? 's' : ''} waiting for your review and approval.</div>` : ''}
    </div>

    <div style="margin-bottom:24px;">
      <div style="font-size:13px;color:#94a3b8;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px;">🤖 AI Ops</div>
      <div style="background:#1e293b;border-radius:8px;padding:16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
          <span style="color:#94a3b8;font-size:14px;">Total actions (24h)</span>
          <span style="font-weight:600;color:#f1f5f9;">${aiOps.totalActions}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
          <span style="color:#94a3b8;font-size:14px;">Auto-executed</span>
          <span style="font-weight:600;color:#22c55e;">${aiOps.autoExec}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#94a3b8;font-size:14px;">Escalated to you</span>
          <span style="font-weight:600;color:${aiOps.escalated > 0 ? '#f59e0b' : '#64748b'};">${aiOps.escalated}</span>
        </div>
      </div>
      ${aiOps.escalated > 0 ? `<div style="margin-top:8px;background:#431407;border:1px solid #f59e0b;border-radius:6px;padding:10px 14px;font-size:13px;color:#fcd34d;">⚠️ ${aiOps.escalated} action${aiOps.escalated > 1 ? 's' : ''} need${aiOps.escalated === 1 ? 's' : ''} your review in the AI Ops dashboard.</div>` : ''}
    </div>

    <div style="text-align:center;padding-top:20px;border-top:1px solid #1e293b;">
      <a href="https://mycarconcierge.com/admin.html" style="display:inline-block;background:linear-gradient(135deg,#c9a84c,#b8942d);color:#0f1117;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:6px;">Open Admin Dashboard →</a>
      <div style="margin-top:16px;font-size:12px;color:#334155;">My Car Concierge · Daily digest sent every evening at 8 PM ET</div>
    </div>

  </div>
</body>
</html>`;
}

exports.handler = async function(event, context) {
  console.log('[DailyDigest] Scheduled run triggered at', new Date().toISOString());
  const t0 = Date.now();

  const supabase = getSupabase();
  if (!supabase) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_database' }) };
  }

  const { threshold: aiThreshold } = await getAiOpsSettings(supabase);
  const shadowMode = aiThreshold >= 1.0;
  const today = new Date().toISOString().split('T')[0];
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    // ── Outreach stats ──────────────────────────────────────────
    const [
      { count: sentToday },
      { count: approvedQueue },
      { data: engineState },
      { count: newLeadsToday },
      { count: draftedToday },
      { count: totalInvestors },
      { count: wefunderPending }
    ] = await Promise.all([
      supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('updated_at', since24h),
      supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('engine_state').select('total_leads_discovered,total_messages_sent,total_messages_drafted').eq('id', 1).single(),
      supabase.from('outreach_leads').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
      supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).in('status', ['approved', 'sent']).gte('created_at', since24h),
      supabase.from('outreach_leads').select('id', { count: 'exact', head: true }).eq('type', 'investor'),
      supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('status', 'draft').filter('metadata->>blast_type', 'eq', 'wefunder')
    ]);

    const outreach = {
      sentToday: sentToday || 0,
      approvedQueue: approvedQueue || 0,
      totalSent: engineState?.total_messages_sent || 0,
      leadsDiscovered: engineState?.total_leads_discovered || 0,
      newLeadsToday: newLeadsToday || 0,
      draftedToday: draftedToday || 0,
      totalInvestors: totalInvestors || 0,
      wefunderPending: wefunderPending || 0
    };

    // ── AI Ops stats ─────────────────────────────────────────────
    const { data: actions } = await supabase
      .from('ai_action_log')
      .select('module, action_type, outcome, auto_executed, escalated')
      .gte('created_at', since24h);

    const byModule = {};
    for (const a of (actions || [])) {
      if (!byModule[a.module]) byModule[a.module] = { total: 0, auto_executed: 0, escalated: 0, outcomes: {} };
      byModule[a.module].total++;
      if (a.auto_executed) byModule[a.module].auto_executed++;
      if (a.escalated) byModule[a.module].escalated++;
      byModule[a.module].outcomes[a.outcome] = (byModule[a.module].outcomes[a.outcome] || 0) + 1;
    }

    const aiOps = {
      totalActions: (actions || []).length,
      autoExec: Object.values(byModule).reduce((s, m) => s + (m.auto_executed || 0), 0),
      escalated: Object.values(byModule).reduce((s, m) => s + (m.escalated || 0), 0)
    };

    // ── Apollo discovery health ─────────────────────────────────
    const apollo = await getApolloHealth(supabase);

    // ── AI narrative ─────────────────────────────────────────────
    const narrative = await callAI(
      `Write a 2-sentence daily operations summary for My Car Concierge admin Jordan. ` +
      `Outreach: ${outreach.sentToday} emails sent today, ${outreach.approvedQueue} queued, ${outreach.totalSent} total sent all-time, ${outreach.newLeadsToday} new leads discovered. ` +
      `Investor pipeline: ${outreach.totalInvestors} investor leads total, ${outreach.wefunderPending} Wefunder drafts pending review. ` +
      `AI Ops: ${aiOps.totalActions} actions, ${aiOps.autoExec} auto-executed, ${aiOps.escalated} escalated. ` +
      (apollo.stalled ? `⚠️ Apollo discovery has stalled: ${apollo.consecutive_failures} consecutive cycles produced no leads (likely cause: ${apollo.last_error_kind || 'unknown'}). Mention this prominently. ` : '') +
      `Shadow mode: ${shadowMode}. Keep it brief, concrete, and encouraging.`,
      200
    );

    // ── Save to DB ───────────────────────────────────────────────
    await supabase.from('ai_daily_digests').upsert({
      date: today,
      narrative: narrative || `${outreach.sentToday} emails sent today. ${outreach.approvedQueue} in queue. ${aiOps.totalActions} AI actions.`,
      stats: { outreach, aiOps: byModule, apollo },
      sent_sms: false,
      created_at: new Date().toISOString()
    }, { onConflict: 'date' });

    // ── Send email via Resend ────────────────────────────────────
    const resend = getResend();
    let emailSent = false;
    if (resend) {
      try {
        const html = buildEmailHtml(today, outreach, aiOps, narrative, apollo);
        const subjectParts = [];
        if (apollo.stalled) subjectParts.push(`⚠️ Apollo stalled (${apollo.consecutive_failures}× zero)`);
        if (outreach.sentToday > 0) subjectParts.push(`${outreach.sentToday} emails sent`);
        if (outreach.approvedQueue > 0) subjectParts.push(`${outreach.approvedQueue} queued`);
        if (aiOps.escalated > 0) subjectParts.push(`⚠️ ${aiOps.escalated} escalated`);
        const subject = `MCC Daily Report — ${today}${subjectParts.length ? ' · ' + subjectParts.join(', ') : ''}`;

        const result = await resend.emails.send({
          from: 'My Car Concierge <no-reply@mycarconcierge.com>',
          to: [ADMIN_EMAIL],
          subject,
          html
        });
        emailSent = !result.error;
        if (result.error) console.error('[DailyDigest] Resend error:', result.error);
      } catch (emailErr) {
        console.error('[DailyDigest] Email send failed:', emailErr.message);
      }
    }

    // ── Send SMS summary via Twilio ──────────────────────────────
    // Prefer admin phone saved in engine_state (set via admin panel); fall back to env var
    let adminPhone = null;
    try {
      const { data: esRow } = await supabase.from('engine_state').select('metadata').eq('id', 1).single();
      adminPhone = esRow?.metadata?.admin_notification_phone || null;
    } catch (_) {}
    if (!adminPhone) adminPhone = process.env.ADMIN_PHONE_NUMBER || null;

    let smsSent = false;
    if (adminPhone) {
      const smsLines = [
        `MCC Daily Report — ${today}`,
        `📧 Outreach: ${outreach.sentToday} sent today, ${outreach.approvedQueue} queued, ${outreach.totalSent} all-time`,
        `💼 Investors: ${outreach.totalInvestors} leads, ${outreach.wefunderPending} Wefunder drafts pending`,
        `🤖 AI Ops: ${aiOps.totalActions} actions, ${aiOps.escalated} escalated`
      ];
      if (apollo.stalled) {
        smsLines.push(`⚠️ Apollo stalled: ${apollo.consecutive_failures} cycles w/o leads (${apollo.last_error_kind || 'unknown'})`);
      }
      if (aiOps.escalated > 0) smsLines.push(`⚠️ Check dashboard for ${aiOps.escalated} escalated item${aiOps.escalated > 1 ? 's' : ''}`);
      smsSent = await sendSMS(adminPhone, smsLines.join('\n'));
      if (smsSent) await supabase.from('ai_daily_digests').update({ sent_sms: true }).eq('date', today);
    }

    const result = { success: true, date: today, outreach, aiOps, apollo: { status: apollo.status, consecutive_failures: apollo.consecutive_failures }, email_sent: emailSent, sms_sent: smsSent, ms: Date.now() - t0 };
    console.log('[DailyDigest] Complete:', JSON.stringify(result));
    return { statusCode: 200, body: JSON.stringify(result) };

  } catch (err) {
    console.error('[DailyDigest] Error:', err.message);
    return { statusCode: 200, body: JSON.stringify({ error: err.message }) };
  }
};
