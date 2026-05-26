// netlify/functions/admin-chat-insights.js
//
// Route: GET /api/admin/chat-insights
//
// Returns aggregate AI chat session data.
// Chat sessions are currently stored client-side (localStorage); this endpoint
// returns server-side counts from notifications/admin_audit_log as a proxy
// until a server-side chat persistence layer exists.
//
// Auth: x-admin-password or x-admin-token

'use strict';

const utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET') return utils.errorResponse(405, 'Method not allowed');

  const adminPassword = process.env.ADMIN_PASSWORD;
  const incomingPw = (event.headers['x-admin-password'] || event.headers['X-Admin-Password'] || '').trim();
  const incomingTk = (event.headers['x-admin-token']    || event.headers['X-Admin-Token']    || '').trim();
  const teamTokens = (process.env.ADMIN_TEAM_TOKENS || '').split(',').map(t => t.trim()).filter(Boolean);

  const authed = (adminPassword && incomingPw === adminPassword)
              || (incomingTk && teamTokens.includes(incomingTk));
  if (!authed) return utils.errorResponse(401, 'Unauthorized');

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
