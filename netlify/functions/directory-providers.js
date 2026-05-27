// GET /api/directory/providers               — paginated listing
// GET /api/directory/providers/:slug         — individual profile page
//
// Public endpoint (no auth required). Uses service role key so RLS doesn't
// block anonymous reads, but only exposes fields safe for public display.
'use strict';
const { createClient } = require('@supabase/supabase-js');

function sb() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
};

function json(status, body) {
  return { statusCode: status, headers: HEADERS, body: JSON.stringify(body) };
}

// ── helpers ────────────────────────────────────────────────────────────────

function safeStr(v) {
  return v != null ? String(v) : null;
}

function ratingFromReviews(reviews) {
  if (!reviews || reviews.length === 0) return { avg: null, count: 0 };
  const valid = reviews.filter(r => r.overall_rating != null || r.rating != null);
  if (valid.length === 0) return { avg: null, count: 0 };
  const sum = valid.reduce((acc, r) => acc + (r.overall_rating ?? r.rating), 0);
  return { avg: (sum / valid.length).toFixed(1), count: valid.length };
}

// Map a profiles row + optional enrichment into the public-safe card shape
// expected by renderProviderCard() in providers-directory.html and
// renderProfile() in p.html.
function toCard(p, opts = {}) {
  const { ratingData, teamCount, application } = opts;
  const emergencyEnabled =
    application?.accepts_emergency_calls ||
    (p.emergency_settings?.enabled) ||
    false;

  const yearsInBusiness =
    application?.years_in_business ||
    p.years_experience ||
    null;

  // services_offered is the canonical column in both profiles and applications
  const services =
    (p.services_offered && p.services_offered.length > 0)
      ? p.services_offered
      : (application?.services_offered || []);

  const certList = p.certifications
    ? p.certifications.split(',').map(c => c.trim()).filter(Boolean)
    : [];

  const rating = ratingData || { avg: null, count: 0 };

  return {
    id:                    p.id,
    slug:                  p.directory_slug,
    business_name:         safeStr(p.business_name),
    city:                  safeStr(p.city),
    state:                 safeStr(p.state),
    description:           safeStr(p.description || null),
    avatar_url:            safeStr(p.avatar_url || null),
    services:              services,
    certifications:        certList,
    years_in_business:     yearsInBusiness,
    emergency_enabled:     emergencyEnabled,
    can_tow:               application?.can_tow || false,
    is_24_seven:           application?.is_24_seven || false,
    bgc_badge_verified:    !!p.bgc_badge_verified,
    bgc_compliant_employees: p.bgc_compliant_employees || 0,
    bgc_total_employees:   p.bgc_total_employees || 0,
    avg_rating:            rating.avg,
    review_count:          rating.count,
    team_count:            teamCount || 0,
    member_since:          p.created_at,
  };
}

// ── listing handler ────────────────────────────────────────────────────────

async function handleListing(event) {
  const q = event.queryStringParameters || {};
  const page     = Math.max(1, parseInt(q.page)  || 1);
  const limit    = Math.min(50, Math.max(1, parseInt(q.limit) || 24));
  const offset   = (page - 1) * limit;
  const city     = q.city     ? q.city.trim()    : null;
  const category = q.category ? q.category.trim(): null;
  const verified = q.verified === 'true' || q.verified === '1';

  const supabase = sb();

  let query = supabase
    .from('profiles')
    .select(
      'id, business_name, city, state, services_offered, years_experience, ' +
      'certifications, directory_slug, directory_opt_in, bgc_badge_verified, ' +
      'bgc_compliant_employees, bgc_total_employees, emergency_settings, created_at',
      { count: 'exact' }
    )
    .eq('directory_opt_in', true)
    .eq('role', 'provider')
    .not('directory_slug', 'is', null)
    .eq('suspended', false)
    .order('business_name', { ascending: true })
    .range(offset, offset + limit - 1);

  if (city)     query = query.ilike('city', `%${city}%`);
  if (verified) query = query.eq('bgc_badge_verified', true);
  if (category) query = query.contains('services_offered', [category]);

  const { data: providers, error, count } = await query;
  if (error) {
    console.error('[directory-providers] listing error:', error.message);
    return json(500, { error: 'Failed to load providers' });
  }

  if (!providers || providers.length === 0) {
    return json(200, { providers: [], total: 0, page, limit });
  }

  const providerIds = providers.map(p => p.id);

  // Ratings from provider_reviews
  const { data: allReviews } = await supabase
    .from('provider_reviews')
    .select('provider_id, rating, overall_rating')
    .in('provider_id', providerIds)
    .in('status', ['approved', 'published', 'active'])
    .not('status', 'in', '("pending","rejected","flagged")');

  // Fall back to all reviews if none are approved (handles early-stage data)
  const { data: allReviewsFallback } = (!allReviews || allReviews.length === 0)
    ? await supabase
        .from('provider_reviews')
        .select('provider_id, rating, overall_rating')
        .in('provider_id', providerIds)
    : { data: null };

  const reviewSource = (allReviews && allReviews.length > 0)
    ? allReviews
    : (allReviewsFallback || []);

  const ratingsMap = {};
  reviewSource.forEach(r => {
    if (!ratingsMap[r.provider_id]) ratingsMap[r.provider_id] = [];
    ratingsMap[r.provider_id].push(r);
  });

  // Team member counts
  const { data: teamData } = await supabase
    .from('team_members')
    .select('provider_id')
    .in('provider_id', providerIds)
    .eq('is_active', true);

  const teamCountMap = {};
  (teamData || []).forEach(tm => {
    teamCountMap[tm.provider_id] = (teamCountMap[tm.provider_id] || 0) + 1;
  });

  // Provider applications (for can_tow, is_24_seven, accepts_emergency_calls,
  // years_in_business — not stored directly on profiles)
  const { data: applications } = await supabase
    .from('provider_applications')
    .select('user_id, years_in_business, accepts_emergency_calls, can_tow, is_24_seven, services_offered')
    .in('user_id', providerIds)
    .eq('status', 'approved');

  const appMap = {};
  (applications || []).forEach(a => { appMap[a.user_id] = a; });

  const cards = providers.map(p => toCard(p, {
    ratingData: ratingFromReviews(ratingsMap[p.id] || []),
    teamCount:  teamCountMap[p.id] || 0,
    application: appMap[p.id] || null,
  }));

  return json(200, { providers: cards, total: count || 0, page, limit });
}

