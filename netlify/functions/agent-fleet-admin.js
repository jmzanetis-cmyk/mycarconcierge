// ============================================================================
// MCC Agent Fleet — Admin API
// All routes are admin-auth gated (x-admin-password header).
//
// Routes (mounted via netlify.toml redirect /api/admin/agent-fleet/* → here):
//   GET  /agents                         — list registry rows + today's spend
//   PUT  /agents/:slug                   — { enabled?, autonomy?, daily_spend_cap_usd?, model? }
//   GET  /actions?limit=50&offset=0&agent=&status=&review_only=1
//   POST /actions/:id/review             — { decision: 'approved'|'rejected'|'executed'|'dismissed', notes? }
//   GET  /spend                          — today + last 7 days per agent
//   GET  /briefing                       — latest analyst briefing
//   POST /test-event                     — { event_type, payload? } emits a synthetic event
//   POST /run/orchestrator               — fire orchestrator tick now
//   POST /run/analyst                    — run analyst now
//   POST /run/gatekeeper-smoke           — run the Gatekeeper smoke now (Task #161)
//   GET  /director/alerts?status=open|all|resolved — Director alert log
//   POST /director/alerts/:id/resolve    — manually close an open Director alert
//   GET  /director/config                — current Director thresholds + quiet-hours
//   PUT  /director/config                — update Director thresholds + quiet-hours
//   POST /run/director                   — fire the Director sweep now
//   GET  /smoke-runs?limit=20&agent=gatekeeper — recent smoke run log
//   GET  /dead-letter?limit=50&offset=0&open=1   — list DLQ entries
//   POST /dead-letter/:id/replay         — re-emit the event (attempts=0)
//   GET  /spend-alerts?days=7            — recent spend-cap breach alerts
//   GET  /events/timeseries?days=7&group_by=event_type|status — events per hour
//   GET  /memory?agent=slug&limit=20     — recent memory rows for one agent
//   GET  /agents/:slug/prompt            — active prompt override (or null)
//   GET  /agents/:slug/prompt-history    — list past prompt versions
//   POST /agents/:slug/prompt            — { body, notes? } new active version
//   POST /agents/:slug/prompt/:version/activate — rollback to that version
//   POST /actions/:id/apply              — execute the recommendation (Gatekeeper)
//   POST /providers/:id/suspend          — { reason } admin suspension; the
//                                          DB trigger emits provider.flagged
//   GET  /social/leads/:id/reasoning     — latest Hunter agent_action for a
//                                          social lead (deterministic lookup
//                                          on decision->>'social_lead_id')
// ============================================================================

const {
  getSupabase, authenticateAdmin, jsonResponse, listAgents, emitEvent,
  sendSpendAlertEmail, clearPromptCache
} = require('./agent-fleet-runtime');
const { Resend } = require('resend');
const crypto = require('node:crypto');

const ALLOWED_AUTONOMY = new Set(['propose','assist','autonomous']);
const MCC_FROM_EMAIL = process.env.RESEND_FROM_EMAIL
  || process.env.MCC_FROM_EMAIL
  || 'My Car Concierge <noreply@mycarconcierge.com>';
const MCC_APP_URL = process.env.MCC_APP_URL || 'https://mycarconcierge.com';

// ─── FCM v1 mobile push helpers (Task #197) ─────────────────────────────────
// Mirrors www/server.js#sendFCMPushNotification but trimmed for this function:
// no in-app preference check (the device_push_tokens.active flag plus the
// caller-side category is sufficient for the matchmaker award flow).  All
// helpers are best-effort: any failure returns a structured reason instead of
// throwing so notifyMatchmakerAward never rolls back the bid acceptance.
let _fcmAccessToken = null;
let _fcmAccessTokenExpiry = 0;

async function getFCMAccessToken() {
  const now = Date.now();
  if (_fcmAccessToken && _fcmAccessTokenExpiry > now + 60000) return _fcmAccessToken;

  const saJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error('FCM_SERVICE_ACCOUNT_JSON not set');

  let sa;
  try { sa = JSON.parse(saJson); }
  catch { throw new Error('FCM_SERVICE_ACCOUNT_JSON is not valid JSON'); }

  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat, exp,
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  })).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(sa.private_key, 'base64url');
  const jwt = `${signingInput}.${signature}`;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenResp.json();
  if (!tokenData.access_token) throw new Error(`FCM OAuth token error: ${JSON.stringify(tokenData)}`);

  _fcmAccessToken = tokenData.access_token;
  _fcmAccessTokenExpiry = now + (tokenData.expires_in || 3600) * 1000;
  return _fcmAccessToken;
}

async function sendFCMv1Message(token, title, body, data, projectId) {
  const accessToken = await getFCMAccessToken();
  const message = {
    message: {
      token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries({ ...(data || {}), title, body }).map(([k, v]) => [k, String(v)])),
      android: { priority: 'HIGH' },
      apns:    { payload: { aps: { sound: 'default', 'content-available': 1 } } }
    }
  };
  const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(message)
  });
  let respBody = null;
  try { respBody = await resp.json(); } catch { respBody = null; }
  return { status: resp.status, body: respBody };
}

// Honour the same opt-out semantics as www/server.js#checkUserPushPreference
// so admin-driven matchmaker pushes never bypass a user who has disabled this
// category in their notification preferences. `category` keys must match the
// PUSH_CATEGORY_*_KEYS maps in www/server.js. Best-effort: any DB failure or
// missing preference row defaults to ALLOWED (matches the legacy server-side
// helper) so a transient DB blip can't silently drop legitimate awards.
const MATCHMAKER_MEMBER_PREF_COL = {
  'bid_accepted': 'push_bid_accepted'
};
const MATCHMAKER_PROVIDER_PREF_COL = {
  'bid_accepted':    'push_bid_accepted',
  'bid_opportunity': 'push_bid_opportunities'
};

async function checkMatchmakerPushPreference(supabase, userId, category) {
  if (!category) return true;
  try {
    const { data: memberPref } = await supabase
      .from('member_notification_preferences')
      .select('push_bid_accepted')
      .eq('member_id', userId)
      .maybeSingle();
    if (memberPref) {
      const colKey = MATCHMAKER_MEMBER_PREF_COL[category];
      if (colKey && memberPref[colKey] === false) return false;
      return true;
    }
    const { data: providerPref } = await supabase
      .from('provider_notification_preferences')
      .select('push_bid_accepted, push_bid_opportunities')
      .eq('provider_id', userId)
      .maybeSingle();
    if (providerPref) {
      const colKey = MATCHMAKER_PROVIDER_PREF_COL[category];
      if (colKey && providerPref[colKey] === false) return false;
    }
    return true;
  } catch {
    return true;
  }
}

// Send a push to every active device token belonging to the given user IDs.
// Returns { sent: boolean, success, failure, reason? } — best-effort.
// `category` (optional) maps to the same notification-preference columns the
// legacy member-side helper checks (push_bid_accepted, push_bid_opportunities).
// When provided, recipients who have opted out of that category are filtered
// out BEFORE sending — never silently overridden by the admin path.
async function sendMatchmakerFCMPush(supabase, userIds, title, body, data, category = null) {
  if (!process.env.FCM_SERVICE_ACCOUNT_JSON) return { sent: false, reason: 'not_configured', success: 0, failure: 0 };
  if (!Array.isArray(userIds) || userIds.length === 0) return { sent: false, reason: 'no_recipients', success: 0, failure: 0 };
  if (!supabase) return { sent: false, reason: 'no_db', success: 0, failure: 0 };

  let tokenRows = [];
  try {
    const { data: rows, error } = await supabase
      .from('device_push_tokens')
      .select('token, member_id, platform')
      .in('member_id', userIds)
      .eq('active', true);
    if (error) return { sent: false, reason: 'token_lookup_error:' + error.message, success: 0, failure: 0 };
    tokenRows = rows || [];
  } catch (e) {
    return { sent: false, reason: 'token_lookup_exception:' + e.message, success: 0, failure: 0 };
  }
  if (tokenRows.length === 0) return { sent: false, reason: 'no_tokens', success: 0, failure: 0 };

  if (category) {
    const allowedByUser = new Map();
    await Promise.all(Array.from(new Set(tokenRows.map(r => r.member_id))).map(async (uid) => {
      allowedByUser.set(uid, await checkMatchmakerPushPreference(supabase, uid, category));
    }));
    const filtered = tokenRows.filter(r => allowedByUser.get(r.member_id) !== false);
    if (filtered.length === 0) return { sent: false, reason: 'push_disabled_by_user', success: 0, failure: 0 };
    tokenRows = filtered;
  }

  let projectId;
  try { projectId = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON).project_id; }
  catch { return { sent: false, reason: 'invalid_service_account', success: 0, failure: 0 }; }

  const stale = [];
  let success = 0, failure = 0;
  let lastErrCode = null;
  let oauthFailed = false;
  await Promise.all(tokenRows.map(async (row) => {
    try {
      const result = await sendFCMv1Message(row.token, title, body, data || {}, projectId);
      if (result.status === 200) {
        success++;
      } else {
        failure++;
        // Only deactivate on definitive token-invalid signals. UNREGISTERED
        // (FCM error code) or NOT_FOUND (token not on FCM servers) mean the
        // token is permanently dead. INVALID_ARGUMENT in v1 can also indicate
        // payload/auth/request-shape problems, so we ONLY deactivate when
        // the per-detail errorCode is explicitly UNREGISTERED — not when the
        // top-level status is INVALID_ARGUMENT (which would mass-deactivate
        // valid tokens during a payload/config bug).
        const detailErrCode = result.body?.error?.details?.[0]?.errorCode;
        const topStatus     = result.body?.error?.status;
        lastErrCode = detailErrCode || topStatus || `http_${result.status}`;
        if (detailErrCode === 'UNREGISTERED' || topStatus === 'NOT_FOUND') {
          stale.push(row.token);
        }
        console.warn(`[FCM v1] matchmaker push failed (${row.platform}): ${lastErrCode}`);
      }
    } catch (err) {
      failure++;
      // Token-acquisition (OAuth) failures bubble up here as the message
      // includes 'FCM OAuth' from getFCMAccessToken. Surface that distinctly
      // so push_skipped_reason reflects the root cause.
      if (/FCM OAuth|FCM_SERVICE_ACCOUNT_JSON/.test(err.message)) oauthFailed = true;
      lastErrCode = lastErrCode || 'send_exception';
      console.error('[FCM v1] matchmaker push send error:', err.message);
    }
  }));

  if (stale.length > 0) {
    try {
      await supabase.from('device_push_tokens').update({ active: false }).in('token', stale);
    } catch (e) {
      console.error('[FCM v1] failed to deactivate stale tokens:', e.message);
    }
  }
  // When every send failed we still need a structured reason so the audit row
  // shows WHY push was skipped instead of leaving push_skipped_reason null.
  if (success === 0 && failure > 0) {
    const reason = oauthFailed ? 'oauth_failed' : (lastErrCode ? `send_failed:${lastErrCode}` : 'send_failed');
    return { sent: false, reason, success, failure };
  }
  return { sent: success > 0, success, failure };
}

// Best-effort transactional email via Resend. Returns boolean. Never throws.
// Mirrors the helper in netlify/functions/provider-admin.js so admin-driven
// award notifications behave identically to the suspension/activation path.
async function sendAwardEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return false;
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({ from: MCC_FROM_EMAIL, to, subject, html });
    return true;
  } catch (e) {
    console.error('[agent-fleet-admin] award email send failed:', e.message);
    return false;
  }
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll('\'', '&#39;');
}

