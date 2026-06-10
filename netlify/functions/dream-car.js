// Dream Car Finder — all /api/dream-car/* routes
//
// GET    /api/dream-car/searches                — list user's searches
// POST   /api/dream-car/searches                — create search
// PUT    /api/dream-car/searches/:id            — update search
// DELETE /api/dream-car/searches/:id            — delete search
// GET    /api/dream-car/searches/:id/matches    — list matches for search
// PUT    /api/dream-car/matches/:id             — update match flags
// POST   /api/dream-car/run-search/:id          — run AI search, returns marketIntel key (E24)
//
// Auth: Bearer JWT
'use strict';

const { createClient } = require('@supabase/supabase-js');
const { sendSms }      = require('./_shared/sms');

const SEARCH_FIELDS = [
  'search_name', 'min_year', 'max_year', 'preferred_makes', 'preferred_models',
  'preferred_trims', 'body_styles', 'min_mileage', 'max_mileage', 'min_price', 'max_price',
  'max_distance_miles', 'zip_code', 'fuel_types', 'transmission_preference', 'exterior_colors',
  'must_have_features', 'is_active', 'search_frequency', 'email_report_frequency',
  'notify_sms', 'notify_email', 'notification_email', 'notification_phone',
];

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

async function getUser(event, sb) {
  const auth = (event.headers?.authorization || event.headers?.Authorization || '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: json(401, { error: 'Missing token' }) };
  const { data: { user }, error } = await sb.auth.getUser(m[1].trim());
  if (error || !user) return { error: json(401, { error: 'Invalid token' }) };
  return { user };
}

function parsePath(path) {
  // /api/dream-car/searches
  // /api/dream-car/searches/:id
  // /api/dream-car/searches/:id/matches
  // /api/dream-car/matches/:id
  // /api/dream-car/run-search/:id
  const p = (path || '').replace(/^.*\/api\/dream-car\//, '');
  const runSearch = p.match(/^run-search\/([^/]+)$/);
  if (runSearch) return { route: 'run-search', id: runSearch[1] };
  const matchUpdate = p.match(/^matches\/([^/]+)$/);
  if (matchUpdate) return { route: 'match', id: matchUpdate[1] };
  const searchMatches = p.match(/^searches\/([^/]+)\/matches$/);
  if (searchMatches) return { route: 'search-matches', id: searchMatches[1] };
  const searchById = p.match(/^searches\/([^/]+)$/);
  if (searchById) return { route: 'search-by-id', id: searchById[1] };
  if (p.startsWith('searches')) return { route: 'searches' };
  return { route: null };
}

// ─── handlers ────────────────────────────────────────────────────────────────

async function getSearches(sb, user) {
  const { data, error } = await sb.from('dream_car_searches')
    .select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) return json(500, { error: 'Failed to fetch searches' });
  return json(200, { success: true, data });
}

async function createSearch(event, sb, user) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const searchData = {
    user_id:              user.id,
    search_name:          body.search_name || null,
    min_year:             body.min_year || null,
    max_year:             body.max_year || null,
    preferred_makes:      body.preferred_makes || [],
    preferred_models:     body.preferred_models || [],
    preferred_trims:      body.preferred_trims || [],
    body_styles:          body.body_styles || [],
    min_mileage:          body.min_mileage || null,
    max_mileage:          body.max_mileage || null,
    min_price:            body.min_price || null,
    max_price:            body.max_price || null,
    max_distance_miles:   body.max_distance_miles || null,
    zip_code:             body.zip_code || null,
    fuel_types:           body.fuel_types || [],
    transmission_preference: body.transmission_preference || null,
    exterior_colors:      body.exterior_colors || [],
    must_have_features:   body.must_have_features || [],
    is_active:            body.is_active !== false,
    search_frequency:     body.search_frequency || 'daily',
    email_report_frequency: body.email_report_frequency || 'daily',
    notify_sms:           body.notify_sms || false,
    notify_email:         body.notify_email !== false,
    notification_email:   body.notification_email || null,
    notification_phone:   body.notification_phone || null,
  };

  const { data, error } = await sb.from('dream_car_searches').insert(searchData).select().single();
  if (error) return json(500, { error: 'Failed to create search' });
  return json(201, { success: true, data });
}

