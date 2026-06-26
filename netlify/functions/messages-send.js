// ============================================================================
// netlify/functions/messages-send.js  (Session 1 — Messages hardening)
//
// POST /api/messages/send
//   Body: { package_id, recipient_id, content }
//   Auth: Bearer JWT (Supabase) — sender is ALWAYS auth.uid(), never trusted from body.
//
// SINGLE ARBITER FOR MESSAGES. The legacy direct client `.insert()` paths in
// members-extras.js + providers-jobs.js now POST here instead. This endpoint:
//
//   1. JWT auth → resolves caller user.id (sender_id is derived, not trusted).
//   2. RELATIONSHIP GATE: caller and recipient must be the member + accepted
//      provider on the given package_id, in either direction. Mirrors the
//      strict RLS in 20260625b_messages_rls_relationship_gate.sql server-side
//      so the failure mode is loud (403 feature_disabled-shaped error) instead
//      of a silent RLS rejection. Covers BOTH the new care_plans flow (status
//      IN 'awarded','completed' + provider_id set) and the legacy
//      maintenance_packages flow (accepted_bid_id → bids.status='accepted').
//   3. CONTENT SCAN (anti-circumvention): phone, email, off-platform keywords.
//      On any match: auto-file a circumvention_reports row, redact matches in
//      stored content, return soft warning to sender. NOT a hard block —
//      MODERATION_MODE constant flips to 'hard_block' if you ever want that.
//   4. INSERT message via service-role (bypasses tightened RLS).
//   5. SERVER-SIDE notification fan-out: insert notifications row + fire FCM
//      push (recipient's device_push_tokens). Replaces the orphan client
//      notifyNewMessage() helper that nobody was actually calling.
//   6. AUDIT on flagged sends only (admin_audit_log; unflagged messages are
//      not audited to keep the table queryable for moderation events).
//   7. Returns the (possibly redacted) message so the client renders what
//      was actually stored.
//
// Pattern B (utils.createSupabaseClient, lowercase sentinel errors).
// ============================================================================
'use strict';

const utils = require('./utils');
const {
  getFCMAccessToken,
  sendFCMv1Message,
} = require('./notifications-bid-accepted-push');

// Toggle moderation severity. 'redact' = scan-redact-flag (current default).
// 'hard_block' = refuse to insert if any pattern matches. Reserved for future.
const MODERATION_MODE = 'redact';

const MAX_CONTENT_LEN = 4000;

// Anti-circumvention regex set. Order matters for redaction (longer/keyword
// matches first so they don't get partially-redacted by the phone/email pass).
const KEYWORDS_RE = /\b(whatsapp|telegram|signal|venmo|cashapp|zelle|paypal\.me|cash\.app|text me at|call me at|my number is|reach me at|outside the (app|platform))\b/gi;
const PHONE_RE    = /(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}/g;
const EMAIL_RE    = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function jsonResp(code, data) {
  return { statusCode: code, headers: CORS_HEADERS, body: JSON.stringify(data) };
}