function formatAmount(amount) {
  const num = Number(amount);
  if (!isFinite(num)) return '$0.00';
  return '$' + num.toFixed(2);
}

// Fan out winner / loser / member notifications + emails after an admin
// applies a Matchmaker rank recommendation. Mirrors the legacy member-side
// acceptBid() path in www/members-packages.js so admin-driven awards behave
// identically to member-driven awards. All work is best-effort — a single
// row failure must not roll back the bid acceptance, which has already been
// committed by applyMatchmakerRank before we are called.
//
// Returns a summary object describing what was attempted, suitable for the
// audit-trail decision payload.
async function notifyMatchmakerAward(supabase, {
  carePlan,            // { id, title, member_id }
  winnerBidId,
  winnerProviderId,
  amount,
  loserBids            // [{ id, provider_id }]
}) {
  const summary = {
    member_notified: false,
    winner_notified: false,
    loser_notified_count: 0,
    member_emailed: false,
    winner_emailed: false,
    loser_emailed_count: 0,
    member_pushed: false,
    winner_pushed: false,
    loser_pushed_count: 0,
    push_skipped_reason: null,
    errors: []
  };

  const planTitle = (carePlan?.title) || 'your auction';
  const planId = carePlan?.id;
  const memberId = carePlan?.member_id;
  const amountLabel = formatAmount(amount);

  // ── Look up the people we need to message in one round trip per role ───
  const loserProviderIds = Array.from(new Set(
    (loserBids || []).map(b => b?.provider_id).filter(Boolean)
  ));

  const profileSelect = 'id, email, full_name, business_name';
  const lookups = [
    memberId
      ? supabase.from('profiles').select(profileSelect).eq('id', memberId).maybeSingle()
      : Promise.resolve({ data: null }),
    winnerProviderId
      ? supabase.from('profiles').select(profileSelect).eq('id', winnerProviderId).maybeSingle()
      : Promise.resolve({ data: null }),
    loserProviderIds.length
      ? supabase.from('profiles').select(profileSelect).in('id', loserProviderIds)
      : Promise.resolve({ data: [] })
  ];

  let memberRow = null;
  let winnerRow = null;
  let loserRows = [];
  try {
    const [memberRes, winnerRes, loserRes] = await Promise.all(lookups);
    memberRow = memberRes?.data ? memberRes.data : null;
    winnerRow = winnerRes?.data ? winnerRes.data : null;
    loserRows = (loserRes?.data) || [];
  } catch (e) {
    summary.errors.push('profile_lookup:' + e.message);
  }

  const winnerDisplay = winnerRow
    ? (winnerRow.business_name || winnerRow.full_name || 'A provider')
    : 'A provider';
  const memberDisplay = memberRow
    ? (memberRow.full_name || 'there')
    : 'there';
  const memberDashboardUrl = `${MCC_APP_URL}/members.html#packages`;
  const providerDashboardUrl = `${MCC_APP_URL}/providers.html#bids`;

  // ── In-app notifications (winner / losers / member) ───────────────────
  const notificationRows = [];
  if (winnerProviderId) {
    notificationRows.push({
      user_id: winnerProviderId,
      type: 'bid_accepted',
      title: 'Your bid was accepted',
      message: `Your bid of ${amountLabel} for "${planTitle}" was accepted. Contact the member to schedule the work.`,
      link_type: 'care_plan',
      link_id: planId
    });
  }
  for (const loser of loserRows) {
    notificationRows.push({
      user_id: loser.id,
      type: 'bid_not_selected',
      title: 'Bid not selected',
      message: `Thanks for bidding on "${planTitle}". The member selected another provider this time — keep an eye out for new auctions.`,
      link_type: 'care_plan',
      link_id: planId
    });
  }
  if (memberId) {
    notificationRows.push({
      user_id: memberId,
      type: 'auction_awarded',
      title: 'Your auction has been awarded',
      message: `${winnerDisplay} won your "${planTitle}" auction at ${amountLabel}. Authorize payment to start the work.`,
      link_type: 'care_plan',
      link_id: planId
    });
  }

  if (notificationRows.length) {
    try {
      const { error } = await supabase.from('notifications').insert(notificationRows);
      if (error) {
        summary.errors.push('notifications:' + error.message);
      } else {
        if (winnerProviderId) summary.winner_notified = true;
        summary.loser_notified_count = loserRows.length;
        if (memberId) summary.member_notified = true;
      }
    } catch (e) {
      summary.errors.push('notifications:' + e.message);
    }
  }

  // ── Email fan-out (best-effort, skipped silently if Resend unconfigured) ──
  const safePlanTitle = escapeHtml(planTitle);
  const safeWinnerName = escapeHtml(winnerDisplay);
  const safeAmountLabel = escapeHtml(amountLabel);

  const emailJobs = [];

  if (winnerRow?.email) {
    emailJobs.push((async () => {
      const ok = await sendAwardEmail(
        winnerRow.email,
        `Your bid was accepted on ${planTitle}`,
        `<p>Hi ${escapeHtml(winnerRow.business_name || winnerRow.full_name || 'there')},</p>
         <p>Great news — your bid of <strong>${safeAmountLabel}</strong> for <strong>${safePlanTitle}</strong> was accepted.</p>
         <p>Please reach out to the member to schedule the work. You can review the details from your provider dashboard:</p>
         <p><a href="${providerDashboardUrl}" style="display:inline-block;padding:10px 18px;background:#b8942d;color:#fff;text-decoration:none;border-radius:6px;">Open my bids</a></p>
         <p>— My Car Concierge</p>`
      );
      if (ok) summary.winner_emailed = true;
    })());
  }

  for (const loser of loserRows) {
    if (!loser.email) continue;
    emailJobs.push((async () => {
      const ok = await sendAwardEmail(
        loser.email,
        `Update on your bid for ${planTitle}`,
        `<p>Hi ${escapeHtml(loser.business_name || loser.full_name || 'there')},</p>
         <p>Thanks for bidding on <strong>${safePlanTitle}</strong>. The member selected another provider this time, so your bid was not accepted.</p>
         <p>New auctions go out to qualified providers regularly — keep your auto-bid settings sharp and you'll see the next match soon.</p>
         <p><a href="${providerDashboardUrl}" style="display:inline-block;padding:10px 18px;background:#1e3a5f;color:#fff;text-decoration:none;border-radius:6px;">View open auctions</a></p>
         <p>— My Car Concierge</p>`
      );
      if (ok) summary.loser_emailed_count += 1;
    })());
  }

  if (memberRow?.email) {
    emailJobs.push((async () => {
      const ok = await sendAwardEmail(
        memberRow.email,
        `Your auction has been awarded — ${planTitle}`,
        `<p>Hi ${escapeHtml(memberDisplay)},</p>
         <p><strong>${safeWinnerName}</strong> won your <strong>${safePlanTitle}</strong> auction at <strong>${safeAmountLabel}</strong>.</p>
         <p>Open your dashboard to authorize payment so funds can be held in escrow and work can begin:</p>
         <p><a href="${memberDashboardUrl}" style="display:inline-block;padding:10px 18px;background:#b8942d;color:#fff;text-decoration:none;border-radius:6px;">Authorize payment</a></p>
         <p>— My Car Concierge</p>`
      );
      if (ok) summary.member_emailed = true;
    })());
  }

  if (emailJobs.length) {
    try {
      await Promise.all(emailJobs);
    } catch (e) {
      summary.errors.push('email:' + e.message);
    }
  }

  // ── Mobile push fan-out (Task #197) ──────────────────────────────────────
  // Best-effort FCM v1 push to every active device token belonging to the
  // winner / each loser / the member.  Failures here NEVER affect the bid
  // acceptance — they're recorded in summary.errors and summary.push_skipped_reason
  // so admins can see them in the audit trail.
  try {
    const pushData = {
      type: 'matchmaker_award',
      care_plan_id: planId || '',
      amount: String(amount || 0)
    };

    const pushJobs = [];

    if (winnerProviderId) {
      pushJobs.push((async () => {
        const r = await sendMatchmakerFCMPush(
          supabase,
          [winnerProviderId],
          'Your bid was accepted',
          `${amountLabel} for "${planTitle}". Tap to contact the member and schedule the work.`,
          { ...pushData, role: 'winner', deeplink: '/providers.html#bids' },
          'bid_accepted'
        );
        if (r.sent) summary.winner_pushed = true;
        if (!r.sent && r.reason && !summary.push_skipped_reason) summary.push_skipped_reason = r.reason;
      })());
    }

    const loserIds = loserRows.map(l => l.id).filter(Boolean);
    if (loserIds.length) {
      pushJobs.push((async () => {
        const r = await sendMatchmakerFCMPush(
          supabase,
          loserIds,
          'Bid not selected',
          `Your bid on "${planTitle}" wasn't selected this time. Keep an eye on new auctions.`,
          { ...pushData, role: 'loser', deeplink: '/providers.html#bids' },
          'bid_opportunity'
        );
        if (r.sent) summary.loser_pushed_count = r.success || loserIds.length;
        if (!r.sent && r.reason && !summary.push_skipped_reason) summary.push_skipped_reason = r.reason;
      })());
    }

    if (memberId) {
      pushJobs.push((async () => {
        const r = await sendMatchmakerFCMPush(
          supabase,
          [memberId],
          'Your auction has been awarded',
          `${winnerDisplay} won "${planTitle}" at ${amountLabel}. Tap to authorize payment.`,
          { ...pushData, role: 'member', deeplink: '/members.html#packages' },
          'bid_accepted'
        );
        if (r.sent) summary.member_pushed = true;
        if (!r.sent && r.reason && !summary.push_skipped_reason) summary.push_skipped_reason = r.reason;
      })());
    }

    if (pushJobs.length) await Promise.all(pushJobs);
  } catch (e) {
    summary.errors.push('push:' + e.message);
  }

  return summary;
}

function siteBaseUrl(event) {
  return process.env.URL
    || process.env.DEPLOY_PRIME_URL
    || (event?.headers && event.headers.host
          ? `https://${event.headers.host}`
          : 'https://mycarconcierge.com');
}

function parsePath(event) {
  // Netlify may pass either the rewritten internal path
  //   /.netlify/functions/agent-fleet-admin/<route>
  // or the original public path
  //   /api/admin/agent-fleet/<route>
  // depending on how the request was routed. Strip both prefixes.
  const raw = event.path || '';
  return raw
    .replace(/^\/?\.netlify\/functions\/agent-fleet-admin\/?/, '')
    .replace(/^\/api\/admin\/agent-fleet\/?/, '')
    .replaceAll(/^\/+|\/+$/g, '');
}

async function listAgentsWithSpend(supabase) {
  const today = new Date().toISOString().split('T')[0];
  const [agentsRes, spendRes] = await Promise.all([
    supabase.from('agents').select('*').order('slug'),
    supabase.from('agent_daily_spend').select('*').eq('day', today)
  ]);
  if (agentsRes.error) throw new Error(agentsRes.error.message);
  const spendBySlug = {};
  for (const s of (spendRes.data || [])) spendBySlug[s.agent_slug] = s;
  return (agentsRes.data || []).map(a => ({
    ...a,
    today_spend: spendBySlug[a.slug] || { reserved_usd: 0, actual_usd: 0, call_count: 0 }
  }));
}

