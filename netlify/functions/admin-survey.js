// netlify/functions/admin-survey.js
//
// Admin survey analytics endpoints (built from scratch — no server.js equivalent).
// Data source: survey_responses table + customer_profiles + job_listings
//
// Routes (via _redirects):
//   GET /api/admin/survey-stats              → totals, feature_heatmap, daily_counts
//   GET /api/admin/survey-analytics?range=   → 22 chart dimensions by date range
//   GET /api/admin/survey-leads              → paginated prospect leads
//   GET /api/admin/survey-leads/export       → CSV download
//   GET /api/admin/survey-not-interested     → paginated not-interested emails
//
// Auth: x-admin-password or x-admin-token header matching ADMIN_PASSWORD env var

'use strict';

var utils = require('./utils');

var FEATURE_IDS = [
  'get_quotes', 'manage_vehicles', 'maintenance', 'shop_smarter',
  'booking', 'obd_diagnostics', 'provider_ratings', 'price_estimator'
];

var CHART_KEYS = [
  'provider_discovery', 'provider_satisfaction', 'top_priority',
  'service_frequency', 'service_types', 'vehicle_count',
  'annual_spend', 'pricing_confidence', 'estimate_surprise', 'quote_behavior',
  'provider_honesty', 'provider_vetting', 'maintenance_avoidance', 'dispute_history',
  'history_tracking', 'job_status_updates', 'maintenance_reminders',
  'competitive_bids', 'app_usage', 'payment_comfort', 'decision_maker', 'near_term_need'
];

function authenticateAdmin(event) {
  var pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  var headers = event.headers || {};
  var provided = headers['x-admin-password'] || headers['x-admin-token'] || '';
  return provided === pw;
}

function parsePath(event) {
  var raw = event.path || '';
  return raw
    .replace(/^\/?\.netlify\/functions\/admin-survey\/?/, '')
    .replace(/^\/api\/admin\/survey-?/, '')
    .replace(/^\/+|\/+$/g, '');
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function getDateRange(range) {
  var now = new Date();
  var start = new Date(now);
  if (range === '7d')  { start.setDate(now.getDate() - 7);  }
  else if (range === '30d') { start.setDate(now.getDate() - 30); }
  else if (range === '90d') { start.setDate(now.getDate() - 90); }
  else { return null; } // 'all' — no filter
  return start.toISOString();
}

// Build { fid: { yes: N, maybe: M, no: P } } from an array of feature_ratings jsonb
function buildHeatmap(rows) {
  var heatmap = {};
  FEATURE_IDS.forEach(function(fid) { heatmap[fid] = { yes: 0, maybe: 0, no: 0 }; });
  rows.forEach(function(row) {
    var fr = row.feature_ratings;
    if (!fr || typeof fr !== 'object') return;
    FEATURE_IDS.forEach(function(fid) {
      var val = fr[fid];
      if (val === 'yes')   { heatmap[fid].yes++;   }
      else if (val === 'maybe') { heatmap[fid].maybe++; }
      else if (val === 'no')    { heatmap[fid].no++;    }
    });
  });
  return heatmap;
}

// Compute top_feature from a single feature_ratings object (first 'yes' key)
function topFeature(fr) {
  if (!fr || typeof fr !== 'object') return null;
  for (var i = 0; i < FEATURE_IDS.length; i++) {
    if (fr[FEATURE_IDS[i]] === 'yes') return FEATURE_IDS[i];
  }
  return null;
}

async function handleStats(supabase) {
  var now = new Date();
  var thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  var results = await Promise.all([
    // Total survey_responses
    supabase.from('survey_responses').select('id', { count: 'exact', head: true }),
    // With interested=true
    supabase.from('survey_responses').select('id', { count: 'exact', head: true }).eq('interested', true),
    // With interested not null (for % calc)
    supabase.from('survey_responses').select('id', { count: 'exact', head: true }).not('interested', 'is', null),
    // Total customer_profiles
    supabase.from('customer_profiles').select('id', { count: 'exact', head: true }),
    // Total job_listings
    supabase.from('job_listings').select('id', { count: 'exact', head: true }),
    // Feature ratings (last 30 days for heatmap freshness — all-time if < 500 rows)
    supabase.from('survey_responses').select('feature_ratings').not('feature_ratings', 'is', null).limit(500),
    // Daily counts (last 30 days)
    supabase.from('survey_responses').select('created_at')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true })
  ]);

  var totalCount     = results[0].count || 0;
  var interestedCount = results[1].count || 0;
  var withAnswerCount = results[2].count || 0;
  var profileCount   = results[3].count || 0;
  var jobCount       = results[4].count || 0;
  var featureRows    = results[5].data || [];
  var dailyRows      = results[6].data || [];

  var pctInterested = withAnswerCount > 0
    ? Math.round((interestedCount / withAnswerCount) * 100)
    : 0;

  var heatmap = buildHeatmap(featureRows);

  // Build daily_counts: { 'YYYY-MM-DD': N }
  var dailyCounts = {};
  dailyRows.forEach(function(r) {
    var day = isoDate(new Date(r.created_at));
    dailyCounts[day] = (dailyCounts[day] || 0) + 1;
  });

  return {
    total_responses:  totalCount,
    pct_interested:   pctInterested,
    total_profiles:   profileCount,
    total_jobs:       jobCount,
    feature_heatmap:  heatmap,
    daily_counts:     dailyCounts
  };
}

