// netlify/functions/admin-stats.js
//
// Handles all /api/admin/stats/* dashboard chart routes.
// Ported from server.js:
//   handleAdminStatsOverview  (line 27517)
//   handleAdminStatsRevenue   (line 28379)
//   handleAdminStatsUsers     (line 28436)
//   handleAdminStatsOrders    (line 28494)
//   getDateRangeFromPeriod    (line 27581)
//   groupDataByPeriod         (line 28347)
//
// Routes (via _redirects → /.netlify/functions/admin-stats/:splat):
//   GET /api/admin/stats/overview
//   GET /api/admin/stats/revenue?period=week|month|quarter|year
//   GET /api/admin/stats/users?period=week|month|quarter|year
//   GET /api/admin/stats/orders?period=week|month|quarter|year
//
// Auth: Authorization: Bearer <supabase_token> → verify with getUser → profiles.role === 'admin'

'use strict';

var utils = require('./utils');

function parsePath(event) {
  var raw = event.path || '';
  return raw
    .replace(/^\/?\.netlify\/functions\/admin-stats\/?/, '')
    .replace(/^\/api\/admin\/stats\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

function getDateRangeFromPeriod(period) {
  var now = new Date();
  var startDate, groupBy;
  switch (period) {
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      groupBy = 'day';
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      groupBy = 'day';
      break;
    case 'quarter':
      startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      groupBy = 'week';
      break;
    case 'year':
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      groupBy = 'month';
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      groupBy = 'day';
  }
  return { startDate, groupBy };
}

function groupDataByPeriod(data, dateField, valueField, groupBy) {
  var groups = {};
  data.forEach(function(item) {
    if (!item[dateField]) return;
    var date = new Date(item[dateField]);
    var key;
    if (groupBy === 'day') {
      key = date.toISOString().split('T')[0];
    } else if (groupBy === 'week') {
      var weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toISOString().split('T')[0];
    } else if (groupBy === 'month') {
      key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
    }
    if (!groups[key]) groups[key] = { date: key, value: 0, count: 0 };
    if (valueField) groups[key].value += (item[valueField] || 0);
    groups[key].count += 1;
  });
  return Object.values(groups).sort(function(a, b) { return a.date.localeCompare(b.date); });
}

async function handleOverview(supabase) {
  var results = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'member'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'provider'),
    supabase.from('vehicles').select('*', { count: 'exact', head: true }),
    supabase.from('maintenance_packages').select('*', { count: 'exact', head: true }),
    supabase.from('maintenance_packages').select('*', { count: 'exact', head: true }).in('status', ['open', 'accepted', 'in_progress']),
    supabase.from('payments').select('amount_total, mcc_fee, status').eq('status', 'released'),
    // Transport stats
    supabase.from('rides').select('*', { count: 'exact', head: true }),
    supabase.from('rides').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'driver'),
    supabase.from('rides').select('estimated_fare').eq('status', 'completed'),
    supabase.from('driver_earnings').select('amount_cents').eq('payout_status', 'paid')
  ]);

  var totalMembers   = results[0].count;
  var totalProviders = results[1].count;
  var totalVehicles  = results[2].count;
  var totalPackages  = results[3].count;
  var activePackages = results[4].count;
  var paymentsData   = results[5].data || [];
  var totalRides     = results[6].count;
  var completedRides = results[7].count;
  var activeDrivers  = results[8].count;
  var completedFares = results[9].data || [];
  var paidEarnings   = results[10].data || [];

  var totalRevenue           = paymentsData.reduce(function(s, p) { return s + (p.mcc_fee     || 0); }, 0);
  var totalTransactionVolume = paymentsData.reduce(function(s, p) { return s + (p.amount_total || 0); }, 0);
  var transportRevenue       = completedFares.reduce(function(s, r) { return s + (r.estimated_fare || 0); }, 0);
  var avgFare                = completedFares.length ? transportRevenue / completedFares.length : 0;
  var driverPayoutTotal      = paidEarnings.reduce(function(s, e) { return s + ((e.amount_cents || 0) / 100); }, 0);

  return {
    totalMembers:           totalMembers   || 0,
    totalProviders:         totalProviders || 0,
    totalVehicles:          totalVehicles  || 0,
    totalPackages:          totalPackages  || 0,
    activePackages:         activePackages || 0,
    totalRevenue,
    totalTransactionVolume,
    totalOrders:            paymentsData.length,
    transport: {
      totalRides:       totalRides     || 0,
      completedRides:   completedRides || 0,
      activeDrivers:    activeDrivers  || 0,
      transportRevenue: Math.round(transportRevenue * 100) / 100,
      avgFare:          Math.round(avgFare * 100) / 100,
      driverPayoutTotal: Math.round(driverPayoutTotal * 100) / 100
    }
  };
}