async function updateAgent(supabase, slug, body) {
  const patch = {};
  if (typeof body.enabled === 'boolean')                    patch.enabled = body.enabled;
  if (body.autonomy && ALLOWED_AUTONOMY.has(body.autonomy)) patch.autonomy = body.autonomy;
  if (typeof body.daily_spend_cap_usd === 'number' && body.daily_spend_cap_usd >= 0) {
    patch.daily_spend_cap_usd = body.daily_spend_cap_usd;
  }
  if (typeof body.model === 'string' && body.model.trim()) patch.model = body.model.trim();
  if (Object.keys(patch).length === 0) return { error: 'No valid fields to update' };
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('agents').update(patch).eq('slug', slug).select('*').single();
  if (error) return { error: error.message };
  return { agent: data };
}

async function listActions(supabase, { limit = 50, offset = 0, agent = null, status = null, reviewOnly = false, since = null }) {
  const lim = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200);
  const off = Math.max(Number.parseInt(offset, 10) || 0, 0);
  // Task #174 — count: 'planned' avoids a full COUNT(*) scan over
  // agent_actions; pagination labels only need an estimate.
  let q = supabase.from('agent_actions')
    .select('*', { count: 'planned' })
    .order('created_at', { ascending: false })
    .range(off, off + lim - 1);
  if (agent)  q = q.eq('agent_slug', agent);
  if (status) q = q.eq('status', status);
  if (reviewOnly) q = q.eq('needs_review', true).is('reviewed_at', null);
  if (since && !isNaN(Date.parse(since))) q = q.gte('created_at', since);
  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return { actions: data || [], total: count || 0, limit: lim, offset: off };
}

async function reviewAction(supabase, id, body) {
  const allowed = new Set(['approved','rejected','executed','dismissed']);
  if (!allowed.has(body.decision)) return { error: 'Invalid decision' };
  const { data, error } = await supabase.from('agent_actions').update({
    reviewed_at: new Date().toISOString(),
    reviewed_by: 'admin',
    review_status: body.decision,
    review_notes: body.notes || null,
    needs_review: false
  }).eq('id', id).select('*').single();
  if (error) return { error: error.message };
  return { action: data };
}

// Apply an agent recommendation. Currently supports:
//   - Gatekeeper 'review' → mutates profile.role
//   - Matchmaker 'rank'   → accepts the winning plan_bid (and rejects the rest)
// Stamps the original action as 'executed' and writes a follow-up
// agent_actions row for the audit trail.
async function applyAction(supabase, id) {
  const { data: action, error: aErr } = await supabase
    .from('agent_actions').select('*').eq('id', id).maybeSingle();
  if (aErr) return { error: aErr.message, status: 500 };
  if (!action) return { error: 'Action not found', status: 404 };
  if (action.review_status === 'executed') {
    return { error: 'Already executed', status: 409 };
  }
  if (action.agent_slug === 'gatekeeper' && action.action_type === 'review') {
    return applyGatekeeperReview(supabase, id, action);
  }
  if (action.agent_slug === 'matchmaker' && action.action_type === 'rank') {
    return applyMatchmakerRank(supabase, id, action);
  }
  return { error: 'Apply only supported for Gatekeeper review and Matchmaker rank actions', status: 400 };
}

async function applyGatekeeperReview(supabase, id, action) {
  let decision = action.decision;
  if (typeof decision === 'string') { try { decision = JSON.parse(decision); } catch { decision = {}; } }
  const rec = decision?.recommendation;
  const payload = decision?.payload || {};
  const providerId = payload.provider_id;
  if (!providerId) return { error: 'Action decision missing provider_id', status: 400 };
  if (!['approve','reject'].includes(rec)) {
    return { error: `Cannot apply recommendation "${rec}" — manual_review requires admin to suspend or unsuspend manually`, status: 400 };
  }
  const newRole = rec === 'approve' ? 'provider' : 'member';
  const { data: prof, error: pErr } = await supabase
    .from('profiles').select('id, role').eq('id', providerId).maybeSingle();
  if (pErr) return { error: pErr.message, status: 500 };
  if (!prof) return { error: 'Provider profile not found', status: 404 };

  const { error: upErr } = await supabase
    .from('profiles').update({ role: newRole }).eq('id', providerId);
  if (upErr) return { error: upErr.message, status: 500 };

  await supabase.from('agent_actions').update({
    review_status: 'executed',
    reviewed_at: new Date().toISOString(),
    reviewed_by: 'admin',
    needs_review: false
  }).eq('id', id);

  await supabase.from('agent_actions').insert({
    agent_slug: 'gatekeeper',
    action_type: 'apply',
    status: 'executed',
    autonomy_used: 'admin',
    decision: { applied_action_id: id, provider_id: providerId, prior_role: prof.role, new_role: newRole, recommendation: rec },
    reasoning: `Admin applied Gatekeeper recommendation "${rec}" — role ${prof.role} -> ${newRole}.`
  });

  return { ok: true, provider_id: providerId, prior_role: prof.role, new_role: newRole };
}

// Mirrors the existing accept-bid path used by members on the legacy
// `bids` table (see www/members-packages.js#acceptBid):
//   1) winning bid       -> status='accepted'
//   2) all other pending -> status='rejected'
//   3) parent care_plan  -> status='awarded'
// Service-role client so it bypasses RLS the same way server-side admin
// flows do. Idempotent enough — repeated applies short-circuit on the
// review_status='executed' guard above.
async function applyMatchmakerRank(supabase, id, action) {
  let decision = action.decision;
  if (typeof decision === 'string') { try { decision = JSON.parse(decision); } catch { decision = {}; } }
  const winnerBidId = decision?.recommended_winner_bid_id;
  const carePlanId  = decision?.payload?.care_plan_id;
  if (!carePlanId) return { error: 'Action decision missing care_plan_id', status: 400 };
  if (!winnerBidId) {
    return { error: 'No recommended winner — Matchmaker proposed null. Re-list the auction or select a bid manually.', status: 400 };
  }

  const { data: winner, error: bErr } = await supabase
    .from('plan_bids').select('id, care_plan_id, provider_id, status, amount')
    .eq('id', winnerBidId).maybeSingle();
  if (bErr) return { error: bErr.message, status: 500 };
  if (!winner) return { error: 'Recommended winning bid no longer exists', status: 404 };
  if (winner.care_plan_id !== carePlanId) {
    return { error: 'Recommended bid does not belong to the care plan in the action payload', status: 400 };
  }
  if (winner.status !== 'pending') {
    return { error: `Recommended bid is already ${winner.status}; nothing to apply`, status: 409 };
  }

  const { data: plan, error: pErr } = await supabase
    .from('care_plans').select('id, member_id, status, title').eq('id', carePlanId).maybeSingle();
  if (pErr) return { error: pErr.message, status: 500 };
  if (!plan) return { error: 'Care plan no longer exists', status: 404 };

  // Mark the winner accepted FIRST so a concurrent admin click on a different
  // winner can't both succeed. We then sweep the losers. The .eq('status',
  // 'pending') guard means a racing click that already flipped this row will
  // produce a 0-row update; .select() lets us detect that and return 409
  // BEFORE we touch the losers, the plan, or the audit trail. Without this
  // check the action would get stamped 'executed' even though no bid moved.
  const { data: accRows, error: accErr } = await supabase.from('plan_bids')
    .update({ status: 'accepted' })
    .eq('id', winnerBidId).eq('status', 'pending')
    .select('id');
  if (accErr) return { error: accErr.message, status: 500 };
  if (!accRows || accRows.length === 0) {
    return {
      error: 'Recommended bid was no longer pending — another admin or process accepted/rejected it first.',
      status: 409
    };
  }

  const { data: losers, error: rejErr } = await supabase.from('plan_bids')
    .update({ status: 'rejected' })
    .eq('care_plan_id', carePlanId)
    .neq('id', winnerBidId)
    .eq('status', 'pending')
    .select('id, provider_id');
  if (rejErr) return { error: rejErr.message, status: 500 };

  // Care-plan status transition. Allowed enum values today are
  // open|awarded|expired|cancelled (see 20260328_job_board.sql) plus
  // auction_closed referenced by the Phase 1 trigger guard. 'awarded'
  // is the canonical post-acceptance state — log+continue if the DB
  // rejects it so the bid acceptance still stands.
  const { error: planErr } = await supabase.from('care_plans')
    .update({ status: 'awarded' }).eq('id', carePlanId);
  if (planErr) {
    console.warn(`[matchmaker apply] care_plan ${carePlanId} status update failed: ${planErr.message}`);
  }

  await supabase.from('agent_actions').update({
    review_status: 'executed',
    reviewed_at: new Date().toISOString(),
    reviewed_by: 'admin',
    needs_review: false
  }).eq('id', id);

  // Task #153 — fan out award notifications + emails before we write the
  // audit row so the audit decision can record what was actually delivered.
  // notifyMatchmakerAward is best-effort and never throws; the bid acceptance
  // above is already committed and stands on its own.
  let notifySummary = null;
  try {
    notifySummary = await notifyMatchmakerAward(supabase, {
      carePlan: plan,
      winnerBidId,
      winnerProviderId: winner.provider_id,
      amount: winner.amount,
      loserBids: losers || []
    });
  } catch (e) {
    console.error('[matchmaker apply] notifyMatchmakerAward threw:', e.message);
    notifySummary = { error: e.message };
  }

  await supabase.from('agent_actions').insert({
    agent_slug: 'matchmaker',
    action_type: 'apply',
    status: 'executed',
    autonomy_used: 'admin',
    decision: {
      applied_action_id: id,
      care_plan_id: carePlanId,
      accepted_bid_id: winnerBidId,
      provider_id: winner.provider_id,
      amount: winner.amount,
      rejected_bid_ids: (losers || []).map(b => b.id),
      prior_plan_status: plan.status,
      new_plan_status: planErr ? plan.status : 'awarded',
      notifications: notifySummary
    },
    reasoning: `Admin accepted Matchmaker-recommended bid ${winnerBidId} for care plan ${carePlanId}. ${(losers || []).length} other pending bid(s) rejected.`
  });

  return {
    ok: true,
    care_plan_id: carePlanId,
    accepted_bid_id: winnerBidId,
    provider_id: winner.provider_id,
    amount: winner.amount,
    rejected_count: (losers || []).length,
    prior_plan_status: plan.status,
    new_plan_status: planErr ? plan.status : 'awarded',
    plan_status_warning: planErr ? planErr.message : null,
    notifications: notifySummary
  };
}

async function suspendProvider(supabase, providerId, body) {
  const reason = (body.reason || '').toString().slice(0, 500);
  const { data: prof, error: pErr } = await supabase
    .from('profiles').select('id, role').eq('id', providerId).maybeSingle();
  if (pErr) return { error: pErr.message, status: 500 };
  if (!prof) return { error: 'Provider profile not found', status: 404 };
  if (prof.role === 'suspended') return { error: 'Provider already suspended', status: 409 };

  const { error: upErr } = await supabase
    .from('profiles').update({ role: 'suspended' }).eq('id', providerId);
  if (upErr) return { error: upErr.message, status: 500 };

  await supabase.from('agent_actions').insert({
    agent_slug: 'gatekeeper',
    action_type: 'suspend',
    status: 'executed',
    autonomy_used: 'admin',
    decision: { provider_id: providerId, prior_role: prof.role, new_role: 'suspended', reason },
    reasoning: reason ? `Admin suspended provider: ${reason}` : 'Admin suspended provider (no reason given).'
  });

  return { ok: true, provider_id: providerId, prior_role: prof.role, new_role: 'suspended' };
}