async function handleAnalytics(supabase, qs) {
  var range     = qs.range || 'all';
  var startDate = getDateRange(range);

  var now = new Date();
  var weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);

  // Fetch all columns needed for the 22 chart dimensions
  var select = ['id', 'created_at'].concat(CHART_KEYS).join(', ');

  var query = supabase.from('survey_responses').select(select);
  if (startDate) query = query.gte('created_at', startDate);

  // Fetch total in range + recent week (always last 7d regardless of range)
  var results = await Promise.all([
    query,
    supabase.from('survey_responses').select('id', { count: 'exact', head: true })
      .gte('created_at', weekAgo.toISOString())
  ]);

  if (results[0].error) {
    // Gracefully handle schema_pending (columns not yet migrated)
    var errMsg = (results[0].error.message || '').toLowerCase();
    if (errMsg.includes('column') || errMsg.includes('does not exist')) {
      return { total: 0, recent_week: 0, schema_pending: true };
    }
    throw results[0].error;
  }

  var rows      = results[0].data || [];
  var weekCount = results[1].count || 0;

  // Aggregate each chart key: { value: count }
  var out = { total: rows.length, recent_week: weekCount };
  CHART_KEYS.forEach(function(key) {
    var counts = {};
    rows.forEach(function(row) {
      var val = row[key];
      if (val && val !== '') {
        counts[val] = (counts[val] || 0) + 1;
      }
    });
    out['by_' + key] = counts;
  });

  return out;
}

async function handleLeads(supabase, qs) {
  var page    = Math.max(1, parseInt(qs.page)  || 1);
  var limit   = Math.min(parseInt(qs.limit) || 25, 100);
  var search  = (qs.search  || '').trim();
  var filter  = qs.filter   || 'all';
  var sortDir = qs.sort_dir === 'asc' ? true : false;
  var range   = qs.range    || 'all'; // '7d' | '30d' | '90d' | 'all'
  var startDate = getDateRange(range); // null when 'all'
  var offset  = (page - 1) * limit;

  var query = supabase
    .from('survey_responses')
    .select('id, email, first_name, last_name, phone, zip, interested, feature_ratings, created_at', { count: 'exact' })
    .not('email', 'is', null);

  if (filter === 'interested')     { query = query.eq('interested', true);  }
  else if (filter === 'not_interested') { query = query.eq('interested', false); }

  // Date-range filter so leads list matches the Survey Analytics window the admin picked
  if (startDate) query = query.gte('created_at', startDate);

  if (search) {
    query = query.or('email.ilike.%' + search + '%,first_name.ilike.%' + search + '%,last_name.ilike.%' + search + '%');
  }

  var result = await query
    .order('created_at', { ascending: sortDir })
    .range(offset, offset + limit - 1);

  if (result.error) throw result.error;

  var rows = result.data || [];
  var surveyIds = rows.map(function(r) { return r.id; });

  // Fetch customer_profiles for vehicle/name enrichment
  var profileMap = {};
  var jobMap     = {};

  if (surveyIds.length > 0) {
    var profileResult = await supabase
      .from('customer_profiles')
      .select('id, survey_response_id, first_name, last_name, phone, zip, vehicle_year, vehicle_make, vehicle_model')
      .in('survey_response_id', surveyIds);

    var profiles = profileResult.data || [];
    var profileIds = [];
    profiles.forEach(function(p) {
      profileMap[p.survey_response_id] = p;
      profileIds.push(p.id);
    });

    // Fetch job_listings for job detail
    if (profileIds.length > 0) {
      var jobResult = await supabase
        .from('job_listings')
        .select('customer_profile_id, service_type, vehicle_description, issue_description, urgency, budget_range')
        .in('customer_profile_id', profileIds);

      (jobResult.data || []).forEach(function(j) {
        jobMap[j.customer_profile_id] = j;
      });
    }
  }

  var leads = rows.map(function(r) {
    var profile = profileMap[r.id] || null;
    var job     = profile ? (jobMap[profile.id] || null) : null;

    var firstName = (profile && profile.first_name) || r.first_name || '';
    var lastName  = (profile && profile.last_name)  || r.last_name  || '';
    var name      = [firstName, lastName].filter(Boolean).join(' ') || null;

    var vehicle = null;
    if (profile && (profile.vehicle_year || profile.vehicle_make || profile.vehicle_model)) {
      vehicle = [profile.vehicle_year, profile.vehicle_make, profile.vehicle_model].filter(Boolean).join(' ');
    } else if (job && job.vehicle_description) {
      vehicle = job.vehicle_description;
    }

    return {
      id:           r.id,
      name:         name,
      email:        r.email,
      phone:        (profile && profile.phone) || r.phone || null,
      zip:          (profile && profile.zip)   || r.zip   || null,
      vehicle:      vehicle,
      interested:   r.interested,
      top_feature:  topFeature(r.feature_ratings),
      feature_ratings: r.feature_ratings || null,
      job_service:  job ? job.service_type       : null,
      job_issue:    job ? job.issue_description  : null,
      job_urgency:  job ? job.urgency            : null,
      job_budget:   job ? job.budget_range       : null,
      created_at:   r.created_at
    };
  });

  return {
    leads,
    total:      result.count || 0,
    page,
    totalPages: Math.ceil((result.count || 0) / limit)
  };
}