async function updateSearch(event, sb, user, searchId) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { data: existing, error: fe } = await sb.from('dream_car_searches')
    .select('id, user_id').eq('id', searchId).single();
  if (fe || !existing) return json(404, { error: 'Search not found' });
  if (existing.user_id !== user.id) return json(403, { error: 'Not authorized' });

  const update = {};
  for (const f of SEARCH_FIELDS) { if (body[f] !== undefined) update[f] = body[f]; }

  const { data, error } = await sb.from('dream_car_searches').update(update).eq('id', searchId).select().single();
  if (error) return json(500, { error: 'Failed to update search' });
  return json(200, { success: true, data });
}

async function deleteSearch(sb, user, searchId) {
  const { data: existing, error: fe } = await sb.from('dream_car_searches')
    .select('id, user_id').eq('id', searchId).single();
  if (fe || !existing) return json(404, { error: 'Search not found' });
  if (existing.user_id !== user.id) return json(403, { error: 'Not authorized' });

  await sb.from('dream_car_matches').delete().eq('search_id', searchId);
  const { error } = await sb.from('dream_car_searches').delete().eq('id', searchId);
  if (error) return json(500, { error: 'Failed to delete search' });
  return json(200, { success: true, message: 'Search deleted' });
}

async function getMatches(sb, user, searchId) {
  const { data: search, error: se } = await sb.from('dream_car_searches')
    .select('id, user_id').eq('id', searchId).single();
  if (se || !search) return json(404, { error: 'Search not found' });
  if (search.user_id !== user.id) return json(403, { error: 'Not authorized' });

  const { data, error } = await sb.from('dream_car_matches')
    .select('*').eq('search_id', searchId).order('found_at', { ascending: false });
  if (error) return json(500, { error: 'Failed to fetch matches' });
  return json(200, { success: true, data });
}

async function updateMatch(event, sb, user, matchId) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { data: existing, error: fe } = await sb.from('dream_car_matches')
    .select('id, user_id').eq('id', matchId).single();
  if (fe || !existing) return json(404, { error: 'Match not found' });
  if (existing.user_id !== user.id) return json(403, { error: 'Not authorized' });

  const update = {};
  if (body.is_seen      !== undefined) update.is_seen      = !!body.is_seen;
  if (body.is_saved     !== undefined) update.is_saved     = !!body.is_saved;
  if (body.is_dismissed !== undefined) update.is_dismissed = !!body.is_dismissed;
  if (!Object.keys(update).length) return json(400, { error: 'No valid fields to update' });

  const { data, error } = await sb.from('dream_car_matches').update(update).eq('id', matchId).select().single();
  if (error) return json(500, { error: 'Failed to update match' });
  return json(200, { success: true, data });
}

function buildCriteriaDescription(search) {
  const parts = [];
  if (search.preferred_makes?.length)  parts.push(`Makes: ${search.preferred_makes.join(', ')}`);
  if (search.preferred_models?.length) parts.push(`Models: ${search.preferred_models.join(', ')}`);
  if (search.min_year || search.max_year) {
    parts.push(`Year: ${search.min_year && search.max_year ? `${search.min_year}-${search.max_year}` : search.min_year ? `${search.min_year}+` : `Up to ${search.max_year}`}`);
  }
  if (search.min_price || search.max_price) {
    parts.push(`Price: ${search.min_price && search.max_price ? `$${search.min_price}-$${search.max_price}` : search.min_price ? `$${search.min_price}+` : `Up to $${search.max_price}`}`);
  }
  if (search.max_mileage)           parts.push(`Max Mileage: ${search.max_mileage.toLocaleString()}`);
  if (search.body_styles?.length)   parts.push(`Body Styles: ${search.body_styles.join(', ')}`);
  if (search.fuel_types?.length)    parts.push(`Fuel Types: ${search.fuel_types.join(', ')}`);
  if (search.transmission_preference) parts.push(`Transmission: ${search.transmission_preference}`);
  if (search.exterior_colors?.length) parts.push(`Colors: ${search.exterior_colors.join(', ')}`);
  if (search.must_have_features?.length) parts.push(`Must Have: ${search.must_have_features.join(', ')}`);
  if (search.zip_code) {
    parts.push(`Location: Near ${search.zip_code}`);
    if (search.max_distance_miles) parts.push(`Max Distance: ${search.max_distance_miles} miles`);
  }
  return parts.length ? parts.join('\n') : 'No specific criteria set';
}