async function spendRollup(supabase) {
  const today = new Date();
  const startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startStr = startDate.toISOString().split('T')[0];
  const [agentsRes, spendRes] = await Promise.all([
    supabase.from('agents').select('slug,display_name,daily_spend_cap_usd,enabled').order('slug'),
    supabase.from('agent_daily_spend').select('*').gte('day', startStr).order('day', { ascending: true })
  ]);
  if (agentsRes.error) throw new Error(agentsRes.error.message);
  if (spendRes.error)  throw new Error(spendRes.error.message);
  return { agents: agentsRes.data || [], days: spendRes.data || [] };
}

async function latestBriefing(supabase) {
  // Prefer the canonical 'latest' key written by the analyst on every run.
  let { data, error } = await supabase
    .from('agent_memory')
    .select('*')
    .eq('agent_slug', 'analyst')
    .eq('kind', 'briefing')
    .eq('key', 'latest')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data;
  // Fallback for legacy rows written before the 'latest' key existed.
  const fallback = await supabase
    .from('agent_memory')
    .select('*')
    .eq('agent_slug', 'analyst')
    .eq('kind', 'briefing')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fallback.error) throw new Error(fallback.error.message);
  return fallback.data;
}

// ─── Per-action handlers ────────────────────────────────────────────────────
// Each handler receives (event, ctx) where ctx = {supabase, route, method,
// body, qs, params}. Handlers return a jsonResponse(...). The top-level
// `exports.handler` does only auth/setup → dispatch → try/catch.

async function handleListAgents(event, ctx) {
  const agents = await listAgentsWithSpend(ctx.supabase);
  return jsonResponse(200, { agents });
}

async function handleUpdateAgent(event, ctx) {
  const r = await updateAgent(ctx.supabase, ctx.params[1], ctx.body);
  return jsonResponse(r.error ? 400 : 200, r);
}

async function handleListActions(event, ctx) {
  const { qs, supabase } = ctx;
  const result = await listActions(supabase, {
    limit: qs.limit,
    offset: qs.offset,
    agent: qs.agent || null,
    status: qs.status || null,
    reviewOnly: qs.review_only === '1' || qs.review_only === 'true',
    since: qs.since || null
  });
  return jsonResponse(200, result);
}

// -------- actions filtered by target id (used by Task #139 inline activity panels)
// Accepts target_id (required) + optional target_kind to scope JSONB key search.
// Returns the most recent matching agent_actions rows for inline rendering.
async function handleActionsByTarget(event, ctx) {
  const { qs, supabase } = ctx;
  const rawTargetId = (qs.target_id || '').trim();
  if (!rawTargetId) return jsonResponse(400, { error: 'target_id required' });
  // PostgREST .or() reserves comma, parens, period, quotes, and whitespace as syntax;
  // these characters in the value would either silently truncate the filter or break parsing.
  // Restrict to alphanumerics + dash/underscore (covers UUIDs, numeric IDs, slug-like ids).
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(rawTargetId)) {
    return jsonResponse(400, { error: 'target_id must be alphanumeric (with - or _), max 128 chars' });
  }
  const targetId = rawTargetId;
  const lim = Math.min(Math.max(Number.parseInt(qs.limit, 10) || 10, 1), 50);
  const kind = (qs.target_kind || '').trim().toLowerCase();
  // PostgREST `or` filter — JSONB text-extraction is `key->>field`.
  // Each kind maps to one or more candidate JSON paths the agents use.
  const PATHS_BY_KIND = {
    provider:    ['decision->payload->>provider_id', 'decision->>provider_id'],
    application: ['decision->payload->>provider_id', 'decision->payload->>application_id'],
    social_lead: ['decision->>social_lead_id'],
    dispute:     ['decision->payload->>dispute_id', 'decision->>dispute_id'],
    ticket:      ['decision->payload->>ticket_id', 'decision->>ticket_id'],
    payment:     ['decision->payload->>payment_id', 'decision->>payment_id', 'decision->payload->>provider_id'],
    any:         ['decision->payload->>provider_id', 'decision->>social_lead_id',
                  'decision->payload->>dispute_id', 'decision->payload->>ticket_id',
                  'decision->payload->>application_id']
  };
  const paths = PATHS_BY_KIND[kind] || PATHS_BY_KIND.any;
  // Build "or" expression: path1.eq.X,path2.eq.X,...
  const orExpr = paths.map(p => `${p}.eq.${targetId}`).join(',');
  let q = supabase.from('agent_actions')
    .select('id, agent_slug, action_type, status, autonomy_used, decision, reasoning, confidence, ' +
            'tokens_in, tokens_out, cost_usd, duration_ms, needs_review, reviewed_at, review_status, ' +
            'review_notes, error_message, event_id, created_at')
    .order('created_at', { ascending: false })
    .limit(lim);
  if (qs.agent) q = q.eq('agent_slug', qs.agent);
  q = q.or(orExpr);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return jsonResponse(200, { actions: data || [], target_id: targetId, target_kind: kind || 'any' });
}

async function handleReviewAction(event, ctx) {
  const r = await reviewAction(ctx.supabase, Number.parseInt(ctx.params[1], 10), ctx.body);
  return jsonResponse(r.error ? 400 : 200, r);
}

// -------- single action detail (Task #144): full row + originating event payload
// Used by the inline activity panel "Details" drawer to show the prompt /
// raw event the agent ingested. Safe to call on every expand because the
// panel caches the response client-side.
async function handleActionDetail(event, ctx) {
  const { supabase } = ctx;
  const id = Number.parseInt(ctx.params[1], 10);
  const { data: action, error: aErr } = await supabase
    .from('agent_actions').select('*').eq('id', id).maybeSingle();
  if (aErr) return jsonResponse(500, { error: aErr.message });
  if (!action) return jsonResponse(404, { error: 'Action not found' });
  let eventRow = null;
  if (action.event_id) {
    const { data: ev, error: eErr } = await supabase
      .from('agent_events')
      .select('id, event_type, payload, source, created_at, processed_at')
      .eq('id', action.event_id)
      .maybeSingle();
    if (!eErr) eventRow = ev || null;
  }
  return jsonResponse(200, { action, event: eventRow });
}

async function handleSpend(event, ctx) {
  return jsonResponse(200, await spendRollup(ctx.supabase));
}

// -------- stats/24h (Task #139): drives the dashboard "Last 24h" tile.
// Service-role-backed counts so RLS on agent_actions doesn't return zero.
async function handleStats24h(event, ctx) {
  const { supabase } = ctx;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // Required dashboard semantics: "actions taken / escalated / failed" over
  // the last 24h, drawn from BOTH agent_actions and agent_events. We dedupe
  // event rows whose payload.action_id is non-null (the agent_action that
  // emitted the event already counts toward the per-table tally).
  //   actions_taken — agent_actions rows that ran end-to-end (status='executed')
  //   escalated     — needs_review queue + standalone agent.escalated events
  //   failed        — agent_actions status='errored' + standalone agent.failed events
  // Cheap to call: 3 head/count probes + 2 small SELECTs that pull only the
  // payload column for the same window.
  const [
    takenRes, escActionRes, failActionRes,
    escEventRes, failEventRes
  ] = await Promise.all([
    supabase.from('agent_actions').select('*', { count: 'exact', head: true })
      .gte('created_at', since).eq('status', 'executed'),
    supabase.from('agent_actions').select('*', { count: 'exact', head: true })
      .gte('created_at', since).eq('needs_review', true).is('reviewed_at', null),
    supabase.from('agent_actions').select('*', { count: 'exact', head: true })
      .gte('created_at', since).eq('status', 'errored'),
    supabase.from('agent_events').select('payload')
      .gte('created_at', since).eq('event_type', 'agent.escalated'),
    supabase.from('agent_events').select('payload')
      .gte('created_at', since).eq('event_type', 'agent.failed')
  ]);
  // Standalone events = those NOT tied back to an agent_action row.
  const standaloneCount = (res) => {
    if (res.error || !Array.isArray(res.data)) return 0;
    return res.data.reduce((n, row) => {
      const aid = row?.payload && row.payload.action_id;
      return aid ? n : n + 1;
    }, 0);
  };
  const escEventCount  = (escEventRes.error  || !Array.isArray(escEventRes.data))  ? 0 : escEventRes.data.length;
  const failEventCount = (failEventRes.error || !Array.isArray(failEventRes.data)) ? 0 : failEventRes.data.length;
  const escStandalone  = standaloneCount(escEventRes);
  const failStandalone = standaloneCount(failEventRes);
  return jsonResponse(200, {
    actions_taken: takenRes.error ? 0 : (takenRes.count || 0),
    escalated:     (escActionRes.error  ? 0 : (escActionRes.count  || 0)) + escStandalone,
    failed:        (failActionRes.error ? 0 : (failActionRes.count || 0)) + failStandalone,
    sources: {
      agent_actions: { taken: takenRes.count || 0, escalated: escActionRes.count || 0, failed: failActionRes.count || 0 },
      agent_events:  { escalated: escEventCount, failed: failEventCount, escalated_standalone: escStandalone, failed_standalone: failStandalone }
    },
    errors: {
      taken:        takenRes.error?.message      || null,
      esc_actions:  escActionRes.error?.message  || null,
      fail_actions: failActionRes.error?.message || null,
      esc_events:   escEventRes.error?.message   || null,
      fail_events:  failEventRes.error?.message  || null
    }
  });
}

// -------- badge-summary (Task #139): drives the sidebar attention badge.
// Returns counts the operator should notice without having to open the
// fleet console. Cheap to call — uses head/count selects.
async function handleBadgeSummary(event, ctx) {
  const { supabase } = ctx;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];
  const [dlqRes, reviewRes, alertRes] = await Promise.all([
    supabase.from('agent_dead_letter')
      .select('*', { count: 'exact', head: true })
      .is('replayed_at', null),
    supabase.from('agent_actions')
      .select('*', { count: 'exact', head: true })
      .eq('needs_review', true)
      .is('reviewed_at', null),
    supabase.from('agent_spend_alerts')
      .select('*', { count: 'exact', head: true })
      .gte('day', sevenDaysAgo)
      .eq('email_sent', false)
  ]);
  const open_dlq           = dlqRes.error    ? 0 : (dlqRes.count    || 0);
  const needs_review       = reviewRes.error ? 0 : (reviewRes.count || 0);
  const unack_spend_alerts = alertRes.error  ? 0 : (alertRes.count  || 0);
  // total_attention deliberately includes needs_review alongside DLQ + spend
  // alerts — operators have asked for a single sidebar signal that lights up
  // for ANY pending agent work, not just infrastructure failures. The three
  // fields are returned individually too so the UI can break them out.
  return jsonResponse(200, {
    open_dlq, needs_review, unack_spend_alerts,
    total_attention: open_dlq + needs_review + unack_spend_alerts,
    errors: {
      dlq:    dlqRes.error?.message    || null,
      review: reviewRes.error?.message || null,
      alerts: alertRes.error?.message  || null
    }
  });
}

async function handleBriefing(event, ctx) {
  const briefing = await latestBriefing(ctx.supabase);
  return jsonResponse(200, { briefing });
}

async function handleTestEvent(event, ctx) {
  const { body, supabase } = ctx;
  const eventType = (body.event_type || '').trim();
  if (!eventType) return jsonResponse(400, { error: 'event_type required' });
  const id = await emitEvent(supabase, eventType, body.payload || { test: true, ts: Date.now() }, 'admin:test');
  return jsonResponse(200, { event_id: id, event_type: eventType });
}