async function handleExport(supabase, qs) {
  var range     = (qs && qs.range) || 'all';
  var startDate = getDateRange(range);
  var query = supabase
    .from('survey_responses')
    .select('id, email, first_name, last_name, phone, zip, interested, feature_ratings, created_at')
    .not('email', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (startDate) query = query.gte('created_at', startDate);
  var result = await query;

  if (result.error) throw result.error;

  var rows = result.data || [];

  // CSV header
  var csvLines = ['Name,Email,Phone,ZIP,Interested,Top Feature,Date'];

  rows.forEach(function(r) {
    var name = [r.first_name, r.last_name].filter(Boolean).join(' ');
    var tf   = topFeature(r.feature_ratings) || '';
    var interested = r.interested === true ? 'Yes' : r.interested === false ? 'No' : '';
    var date = r.created_at ? r.created_at.slice(0, 10) : '';

    function csvCell(v) {
      var s = String(v || '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    csvLines.push([
      csvCell(name), csvCell(r.email), csvCell(r.phone || ''),
      csvCell(r.zip || ''), csvCell(interested), csvCell(tf), csvCell(date)
    ].join(','));
  });

  var csv = csvLines.join('\n');

  return {
    statusCode: 200,
    headers: {
      'Content-Type':              'text/csv',
      'Content-Disposition':       'attachment; filename="survey-leads-' + new Date().toISOString().slice(0, 10) + '.csv"',
      'Access-Control-Allow-Origin': '*'
    },
    body: csv
  };
}

async function handleNotInterested(supabase, qs) {
  var page   = Math.max(1, parseInt(qs.page)  || 1);
  var limit  = Math.min(parseInt(qs.limit) || 50, 200);
  var offset = (page - 1) * limit;

  var result = await supabase
    .from('survey_responses')
    .select('email, feature_ratings, created_at', { count: 'exact' })
    .eq('interested', false)
    .not('email', 'is', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (result.error) throw result.error;

  return {
    emails:     result.data || [],
    total:      result.count || 0,
    page,
    totalPages: Math.ceil((result.count || 0) / limit)
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  if (!authenticateAdmin(event)) return utils.errorResponse(401, 'Authentication required');

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  var path   = parsePath(event);
  var method = event.httpMethod;
  var qs     = event.queryStringParameters || {};

  try {
    // GET /api/admin/survey-stats
    if (method === 'GET' && path === 'stats') {
      return utils.successResponse(await handleStats(supabase));
    }

    // GET /api/admin/survey-analytics
    if (method === 'GET' && path === 'analytics') {
      return utils.successResponse(await handleAnalytics(supabase, qs));
    }

    // GET /api/admin/survey-leads/export
    if (method === 'GET' && path === 'leads/export') {
      return await handleExport(supabase, qs);
    }

    // GET /api/admin/survey-leads
    if (method === 'GET' && path === 'leads') {
      return utils.successResponse(await handleLeads(supabase, qs));
    }

    // GET /api/admin/survey-not-interested
    if (method === 'GET' && path === 'not-interested') {
      return utils.successResponse(await handleNotInterested(supabase, qs));
    }

    return utils.errorResponse(404, 'Unknown route: ' + method + ' ' + path);

  } catch (err) {
    console.error('[admin-survey] error on', path, ':', err.message);
    return utils.errorResponse(500, 'Something went wrong');
  }
};
