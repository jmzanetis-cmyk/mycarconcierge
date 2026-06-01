'use strict';

// POST /api/provider/performance
//
// Recalculates and persists performance stats for the authenticated provider.
// Runs entirely server-side with service-role so providers cannot write their
// own row via the browser client (the "System manages performance" RLS policy
// was the previous client-JWT path; that policy is now dropped).
//
// Callers: calculateProviderPerformance() in supabaseclient.js (browser).
// Stats are computed from the provider's own reviews, bids, and completed
// packages — the same logic that was previously client-side.

const { createClient } = require('@supabase/supabase-js');

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function authenticate(event, supabase) {
  const auth = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!auth.startsWith('Bearer ')) return null;
  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  return error || !data?.user ? null : data.user;
}

async function computePerformance(supabase, providerId) {
  const [{ data: reviews }, { data: bids }] = await Promise.all([
    supabase.from('reviews')
      .select('rating, created_at')
      .eq('provider_id', providerId),
    supabase.from('bids')
      .select('id, status, created_at, package_id')
      .eq('provider_id', providerId),
  ]);

  const acceptedBidIds = (bids || [])
    .filter(b => b.status === 'accepted' || b.status === 'won')
    .map(b => b.id);

  const { data: completedPackages } = acceptedBidIds.length > 0
    ? await supabase.from('maintenance_packages')
        .select('id, deadline, completed_at, winning_bid_id')
        .in('winning_bid_id', acceptedBidIds)
        .eq('status', 'completed')
    : { data: [] };

  const ratingCount  = reviews?.length || 0;
  const ratingAvg    = ratingCount > 0
    ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / ratingCount
    : 0;

  const bidsSubmitted  = bids?.length || 0;
  const bidsAccepted   = acceptedBidIds.length;
  const acceptanceRate = bidsSubmitted > 0 ? (bidsAccepted / bidsSubmitted) * 100 : 0;

  const jobsCompleted = completedPackages?.length || 0;
  const jobsOnTime    = (completedPackages || []).filter(p =>
    !p.deadline || !p.completed_at ||
    new Date(p.completed_at) <= new Date(p.deadline)
  ).length;
  const onTimeRate = jobsCompleted > 0 ? (jobsOnTime / jobsCompleted) * 100 : 100;

  // Average response time: hours between package creation and provider's first bid
  let avgResponseTimeHours = null;
  if (bids && bids.length > 0) {
    const packageIds = [...new Set(bids.map(b => b.package_id))];
    const { data: packages } = await supabase.from('maintenance_packages')
      .select('id, created_at')
      .in('id', packageIds);
    const pkgMap = Object.fromEntries((packages || []).map(p => [p.id, p.created_at]));
    const times = bids
      .filter(b => pkgMap[b.package_id])
      .map(b => (new Date(b.created_at) - new Date(pkgMap[b.package_id])) / 3_600_000)
      .filter(h => h >= 0 && h < 720);
    if (times.length > 0) {
      avgResponseTimeHours = times.reduce((a, b) => a + b, 0) / times.length;
    }
  }

  const ratingScore        = (ratingAvg / 5) * 100;
  const reliabilityScore   = onTimeRate;
  const experienceScore    = Math.min(jobsCompleted / 100, 1) * 100;
  const responsivenessScore = avgResponseTimeHours !== null
    ? Math.max(0, 100 - avgResponseTimeHours * 5)
    : 50;
  const overallScore =
    ratingScore * 0.4 +
    reliabilityScore * 0.3 +
    experienceScore * 0.15 +
    responsivenessScore * 0.15;

  let tier = 'bronze';
  if (overallScore >= 90)      tier = 'platinum';
  else if (overallScore >= 75) tier = 'gold';
  else if (overallScore >= 50) tier = 'silver';

  const badges = [];
  if (ratingAvg >= 4.8 && ratingCount >= 3)                        badges.push('top_rated');
  if (avgResponseTimeHours !== null && avgResponseTimeHours < 2)    badges.push('quick_responder');
  if (jobsCompleted >= 50)                                           badges.push('veteran');
  if (overallScore >= 100)                                           badges.push('perfect_score');
  if (jobsCompleted >= 5)                                            badges.push('dispute_free');

  return {
    provider_id:              providerId,
    overall_score:            Math.round(overallScore * 10) / 10,
    rating_avg:               Math.round(ratingAvg * 100) / 100,
    rating_count:             ratingCount,
    jobs_completed:           jobsCompleted,
    jobs_on_time:             jobsOnTime,
    on_time_rate:             Math.round(onTimeRate * 100) / 100,
    avg_response_time_hours:  avgResponseTimeHours !== null
      ? Math.round(avgResponseTimeHours * 100) / 100
      : null,
    disputes_count:    0,
    disputes_resolved: 0,
    bids_submitted:    bidsSubmitted,
    bids_accepted:     bidsAccepted,
    acceptance_rate:   Math.round(acceptanceRate * 100) / 100,
    badges,
    tier,
    last_calculated_at: new Date().toISOString(),
    updated_at:         new Date().toISOString(),
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const user = await authenticate(event, supabase);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Authentication required' }) };
  }

  try {
    const performanceData = await computePerformance(supabase, user.id);
    const { data, error } = await supabase
      .from('provider_performance')
      .upsert(performanceData, { onConflict: 'provider_id' })
      .select()
      .single();

    if (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