// Helper for manual run handlers — POSTs to a sibling Netlify function with
// the admin password header and returns its parsed response inside an envelope.
async function _proxyAdminRun(event, fnName) {
  const baseUrl = siteBaseUrl(event);
  const r = await fetch(`${baseUrl}/.netlify/functions/${fnName}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-password': process.env.ADMIN_PASSWORD || ''
    },
    body: JSON.stringify({ source: 'admin' })
  });
  const text = await r.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return jsonResponse(200, { ok: r.ok, status: r.status, result: parsed });
}

async function handleRunOrchestrator(event) { return _proxyAdminRun(event, 'agent-orchestrator'); }
async function handleRunAnalyst(event)      { return _proxyAdminRun(event, 'agent-analyst'); }
async function handleRunDirector(event)     { return _proxyAdminRun(event, 'agent-director-scheduled'); }

// Manual run: agent smoke (Task #161 gatekeeper, Task #206 matchmaker/treasurer)
async function handleRunSmoke(event, ctx) {
  const slug = ctx.params[1];
  return _proxyAdminRun(event, `${slug}-smoke-scheduled`);
}

// -------- Director (acquisition chief-of-staff) ────────────────────
// GET  /director/alerts?status=open|all|resolved  — list alerts
async function handleDirectorAlerts(event, ctx) {
  const { qs, supabase } = ctx;
  const lim = Math.min(Math.max(Number.parseInt(qs.limit, 10) || 50, 1), 200);
  const status = (qs.status || 'open').toLowerCase();
  let listQ = supabase.from('agent_director_alerts')
    .select('*')
    .order('last_fired_at', { ascending: false })
    .limit(lim);
  if (status === 'open')     listQ = listQ.is('resolved_at', null);
  if (status === 'resolved') listQ = listQ.not('resolved_at', 'is', null);

  // Headline KPIs must reflect the FULL open population, not the
  // paginated page (otherwise >limit alerts under-report). Run the
  // list + two count queries in parallel.
  const [listRes, openRes, critRes] = await Promise.all([
    listQ,
    supabase.from('agent_director_alerts')
      .select('id', { count: 'exact', head: true })
      .is('resolved_at', null),
    supabase.from('agent_director_alerts')
      .select('id', { count: 'exact', head: true })
      .is('resolved_at', null)
      .eq('severity', 'critical')
  ]);
  if (listRes.error) {
    const msg = listRes.error.message || '';
    if (/relation .* does not exist|schema cache/i.test(msg)) {
      return jsonResponse(503, {
        error: 'Director schema not applied yet. Run supabase/migrations/20260429b_agent_director.sql in the Supabase SQL editor.',
        code: 'schema_pending'
      });
    }
    throw new Error(msg);
  }
  return jsonResponse(200, {
    alerts: listRes.data || [],
    open_count:          openRes.count || 0,
    critical_open_count: critRes.count || 0
  });
}

async function handleDirectorAlertResolve(event, ctx) {
  const aid = Number.parseInt(ctx.params[1], 10);
  const { data, error } = await ctx.supabase.from('agent_director_alerts')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', aid)
    .is('resolved_at', null)
    .select('*')
    .maybeSingle();
  if (error) return jsonResponse(500, { error: error.message });
  if (!data)  return jsonResponse(404, { error: 'Alert not found or already resolved' });
  return jsonResponse(200, { alert: data });
}

async function handleDirectorConfigGet(event, ctx) {
  const { data, error } = await ctx.supabase.from('agents')
    .select('config').eq('slug', 'director').maybeSingle();
  if (error) return jsonResponse(500, { error: error.message });
  if (!data) {
    return jsonResponse(503, {
      error: 'Director agent is not registered. Run supabase/migrations/20260429b_agent_director.sql in the Supabase SQL editor.',
      code: 'director_not_seeded'
    });
  }
  return jsonResponse(200, { config: data.config || {} });
}

// Validate & merge a single Director config field. Returns { ok, error?, next }.
function _applyDirectorConfigFields(current, body) {
  const next = JSON.parse(JSON.stringify(current));

  if (body.quiet_hours_utc && typeof body.quiet_hours_utc === 'object') {
    const s = Number.parseInt(body.quiet_hours_utc.start, 10);
    const e = Number.parseInt(body.quiet_hours_utc.end, 10);
    if (Number.isInteger(s) && Number.isInteger(e) && s >= 0 && s <= 23 && e >= 0 && e <= 23) {
      next.quiet_hours_utc = { start: s, end: e };
    } else {
      return { ok: false, error: 'quiet_hours_utc.start/end must be integers 0-23' };
    }
  }
  if (body.digest_hour_utc != null) {
    const h = Number.parseInt(body.digest_hour_utc, 10);
    if (!Number.isInteger(h) || h < 0 || h > 23) {
      return { ok: false, error: 'digest_hour_utc must be an integer 0-23' };
    }
    next.digest_hour_utc = h;
  }
  if (body.dedupe_repage_hours != null) {
    const h = Number(body.dedupe_repage_hours);
    if (!isFinite(h) || h < 0.25 || h > 168) {
      return { ok: false, error: 'dedupe_repage_hours must be 0.25-168' };
    }
    next.dedupe_repage_hours = h;
  }
  if (body.thresholds && typeof body.thresholds === 'object') {
    const allowed = new Set([
      'gatekeeper_error_min_in_6h','promoter_drafts_pile_min','promoter_idle_days',
      'hunter_unscored_min_2h','social_dry_window_h','matchmaker_unranked_min_h',
      'signup_drop_pct'
    ]);
    const merged = Object.assign({}, current.thresholds || {});
    for (const [k, v] of Object.entries(body.thresholds)) {
      if (!allowed.has(k)) continue;
      const n = Number(v);
      if (!isFinite(n) || n < 0) {
        return { ok: false, error: `threshold ${k} must be a non-negative number` };
      }
      merged[k] = n;
    }
    next.thresholds = merged;
  }
  return { ok: true, next };
}

async function handleDirectorConfigPut(event, ctx) {
  const { body, supabase } = ctx;
  // Whitelist fields and validate types/ranges. Unknown keys are ignored.
  const { data: existing, error: readErr } = await supabase.from('agents')
    .select('config').eq('slug', 'director').maybeSingle();
  if (readErr) return jsonResponse(500, { error: readErr.message });
  if (!existing) {
    return jsonResponse(503, {
      error: 'Director agent is not registered. Run supabase/migrations/20260429b_agent_director.sql in the Supabase SQL editor before tuning thresholds.',
      code: 'director_not_seeded'
    });
  }
  const current = existing.config || {};
  const merged = _applyDirectorConfigFields(current, body);
  if (!merged.ok) return jsonResponse(400, { error: merged.error });
  const next = merged.next;

  const { data: updated, error: updErr } = await supabase.from('agents')
    .update({ config: next, updated_at: new Date().toISOString() })
    .eq('slug', 'director')
    .select('config')
    .maybeSingle();
  if (updErr) return jsonResponse(500, { error: updErr.message });
  if (!updated) {
    return jsonResponse(503, {
      error: 'Director agent row was removed mid-update. Re-apply supabase/migrations/20260429b_agent_director.sql.',
      code: 'director_not_seeded'
    });
  }
  return jsonResponse(200, { config: updated.config });
}

// -------- gatekeeper smoke run log (Task #161)
async function handleSmokeRuns(event, ctx) {
  const { qs, supabase } = ctx;
  const lim = Math.min(Math.max(Number.parseInt(qs.limit, 10) || 20, 1), 100);
  const slug = (qs.agent || 'gatekeeper').trim();
  const { data, error } = await supabase
    .from('agent_smoke_runs')
    .select('*')
    .eq('agent_slug', slug)
    .order('started_at', { ascending: false })
    .limit(lim);
  if (error) throw new Error(error.message);
  const runs = data || [];
  const lastPass = runs.find(r => r.status === 'passed') || null;
  const lastFail = runs.find(r => r.status !== 'passed') || null;
  return jsonResponse(200, {
    agent_slug: slug,
    runs,
    last_pass: lastPass,
    last_fail: lastFail,
    latest: runs[0] || null
  });
}

// -------- dead-letter queue
async function handleDeadLetter(event, ctx) {
  const { qs, supabase } = ctx;
  const lim = Math.min(Math.max(Number.parseInt(qs.limit, 10) || 50, 1), 200);
  const off = Math.max(Number.parseInt(qs.offset, 10) || 0, 0);
  const openOnly = qs.open === '1' || qs.open === 'true';
  // Optional `event_ids=1,2,3` filter (max 200 ids) used by the inline
  // Agent Activity panel to deterministically check which visible cards
  // are backed by an open DLQ row, even when the global backlog exceeds
  // the page size. Non-numeric ids are silently dropped.
  let eventIdFilter = null;
  if (typeof qs.event_ids === 'string' && qs.event_ids.length) {
    eventIdFilter = qs.event_ids.split(',')
      .map(s => Number.parseInt(s, 10))
      .filter(n => Number.isInteger(n) && n > 0)
      .slice(0, 200);
    if (eventIdFilter.length === 0) eventIdFilter = null;
  }
  let q = supabase.from('agent_dead_letter')
    .select('*', { count: 'exact' })
    .order('failed_at', { ascending: false })
    .range(off, off + lim - 1);
  if (openOnly) q = q.is('replayed_at', null);
  if (eventIdFilter) q = q.in('event_id', eventIdFilter);
  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return jsonResponse(200, { entries: data || [], total: count || 0, limit: lim, offset: off });
}

async function handleDeadLetterReplay(event, ctx) {
  const { supabase } = ctx;
  const dlqId = Number.parseInt(ctx.params[1], 10);
  const { data: entry, error: fetchErr } = await supabase
    .from('agent_dead_letter').select('*').eq('id', dlqId).maybeSingle();
  if (fetchErr) return jsonResponse(500, { error: fetchErr.message });
  if (!entry) return jsonResponse(404, { error: 'DLQ entry not found' });
  if (entry.replayed_at) return jsonResponse(400, { error: 'Already replayed', replay_event_id: entry.replay_event_id });
  const newId = await emitEvent(supabase, entry.event_type,
    entry.payload || {}, `dlq-replay:${dlqId}`);
  const { error: updErr } = await supabase.from('agent_dead_letter')
    .update({ replayed_at: new Date().toISOString(), replayed_by: 'admin', replay_event_id: newId })
    .eq('id', dlqId);
  if (updErr) return jsonResponse(500, { error: updErr.message });
  return jsonResponse(200, { ok: true, dlq_id: dlqId, replay_event_id: newId });
}

// -------- spend-cap alerts
async function handleSpendAlerts(event, ctx) {
  const { qs, supabase } = ctx;
  const days = Math.min(Math.max(Number.parseInt(qs.days, 10) || 7, 1), 90);
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('agent_spend_alerts')
    .select('*')
    .gte('day', startDate)
    .order('notified_at', { ascending: false });
  if (error) throw new Error(error.message);
  return jsonResponse(200, { alerts: data || [], since: startDate });
}

// Force a synthetic alert (testing). Body: { agent_slug }.
// Wipes today's row for that agent first so the email actually fires.
async function handleSpendAlertsTest(event, ctx) {
  const { body, supabase } = ctx;
  const slug = (body.agent_slug || '').trim();
  if (!slug) return jsonResponse(400, { error: 'agent_slug required' });
  const { data: agent, error: agentErr } = await supabase
    .from('agents').select('slug, daily_spend_cap_usd').eq('slug', slug).maybeSingle();
  if (agentErr) return jsonResponse(500, { error: agentErr.message });
  if (!agent)   return jsonResponse(404, { error: `Unknown agent: ${slug}` });

  const today = new Date().toISOString().split('T')[0];

  // Best-effort delete so the email path actually runs (vs. dedupe skip).
  await supabase.from('agent_spend_alerts')
    .delete().eq('agent_slug', slug).eq('day', today);

  const capUsd = Number(agent.daily_spend_cap_usd) || 0;
  const estimateUsd = capUsd > 0 ? capUsd * 0.01 : 0.001;

  // Pull today's spend if any so the test email has realistic numbers.
  let reservedUsd = null, actualUsd = null;
  const { data: spend } = await supabase
    .from('agent_daily_spend')
    .select('reserved_usd, actual_usd')
    .eq('agent_slug', slug).eq('day', today).maybeSingle();
  if (spend) { reservedUsd = spend.reserved_usd; actualUsd = spend.actual_usd; }

  const alertRow = {
    agent_slug: slug,
    day: today,
    cap_usd: capUsd,
    estimate_usd: estimateUsd,
    reserved_usd: reservedUsd,
    actual_usd: actualUsd,
    notified_at: new Date().toISOString(),
    email_sent: false
  };
  const { error: insErr } = await supabase
    .from('agent_spend_alerts').insert(alertRow);
  if (insErr) return jsonResponse(500, { error: insErr.message });

  const result = await sendSpendAlertEmail(supabase, alertRow);
  return jsonResponse(200, { ok: true, agent_slug: slug, day: today, email: result });
}

// Resend the email for a specific existing alert. Path: /spend-alerts/:slug/:day/resend
async function handleSpendAlertResend(event, ctx) {
  const { supabase, params } = ctx;
  const slug = params[1];
  const day  = params[2];
  const { data: alert, error: alertErr } = await supabase
    .from('agent_spend_alerts')
    .select('*').eq('agent_slug', slug).eq('day', day).maybeSingle();
  if (alertErr) return jsonResponse(500, { error: alertErr.message });
  if (!alert)   return jsonResponse(404, { error: 'Alert not found' });
  const result = await sendSpendAlertEmail(supabase, alert);
  return jsonResponse(result.sent ? 200 : 500, {
    ok: result.sent, agent_slug: slug, day, email: result
  });
}

// -------- events timeseries (per-hour bucketing for the events chart)
async function handleEventsTimeseries(event, ctx) {
  const { qs, supabase } = ctx;
  const days = Math.min(Math.max(Number.parseInt(qs.days, 10) || 7, 1), 30);
  const groupBy = qs.group_by === 'status' ? 'status' : 'event_type';
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();
  const { data, error } = await supabase
    .from('agent_events')
    .select('created_at, event_type, processed_at, error, routed_to')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(20000);
  if (error) throw new Error(error.message);
  const bucketMs = 60 * 60 * 1000;
  const startBucket = Math.floor(sinceMs / bucketMs) * bucketMs;
  const endBucket   = Math.floor(Date.now() / bucketMs) * bucketMs;
  const buckets = [];
  for (let t = startBucket; t <= endBucket; t += bucketMs) buckets.push(new Date(t).toISOString());
  const seriesMap = {};
  const eventTypeCounts = {};
  function statusOf(row) {
    if (row.error) return 'errored';
    if (Array.isArray(row.routed_to) && row.routed_to.length === 0) return 'skipped';
    if (row.processed_at) return 'routed';
    return 'pending';
  }
  for (const row of (data || [])) {
    const t = new Date(row.created_at).getTime();
    const bucket = new Date(Math.floor(t / bucketMs) * bucketMs).toISOString();
    const key = groupBy === 'status' ? statusOf(row) : (row.event_type || 'unknown');
    if (groupBy === 'event_type') eventTypeCounts[key] = (eventTypeCounts[key] || 0) + 1;
    if (!seriesMap[key]) seriesMap[key] = {};
    seriesMap[key][bucket] = (seriesMap[key][bucket] || 0) + 1;
  }
  let seriesNames = Object.keys(seriesMap);
  if (groupBy === 'event_type' && seriesNames.length > 8) {
    const top = Object.entries(eventTypeCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
    const topSet = new Set(top);
    const collapsed = {};
    for (const k of seriesNames) {
      const dest = topSet.has(k) ? k : 'other';
      collapsed[dest] = collapsed[dest] || {};
      for (const [bucket, n] of Object.entries(seriesMap[k])) {
        collapsed[dest][bucket] = (collapsed[dest][bucket] || 0) + n;
      }
    }
    for (const k of Object.keys(seriesMap)) delete seriesMap[k];
    Object.assign(seriesMap, collapsed);
    seriesNames = Object.keys(seriesMap);
  }
  const series = seriesNames.sort().map(name => ({
    name,
    data: buckets.map(b => seriesMap[name][b] || 0)
  }));
  return jsonResponse(200, {
    days, group_by: groupBy, buckets, series, total: (data || []).length
  });
}

// -------- per-agent memory viewer
async function handleMemory(event, ctx) {
  const { qs, supabase } = ctx;
  const slug = (qs.agent || '').trim();
  if (!slug) return jsonResponse(400, { error: 'agent query param required' });
  const lim = Math.min(Math.max(Number.parseInt(qs.limit, 10) || 20, 1), 100);
  const off = Math.max(Number.parseInt(qs.offset, 10) || 0, 0);
  const { data, count, error } = await supabase
    .from('agent_memory')
    .select('*', { count: 'exact' })
    .eq('agent_slug', slug)
    .order('created_at', { ascending: false })
    .range(off, off + lim - 1);
  if (error) throw new Error(error.message);
  return jsonResponse(200, { rows: data || [], total: count || 0, limit: lim, offset: off });
}

async function handleApplyAction(event, ctx) {
  const r = await applyAction(ctx.supabase, Number.parseInt(ctx.params[1], 10));
  if (r.error) return jsonResponse(r.status || 500, { error: r.error });
  return jsonResponse(200, r);
}

async function handleSuspendProvider(event, ctx) {
  const r = await suspendProvider(ctx.supabase, ctx.params[1], ctx.body);
  if (r.error) return jsonResponse(r.status || 500, { error: r.error });
  return jsonResponse(200, r);
}

// -------- social acquisition (Hunter inbound + Promoter outbound)
const SOCIAL_LEAD_STATUSES = ['pending','scored','approved','rejected','contacted'];
const SOCIAL_POST_STATUSES = ['draft','approved','published','rejected'];

async function handleSocialLeads(event, ctx) {
  const { qs, supabase } = ctx;
  const status = (qs.status || '').trim();
  if (status && !SOCIAL_LEAD_STATUSES.includes(status)) {
    return jsonResponse(400, { error: 'invalid status', allowed: SOCIAL_LEAD_STATUSES });
  }
  const lim = Math.min(Math.max(Number.parseInt(qs.limit, 10) || 50, 1), 200);
  const off = Math.max(Number.parseInt(qs.offset, 10) || 0, 0);
  let q = supabase.from('social_leads')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(off, off + lim - 1);
  if (status) q = q.eq('status', status);
  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return jsonResponse(200, { rows: data || [], total: count || 0, limit: lim, offset: off });
}

// Task #130: deterministic Hunter-reasoning lookup for a single social
// lead. The frontend lead drawer used to scan the most recent 50 hunter
// actions and try to match by decision.social_lead_id, which silently
// returned "No Hunter reasoning yet" for older leads. This route does a
// direct indexed query on agent_actions and returns the latest scoring
// row for that lead.
async function handleSocialLeadReasoning(event, ctx) {
  const { supabase, params } = ctx;
  const leadId = params[1];
  const [actionRes, agentRes] = await Promise.all([
    supabase.from('agent_actions')
      .select('id, agent_slug, action_type, status, autonomy_used, decision, ' +
              'reasoning, confidence, tokens_in, tokens_out, cost_usd, ' +
              'duration_ms, needs_review, reviewed_at, review_status, ' +
              'review_notes, error_message, event_id, created_at')
      .eq('agent_slug', 'hunter')
      .filter('decision->>social_lead_id', 'eq', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('agents').select('model').eq('slug', 'hunter').maybeSingle()
  ]);
  if (actionRes.error) return jsonResponse(500, { error: actionRes.error.message });
  if (!actionRes.data) return jsonResponse(404, { error: 'no hunter reasoning found for this lead', social_lead_id: leadId });
  return jsonResponse(200, {
    action: actionRes.data,
    reasoning: actionRes.data.reasoning || null,
    cost_usd: actionRes.data.cost_usd,
    model: agentRes.data?.model || null,
    social_lead_id: leadId
  });
}

async function handleSocialLeadAction(event, ctx) {
  const { supabase, params } = ctx;
  const id = Number.parseInt(params[1], 10);
  const status = params[2] === 'approve' ? 'approved'
               : params[2] === 'reject'  ? 'rejected'
               : 'contacted';
  const { data, error } = await supabase.from('social_leads')
    .update({ status })
    .eq('id', id).select('*').single();
  if (error) return jsonResponse(404, { error: error.message });
  return jsonResponse(200, { lead: data });
}

async function handleSocialPosts(event, ctx) {
  const { qs, supabase } = ctx;
  const status = (qs.status || '').trim();
  if (status && !SOCIAL_POST_STATUSES.includes(status)) {
    return jsonResponse(400, { error: 'invalid status', allowed: SOCIAL_POST_STATUSES });
  }
  const lim = Math.min(Math.max(Number.parseInt(qs.limit, 10) || 50, 1), 200);
  const off = Math.max(Number.parseInt(qs.offset, 10) || 0, 0);
  let q = supabase.from('social_posts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(off, off + lim - 1);
  if (status) q = q.eq('status', status);
  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return jsonResponse(200, { rows: data || [], total: count || 0, limit: lim, offset: off });
}

// Race-safe simple status flips for social_posts (approve / reject).
// Returns the same shape the original inline code did.
async function _socialPostStatusFlip(supabase, id, post, action) {
  if (action === 'reject') {
    // Race-safe: only reject from non-terminal, non-in-flight states.
    const { data, error } = await supabase.from('social_posts')
      .update({ status: 'rejected', reviewed_by: 'admin', reviewed_at: new Date().toISOString() })
      .eq('id', id).in('status', ['draft','approved'])
      .select('*').maybeSingle();
    if (error) return jsonResponse(500, { error: error.message });
    if (!data) return jsonResponse(409, { error: `cannot reject from current state (${post.status})` });
    return jsonResponse(200, { post: data });
  }
  // approve
  // Race-safe: only approve from draft.
  const { data, error } = await supabase.from('social_posts')
    .update({ status: 'approved', reviewed_by: 'admin', reviewed_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'draft')
    .select('*').maybeSingle();
  if (error) return jsonResponse(500, { error: error.message });
  if (!data) return jsonResponse(409, { error: `cannot approve from current state (${post.status})` });
  return jsonResponse(200, { post: data });
}

async function _socialPostPublish(supabase, id, post) {
  // publish — adapter dispatch.
  // Race-safe: we first flip status draft|approved -> publishing atomically via a
  // conditional UPDATE. If zero rows match, another request won the race (or the
  // post is in a terminal state). Only one caller ever reaches the adapter.
  if (post.status === 'published') return jsonResponse(409, { error: 'already published' });
  if (post.status === 'rejected')  return jsonResponse(409, { error: 'cannot publish a rejected draft' });
  if (post.status === 'publishing') return jsonResponse(409, { error: 'publish already in flight' });

  // Require a channel for platforms that address posts by account/subreddit.
  // Only Reddit truly needs a target subreddit today, but the same constraint
  // is safe for the other real adapters once they land.
  const PLATFORMS_REQUIRING_CHANNEL = ['reddit'];
  if (PLATFORMS_REQUIRING_CHANNEL.includes(post.platform) && !post.channel_id) {
    return jsonResponse(400, {
      error: `platform "${post.platform}" requires a channel — re-request the draft with a channel_id, or attach one before publishing`
    });
  }

  // Load the channel row (adapter needs the handle for Reddit).
  let channelRow = null;
  if (post.channel_id) {
    const { data: ch, error: chErr } = await supabase
      .from('social_channels').select('*').eq('id', post.channel_id).maybeSingle();
    if (chErr) return jsonResponse(500, { error: 'channel lookup failed: ' + chErr.message });
    channelRow = ch;
  }

  // Atomic claim: only the first caller sees >0 rows returned.
  const priorStatus = post.status; // 'draft' or 'approved'
  const { data: claimed, error: claimErr } = await supabase.from('social_posts')
    .update({ status: 'publishing' })
    .eq('id', id).eq('status', priorStatus)
    .select('id');
  if (claimErr) return jsonResponse(500, { error: 'claim failed: ' + claimErr.message });
  if (!claimed || claimed.length === 0) {
    return jsonResponse(409, { error: 'status changed under us — refresh and retry' });
  }

  let publishResult;
  try {
    const { getAdapter } = require('./social-adapters');
    const adapter = getAdapter(post.platform);
    publishResult = await adapter.publish({
      body: post.body,
      media_urls: post.media_urls || [],
      channel: channelRow
    });
  } catch (e) {
    // Roll the claim back so the post can be retried (or rejected).
    await supabase.from('social_posts')
      .update({ status: priorStatus })
      .eq('id', id).eq('status', 'publishing');
    return jsonResponse(502, { error: 'adapter_publish_failed: ' + e.message });
  }
  const { data, error } = await supabase.from('social_posts')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      external_post_id: publishResult?.external_post_id || null,
      reviewed_by: 'admin',
      reviewed_at: new Date().toISOString()
    })
    .eq('id', id).eq('status', 'publishing').select('*').single();
  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, { post: data, publish: publishResult });
}

async function handleSocialPostAction(event, ctx) {
  const { supabase, params } = ctx;
  const id = Number.parseInt(params[1], 10);
  const action = params[2];

  const { data: post, error: loadErr } = await supabase
    .from('social_posts').select('*').eq('id', id).maybeSingle();
  if (loadErr) return jsonResponse(500, { error: loadErr.message });
  if (!post) return jsonResponse(404, { error: 'post not found' });

  if (action === 'reject' || action === 'approve') {
    return _socialPostStatusFlip(supabase, id, post, action);
  }
  return _socialPostPublish(supabase, id, post);
}

// Manual draft request — emits social.post_requested for Promoter.
// When `variants` > 1, emits N events sharing a `variant_group` correlation
// id so the operator can compare multiple drafts of the same brief side-by-side.
async function handleSocialRequestDraft(event, ctx) {
  const { body, supabase } = ctx;
  const platform = (body.platform || '').toString();
  const audience = (body.audience || 'mixed').toString();
  const brief    = (body.brief || '').toString();
  let variants = Number.parseInt(body.variants, 10);
  if (!isFinite(variants) || variants < 1) variants = 1;
  if (variants > 10) variants = 10;
  if (!platform) return jsonResponse(400, { error: 'platform required' });

  const variantGroup = variants > 1
    ? `vg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    : null;

  const rows = [];
  for (let i = 0; i < variants; i++) {
    rows.push({
      event_type: 'social.post_requested',
      payload: {
        platform, audience, brief,
        channel_id: body.channel_id || null,
        variant_group: variantGroup,
        variant_index: variants > 1 ? i + 1 : null,
        variant_total: variants > 1 ? variants : null
      },
      source: 'admin-console'
    });
  }
  const { data, error } = await supabase
    .from('agent_events').insert(rows).select('id');
  if (error) return jsonResponse(500, { error: error.message });
  const ids = (data || []).map(r => r.id);
  return jsonResponse(200, {
    event_id: ids[0] || null,
    event_ids: ids,
    variants,
    variant_group: variantGroup
  });
}

// Inline-edit a draft. Race-safe: rejects if status is publishing/published.
async function handleSocialPostPatch(event, ctx) {
  const { body, supabase, params } = ctx;
  const id = Number.parseInt(params[1], 10);
  const { data: cur, error: loadErr } = await supabase
    .from('social_posts').select('*').eq('id', id).maybeSingle();
  if (loadErr) return jsonResponse(500, { error: loadErr.message });
  if (!cur) return jsonResponse(404, { error: 'post not found' });
  if (cur.status === 'publishing' || cur.status === 'published') {
    return jsonResponse(409, { error: `cannot edit a ${cur.status} post` });
  }
  const patch = {};
  if (typeof body.body === 'string') {
    const trimmed = body.body.trim();
    if (!trimmed) return jsonResponse(400, { error: 'body cannot be empty' });
    if (trimmed.length > 4000) return jsonResponse(400, { error: 'body exceeds 4000 chars' });
    patch.body = trimmed;
  }
  if (['member','provider','mixed'].includes(body.audience)) patch.audience = body.audience;
  if (Array.isArray(body.media_urls)) patch.media_urls = body.media_urls.slice(0, 10);
  if (body.channel_id === null || Number.isInteger(body.channel_id)) patch.channel_id = body.channel_id;
  if (Object.keys(patch).length === 0) return jsonResponse(400, { error: 'no valid fields to update' });

  // Stamp the operator's review on every accepted edit — an edit is an
  // implicit review touch even if status doesn't change.
  patch.reviewed_by = 'admin';
  patch.reviewed_at = new Date().toISOString();

  // Atomic guard: only update rows still in draft|approved|rejected.
  const { data, error } = await supabase.from('social_posts')
    .update(patch).eq('id', id).in('status', ['draft','approved','rejected'])
    .select('*').single();
  if (error) {
    // PGRST116 = no rows returned by .single() — likely status raced.
    if (error.code === 'PGRST116') return jsonResponse(409, { error: 'status changed under us — refresh and retry' });
    return jsonResponse(500, { error: error.message });
  }
  return jsonResponse(200, { post: data });
}

// Channel CRUD (minimal — list + insert + toggle).
async function handleSocialChannelsList(event, ctx) {
  const { data, error } = await ctx.supabase
    .from('social_channels').select('*').order('platform', { ascending: true });
  if (error) throw new Error(error.message);
  return jsonResponse(200, { rows: data || [] });
}

async function handleSocialChannelsCreate(event, ctx) {
  const { body, supabase } = ctx;
  const platform = (body.platform || '').toString();
  const handle   = (body.handle || '').toString() || null;
  const keywords = Array.isArray(body.monitor_keywords) ? body.monitor_keywords : [];
  const audience = ['member','provider','both'].includes(body.monitor_audience) ? body.monitor_audience : 'both';
  if (!platform) return jsonResponse(400, { error: 'platform required' });
  const { data, error } = await supabase
    .from('social_channels')
    .insert({ platform, handle, monitor_keywords: keywords, monitor_audience: audience, enabled: !!body.enabled })
    .select('*').single();
  if (error) return jsonResponse(400, { error: error.message });
  return jsonResponse(200, { channel: data });
}

async function handleSocialChannelToggle(event, ctx) {
  const { supabase, params } = ctx;
  const id = Number.parseInt(params[1], 10);
  const { data: cur } = await supabase.from('social_channels').select('enabled').eq('id', id).maybeSingle();
  if (!cur) return jsonResponse(404, { error: 'channel not found' });
  const { data, error } = await supabase.from('social_channels')
    .update({ enabled: !cur.enabled }).eq('id', id).select('*').single();
  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, { channel: data });
}