async function handleRevenue(supabase, qs) {
  var period = (qs && qs.period) || 'month';
  var range  = getDateRangeFromPeriod(period);

  var result = await supabase
    .from('payments')
    .select('amount_total, mcc_fee, released_at, created_at, status')
    .eq('status', 'released')
    .gte('released_at', range.startDate.toISOString())
    .order('released_at', { ascending: true });

  if (result.error) throw result.error;

  var payments     = result.data || [];
  var grouped      = groupDataByPeriod(payments, 'released_at', 'mcc_fee', range.groupBy);
  var totalRevenue = payments.reduce(function(s, p) { return s + (p.mcc_fee     || 0); }, 0);
  var totalVolume  = payments.reduce(function(s, p) { return s + (p.amount_total || 0); }, 0);

  return {
    period,
    groupBy:           range.groupBy,
    totalRevenue,
    totalVolume,
    totalTransactions: payments.length,
    chartData: grouped.map(function(g) { return { label: g.date, revenue: g.value, orders: g.count }; })
  };
}

async function handleUsers(supabase, qs) {
  var period = (qs && qs.period) || 'month';
  var range  = getDateRangeFromPeriod(period);

  var results = await Promise.all([
    supabase.from('profiles').select('created_at, role').eq('role', 'member').gte('created_at', range.startDate.toISOString()),
    supabase.from('profiles').select('created_at, role').eq('role', 'provider').gte('created_at', range.startDate.toISOString())
  ]);
  var members   = results[0].data || [];
  var providers = results[1].data || [];

  var memberGroups   = groupDataByPeriod(members,   'created_at', null, range.groupBy);
  var providerGroups = groupDataByPeriod(providers, 'created_at', null, range.groupBy);

  var allDates = Array.from(new Set([
    ...memberGroups.map(function(g) { return g.date; }),
    ...providerGroups.map(function(g) { return g.date; })
  ])).sort();

  var chartData = allDates.map(function(date) {
    var md = memberGroups.find(function(g)   { return g.date === date; });
    var pd = providerGroups.find(function(g) { return g.date === date; });
    return {
      label:     date,
      members:   md ? md.count : 0,
      providers: pd ? pd.count : 0,
      total:     (md ? md.count : 0) + (pd ? pd.count : 0)
    };
  });

  return {
    period,
    groupBy:           range.groupBy,
    totalNewMembers:   members.length,
    totalNewProviders: providers.length,
    chartData
  };
}

async function handleOrders(supabase, qs) {
  var period = (qs && qs.period) || 'month';
  var range  = getDateRangeFromPeriod(period);

  var result = await supabase
    .from('maintenance_packages')
    .select('created_at, status, category')
    .gte('created_at', range.startDate.toISOString())
    .order('created_at', { ascending: true });

  if (result.error) throw result.error;

  var allPackages       = result.data || [];
  var completedPackages = allPackages.filter(function(p) { return p.status === 'completed'; });

  var grouped          = groupDataByPeriod(allPackages,       'created_at', null, range.groupBy);
  var completedGrouped = groupDataByPeriod(completedPackages, 'created_at', null, range.groupBy);

  var allDates = Array.from(new Set([
    ...grouped.map(function(g) { return g.date; }),
    ...completedGrouped.map(function(g) { return g.date; })
  ])).sort();

  var chartData = allDates.map(function(date) {
    var ad = grouped.find(function(g)          { return g.date === date; });
    var cd = completedGrouped.find(function(g) { return g.date === date; });
    return { label: date, created: ad ? ad.count : 0, completed: cd ? cd.count : 0 };
  });

  var categoryBreakdown = {};
  allPackages.forEach(function(p) {
    var cat = p.category || 'other';
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
  });

  return {
    period,
    groupBy:        range.groupBy,
    totalCreated:   allPackages.length,
    totalCompleted: completedPackages.length,
    categoryBreakdown,
    chartData
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET') return utils.errorResponse(405, 'Method not allowed');

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  var admin = await utils.authenticateBearerAdmin(event, supabase);
  if (!admin) return utils.errorResponse(401, 'Authentication required');

  var route = parsePath(event);
  var qs    = event.queryStringParameters || {};

  try {
    var data;
    if (route === 'overview') {
      data = await handleOverview(supabase);
    } else if (route === 'revenue') {
      data = await handleRevenue(supabase, qs);
    } else if (route === 'users') {
      data = await handleUsers(supabase, qs);
    } else if (route === 'orders') {
      data = await handleOrders(supabase, qs);
    } else {
      return utils.errorResponse(404, 'Unknown stats route: ' + route);
    }
    return utils.successResponse({ success: true, data });
  } catch (err) {
    console.error('[admin-stats] ' + route + ' error:', err.message);
    return utils.errorResponse(500, 'Failed to fetch ' + route + ' stats');
  }
};
