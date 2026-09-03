// netlify/functions/analytics.js
//
// Ports server.js's site-analytics feature (Traffic admin section) to
// Netlify. Task: admin-portal audit — /api/analytics/data only ever
// existed in server.js, no _redirects rule, so the whole Traffic section
// 404'd. /api/analytics/track (page-view ingest) was in the same boat, and
// had been deliberately disabled client-side as a no-op since a prior audit
// pass (see www/analytics-tracker.js) pending exactly this work.
//
// Routes:
//   POST /api/analytics/track  — log a page view (public, no auth — called
//                                 from every page load)
//   GET  /api/analytics/data   — aggregated stats for the Traffic admin
//                                 section (admin-only)
//
// "Active now" is computed from page_views rows in the last 5 minutes
// instead of server.js's in-memory activeVisitors Map — Netlify functions
// are stateless between invocations, so an in-memory map can't survive
// across requests the way it could in the old long-running server.

'use strict';

const utils = require('./utils');

function parsePath(event) {
  return (event.path || '')
    .replace(/^\/?\.netlify\/functions\/analytics\/?/, '')
    .replace(/^\/api\/analytics\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

function getDateKey(date) {
  return date.toISOString().split('T')[0];
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  const path = parsePath(event);
  const method = event.httpMethod;

  // ── POST /track — public, no auth ─────────────────────────────────────
  if (method === 'POST' && path === 'track') {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { return utils.errorResponse(400, 'Invalid JSON'); }
    const { page, referrer, device, visitorId } = body;
    if (!page || typeof page !== 'string' || page.length > 500) {
      return utils.errorResponse(400, 'Invalid page parameter');
    }

    const supabase = utils.createSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('page_views').insert({
          page: page.substring(0, 500),
          referrer: (referrer || '').substring(0, 500),
          device: (device || 'unknown').substring(0, 50),
          visitor_id: (visitorId || 'anonymous').substring(0, 100)
        });
      } catch (dbErr) {
        console.error('[analytics] page_views insert error:', dbErr.message);
        // Never fail the page load over analytics — swallow and still 200.
      }
    }
    return utils.successResponse({ success: true });
  }

  // ── GET /data — admin only ────────────────────────────────────────────
  if (method === 'GET' && path === 'data') {
    const supabase = utils.createSupabaseClient();
    if (!supabase) return utils.errorResponse(500, 'Server configuration error');

    // Tries the existing ADMIN_TEAM_TOKENS / full-admin check first (unchanged,
    // still covers whatever automation already relies on it — see
    // netlify/functions-tests/admin-team-functions.test.js). Falls back to a
    // Team Login team member whose role has 'traffic' in
    // lib/admin-role-permissions.js (2026-09-03 — see
    // utils.authenticateAdminSection).
    const caller = (await utils.authenticateBearerAdminOrTeam(event, supabase))
      || (await utils.authenticateAdminSection(event, supabase, 'traffic'));
    if (!caller) return utils.errorResponse(401, 'Unauthorized');

    try {
      const params = event.queryStringParameters || {};
      const days = Number.parseInt(params.days) || 30;

      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - days);
      const startISO = startDate.toISOString();

      const { data: rows, error: dbErr } = await supabase
        .from('page_views')
        .select('page, referrer, device, visitor_id, created_at')
        .gte('created_at', startISO)
        .order('created_at', { ascending: true });
      if (dbErr) console.error('[analytics] page_views select error:', dbErr.message);

      const pvRows = rows || [];
      const dailyMap = {};
      const dailyVisitorMap = {};
      const pageMap = {};
      const deviceAgg = { ios_app: 0, android_app: 0, desktop_web: 0, mobile_web: 0, unknown: 0 };
      const refMap = {};

      for (const row of pvRows) {
        const dk = row.created_at.substring(0, 10);
        dailyMap[dk] = (dailyMap[dk] || 0) + 1;
        if (!dailyVisitorMap[dk]) dailyVisitorMap[dk] = new Set();
        dailyVisitorMap[dk].add(row.visitor_id);
        pageMap[row.page] = (pageMap[row.page] || 0) + 1;
        const dev = (row.device || 'unknown').toLowerCase().replaceAll(/\s+/g, '_');
        if (Object.hasOwn(deviceAgg, dev)) deviceAgg[dev]++; else deviceAgg.unknown++;
        const ref = row.referrer || 'direct';
        refMap[ref] = (refMap[ref] || 0) + 1;
      }

      const dateKeys = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dateKeys.push(getDateKey(d));
      }
      const dailyViews = dateKeys.map(dk => ({
        date: dk,
        views: dailyMap[dk] || 0,
        visitors: dailyVisitorMap[dk] ? dailyVisitorMap[dk].size : 0
      })).reverse();

      const topPages = Object.entries(pageMap)
        .map(([page, views]) => ({ page, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 20);

      const referralSources = Object.entries(refMap)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      let totalViews = 0;
      let totalVisitors = 0;
      for (const dv of dailyViews) { totalViews += dv.views; totalVisitors += dv.visitors; }

      // "Active now" approximated from page_views in the last 5 minutes —
      // see file header for why this replaces server.js's in-memory Map.
      let activeNow = 0;
      try {
        const fiveMinAgoISO = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: recentRows } = await supabase
          .from('page_views')
          .select('visitor_id')
          .gte('created_at', fiveMinAgoISO);
        activeNow = new Set((recentRows || []).map(r => r.visitor_id)).size;
      } catch (e) {
        console.error('[analytics] active-now query error:', e.message);
      }

      return utils.successResponse({
        dailyViews, topPages, deviceBreakdown: deviceAgg, referralSources,
        totalViews, totalVisitors, activeNow
      });
    } catch (err) {
      console.error('[analytics] data retrieval error:', err.message);
      return utils.errorResponse(500, 'Failed to load analytics data');
    }
  }

  return utils.errorResponse(404, 'Not found');
};