async function handleSocialChannelPatch(event, ctx) {
  const { body, supabase, params } = ctx;
  const id = Number.parseInt(params[1], 10);
  const patch = {};
  if (typeof body.handle === 'string') patch.handle = body.handle.trim() || null;
  if (Array.isArray(body.monitor_keywords)) {
    patch.monitor_keywords = body.monitor_keywords
      .map(s => String(s).trim()).filter(Boolean).slice(0, 50);
  }
  if (['member','provider','both'].includes(body.monitor_audience)) {
    patch.monitor_audience = body.monitor_audience;
  }
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (Object.keys(patch).length === 0) return jsonResponse(400, { error: 'no valid fields to update' });
  const { data, error } = await supabase.from('social_channels')
    .update(patch).eq('id', id).select('*').single();
  if (error) return jsonResponse(error.code === 'PGRST116' ? 404 : 400, { error: error.message });
  return jsonResponse(200, { channel: data });
}

async function handleSocialChannelDelete(event, ctx) {
  const id = Number.parseInt(ctx.params[1], 10);
  // FK on social_leads/social_posts is ON DELETE SET NULL — historical
  // rows survive but lose their channel pointer. That's intentional.
  const { error } = await ctx.supabase.from('social_channels').delete().eq('id', id);
  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, { ok: true, id });
}

