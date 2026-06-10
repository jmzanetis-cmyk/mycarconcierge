// dream-car-scheduled — daily Dream Car Finder sweep
//
// Runs at 02:00 UTC daily. Fetches all active dream_car_searches,
// filters by search_frequency / last_searched_at, generates mock
// matches, inserts to dream_car_matches, sends email/SMS if enabled.
//
// Also accepts POST with x-admin-password for on-demand runs.
'use strict';

const { createClient } = require('@supabase/supabase-js');
const { sendSms }      = require('./_shared/sms');

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// ─── shared helpers (mirrors dream-car.js) ───────────────────────────────────

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
  if (search.max_mileage)            parts.push(`Max Mileage: ${search.max_mileage.toLocaleString()}`);
  if (search.body_styles?.length)    parts.push(`Body Styles: ${search.body_styles.join(', ')}`);
  if (search.fuel_types?.length)     parts.push(`Fuel Types: ${search.fuel_types.join(', ')}`);
  if (search.transmission_preference) parts.push(`Transmission: ${search.transmission_preference}`);
  if (search.exterior_colors?.length) parts.push(`Colors: ${search.exterior_colors.join(', ')}`);
  if (search.zip_code)               parts.push(`Location: Near ${search.zip_code}`);
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

async function sendDreamCarSMS(sb, userId, matchCount) {
  const { data: profile } = await sb.from('profiles').select('phone').eq('id', userId).single();
  if (!profile?.phone) return { sent: false, reason: 'no_phone' };
  return sendSms({
    supabase: sb,
    toPhone: profile.phone,
    body: `My Car Concierge found ${matchCount} new car${matchCount !== 1 ? 's' : ''} matching your search! https://app.mycarconcierge.co/members.html#dream-car`,
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
  } catch {
    return { sent: false, reason: 'exception' };
  }
}

// ─── core sweep ──────────────────────────────────────────────────────────────

async function runScheduledSweep(sb) {
  const now = new Date();

  const { data: searches, error } = await sb.from('dream_car_searches')
    .select('*').eq('is_active', true);

  if (error) {
    console.error('[dream-car-scheduled] fetch error:', error.message);
    return { success: false, error: error.message };
  }

  const due = (searches || []).filter(search => {
    if (!search.last_searched_at) return true;
    const hours = (now - new Date(search.last_searched_at)) / 3_600_000;
    switch (search.search_frequency) {
      case 'hourly':      return hours >= 1;
      case 'twice_daily': return hours >= 12;
      default:            return hours >= 24;
    }
  });

  console.log(`[dream-car-scheduled] ${due.length} searches due out of ${(searches || []).length} active`);

  const results = [];

  for (const search of due) {
    try {
      const mockMatches = generateMockMatches(search);
      const nowIso = new Date().toISOString();

      const matchesToInsert = mockMatches.map(m => ({
        search_id:      search.id,
        user_id:        search.user_id,
        source:         'scheduled_search',
        listing_url:    m.listing_url || `https://example.com/listing/${require('crypto').randomBytes(8).toString('hex')}`,
        listing_id:     require('crypto').randomBytes(8).toString('hex'),
        year:           m.year || String(search.min_year || 2020),
        make:           m.make || (search.preferred_makes?.[0] || 'Toyota'),
        model:          m.model || (search.preferred_models?.[0] || 'Camry'),
        trim:           m.trim || 'Base',
        price:          m.price || (search.max_price ? Number(search.max_price) * 0.9 : 25000),
        mileage:        m.mileage || (search.max_mileage ? search.max_mileage * 0.7 : 30000),
        exterior_color: m.exterior_color || (search.exterior_colors?.[0] || 'Black'),
        location:       m.location || `Near ${search.zip_code || '90210'}`,
        seller_type:    m.seller_type || 'dealer',
        match_score:    m.match_score || 85,
        match_reasons:  m.match_reasons || ['Matches search criteria'],
        listing_data:   {},
        photos:         m.photos || [],
        found_at:       nowIso,
      }));

      const { data: inserted, error: ie } = await sb.from('dream_car_matches').insert(matchesToInsert).select();
      if (ie) {
        console.error(`[dream-car-scheduled] insert error for ${search.id}:`, ie.message);
        results.push({ searchId: search.id, success: false, error: 'Insert failed' });
        continue;
      }

      await sb.from('dream_car_searches').update({ last_searched_at: nowIso }).eq('id', search.id);

      const notifications = { sms: null, email: null };
      if (inserted && inserted.length > 0) {
        if (search.notify_sms)   notifications.sms   = await sendDreamCarSMS(sb, search.user_id, inserted.length).catch(() => ({ sent: false }));
        if (search.notify_email) notifications.email = await sendDreamCarEmail(sb, search.user_id, search.search_name, inserted).catch(() => ({ sent: false }));
      }

      results.push({
        searchId:     search.id,
        userId:       search.user_id,
        searchName:   search.search_name,
        success:      true,
        matchesFound: inserted?.length || 0,
        notifications,
      });

      console.log(`[dream-car-scheduled] search ${search.id}: ${inserted?.length || 0} matches`);
    } catch (e) {
      console.error(`[dream-car-scheduled] error for ${search.id}:`, e.message);
      results.push({ searchId: search.id, success: false, error: e.message });
    }
  }

  return {
    success: true,
    summary: {
      totalSearches:   due.length,
      successCount:    results.filter(r => r.success).length,
      failureCount:    results.filter(r => !r.success).length,
      totalMatchesFound: results.reduce((s, r) => s + (r.matchesFound || 0), 0),
    },
    results,
  };
}

// ─── handler ─────────────────────────────────────────────────────────────────

exports.handler = async function(event) {
  const isScheduled = !event.httpMethod;
  const isManual    = event.httpMethod === 'POST' &&
    (event.headers?.['x-admin-password'] || event.headers?.['X-Admin-Password']) === process.env.ADMIN_PASSWORD;

  if (!isScheduled && !isManual) {
    return json(401, { error: 'Unauthorized' });
  }

  const sb = supabase();
  if (!sb) return json(200, { success: false, error: 'no_db' });

  const result = await runScheduledSweep(sb);
  console.log('[dream-car-scheduled] done:', JSON.stringify(result.summary || {}));
  return json(200, result);
};