function getBearerToken(event) {
  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// Scan content for circumvention patterns. Returns { matched, redacted, hits }.
// hits is an array of { pattern, sample } for the audit row.
function scanContent(raw) {
  const hits = [];
  let redacted = String(raw);

  const apply = (re, label) => {
    const found = redacted.match(re);
    if (found && found.length) {
      for (const s of found) hits.push({ pattern: label, sample: s });
      redacted = redacted.replace(re, '[redacted]');
    }
  };

  // Keyword pass first — preserves intent signal in audit even if phone/email
  // pass would catch the same span.
  apply(KEYWORDS_RE, 'keyword');
  apply(PHONE_RE, 'phone');
  apply(EMAIL_RE, 'email');

  return { matched: hits.length > 0, redacted, hits };
}

// Verify caller + recipient are the member + accepted provider on the
// referenced package_id, in either direction. Returns { ok, reason }.
async function checkRelationship(supabase, callerId, recipientId, packageId) {
  // New flow first: care_plans.
  const cp = await supabase
    .from('care_plans')
    .select('id, member_id, provider_id, status')
    .eq('id', packageId)
    .maybeSingle();
  if (cp.data) {
    const { member_id, provider_id, status } = cp.data;
    if (!['awarded', 'completed'].includes(status)) {
      return { ok: false, reason: 'care_plan_not_past_acceptance' };
    }
    if (!provider_id) return { ok: false, reason: 'no_accepted_provider' };
    const pair =
      (member_id === callerId && provider_id === recipientId) ||
      (provider_id === callerId && member_id === recipientId);
    if (!pair) return { ok: false, reason: 'not_a_participant_on_care_plan' };
    return { ok: true };
  }

  // Legacy: maintenance_packages → accepted_bid_id → bids.
  const mp = await supabase
    .from('maintenance_packages')
    .select('id, member_id, accepted_bid_id')
    .eq('id', packageId)
    .maybeSingle();
  if (!mp.data) return { ok: false, reason: 'package_not_found' };
  if (!mp.data.accepted_bid_id) return { ok: false, reason: 'no_accepted_bid' };

  const bid = await supabase
    .from('bids')
    .select('id, provider_id, status')
    .eq('id', mp.data.accepted_bid_id)
    .maybeSingle();
  if (!bid.data) return { ok: false, reason: 'accepted_bid_not_found' };
  if (bid.data.status !== 'accepted') return { ok: false, reason: 'bid_not_accepted_status' };

  const pair =
    (mp.data.member_id === callerId  && bid.data.provider_id === recipientId) ||
    (bid.data.provider_id === callerId && mp.data.member_id === recipientId);
  if (!pair) return { ok: false, reason: 'not_a_participant_on_package' };
  return { ok: true };
}

// Fire FCM push to recipient's active devices. Mirrors the
// notifications-bid-accepted-push.js pattern. Non-fatal: errors logged.
async function dispatchMessagePush(supabase, recipientId, senderName, packageTitle, packageId) {
  if (!process.env.FCM_SERVICE_ACCOUNT_JSON) return; // not configured — fine
  let tokenRows = [];
  try {
    const { data, error } = await supabase
      .from('device_push_tokens')
      .select('token, platform')
      .eq('member_id', recipientId)
      .eq('active', true);
    if (error || !data || data.length === 0) return;
    tokenRows = data;
  } catch (e) {
    console.warn('[messages-send] token lookup failed:', e.message);
    return;
  }

  let projectId;
  try { projectId = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON).project_id; }
  catch { return; }

  const title = `New message from ${senderName}`;
  const body = packageTitle ? `Regarding: ${packageTitle}` : 'Open the app to read.';
  const stale = [];

  await Promise.all(tokenRows.map(async (row) => {
    try {
      const result = await sendFCMv1Message(row.token, title, body, {
        section: 'messages',
        package_id: packageId,
      }, projectId);
      if (result.status !== 200) {
        const code = result.body?.error?.details?.[0]?.errorCode
                  || result.body?.error?.status;
        if (code === 'UNREGISTERED' || code === 'NOT_FOUND') stale.push(row.token);
      }
    } catch (err) {
      console.warn('[messages-send] FCM send failed:', err.message);
    }
  }));

  if (stale.length) {
    try { await supabase.from('device_push_tokens').update({ active: false }).in('token', stale); }
    catch (e) { console.warn('[messages-send] stale token deactivate failed:', e.message); }
  }
}

// Resolve a friendly sender display name (provider business_name / alias
// preferred, else full_name, else 'A member'). Service-role read — bypasses
// any directory allowlist.
async function resolveSenderName(supabase, senderId) {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('business_name, provider_alias, full_name, role')
      .eq('id', senderId)
      .maybeSingle();
    if (!data) return 'A user';
    if (data.role === 'provider') {
      return data.business_name || data.provider_alias || data.full_name || 'A provider';
    }
    return data.full_name || 'A member';
  } catch {
    return 'A user';
  }
}