async function handleSocialChannelRunMonitor(event, ctx) {
  const id = Number.parseInt(ctx.params[1], 10);
  const { runOnce } = require('./social-monitor-scheduled');
  try {
    const summary = await runOnce(ctx.supabase, { channelId: id });
    if (!summary.channels) return jsonResponse(404, { error: 'channel not found' });
    return jsonResponse(200, { ok: true, summary });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
}

// -------- prompt versioning
async function handlePromptGet(event, ctx) {
  const slug = ctx.params[1];
  const { data, error } = await ctx.supabase
    .from('agent_prompt_versions')
    .select('*')
    .eq('agent_slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return jsonResponse(200, { active: data || null });
}

async function handlePromptHistory(event, ctx) {
  const { qs, supabase, params } = ctx;
  const slug = params[1];
  const lim = Math.min(Math.max(Number.parseInt(qs.limit, 10) || 20, 1), 100);
  const { data, error } = await supabase
    .from('agent_prompt_versions')
    .select('id, version, notes, is_active, created_at, created_by')
    .eq('agent_slug', slug)
    .order('version', { ascending: false })
    .limit(lim);
  if (error) throw new Error(error.message);
  return jsonResponse(200, { versions: data || [] });
}

// Task #176: per-version body fetch for the diff viewer in
// /admin/agent-fleet-detail.html. The list endpoint above deliberately
// omits `body` to keep the payload small for long Sonnet system prompts;
// the diff view loads bodies on-demand via this route.
async function handlePromptVersion(event, ctx) {
  const { supabase, params } = ctx;
  const slug = params[1];
  const version = Number.parseInt(params[2], 10);
  const { data, error } = await supabase
    .from('agent_prompt_versions')
    .select('id, version, body, notes, is_active, created_at, created_by')
    .eq('agent_slug', slug)
    .eq('version', version)
    .maybeSingle();
  if (error) return jsonResponse(500, { error: error.message });
  if (!data) return jsonResponse(404, { error: 'Version not found' });
  return jsonResponse(200, { version: data });
}

async function handlePromptSave(event, ctx) {
  const { body, supabase, params } = ctx;
  const slug = params[1];
  const body_ = (body.body || '').toString();
  if (!body_.trim()) return jsonResponse(400, { error: 'body is required' });
  if (body_.length > 50000) return jsonResponse(400, { error: 'body exceeds 50,000 char limit' });
  const { data: agentRow, error: agentErr } = await supabase
    .from('agents').select('slug').eq('slug', slug).maybeSingle();
  if (agentErr) return jsonResponse(500, { error: agentErr.message });
  if (!agentRow) return jsonResponse(404, { error: 'Unknown agent: ' + slug });

  const { data: maxRow } = await supabase
    .from('agent_prompt_versions')
    .select('version')
    .eq('agent_slug', slug)
    .order('version', { ascending: false })
    .limit(1).maybeSingle();
  const nextVersion = (maxRow?.version || 0) + 1;

  // Deactivate the existing active row first (partial-unique index forbids two actives).
  const { error: deactErr } = await supabase
    .from('agent_prompt_versions')
    .update({ is_active: false })
    .eq('agent_slug', slug)
    .eq('is_active', true);
  if (deactErr) return jsonResponse(500, { error: deactErr.message });

  const { data: inserted, error: insErr } = await supabase
    .from('agent_prompt_versions')
    .insert({
      agent_slug: slug,
      version: nextVersion,
      body: body_,
      notes: (body.notes || '').toString().slice(0, 500) || null,
      is_active: true,
      created_by: 'admin'
    })
    .select('*').single();
  if (insErr) return jsonResponse(500, { error: insErr.message });
  try { clearPromptCache(slug); } catch (e) { /* warm cache only — ignore */ }
  // Audit row in agent_actions so the change shows up in the agent's activity
  // feed alongside its other actions. Best-effort — never blocks the save.
  try {
    await supabase.from('agent_actions').insert({
      agent_slug: slug,
      action_type: 'prompt.update',
      status: 'executed',
      autonomy_used: 'admin',
      decision: {
        version: inserted.version,
        notes: inserted.notes,
        body_chars: body_.length,
        body_preview: body_.slice(0, 200)
      },
      reasoning: inserted.notes
        ? `Admin saved prompt v${inserted.version}: ${inserted.notes}`
        : `Admin saved prompt v${inserted.version} (no changelog note).`
    });
  } catch (e) { console.warn('[agent-fleet-admin] prompt.update audit log failed:', e.message); }
  return jsonResponse(200, { version: inserted });
}

async function handlePromptActivate(event, ctx) {
  const { supabase, params } = ctx;
  const slug = params[1];
  const version = Number.parseInt(params[2], 10);
  const { data: target, error: tErr } = await supabase
    .from('agent_prompt_versions')
    .select('id').eq('agent_slug', slug).eq('version', version).maybeSingle();
  if (tErr) return jsonResponse(500, { error: tErr.message });
  if (!target) return jsonResponse(404, { error: 'Version not found' });

  const { error: deactErr } = await supabase
    .from('agent_prompt_versions')
    .update({ is_active: false })
    .eq('agent_slug', slug)
    .eq('is_active', true);
  if (deactErr) return jsonResponse(500, { error: deactErr.message });

  const { data: activated, error: actErr } = await supabase
    .from('agent_prompt_versions')
    .update({ is_active: true })
    .eq('id', target.id)
    .select('*').single();
  if (actErr) return jsonResponse(500, { error: actErr.message });
  try { clearPromptCache(slug); } catch (e) { /* ignore */ }
  // Audit the rollback in the agent's activity feed.
  try {
    await supabase.from('agent_actions').insert({
      agent_slug: slug,
      action_type: 'prompt.rollback',
      status: 'executed',
      autonomy_used: 'admin',
      decision: {
        activated_version: activated.version,
        notes: activated.notes,
        body_chars: (activated.body || '').length
      },
      reasoning: `Admin rolled back to prompt v${activated.version}` +
        (activated.notes ? ` (${activated.notes}).` : '.')
    });
  } catch (e) { console.warn('[agent-fleet-admin] prompt.rollback audit log failed:', e.message); }
  return jsonResponse(200, { version: activated });
}

// ─── Dispatch table ─────────────────────────────────────────────────────────
// Order matters: more-specific regexes must come before a sibling regex they
// could otherwise shadow. A `pattern` is matched against the parsed route;
// strings require exact equality, RegExps run `route.match(pattern)` and the
// resulting array is exposed to the handler as `ctx.params` (so params[1] is
// the first capture, mirroring the original inline match-array indexing).
const ROUTES = [
  // agents
  { method: 'GET',    pattern: 'agents',                                                handler: handleListAgents },
  { method: 'PUT',    pattern: /^agents\/([a-z0-9_-]+)$/i,                              handler: handleUpdateAgent },

  // actions  (more-specific subroutes first)
  { method: 'GET',    pattern: 'actions',                                               handler: handleListActions },
  { method: 'GET',    pattern: 'actions/by-target',                                     handler: handleActionsByTarget },
  { method: 'POST',   pattern: /^actions\/(\d+)\/review$/,                              handler: handleReviewAction },
  { method: 'POST',   pattern: /^actions\/(\d+)\/apply$/,                               handler: handleApplyAction },
  { method: 'GET',    pattern: /^actions\/(\d+)$/,                                      handler: handleActionDetail },

  // dashboards / misc reads
  { method: 'GET',    pattern: 'spend',                                                 handler: handleSpend },
  { method: 'GET',    pattern: 'stats/24h',                                             handler: handleStats24h },
  { method: 'GET',    pattern: 'badge-summary',                                         handler: handleBadgeSummary },
  { method: 'GET',    pattern: 'briefing',                                              handler: handleBriefing },

  // synthetic events + manual runs
  { method: 'POST',   pattern: 'test-event',                                            handler: handleTestEvent },
  { method: 'POST',   pattern: 'run/orchestrator',                                      handler: handleRunOrchestrator },
  { method: 'POST',   pattern: 'run/analyst',                                           handler: handleRunAnalyst },
  { method: 'POST',   pattern: /^run\/(gatekeeper|matchmaker|treasurer)-smoke$/,        handler: handleRunSmoke },
  { method: 'POST',   pattern: 'run/director',                                          handler: handleRunDirector },

  // director
  { method: 'GET',    pattern: 'director/alerts',                                       handler: handleDirectorAlerts },
  { method: 'POST',   pattern: /^director\/alerts\/(\d+)\/resolve$/,                    handler: handleDirectorAlertResolve },
  { method: 'GET',    pattern: 'director/config',                                       handler: handleDirectorConfigGet },
  { method: 'PUT',    pattern: 'director/config',                                       handler: handleDirectorConfigPut },

  // smoke run log
  { method: 'GET',    pattern: 'smoke-runs',                                            handler: handleSmokeRuns },

  // dead-letter queue
  { method: 'GET',    pattern: 'dead-letter',                                           handler: handleDeadLetter },
  { method: 'POST',   pattern: /^dead-letter\/(\d+)\/replay$/,                          handler: handleDeadLetterReplay },

  // spend-cap alerts
  { method: 'GET',    pattern: 'spend-alerts',                                          handler: handleSpendAlerts },
  { method: 'POST',   pattern: 'spend-alerts/test',                                     handler: handleSpendAlertsTest },
  { method: 'POST',   pattern: /^spend-alerts\/([a-z0-9_-]+)\/(\d{4}-\d{2}-\d{2})\/resend$/i, handler: handleSpendAlertResend },

  // events timeseries + memory viewer
  { method: 'GET',    pattern: 'events/timeseries',                                     handler: handleEventsTimeseries },
  { method: 'GET',    pattern: 'memory',                                                handler: handleMemory },

  // provider suspension
  { method: 'POST',   pattern: /^providers\/([0-9a-f-]+)\/suspend$/i,                   handler: handleSuspendProvider },

  // social leads / posts / channels
  { method: 'GET',    pattern: 'social/leads',                                          handler: handleSocialLeads },
  { method: 'GET',    pattern: /^social\/leads\/(\d+)\/reasoning$/,                     handler: handleSocialLeadReasoning },
  { method: 'POST',   pattern: /^social\/leads\/(\d+)\/(approve|reject|contacted)$/,    handler: handleSocialLeadAction },
  { method: 'GET',    pattern: 'social/posts',                                          handler: handleSocialPosts },
  { method: 'POST',   pattern: /^social\/posts\/(\d+)\/(approve|reject|publish)$/,      handler: handleSocialPostAction },
  { method: 'POST',   pattern: 'social/request-draft',                                  handler: handleSocialRequestDraft },
  { method: 'PATCH',  pattern: /^social\/posts\/(\d+)$/,                                handler: handleSocialPostPatch },
  { method: 'GET',    pattern: 'social/channels',                                       handler: handleSocialChannelsList },
  { method: 'POST',   pattern: 'social/channels',                                       handler: handleSocialChannelsCreate },
  { method: 'POST',   pattern: /^social\/channels\/(\d+)\/toggle$/,                     handler: handleSocialChannelToggle },
  { method: 'POST',   pattern: /^social\/channels\/(\d+)\/run-monitor$/,                handler: handleSocialChannelRunMonitor },
  { method: 'PATCH',  pattern: /^social\/channels\/(\d+)$/,                             handler: handleSocialChannelPatch },
  { method: 'DELETE', pattern: /^social\/channels\/(\d+)$/,                             handler: handleSocialChannelDelete },

  // prompt versioning  (more-specific paths before generic ones)
  { method: 'GET',    pattern: /^agents\/([a-z0-9_-]+)\/prompt-history$/i,              handler: handlePromptHistory },
  { method: 'GET',    pattern: /^agents\/([a-z0-9_-]+)\/prompt\/(\d+)$/i,               handler: handlePromptVersion },
  { method: 'GET',    pattern: /^agents\/([a-z0-9_-]+)\/prompt$/i,                      handler: handlePromptGet },
  { method: 'POST',   pattern: /^agents\/([a-z0-9_-]+)\/prompt$/i,                      handler: handlePromptSave },
  { method: 'POST',   pattern: /^agents\/([a-z0-9_-]+)\/prompt\/(\d+)\/activate$/i,     handler: handlePromptActivate }
];

function _matchRoute(route, method) {
  for (const entry of ROUTES) {
    if (entry.method !== method) continue;
    if (typeof entry.pattern === 'string') {
      if (entry.pattern === route) return { entry, params: [route] };
    } else {
      const m = route.match(entry.pattern);
      if (m) return { entry, params: m };
    }
  }
  return null;
}

// ─── Top-level handler ──────────────────────────────────────────────────────
// All admin auth, Supabase setup, body/qs parsing, and dispatch live here.
// The actual behavior of each route lives in its `handle*` function above.
exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });
  if (!authenticateAdmin(event)) return jsonResponse(401, { error: 'Unauthorized' });

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  const route = parsePath(event);
  const method = event.httpMethod || 'GET';
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch { body = {}; }
  }
  const qs = event.queryStringParameters || {};

  const matched = _matchRoute(route, method);
  if (!matched) return jsonResponse(404, { error: 'Not found', route });

  const ctx = { supabase, route, method, body, qs, params: matched.params };
  try {
    return await matched.entry.handler(event, ctx);
  } catch (e) {
    console.error('[agent-fleet-admin] error:', e.message);
    return jsonResponse(500, { error: e.message });
  }
};

// Exposed for unit tests (scripts/matchmaker-award-notify-test.js). Not part
// of the public Netlify function surface — only the `handler` export is.
exports.__test = {
  applyMatchmakerRank,
  notifyMatchmakerAward,
  sendMatchmakerFCMPush
};