// ── single profile handler ─────────────────────────────────────────────────

async function handleProfile(slug) {
  const supabase = sb();

  const { data: provider, error } = await supabase
    .from('profiles')
    .select(
      'id, business_name, city, state, services_offered, years_experience, ' +
      'certifications, directory_slug, bgc_badge_verified, bgc_compliant_employees, ' +
      'bgc_total_employees, emergency_settings, created_at, role, suspended'
    )
    .eq('directory_slug', slug)
    .eq('directory_opt_in', true)
    .eq('role', 'provider')
    .eq('suspended', false)
    .maybeSingle();

  if (error) {
    console.error('[directory-providers] profile error:', error.message);
    return json(500, { error: 'Failed to load profile' });
  }
  if (!provider) return json(404, { error: 'Provider not found' });

  const pid = provider.id;

  // Reviews (detailed for profile page)
  const { data: reviewRows } = await supabase
    .from('provider_reviews')
    .select('rating, overall_rating, review_text, created_at, member_id')
    .eq('provider_id', pid)
    .order('created_at', { ascending: false })
    .limit(20);

  const memberIds = (reviewRows || [])
    .map(r => r.member_id)
    .filter(Boolean);

  let reviewerNames = {};
  if (memberIds.length > 0) {
    const { data: memberProfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', memberIds);
    (memberProfiles || []).forEach(p => { reviewerNames[p.id] = p.full_name; });
  }

  const reviews = (reviewRows || []).map(r => {
    const raw = reviewerNames[r.member_id];
    const parts = raw ? raw.split(' ') : [];
    const name = parts.length > 1
      ? parts[0] + ' ' + parts[parts.length - 1].charAt(0) + '.'
      : (parts[0] || 'Member');
    const rating = r.overall_rating ?? r.rating;
    return { rating, comment: r.review_text || null, created_at: r.created_at, reviewer_name: name };
  });

  const ratingData = ratingFromReviews(reviews);

  // BGC details from provider_background_checks
  const { data: bgcRow } = await supabase
    .from('provider_background_checks')
    .select('status, updated_at')
    .eq('provider_id', pid)
    .eq('subject_type', 'provider')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Team members
  const { data: tmData } = await supabase
    .from('team_members')
    .select('id, name, role, photo_url, bio, certifications, specialties, years_experience')
    .eq('provider_id', pid)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(20);

  let teamMembers = [];
  if (tmData && tmData.length > 0) {
    const tmIds = tmData.map(t => t.id);
    const { data: empBgc } = await supabase
      .from('provider_background_checks')
      .select('employee_id, status, created_at')
      .eq('provider_id', pid)
      .neq('subject_type', 'provider')
      .in('employee_id', tmIds)
      .order('created_at', { ascending: false });

    const empBgcMap = {};
    (empBgc || []).forEach(c => {
      if (c.employee_id && !empBgcMap[c.employee_id]) empBgcMap[c.employee_id] = c.status;
    });

    teamMembers = tmData.map(tm => ({
      name:                tm.name,
      role:                tm.role,
      photo_url:           tm.photo_url,
      bio:                 tm.bio,
      certifications:      tm.certifications,
      specialties:         tm.specialties,
      years_experience:    tm.years_experience,
      background_verified: ['cleared', 'clear', 'eligible'].includes(empBgcMap[tm.id]),
      background_check_pending: ['pending', 'initiated', 'processing', 'invitation_sent'].includes(empBgcMap[tm.id]),
    }));
  }

  // Provider application for supplemental fields
  const { data: application } = await supabase
    .from('provider_applications')
    .select('years_in_business, accepts_emergency_calls, can_tow, is_24_seven, services_offered')
    .eq('user_id', pid)
    .eq('status', 'approved')
    .maybeSingle();

  const card = toCard(provider, { ratingData, application });

  return json(200, {
    ...card,
    reviews,
    gallery: [],
    team_members: teamMembers,
    background_verified: ['cleared', 'clear', 'eligible'].includes(bgcRow?.status),
    background_check_status: bgcRow?.status || null,
    completed_jobs: 0,
  });
}

// ── router ─────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'GET')    return json(405, { error: 'Method not allowed' });

  try {
    // Strip the function prefix Netlify puts in event.path, then check for slug
    const path   = event.path || '';
    const after  = path.replace(/^\/api\/directory\/providers\/?/, '');
    const slug   = after ? decodeURIComponent(after.split('/')[0]) : null;

    if (slug) return handleProfile(slug);
    return handleListing(event);
  } catch (err) {
    console.error('[directory-providers] unhandled error:', err.message);
    return json(500, { error: 'Something went wrong' });
  }
};