function generateMockMatches(search) {
  const makes  = search.preferred_makes?.length  ? search.preferred_makes  : ['Toyota', 'Honda', 'Ford'];
  const models = search.preferred_models?.length ? search.preferred_models : ['Camry', 'Accord', 'F-150'];
  const colors = search.exterior_colors?.length  ? search.exterior_colors  : ['Black', 'White', 'Silver'];
  return [
    {
      year: String(search.min_year || 2021), make: makes[0], model: models[0] || 'Sedan', trim: 'SE',
      price: search.max_price ? Math.floor(Number(search.max_price) * 0.85) : 28000,
      mileage: search.max_mileage ? Math.floor(search.max_mileage * 0.6) : 25000,
      exterior_color: colors[0],
      location: search.zip_code ? `${search.max_distance_miles || 25} miles from ${search.zip_code}` : 'Los Angeles, CA',
      seller_type: 'dealer', match_score: 92,
      match_reasons: ['Excellent condition', 'Low mileage', 'Full service history'], photos: [],
    },
    {
      year: String((search.min_year || 2020) + 1), make: makes[Math.min(1, makes.length - 1)],
      model: models[Math.min(1, models.length - 1)] || 'SUV', trim: 'XLE',
      price: search.max_price ? Math.floor(Number(search.max_price) * 0.75) : 24000,
      mileage: search.max_mileage ? Math.floor(search.max_mileage * 0.8) : 35000,
      exterior_color: colors[Math.min(1, colors.length - 1)],
      location: search.zip_code ? `${Math.floor((search.max_distance_miles || 50) * 0.5)} miles from ${search.zip_code}` : 'San Diego, CA',
      seller_type: 'private', match_score: 87,
      match_reasons: ['Great price', 'One owner', 'Clean title'], photos: [],
    },
    {
      year: String((search.min_year || 2019) + 2), make: makes[Math.min(2, makes.length - 1)],
      model: models[Math.min(2, models.length - 1)] || 'Truck', trim: 'Limited',
      price: search.max_price ? Math.floor(Number(search.max_price) * 0.95) : 32000,
      mileage: search.max_mileage ? Math.floor(search.max_mileage * 0.4) : 18000,
      exterior_color: colors[Math.min(2, colors.length - 1)],
      location: search.zip_code ? `${search.max_distance_miles || 30} miles from ${search.zip_code}` : 'Phoenix, AZ',
      seller_type: 'dealer', match_score: 95,
      match_reasons: ['Premium trim', 'Certified pre-owned', 'Extended warranty available'], photos: [],
    },
  ];
}

function buildMarketIntel(matches, search) {
  const prices = matches.map(m => m.price).filter(Boolean).map(Number);
  const mileages = matches.map(m => m.mileage).filter(Boolean).map(Number);
  return {
    total_listings:   matches.length,
    median_price:     prices.length ? Math.round(prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)]) : null,
    price_range:      prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    avg_mileage:      mileages.length ? Math.round(mileages.reduce((s, v) => s + v, 0) / mileages.length) : null,
    top_makes:        [...new Set(matches.map(m => m.make).filter(Boolean))].slice(0, 3),
    search_criteria:  buildCriteriaDescription(search),
    generated_at:     new Date().toISOString(),
  };
}

async function sendDreamCarSMS(sb, userId, matchCount) {
  const { data: profile } = await sb.from('profiles').select('phone').eq('id', userId).single();
  if (!profile?.phone) return { sent: false, reason: 'no_phone' };
  return sendSms({
    supabase: sb,
    toPhone: profile.phone,
    body: `My Car Concierge found ${matchCount} new car${matchCount !== 1 ? 's' : ''} matching your search! View them at https://app.mycarconcierge.co/members.html#dream-car`,
    userId,
  });
}

