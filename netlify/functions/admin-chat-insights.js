// netlify/functions/admin-chat-insights.js
//
// Route: GET /api/admin/chat-insights
//
// Returns aggregate AI chat session data.
// Chat sessions are currently stored client-side (localStorage); this endpoint
// returns server-side counts from notifications/admin_audit_log as a proxy
// until a server-side chat persistence layer exists.
//
// Auth: Authorization: Bearer <supabase_token|team_token>

'use strict';

const utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET') return utils.errorResponse(405, 'Method not allowed');

  const supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  const caller = await utils.authenticateBearerAdminOrTeam(event, supabase);
  if (!caller) return utils.errorResponse(401, 'Unauthorized');

  // Return empty structure — chat sessions are stored locally on each client
  // until a server-side session persistence layer is built.
  return utils.successResponse({
    totalSessions:   0,
    totalMessages:   0,
    thumbsUp:        0,
    thumbsDown:      0,
    modeCount:       { driver: 0, provider: 0, education: 0 },
    recentActivity:  [],
    note: 'Chat sessions are stored client-side. Aggregate server-side tracking is pending implementation.'
  });
};