async function resolvePackageTitle(supabase, packageId) {
  try {
    const cp = await supabase.from('care_plans').select('title').eq('id', packageId).maybeSingle();
    if (cp.data?.title) return cp.data.title;
    const mp = await supabase.from('maintenance_packages').select('title').eq('id', packageId).maybeSingle();
    return mp.data?.title || null;
  } catch { return null; }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') return jsonResp(405, { error: 'method_not_allowed' });

  const supabase = utils.createSupabaseClient();
  if (!supabase) return jsonResp(500, { error: 'server_misconfigured' });

  const token = getBearerToken(event);
  if (!token) return jsonResp(401, { error: 'authentication_required' });

  const authResult = await supabase.auth.getUser(token);
  if (authResult.error || !authResult.data?.user) return jsonResp(401, { error: 'invalid_token' });
  const senderId = authResult.data.user.id;

  let parsed;
  try { parsed = JSON.parse(event.body || '{}'); }
  catch { return jsonResp(400, { error: 'invalid_json' }); }

  const packageId   = parsed.package_id;
  const recipientId = parsed.recipient_id;
  const contentRaw  = (parsed.content || '').toString();

  if (!packageId || !utils.isValidUUID(packageId))     return jsonResp(400, { error: 'invalid_package_id' });
  if (!recipientId || !utils.isValidUUID(recipientId)) return jsonResp(400, { error: 'invalid_recipient_id' });
  if (recipientId === senderId)                         return jsonResp(400, { error: 'cannot_message_self' });
  const content = contentRaw.trim();
  if (!content)                                         return jsonResp(400, { error: 'empty_content' });
  if (content.length > MAX_CONTENT_LEN)                 return jsonResp(400, { error: 'content_too_long' });

  // Relationship gate (mirrors the tightened RLS).
  const rel = await checkRelationship(supabase, senderId, recipientId, packageId);
  if (!rel.ok) {
    return jsonResp(403, { error: 'no_active_relationship', reason: rel.reason });
  }

  // Content scan.
  const scan = scanContent(content);
  let storedContent = scan.matched ? scan.redacted : content;
  let warning = null;

  if (scan.matched) {
    if (MODERATION_MODE === 'hard_block') {
      return jsonResp(422, {
        error: 'content_flagged',
        reason: 'Sharing contact info or off-platform handles is against our terms.',
      });
    }
    // 'redact' mode: file a circumvention_reports row, soft-warn the sender.
    try {
      await supabase.from('circumvention_reports').insert({
        reporter_id: senderId,            // self-reported by the moderation system
        provider_id: recipientId,         // best-effort: who the sender was attempting to contact
        package_id:  packageId,
        report_type: 'auto_content_scan',
        description: 'Automated scan detected potential off-platform contact in a message.',
        evidence_urls: null,
        status: 'pending',
      });
    } catch (e) {
      console.error('[messages-send] circumvention_reports insert failed (non-fatal):', e.message);
    }
    warning = 'Sharing contact info is against our terms. The flagged content was redacted and a record was filed for review.';
  }

  // Look up the sender's provider_alias to denormalize (existing column on
  // messages used by loadConversations for thread labels).
  let providerAlias = null;
  try {
    const sp = await supabase.from('profiles').select('provider_alias').eq('id', senderId).maybeSingle();
    providerAlias = sp.data?.provider_alias || null;
  } catch { /* non-fatal */ }

  // INSERT via service-role (bypasses the tightened RLS for legitimate sends).
  const insertRes = await supabase
    .from('messages')
    .insert({
      sender_id: senderId,
      recipient_id: recipientId,
      package_id: packageId,
      content: storedContent,
      provider_alias: providerAlias,
    })
    .select('id, sender_id, recipient_id, package_id, content, provider_alias, created_at')
    .single();

  if (insertRes.error) {
    console.error('[messages-send] insert failed:', insertRes.error.message);
    return jsonResp(500, { error: 'insert_failed' });
  }
  const inserted = insertRes.data;

  // ── SERVER-SIDE notification fan-out ─────────────────────────────────────
  const [senderName, packageTitle] = await Promise.all([
    resolveSenderName(supabase, senderId),
    resolvePackageTitle(supabase, packageId),
  ]);

  // In-app row.
  try {
    await supabase.from('notifications').insert({
      user_id: recipientId,
      type: 'new_message',
      title: `New message from ${senderName}`,
      message: packageTitle
        ? `Regarding: ${packageTitle}`
        : 'Open the app to read.',
      link_type: 'message',
      link_id: packageId,
    });
  } catch (e) {
    console.warn('[messages-send] in-app notification insert failed:', e.message);
  }

  // FCM push (fire-and-forget; never blocks the send).
  dispatchMessagePush(supabase, recipientId, senderName, packageTitle, packageId)
    .catch(e => console.warn('[messages-send] push dispatch threw:', e.message));

  // ── AUDIT (flagged sends only — keeps log queryable for moderation) ──────
  if (scan.matched) {
    try {
      await supabase.from('admin_audit_log').insert({
        action: 'message_flagged',
        target_type: 'message',
        target_id: inserted.id,
        reason: 'auto_content_scan',
        metadata: {
          sender_id: senderId,
          recipient_id: recipientId,
          package_id: packageId,
          redacted: true,
          hit_patterns: scan.hits.map(h => h.pattern),
        },
        performed_by: senderId,
      });
    } catch (e) {
      console.warn('[messages-send] audit insert failed (non-fatal):', e.message);
    }
  }

  return jsonResp(200, {
    success: true,
    message: inserted,
    warning,            // null unless flagged
    flagged: scan.matched,
  });
};