async function sendDreamCarEmail(sb, userId, searchName, matches) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.MCC_FROM_EMAIL || 'My Car Concierge <noreply@mycarconcierge.com>';
  if (!apiKey) return { sent: false, reason: 'not_configured' };

  const { data: profile } = await sb.from('profiles').select('email, full_name').eq('id', userId).single();
  if (!profile?.email) return { sent: false, reason: 'no_email' };

  const count = matches.length;
  let matchHtml = '';
  for (const m of matches.slice(0, 5)) {
    matchHtml += `<div style="border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:12px;">
      <strong>${m.year || ''} ${m.make || ''} ${m.model || ''}</strong>${m.trim ? ` - ${m.trim}` : ''}
      <div style="color:#666;font-size:14px;margin-top:4px;">
        ${m.price ? `$${Number(m.price).toLocaleString()}` : 'Price TBD'}
        ${m.mileage ? ` • ${Number(m.mileage).toLocaleString()} miles` : ''}
        ${m.location ? ` • ${m.location}` : ''}
      </div>
    </div>`;
  }
  if (matches.length > 5) matchHtml += `<p style="color:#666;font-size:14px;">...and ${matches.length - 5} more</p>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: profile.email,
        subject: `${count} New Dream Car Match${count !== 1 ? 'es' : ''} Found!`,
        html: `<p>Hi ${profile.full_name || 'there'},</p><p>We found <strong>${count} new car${count !== 1 ? 's' : ''}</strong> matching your "${searchName || 'Dream Car'}" search!</p>${matchHtml}<p><a href="https://app.mycarconcierge.co/members.html#dream-car">View Your Matches →</a></p>`,
      }),
    });
    return res.ok ? { sent: true } : { sent: false, reason: `resend_${res.status}` };
  } catch (e) {
    return { sent: false, reason: 'exception' };
  }
}

async function runSearch(sb, user, searchId) {
  const { data: search, error: se } = await sb.from('dream_car_searches')
    .select('*').eq('id', searchId).single();
  if (se || !search) return json(404, { error: 'Search not found' });
  if (search.user_id !== user.id) return json(403, { error: 'Not authorized' });

  const mockMatches = generateMockMatches(search);
  const now = new Date().toISOString();
  const uid = require('crypto').randomBytes;

  const matchesToInsert = mockMatches.map(m => ({
    search_id:     searchId,
    user_id:       user.id,
    source:        'mock_search',
    listing_url:   m.listing_url || `https://example.com/listing/${require('crypto').randomBytes(8).toString('hex')}`,
    listing_id:    require('crypto').randomBytes(8).toString('hex'),
    year:          m.year || String(search.min_year || 2020),
    make:          m.make || (search.preferred_makes?.[0] || 'Toyota'),
    model:         m.model || (search.preferred_models?.[0] || 'Camry'),
    trim:          m.trim || 'Base',
    price:         m.price || (search.max_price ? Number(search.max_price) * 0.9 : 25000),
    mileage:       m.mileage || (search.max_mileage ? search.max_mileage * 0.7 : 30000),
    exterior_color: m.exterior_color || (search.exterior_colors?.[0] || 'Black'),
    location:      m.location || `Near ${search.zip_code || '90210'}`,
    seller_type:   m.seller_type || 'dealer',
    match_score:   m.match_score || 85,
    match_reasons: m.match_reasons || ['Matches search criteria'],
    listing_data:  {},
    photos:        m.photos || [],
    found_at:      now,
  }));

  const { data: inserted, error: ie } = await sb.from('dream_car_matches').insert(matchesToInsert).select();
  if (ie) return json(500, { error: 'Failed to save matches' });

  await sb.from('dream_car_searches').update({ last_searched_at: now }).eq('id', searchId);

  const notifications = { sms: null, email: null };
  if (inserted.length > 0) {
    if (search.notify_sms)   notifications.sms   = await sendDreamCarSMS(sb, user.id, inserted.length).catch(() => ({ sent: false }));
    if (search.notify_email) notifications.email = await sendDreamCarEmail(sb, user.id, search.search_name, inserted).catch(() => ({ sent: false }));
  }

  const marketIntel = buildMarketIntel(inserted, search);

  return json(200, {
    success: true,
    message: `Search completed. Found ${inserted.length} matches.`,
    data: inserted,
    notifications,
    marketIntel,
  });
}

// ─── router ──────────────────────────────────────────────────────────────────

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  const sb   = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  const { route, id } = parsePath(event.path);
  const method = event.httpMethod;

  if (route === 'searches' && method === 'GET')    return getSearches(sb, auth.user);
  if (route === 'searches' && method === 'POST')   return createSearch(event, sb, auth.user);
  if (route === 'search-by-id' && method === 'PUT')    return updateSearch(event, sb, auth.user, id);
  if (route === 'search-by-id' && method === 'DELETE') return deleteSearch(sb, auth.user, id);
  if (route === 'search-matches' && method === 'GET')  return getMatches(sb, auth.user, id);
  if (route === 'match'       && method === 'PUT')     return updateMatch(event, sb, auth.user, id);
  if (route === 'run-search'  && method === 'POST')    return runSearch(sb, auth.user, id);

  return json(405, { error: 'Method not allowed' });
};
