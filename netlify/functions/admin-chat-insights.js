// netlify/functions/admin-chat-insights.js
//
// Route: GET /api/admin/chat-insights
//
// Returns aggregate AI chat session data for the "AI Chat Insights" admin
// panel section — real data as of 2026-09-03. Previously a permanent stub
// (always returned hardcoded zeros): there was genuinely no server-side
// chat data anywhere to aggregate, because netlify/functions/helpdesk.js
// never stored a message. That's now fixed (see helpdesk.js and
// supabase/migrations/20260903e_chat_conversations.sql) — this queries the
// two tables that fix created: chat_conversations and chat_messages.
//
// No historical backfill is possible — no chat data existed anywhere
// before this shipped, so these numbers only start accumulating from here.
//
// thumbsUp/thumbsDown will read 0 for a while: www/chat-widget-base.js's
// feedback click handler still only writes to localStorage — it was not
// wired to send feedback to the server in this pass (see the migration's
// header comment for why). The `feedback` column exists and is queried
// here so this endpoint needs no further changes once that's wired up.
//
// Auth: Authorization: Bearer <supabase_token|team_token>

'use strict';

const utils = require('./utils');

const RECENT_ACTIVITY_LIMIT = 20;

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET') return utils.errorResponse(405, 'Method not allowed');

  const supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  // Tries the existing ADMIN_TEAM_TOKENS / full-admin check first (unchanged,
  // still covers whatever automation already relies on it — see
  // netlify/functions-tests/admin-team-functions.test.js). Falls back to a
  // Team Login team member whose role has 'ai-chat-insights' in
  // lib/admin-role-permissions.js (2026-09-03 — see
  // utils.authenticateAdminSection).
  const caller = (await utils.authenticateBearerAdminOrTeam(event, supabase))
    || (await utils.authenticateAdminSection(event, supabase, 'ai-chat-insights'));
  if (!caller) return utils.errorResponse(401, 'Unauthorized');

  try {
    const [totalSessionsRes, totalMessagesRes, thumbsUpRes, thumbsDownRes, modeRowsRes, recentConvosRes] = await Promise.all([
      supabase.from('chat_conversations').select('conversation_id', { count: 'exact', head: true }),
      supabase.from('chat_messages').select('id', { count: 'exact', head: true }),
      supabase.from('chat_messages').select('id', { count: 'exact', head: true }).eq('feedback', 'up'),
      supabase.from('chat_messages').select('id', { count: 'exact', head: true }).eq('feedback', 'down'),
      supabase.from('chat_conversations').select('mode'),
      supabase.from('chat_conversations')
        .select('conversation_id, mode, message_count, last_message_at')
        .order('last_message_at', { ascending: false })
        .limit(RECENT_ACTIVITY_LIMIT)
    ]);

    const firstError = [totalSessionsRes, totalMessagesRes, thumbsUpRes, thumbsDownRes, modeRowsRes, recentConvosRes]
      .find(r => r.error);
    if (firstError) return utils.errorResponse(500, firstError.error.message);

    const modeCount = { driver: 0, provider: 0, education: 0 };
    for (const row of (modeRowsRes.data || [])) {
      if (modeCount[row.mode] !== undefined) modeCount[row.mode]++;
    }

    const recentConvos = recentConvosRes.data || [];
    let recentActivity = [];
    if (recentConvos.length > 0) {
      const ids = recentConvos.map(c => c.conversation_id);
      // FK join isn't expressible via a single PostgREST call the way we
      // need it (last message per conversation), so fetch recent messages
      // for just these conversations and pick the newest per id client-side
      // — same pattern used elsewhere in this codebase (e.g. ai-ops-admin.js
      // stitching in profiles) for the same PostgREST limitation.
      const msgRes = await supabase
        .from('chat_messages')
        .select('conversation_id, role, content, created_at')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false });
      const lastMessageByConvo = {};
      for (const m of (msgRes.data || [])) {
        if (!lastMessageByConvo[m.conversation_id]) lastMessageByConvo[m.conversation_id] = m;
      }
      recentActivity = recentConvos.map(c => {
        const last = lastMessageByConvo[c.conversation_id];
        return {
          conversationId: c.conversation_id,
          mode: c.mode,
          messageCount: c.message_count,
          lastMessage: last ? String(last.content || '').slice(0, 100) : '',
          lastMessageAt: c.last_message_at
        };
      });
    }

    return utils.successResponse({
      totalSessions: totalSessionsRes.count || 0,
      totalMessages: totalMessagesRes.count || 0,
      thumbsUp: thumbsUpRes.count || 0,
      thumbsDown: thumbsDownRes.count || 0,
      modeCount,
      recentActivity
    });
  } catch (err) {
    console.error('[admin-chat-insights] error:', err.message);
    return utils.errorResponse(500, err.message);
  }
};
