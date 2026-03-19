const Anthropic = require('@anthropic-ai/sdk');
const { Resend } = require('resend');

let anthropicClient = null;
let resendClient = null;
let aiCircuitBreaker = { failures: 0, pausedUntil: null };

function getAnthropic() {
  if (!anthropicClient && process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function getResend() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

async function callAI(prompt, maxTokens = 4000) {
  if (aiCircuitBreaker.pausedUntil && Date.now() < aiCircuitBreaker.pausedUntil) {
    throw new Error('AI circuit breaker active — paused for cooldown');
  }

  const anthropic = getAnthropic();
  if (anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      });
      aiCircuitBreaker.failures = 0;
      return { text: response.content[0]?.type === 'text' ? response.content[0].text : '', provider: 'anthropic' };
    } catch (err) {
      const isCreditsOrRate = err.message?.includes('credit balance') || err.message?.includes('rate_limit') || err.status === 429 || err.status === 400;
      if (isCreditsOrRate) {
        console.log('[OutreachEngine] Anthropic unavailable, trying Gemini fallback...');
      } else {
        throw err;
      }
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    try {
      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { temperature: 0.4 }
      });
      aiCircuitBreaker.failures = 0;
      return { text: response.text || '', provider: 'gemini' };
    } catch (err) {
      aiCircuitBreaker.failures++;
      if (aiCircuitBreaker.failures >= 3) {
        aiCircuitBreaker.pausedUntil = Date.now() + 5 * 60 * 1000;
        console.error('[OutreachEngine] Circuit breaker tripped — pausing AI calls for 5 minutes');
      }
      throw err;
    }
  }

  aiCircuitBreaker.failures++;
  if (aiCircuitBreaker.failures >= 3) {
    aiCircuitBreaker.pausedUntil = Date.now() + 5 * 60 * 1000;
    console.error('[OutreachEngine] Circuit breaker tripped — pausing AI calls for 5 minutes');
  }
  throw new Error('No AI provider available');
}

const BRAND_INFO = 'Brand: "My Car Concierge" — Your complete auto ownership platform. Tagline: "One app. Every auto need. Zero hassle." IMPORTANT: Always write the full name "My Car Concierge" — never abbreviate. My Car Concierge is in its early startup stage and actively building its founding community. We are looking for founding members and founding providers who want to get in on the ground floor. Founding members and providers get preferred status, early-adopter perks, and the opportunity to shape the platform as it grows. Value proposition: Car owners post what they need and receive competitive bids from vetted, local service providers — no more calling around or overpaying. Providers get a steady stream of pre-qualified customers with secure escrow payments. Key features: competitive bidding from multiple providers, Car Club loyalty rewards (punch cards, exclusive perks), vehicle maintenance tracking, OBD diagnostic scanner, snow removal and property services, merch store, and a referral program with lifetime commissions. No platform fees — providers keep 100% of what they earn. Website: mycarconcierge.com.';

const PHYSICAL_ADDRESS = 'My Car Concierge, East Rutherford, NJ 07073';
const BASE_URL = 'https://mycarconcierge.com';
const UNSUBSCRIBE_URL = `${BASE_URL}/unsubscribe`;
const EMAIL_FOOTER = `\n\n---\n${PHYSICAL_ADDRESS}\nTo stop receiving these emails: ${UNSUBSCRIBE_URL}`;
const SMS_OPT_OUT = '\nReply STOP to opt out.';

let schemaReady = false;

async function checkSchemaExists(supabase) {
  if (schemaReady) return true;
  const { error } = await supabase.from('engine_state').select('id').eq('id', 1).maybeSingle();
  if (!error) { schemaReady = true; return true; }
  return false;
}

async function initEngineState(supabase) {
  const exists = await checkSchemaExists(supabase);
  if (!exists) {
    console.log('[OutreachEngine] Schema not found. Run outreach-schema.sql in Supabase SQL Editor.');
    return;
  }

  const { data } = await supabase
    .from('engine_state')
    .select('id')
    .eq('id', 1)
    .maybeSingle();

  if (!data) {
    await supabase.from('engine_state').insert({
      id: 1,
      is_running: true,
      discovery_interval_minutes: 30,
      max_drafts_per_cycle: 20,
      target_cities: ['East Rutherford, NJ', 'Newark, NJ', 'Jersey City, NJ', 'New York, NY', 'Hoboken, NJ', 'Paterson, NJ', 'Edison, NJ', 'Trenton, NJ', 'Philadelphia, PA', 'Stamford, CT'],
      search_radius_meters: 15000,
      total_leads_discovered: 0,
      total_messages_drafted: 0,
      total_messages_sent: 0,
      warmup_start_date: new Date().toISOString(),
      metadata: { city_rotation_index: 0 }
    });
  }
}

const CHAIN_BLOCKLIST = [
  'pep boys', 'firestone', 'midas', 'jiffy lube', 'valvoline', 'ntb', 'meineke',
  'maaco', 'aamco', 'goodyear', 'autozone', 'o\'reilly', 'advance auto parts',
  'caliber collision', 'service king', 'safelite', 'take 5', 'walmart', 'costco',
  'bj\'s', 'sam\'s club', 'bridgestone', 'brake masters', 'brakes plus',
  'christian brothers', 'big o tires', 'les schwab', 'monro', 'tires plus',
  'speedee', 'express oil change', 'grease monkey', 'napa auto', 'sears auto',
  'town fair tire', 'sullivan tire', 'discount tire', 'americas tire', 'belle tire',
  'tire kingdom', 'tire barn', 'kauffman tire', 'pepboys', 'jiffylube',
  'meineke car care', 'precision tune', 'tuffy', 'sun devil auto', 'car-x',
  'mr. tire', 'pep boys', 'national tire', 'dtlr', 'icahn automotive'
];

function isChainShop(name) {
  const lower = (name || '').toLowerCase();
  return CHAIN_BLOCKLIST.some(chain => lower.includes(chain));
}

async function importProviderLeadsFromPlaces(supabase, location, radiusMeters) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return 0;

  try {
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`
    );
    const geoData = await geoRes.json();
    const coords = geoData.results?.[0]?.geometry?.location;
    if (!coords) return 0;

    const searches = [
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${coords.lat},${coords.lng}&radius=${radiusMeters}&type=car_repair&key=${apiKey}`,
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${coords.lat},${coords.lng}&radius=${radiusMeters}&type=car_wash&key=${apiKey}`,
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=mobile+detailing+near+${encodeURIComponent(location)}&location=${coords.lat},${coords.lng}&radius=${radiusMeters}&key=${apiKey}`,
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=auto+detailing+near+${encodeURIComponent(location)}&location=${coords.lat},${coords.lng}&radius=${radiusMeters}&key=${apiKey}`,
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=auto+body+shop+near+${encodeURIComponent(location)}&location=${coords.lat},${coords.lng}&radius=${radiusMeters}&key=${apiKey}`,
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=towing+service+near+${encodeURIComponent(location)}&location=${coords.lat},${coords.lng}&radius=${radiusMeters}&key=${apiKey}`,
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=auto+glass+repair+near+${encodeURIComponent(location)}&location=${coords.lat},${coords.lng}&radius=${radiusMeters}&key=${apiKey}`,
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=oil+change+near+${encodeURIComponent(location)}&location=${coords.lat},${coords.lng}&radius=${radiusMeters}&key=${apiKey}`,
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=transmission+repair+near+${encodeURIComponent(location)}&location=${coords.lat},${coords.lng}&radius=${radiusMeters}&key=${apiKey}`,
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=muffler+exhaust+shop+near+${encodeURIComponent(location)}&location=${coords.lat},${coords.lng}&radius=${radiusMeters}&key=${apiKey}`,
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=wheel+alignment+shop+near+${encodeURIComponent(location)}&location=${coords.lat},${coords.lng}&radius=${radiusMeters}&key=${apiKey}`,
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=snow+removal+snow+plow+near+${encodeURIComponent(location)}&location=${coords.lat},${coords.lng}&radius=${radiusMeters}&key=${apiKey}`
    ];
    const searchResults = await Promise.all(searches.map(url => fetch(url).then(r => r.json()).catch(() => ({ results: [] }))));
    const places = [];
    const seenIds = new Set();
    for (const result of searchResults) {
      for (const p of (result.results || [])) {
        if (!seenIds.has(p.place_id)) {
          seenIds.add(p.place_id);
          places.push(p);
        }
      }
    }

    let newCount = 0;
    let skippedChains = 0;
    for (const p of places) {
      if (isChainShop(p.name)) {
        skippedChains++;
        continue;
      }

      const { data: existingLead } = await supabase
        .from('outreach_leads')
        .select('id')
        .eq('name', p.name)
        .eq('location', p.vicinity || location)
        .maybeSingle();
      if (existingLead) continue;

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('business_name', p.name)
        .maybeSingle();

      const leadData = {
        type: 'provider',
        name: p.name,
        location: p.vicinity || location,
        source: 'google_places',
        status: 'new',
        metadata: {
          place_id: p.place_id,
          rating: p.rating,
          user_ratings_total: p.user_ratings_total,
          open_now: p.opening_hours?.open_now
        }
      };

      if (existingProfile) {
        leadData.crm_profile_id = existingProfile.id;
        leadData.crm_sync_status = 'duplicate';
      } else {
        leadData.crm_sync_status = 'unlinked';
        newCount++;
      }

      const { data: inserted } = await supabase.from('outreach_leads').insert(leadData).select('*').single();
      if (inserted && p.place_id) {
        await enrichLeadFromPlaceDetails(supabase, inserted);
        await new Promise(r => setTimeout(r, 300));
      }
    }

    if (skippedChains > 0) console.log(`[OutreachEngine] Skipped ${skippedChains} chain/franchise shops in ${location}`);
    return newCount;
  } catch (err) {
    console.error('[OutreachEngine] Places import error:', err.message);
    return 0;
  }
}

async function importMemberLeadsFromPlaces(supabase, location, radiusMeters) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return 0;

  try {
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`
    );
    const geoData = await geoRes.json();
    const coords = geoData.results?.[0]?.geometry?.location;
    if (!coords) return 0;

    const memberSearches = [
      { query: 'property management company', note: 'Property management company — potential snow removal and fleet maintenance customer.' },
      { query: 'HOA homeowners association', note: 'HOA / homeowners association — potential snow removal and community maintenance customer.' },
      { query: 'car dealership', note: 'Car dealership — potential source of new car owners needing maintenance services.' },
      { query: 'fleet management company', note: 'Fleet management company — high-value multi-vehicle account potential.' },
      { query: 'car rental agency', note: 'Car rental company — fleet maintenance and vehicle care needs.' },
      { query: 'apartment complex management', note: 'Apartment/condo management — snow removal and property maintenance customer.' },
      { query: 'commercial real estate management', note: 'Commercial property manager — snow removal and lot maintenance customer.' },
      { query: 'car wash detailing', note: 'Car wash / detailing shop — their customers are car owners who care about vehicle appearance. Great channel to reach car-proud owners.' },
      { query: 'auto parts store', note: 'Auto parts store — serves DIY car owners who may want professional help for bigger jobs. Potential partnership to reach their customer base.' },
      { query: 'car insurance agency', note: 'Car insurance agency — serves car owners directly. Partnership potential to recommend My Car Concierge to their policyholders.' },
      { query: 'parking garage valet', note: 'Parking garage / valet service — serves car owners daily. Partnership potential to promote My Car Concierge to their regular customers.' },
      { query: 'tire shop', note: 'Tire shop — their customers are car owners needing vehicle maintenance. Strong referral partnership potential.' },
      { query: 'gas station service center', note: 'Gas station / service center — high foot traffic from car owners. Partnership potential for referrals.' },
      { query: 'driving school', note: 'Driving school — their students are new drivers who need mechanics, insurance recommendations, and vehicle maintenance guidance. Partnership to recommend My Car Concierge to new drivers.' },
      { query: 'auto insurance broker', note: 'Auto insurance broker — every policyholder owns a vehicle needing maintenance. Referral partnership to recommend My Car Concierge to policyholders.' },
      { query: 'used car dealership independent', note: 'Used car dealership — buyers of used cars need immediate maintenance and inspections. Strong referral channel for My Car Concierge.' },
      { query: 'motorcycle shop powersports', note: 'Motorcycle and powersports shop — riders are vehicle enthusiasts who often also own cars. Cross-promotion opportunity for My Car Concierge.' },
      { query: 'EV charging station', note: 'EV charging station — EV owners need specialized maintenance and are tech-forward early adopters. Growing market segment for My Car Concierge.' },
      { query: 'auto auction', note: 'Auto auction house — buyers need immediate vehicle inspections and repairs after purchase. High-intent leads for My Car Concierge.' },
      { query: 'roadside assistance towing', note: 'Roadside assistance and towing company — their customers are having car problems right now. Direct referral pipeline to My Car Concierge for repairs.' }
    ];

    let newCount = 0;
    for (const search of memberSearches) {
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(search.query + ' near ' + location)}&location=${coords.lat},${coords.lng}&radius=${radiusMeters}&key=${apiKey}`;
      const placesRes = await fetch(searchUrl);
      const placesData = await placesRes.json();
      const places = placesData.results || [];

      for (const p of places.slice(0, 10)) {
        const { data: existingLead } = await supabase
          .from('outreach_leads')
          .select('id')
          .eq('name', p.name)
          .eq('location', p.vicinity || location)
          .maybeSingle();
        if (existingLead) continue;

        const leadData = {
          type: 'member',
          name: p.name,
          location: p.vicinity || location,
          source: 'google_places',
          crm_sync_status: 'unlinked',
          status: 'new',
          notes: search.note,
          metadata: {
            place_id: p.place_id,
            rating: p.rating,
            user_ratings_total: p.user_ratings_total,
            open_now: p.opening_hours?.open_now,
            search_category: search.query
          }
        };

        const { data: inserted } = await supabase.from('outreach_leads').insert(leadData).select('*').single();
        if (inserted && p.place_id) {
          await enrichLeadFromPlaceDetails(supabase, inserted);
          await new Promise(r => setTimeout(r, 300));
        }
        newCount++;
      }
      await new Promise(r => setTimeout(r, 200));
    }

    if (newCount > 0) console.log(`[OutreachEngine] Discovered ${newCount} potential member leads in ${location}`);
    return newCount;
  } catch (err) {
    console.error('[OutreachEngine] Member Places import error:', err.message);
    return 0;
  }
}

async function discoverCarOwnerCommunities(supabase, location) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return 0;

  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const searchQueries = [
      `car clubs and automotive enthusiast groups in ${location} with contact information or websites`,
      `car meetup groups and car show organizers in ${location} with email or website`,
      `Facebook groups for car owners and automotive community in ${location}`,
      `local automotive forums and car owner communities near ${location}`
    ];

    let newCount = 0;
    for (const query of searchQueries) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: query,
          config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.3
          }
        });

        const text = response.text || '';
        if (!text || text.length < 50) continue;

        const parsePrompt = `Extract community/group leads from this search result. Return ONLY a valid JSON array of objects with these fields: name (string), website (string or null), email (string or null), description (string, brief), type (one of: car_club, meetup_group, facebook_group, forum, car_show, community_page).

If no leads can be extracted, return an empty array [].

Search result:
${text.substring(0, 3000)}`;

        const parseResult = await callAI(parsePrompt, 2000);
        const parsed = parseResult.text;
        const clean = parsed.replace(/```json|```/g, '').trim();
        let communities = [];
        try {
          communities = JSON.parse(clean);
        } catch (e) {
          const match = clean.match(/\[[\s\S]*\]/);
          if (match) try { communities = JSON.parse(match[0]); } catch (e2) { continue; }
        }

        if (!Array.isArray(communities)) continue;

        for (const c of communities) {
          if (!c.name) continue;

          const { data: existing } = await supabase
            .from('outreach_leads')
            .select('id')
            .eq('name', c.name)
            .maybeSingle();
          if (existing) continue;

          const leadData = {
            type: 'member',
            name: c.name,
            email: c.email || null,
            location: location,
            source: 'community_discovery',
            crm_sync_status: 'unlinked',
            status: 'new',
            notes: `${c.type?.replace(/_/g, ' ') || 'Car community'}: ${c.description || 'Local automotive community'}. Reach out to organizer/admin to promote My Car Concierge to their car-owner members.`,
            metadata: {
              community_type: c.type,
              website: c.website,
              search_query: query
            }
          };

          await supabase.from('outreach_leads').insert(leadData);
          newCount++;
        }

        await new Promise(r => setTimeout(r, 1000));
      } catch (queryErr) {
        console.error(`[OutreachEngine] Community search error for query: ${queryErr.message}`);
      }
    }

    if (newCount > 0) console.log(`[OutreachEngine] Discovered ${newCount} car owner communities in ${location}`);
    return newCount;
  } catch (err) {
    console.error('[OutreachEngine] Community discovery error:', err.message);
    return 0;
  }
}

async function enrichLeadFromPlaceDetails(supabase, lead) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
  const placeId = lead.metadata?.place_id;
  if (!placeId) return null;

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_phone_number,website,formatted_address&key=${apiKey}`
    );
    const data = await res.json();
    const result = data.result;
    if (!result) return null;

    const update = {};
    if (result.formatted_phone_number && !lead.phone) {
      update.phone = result.formatted_phone_number;
    }
    if (result.formatted_address) {
      update.location = result.formatted_address;
    }

    const meta = { ...(lead.metadata || {}) };
    if (result.website) meta.website = result.website;
    update.metadata = meta;

    if (result.website && !lead.email) {
      const email = await extractEmailFromWebsite(result.website);
      if (email) update.email = email;
    }

    if (Object.keys(update).length > 0) {
      await supabase.from('outreach_leads').update(update).eq('id', lead.id);
    }

    return update;
  } catch (err) {
    console.error(`[OutreachEngine] Enrich error for ${lead.name}:`, err.message);
    return null;
  }
}

async function extractEmailFromWebsite(websiteUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const pagesToCheck = [websiteUrl];
    const baseUrl = new URL(websiteUrl).origin;
    pagesToCheck.push(baseUrl + '/contact');
    pagesToCheck.push(baseUrl + '/about');
    pagesToCheck.push(baseUrl + '/contact-us');

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const skipPatterns = ['example.com', 'domain.com', 'email.com', 'yourdomain', 'sentry.io', 'wixpress', 'googleapis'];

    for (const pageUrl of pagesToCheck) {
      try {
        const res = await fetch(pageUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyConciergeBot/1.0)' },
          redirect: 'follow'
        });
        if (!res.ok) continue;
        const html = await res.text();
        const emails = html.match(emailRegex) || [];
        const validEmails = emails.filter(e => {
          const lower = e.toLowerCase();
          return !skipPatterns.some(p => lower.includes(p)) && !lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.css') && !lower.endsWith('.js');
        });
        if (validEmails.length > 0) {
          clearTimeout(timeout);
          return validEmails[0];
        }
      } catch (e) {
        continue;
      }
    }

    clearTimeout(timeout);
    return null;
  } catch (err) {
    return null;
  }
}

async function enrichAllLeads(supabase) {
  const { data: leads } = await supabase
    .from('outreach_leads')
    .select('*')
    .eq('source', 'google_places')
    .or('email.is.null,phone.is.null')
    .limit(100);

  if (!leads || leads.length === 0) return { enriched: 0, total: 0 };

  let enriched = 0;
  for (const lead of leads) {
    const result = await enrichLeadFromPlaceDetails(supabase, lead);
    if (result && (result.phone || result.email)) {
      enriched++;
      console.log(`[OutreachEngine] Enriched: ${lead.name} — phone: ${result.phone || 'none'}, email: ${result.email || 'none'}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  return { enriched, total: leads.length };
}

async function syncReengagementLeads(supabase) {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: dormantMembers } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, created_at')
      .eq('role', 'member')
      .is('outreach_lead_id', null)
      .not('email', 'like', '%@sim-mcc.test')
      .not('email', 'is', null)
      .lt('created_at', threeDaysAgo)
      .order('created_at', { ascending: true })
      .limit(100);

    let memberCount = 0;
    for (const m of (dormantMembers || [])) {
      const { data: existing } = await supabase
        .from('outreach_leads')
        .select('id')
        .eq('crm_profile_id', m.id)
        .maybeSingle();
      if (existing) continue;

      const { count: vehicleCount } = await supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', m.id);

      const daysSinceSignup = Math.floor((Date.now() - new Date(m.created_at).getTime()) / (1000 * 60 * 60 * 24));
      let notes = '';
      if ((vehicleCount || 0) === 0) {
        notes = `Signed up ${daysSinceSignup} days ago but never added a vehicle or completed their profile. Needs a gentle nudge to explore the platform.`;
      } else {
        notes = `Signed up ${daysSinceSignup} days ago and added ${vehicleCount} vehicle(s) but never requested a service quote. Ready to be shown the value of getting quotes.`;
      }

      await supabase.from('outreach_leads').insert({
        type: 'member',
        name: m.full_name || m.email.split('@')[0],
        email: m.email,
        phone: m.phone,
        source: 'crm_reengagement',
        crm_profile_id: m.id,
        crm_sync_status: 'linked',
        notes,
        status: 'new'
      });
      memberCount++;
    }
    if (memberCount > 0) console.log(`[OutreachEngine] Found ${memberCount} dormant members for re-engagement`);

    const { data: stalledApps } = await supabase
      .from('provider_applications')
      .select('user_id, status, updated_at')
      .not('status', 'in', '("rejected","approved")')
      .lt('updated_at', new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString());

    for (const app of (stalledApps || [])) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, business_name, email, phone')
        .eq('id', app.user_id)
        .is('outreach_lead_id', null)
        .maybeSingle();
      if (!profile) continue;

      const { data: existing } = await supabase
        .from('outreach_leads')
        .select('id')
        .eq('crm_profile_id', profile.id)
        .maybeSingle();
      if (existing) continue;

      await supabase.from('outreach_leads').insert({
        type: 'provider',
        name: profile.business_name || profile.full_name || 'Unknown',
        email: profile.email,
        phone: profile.phone,
        source: 'crm_reengagement',
        crm_profile_id: profile.id,
        crm_sync_status: 'linked',
        notes: `Provider application stalled. Current status: ${app.status}.`,
        status: 'new'
      });
    }

    await syncReferralNudges(supabase);
  } catch (err) {
    console.error('[OutreachEngine] Re-engagement sync error:', err.message);
  }
}

async function syncReferralNudges(supabase) {
  try {
    const { data: activeMembers } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone')
      .eq('role', 'member')
      .not('email', 'is', null)
      .not('email', 'like', '%@sim-mcc.test');

    let nudgeCount = 0;
    for (const m of (activeMembers || [])) {
      const { count: serviceCount } = await supabase
        .from('service_requests')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', m.id);

      if (!serviceCount || serviceCount === 0) continue;

      const { data: recentNudge } = await supabase
        .from('outreach_leads')
        .select('id, created_at')
        .eq('crm_profile_id', m.id)
        .eq('source', 'referral_nudge')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentNudge) {
        const daysSinceNudge = (Date.now() - new Date(recentNudge.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceNudge < 30) continue;
      }

      await supabase.from('outreach_leads').insert({
        type: 'member',
        name: m.full_name || m.email.split('@')[0],
        email: m.email,
        phone: m.phone,
        source: 'referral_nudge',
        crm_profile_id: m.id,
        crm_sync_status: 'linked',
        notes: `Active member who has completed ${serviceCount} service request(s). Encourage them to refer friends and family using the referral program for rewards.`,
        status: 'new'
      });
      nudgeCount++;
    }
    if (nudgeCount > 0) console.log(`[OutreachEngine] Created ${nudgeCount} referral nudge leads`);
  } catch (err) {
    console.error('[OutreachEngine] Referral nudge sync error:', err.message);
  }
}

async function scoreLeadsWithAI(supabase, leads) {
  if (leads.length === 0) return 0;

  const BATCH_SIZE = 25;
  let totalScored = 0;

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    try {
      const prompt = `You are a lead qualification assistant for My Car Concierge, an automotive service marketplace.

Score each of the following leads from 0-100 based on how likely they are to convert and how valuable they would be.

For providers (auto repair shops): high scores for shops with many reviews, good ratings, and locations in target markets.
For members (vehicle owners / businesses): high scores for fleet companies (multiple vehicles = recurring revenue), property management companies and HOAs (snow removal + property maintenance contracts), car dealerships (steady stream of new car buyers needing maintenance), tire shops and auto parts stores (high-volume referral partners), car washes and detailing shops (cross-promotion with car-proud owners), insurance agencies (value-add for policyholders), car clubs and communities (access to engaged car enthusiasts), and parking/valet services (daily car owner interactions). Leads with complete contact info (email + phone) score higher. Community leads (car clubs, forums, Facebook groups) score well because they provide access to many individual car owners through one relationship.
For investors: high scores for leads with specific company/title context.

Respond ONLY with a valid JSON array, one object per lead. Keep score_rationale and ai_notes brief (under 30 words each):
[
  {
    "lead_id": "uuid",
    "opportunity_score": 75,
    "priority": "high",
    "recommended_channel": "email",
    "score_rationale": "brief reason",
    "ai_notes": "brief outreach tip"
  }
]

Priority rules: score >= 70 = "high", 40-69 = "medium", < 40 = "low"
Channel rules: use "email" if email available, "sms" if only phone, "both" if both available

Leads to score:
${JSON.stringify(batch, null, 2)}`;

      const aiResult = await callAI(prompt, 4000);
      const clean = aiResult.text.replace(/```json|```/g, '').trim();
      let scores;
      try {
        scores = JSON.parse(clean);
      } catch (parseErr) {
        const arrayMatch = clean.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          try { scores = JSON.parse(arrayMatch[0]); }
          catch (e) { console.error('[OutreachEngine] Batch parse recovery failed, raw:', clean.substring(0, 500)); continue; }
        } else {
          console.error('[OutreachEngine] Batch parse failed, raw:', clean.substring(0, 500));
          continue;
        }
      }

      const pipelineRows = scores.map(s => ({
        lead_id: s.lead_id,
        opportunity_score: Math.min(100, Math.max(0, s.opportunity_score || 50)),
        priority: ['high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium',
        recommended_channel: ['email', 'sms', 'both'].includes(s.recommended_channel) ? s.recommended_channel : 'email',
        score_rationale: s.score_rationale || '',
        ai_notes: s.ai_notes || '',
        stage: 'draft_ready'
      }));

      if (pipelineRows.length > 0) {
        await supabase.from('opportunity_pipeline').upsert(pipelineRows, {
          onConflict: 'lead_id',
          ignoreDuplicates: false
        });
      }

      for (const s of scores) {
        await supabase.from('outreach_activity_log').insert({
          lead_id: s.lead_id,
          event_type: 'scored',
          metadata: { score: s.opportunity_score, priority: s.priority }
        });
      }

      totalScored += scores.length;
      console.log(`[OutreachEngine] Scored batch ${Math.floor(i / BATCH_SIZE) + 1}: ${scores.length} leads (via ${aiResult.provider})`);
    } catch (err) {
      console.error(`[OutreachEngine] Scoring batch error:`, err.message);
      break;
    }
  }

  return totalScored;
}

async function draftMessageWithAI(lead, channel, sequenceStep) {
  try {
    const audienceContext = {
      member: 'a potential founding member — a vehicle owner, property manager, fleet operator, or business invited to join My Car Concierge while it is still in its early startup stage. Founding members get in on the ground floor: early access, the chance to shape the platform, and loyalty perks from day one. They benefit from posting their auto or property service needs and receiving competitive bids from vetted local providers, with secure escrow payments and vehicle maintenance tracking all in one platform',
      provider: 'a potential founding provider — an auto service provider (mechanic, body shop, detailer, etc.) invited to join My Car Concierge while it is still in its early startup stage. Founding providers get priority visibility, early access to new customers as the platform grows, and the chance to build their reputation before the competition arrives. They benefit from a steady stream of pre-qualified local customers, secure escrow payments, and tools like Car Club loyalty programs to build repeat business — with no platform fees',
      investor: 'a potential investor or strategic partner evaluating My Car Concierge — an early-stage automotive marketplace startup with a growing founding community, escrow payments, Car Club loyalty, AI-powered customer acquisition, and a clear path to scale. My Car Concierge is actively raising on Wefunder at wefunder.com/my.car.concierge?utm_source=email&utm_medium=outreach&utm_campaign=followup — direct them there to learn more and invest. This is a community crowdfunding round open to everyday investors, not just institutions'
    };

    const channelInstruction = channel === 'sms'
      ? 'Write a brief SMS message under 160 characters. Be direct, friendly, and include a call to action.'
      : 'Write a professional email. Include TWO subject line variants on the first two lines in the format "Subject A: [subject]" and "Subject B: [subject]". Make them meaningfully different in tone or angle. Then a blank line, then the body.';

    let followUpNote;
    if (sequenceStep === 1) {
      followUpNote = 'This is the first outreach. Introduce My Car Concierge warmly and clearly.';
    } else if (sequenceStep === 2) {
      followUpNote = 'This is follow-up #2. Reference that we reached out a few days ago. Add a new angle or benefit they may have missed. Keep it shorter than the original.';
    } else {
      followUpNote = 'This is the FINAL follow-up (#3). Reference that My Car Concierge has an active community fundraising round live on Wefunder (wefunder.com/my.car.concierge?utm_source=email&utm_medium=outreach&utm_campaign=followup) — the team is actively investing in growing the platform and this is the time to get in early as a founding partner before it scales. Create genuine urgency — founding partner perks exist specifically for the early stage and will not carry the same weight once the platform is established. Keep it concise and respectful of their time. Make it clear this is the last message unless they respond.';
    }

    let contextNote = '';
    if (lead.source === 'referral_nudge') {
      contextNote = 'IMPORTANT: This person is an ACTIVE My Car Concierge member who has used the platform. Do NOT pitch the platform. Instead, thank them for being a valued member and encourage them to share My Car Concierge with friends and family. Mention that they can earn rewards through the referral program. Keep it appreciative, not transactional.';
    } else if (lead.source === 'crm_reengagement' && lead.type === 'member') {
      contextNote = 'IMPORTANT: This person signed up for My Car Concierge but has not fully engaged. Do NOT pitch the platform as if they have never heard of it. Instead, re-engage them warmly based on their activity level (see Notes). If they never added a vehicle, highlight how easy it is to get started. If they added vehicles but never got a quote, highlight the value of comparing bids from verified providers.';
    } else if (lead.source === 'crm_reengagement') {
      contextNote = 'IMPORTANT: This person is an existing My Car Concierge user. Do NOT pitch the platform as if they have never heard of it. Instead, re-engage them warmly.';
    } else if (lead.source === 'google_places' && lead.type === 'member') {
      const searchCat = lead.metadata?.search_category || '';
      if (searchCat.includes('property') || searchCat.includes('HOA') || searchCat.includes('apartment') || searchCat.includes('real estate')) {
        contextNote = 'IMPORTANT: This is a property management company, HOA, or real estate manager discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and we are actively recruiting founding partners. Pitch snow removal services and property maintenance — explain how My Car Concierge connects them with vetted local snow removal and maintenance providers, with competitive bidding and guaranteed service. Emphasize seasonal contracts, reliable scheduling, and one platform for all property maintenance needs. As an early partner, they get priority attention and help shape the platform.';
      } else if (searchCat.includes('fleet')) {
        contextNote = 'IMPORTANT: This is a fleet management company discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and building its founding community. Pitch fleet vehicle maintenance — explain how My Car Concierge connects them with vetted local mechanics and shops, with competitive bidding across their entire fleet. Emphasize cost savings from comparing multiple providers, centralized maintenance tracking, and guaranteed quality service. As a founding member, they get early access and priority support while the platform is still growing.';
      } else if (searchCat.includes('dealership')) {
        contextNote = 'IMPORTANT: This is a car dealership discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and looking for founding partners. Pitch a partnership — their customers (new car buyers) need ongoing maintenance after the warranty period. My Car Concierge can be a value-add they recommend to buyers, keeping their customers in a trusted service ecosystem. As an early partner, they get ground-floor access and can help shape how the platform serves their customers. Also mention fleet/lot maintenance needs.';
      } else if (searchCat.includes('rental')) {
        contextNote = 'IMPORTANT: This is a car rental company discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and building its founding community. Pitch fleet maintenance services — explain how My Car Concierge helps them maintain their rental fleet with vetted providers, competitive pricing, and streamlined scheduling across multiple vehicles. As a founding member, they get priority support and early access to new features.';
      } else if (searchCat.includes('car wash') || searchCat.includes('detailing')) {
        contextNote = 'IMPORTANT: This is a car wash or detailing business discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and actively looking for founding providers and partners. Their customers already care about their vehicles — that makes them ideal My Car Concierge members. Pitch a cross-promotion partnership: we send our members their way for detailing, they recommend My Car Concierge to their customers for mechanical repairs, maintenance, and other services they don\'t offer. As a founding partner, they get in on the ground floor — early visibility, priority placement, and the chance to build their reputation on the platform before the competition. Mention our Car Club loyalty program — they could create their own loyalty punch card on My Car Concierge to reward repeat customers and drive retention.';
      } else if (searchCat.includes('auto parts')) {
        contextNote = 'IMPORTANT: This is an auto parts store discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and building its founding community. Their customers are hands-on car owners — some DIY, some need professional help for bigger jobs. Pitch a referral partnership: when their customers need a mechanic for installation or complex repairs, they can recommend My Car Concierge as a trusted resource for finding vetted local shops with competitive pricing. As an early referral partner, they get ground-floor commissions and visibility as the platform grows. Mention there are no platform fees — providers keep 100% of what they earn.';
      } else if (searchCat.includes('insurance')) {
        contextNote = 'IMPORTANT: This is a car insurance agency discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and looking for founding partners. Every one of their policyholders owns a vehicle that needs maintenance. Pitch My Car Concierge as a value-add for their clients — by recommending My Car Concierge, they help policyholders find trusted repair shops with competitive bidding, which can mean better-quality repairs and fewer claims from shoddy work. As an early partner, they get to be among the first to offer this resource to their clients. Position My Car Concierge as a resource that complements their service, not competes with it.';
      } else if (searchCat.includes('parking') || searchCat.includes('valet')) {
        contextNote = 'IMPORTANT: This is a parking garage or valet service discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and looking for founding partners. They interact with car owners daily. Pitch a partnership where they share My Car Concierge with their customers — perhaps through signage, flyers, or a digital display. Their customers trust them with their vehicles already, so a recommendation for trusted auto services is a natural fit. As a founding referral partner, they get in early and earn commissions as the platform grows.';
      } else if (searchCat.includes('tire')) {
        contextNote = 'IMPORTANT: This is a tire shop discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and actively recruiting founding providers. Their customers are already spending on vehicle maintenance. Pitch a dual opportunity: join as a founding provider to receive new customers for tire services with priority visibility and early-mover advantage, AND refer customers who need services beyond tires (brakes, alignment, engine work) to earn referral commissions. Mention the Car Club loyalty program as a retention tool for building repeat business from day one.';
      } else if (searchCat.includes('gas station')) {
        contextNote = 'IMPORTANT: This is a gas station or service center discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and building its founding community. They see hundreds of car owners daily. Pitch a simple partnership — display My Car Concierge info at the pump or in-store to connect their customers with trusted auto services. If they have a service center, pitch joining as a founding provider with early-mover advantage — priority visibility and the chance to build their reputation on the platform before competitors. Highlight the high visibility and low effort of the partnership.';
      } else if (searchCat.includes('driving school')) {
        contextNote = 'IMPORTANT: This is a driving school discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and recruiting founding partners. Their students are new drivers who will soon need mechanics, maintenance, and vehicle care. Pitch a partnership: recommend My Car Concierge to graduating students as their go-to resource for finding trusted local mechanics and maintaining their first vehicle. As a founding partner, they can offer exclusive value to their students — a trusted recommendation that builds loyalty and keeps new drivers safe on the road. Mention referral commissions for every student who signs up.';
      } else if (searchCat.includes('auto insurance broker') || (searchCat.includes('insurance') && searchCat.includes('broker'))) {
        contextNote = 'IMPORTANT: This is an auto insurance broker discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and building founding partnerships. Every policyholder they serve owns a vehicle that needs regular maintenance. Pitch My Car Concierge as a value-add for their clients — well-maintained vehicles mean fewer claims and lower risk. By recommending My Car Concierge, they differentiate their service and build client loyalty. As a founding referral partner, they earn commissions and get early access to a growing platform that complements their business perfectly.';
      } else if (searchCat.includes('used car dealership') || searchCat.includes('independent')) {
        contextNote = 'IMPORTANT: This is a used car dealership discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and recruiting founding partners. Their buyers need immediate vehicle inspections, maintenance, and ongoing care — used cars especially need a trusted mechanic. Pitch a partnership: recommend My Car Concierge to every buyer as their post-purchase maintenance solution. This adds value to every sale, builds buyer confidence, and creates a seamless ownership experience. As a founding partner, they get referral commissions and early visibility on the platform.';
      } else if (searchCat.includes('motorcycle') || searchCat.includes('powersports')) {
        contextNote = 'IMPORTANT: This is a motorcycle or powersports shop discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and building its founding community. Riders are passionate vehicle enthusiasts who typically also own cars and trucks. Pitch a cross-promotion partnership: their customers are exactly the kind of engaged vehicle owners who would love My Car Concierge for their car maintenance needs. As a founding partner, they can also join as a provider for motorcycle services and get early-mover advantage. Mention the Car Club loyalty program as a way to reward their repeat customers.';
      } else if (searchCat.includes('EV') || searchCat.includes('charging')) {
        contextNote = 'IMPORTANT: This is an EV charging station discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and building partnerships in the growing EV market. EV owners still need maintenance — brakes, tires, suspension, detailing, and specialized EV services. Pitch a partnership: recommend My Car Concierge to their EV-owning customers as the platform to find vetted providers who understand electric vehicles. As a founding partner in this fast-growing segment, they get early visibility and can shape how My Car Concierge serves EV owners. Position this as forward-thinking — the EV maintenance market is expanding rapidly.';
      } else if (searchCat.includes('auto auction') || searchCat.includes('auction')) {
        contextNote = 'IMPORTANT: This is an auto auction house discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and recruiting founding partners. Their buyers need immediate vehicle inspections and often significant repairs after purchase — these are high-intent leads who need mechanics right away. Pitch a partnership: recommend My Car Concierge to every auction buyer as their go-to resource for post-purchase inspections, repairs, and ongoing maintenance. As a founding partner, they add value to every transaction and earn referral commissions. Emphasize speed — auction buyers need fast, reliable service.';
      } else if (searchCat.includes('roadside') || searchCat.includes('towing')) {
        contextNote = 'IMPORTANT: This is a roadside assistance or towing company discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and building its founding community. Their customers are having car problems right now — breakdowns, flat tires, dead batteries — and need a mechanic next. Pitch a direct referral pipeline: after they tow or assist a vehicle, recommend My Car Concierge so the customer can quickly find a vetted local shop for the actual repair. As a founding referral partner, they earn commissions on every referral and provide better end-to-end service. They can also join as a provider for roadside services on the platform.';
      } else {
        contextNote = 'IMPORTANT: This is a business that serves car owners, discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and actively building its founding community of members, providers, and partners. Introduce My Car Concierge as a new platform where car owners get competitive bids from vetted local service providers for any auto need — maintenance, repairs, detailing, and more. As an early partner, they get ground-floor access, priority visibility, and the chance to grow with the platform. Pitch a partnership based on their business type: cross-promotion, referral commissions, or joining as a founding provider.';
      }
    } else if (lead.source === 'community_discovery') {
      const leadNameLower = (lead.name || '').toLowerCase();
      const leadNotesLower = (lead.notes || '').toLowerCase();
      const communityText = leadNameLower + ' ' + leadNotesLower;

      if (communityText.includes('club') || communityText.includes('car club') || communityText.includes('auto club')) {
        contextNote = 'IMPORTANT: This is a car club or auto club discovered online. The lead is the club organizer or admin. My Car Concierge is in its early startup stage and actively looking for founding community partners. Pitch a co-branded Car Club loyalty program on My Car Concierge — their club members get a custom punch card with exclusive rewards, the club earns referral commissions, and members get priority access to vetted local mechanics with competitive bidding. Offer event sponsorship opportunities and co-branded landing pages. As a founding car club partner, they get maximum visibility, influence over how the platform serves enthusiast communities, and preferred status as the platform grows. Their members already love their vehicles — My Car Concierge helps them take even better care of them.';
      } else if (communityText.includes('facebook') || communityText.includes('fb group') || communityText.includes('fb ')) {
        contextNote = 'IMPORTANT: This is a Facebook car group or community discovered online. The lead is the group admin. My Car Concierge is in its early startup stage and looking for founding online community partners. Pitch exclusive member benefits for their Facebook group: a dedicated group landing page on My Car Concierge, special discount codes for group members, and admin collaboration opportunities. As a founding community partner, they can offer tangible value to their members beyond discussions — actual access to vetted mechanics, competitive pricing, and a Car Club loyalty program. Position My Car Concierge as a resource that enhances their community, not competes with it. Offer referral commissions for the admin on every group member who signs up.';
      } else if (communityText.includes('meetup') || communityText.includes('meet up') || communityText.includes('car show') || communityText.includes('cruise') || communityText.includes('cars and coffee')) {
        contextNote = 'IMPORTANT: This is a car meetup, car show, or cruise event community discovered online. The lead is the event organizer. My Car Concierge is in its early startup stage and looking for founding event partners. Pitch event support and sponsorship: branded giveaways at their events, a featured provider showcase, and co-branded event materials. Their attendees are passionate car owners who care deeply about their vehicles — perfect My Car Concierge members. As a founding event partner, they get sponsorship support, a dedicated Car Club loyalty program for their regular attendees, and referral commissions. Offer to be a value-add sponsor rather than just another advertiser — provide real maintenance resources to their community.';
      } else if (communityText.includes('forum') || communityText.includes('reddit') || communityText.includes('online') || communityText.includes('discord')) {
        contextNote = 'IMPORTANT: This is an online car community, forum, or discussion group discovered online. The lead is the community admin or moderator. My Car Concierge is in its early startup stage and looking for founding digital community partners. Pitch a content partnership: exclusive discount codes for their community members, a dedicated support channel, and co-created content about vehicle maintenance. Their members are knowledgeable car enthusiasts who value trusted recommendations. As a founding partner, they can offer their community something tangible — access to vetted mechanics with competitive pricing, a Car Club loyalty program with exclusive rewards, and referral commissions for the community. Position My Car Concierge as a resource their members would genuinely appreciate, not spam.';
      } else {
        contextNote = 'IMPORTANT: This is a car owner community, club, or group discovered online. The lead is the community organizer or admin — NOT an individual car owner. My Car Concierge is in its early startup stage and actively looking for founding community partners. Pitch a partnership: their members already love their vehicles and would benefit from a trusted platform to find vetted local mechanics, compare competitive repair quotes, and track vehicle maintenance. Offer concrete founding-partner benefits: a dedicated Car Club loyalty program on My Car Concierge with custom punch card rewards for their members, a co-branded landing page, referral commissions for the club, and the opportunity to shape how My Car Concierge serves car enthusiast communities as it grows. Being an early community partner means more influence, more visibility, and preferred status. Be respectful of their community — position My Car Concierge as a resource that enhances the ownership experience, not as advertising.';
      }
    } else if (lead.source === 'google_places' && lead.type === 'provider') {
      contextNote = 'IMPORTANT: This is an auto service shop or provider discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and actively recruiting founding providers. Pitch the founding provider opportunity: they get in on the ground floor of a growing marketplace, with early-mover advantage — priority visibility, first access to new customers in their area, and the ability to build their reputation and reviews before competitors join. Emphasize there are no platform fees — providers keep 100% of what they earn, plus secure escrow payments, Car Club loyalty tools to build repeat business, and a steady pipeline of pre-qualified local customers. CONTEXT: My Car Concierge currently has an active community fundraising round on Wefunder (wefunder.com/my.car.concierge?utm_source=email&utm_medium=outreach&utm_campaign=followup), which reflects the team\'s commitment to growing the platform — mention it as a signal that the platform is serious and actively building. Frame this as a rare chance to be among the first providers on a platform that is actively investing in its growth — not just another listing site.';
    } else if (lead.source === 'Apollo' && lead.type === 'investor') {
      contextNote = 'IMPORTANT: This is a potential angel investor, VC, or financial professional discovered via Apollo.io. They may NOT have heard of My Car Concierge before. My Car Concierge is an early-stage automotive marketplace startup currently raising on Wefunder at wefunder.com/my.car.concierge?utm_source=email&utm_medium=outreach&utm_campaign=followup — a community crowdfunding round open to everyday investors, not just institutions. Describe what the platform actually is: a marketplace connecting car owners with vetted local service providers, featuring competitive bidding, escrow payments, Car Club loyalty programs, AI-powered tools, and vehicle maintenance tracking. Explain that the platform is in its early stage, actively building its founding community of members and providers, and seeking capital to fuel growth. Direct them to wefunder.com/my.car.concierge?utm_source=email&utm_medium=outreach&utm_campaign=followup to learn more and invest if interested. Do NOT make specific ROI promises, guaranteed return claims, earnings projections, or any securities-law-violating statements. Stick only to factual descriptions of what the platform does and what the Wefunder campaign is. Be warm, direct, and concise — this is an introduction, not a pitch deck.';
    } else if (lead.source === 'Apollo' && lead.type === 'provider') {
      contextNote = 'IMPORTANT: This is an auto service business owner or manager discovered via Apollo.io. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and actively recruiting founding providers. Pitch the founding provider opportunity: they get in on the ground floor of a marketplace that is actively building and growing, with early-mover advantage — priority visibility, first access to new local customers in their area, and the chance to build their reputation and reviews before competitors join. No platform fees — providers keep 100% of what they earn. Secure escrow payments protect both parties. Car Club loyalty tools help build repeat business. You may mention that My Car Concierge has an active fundraising campaign on Wefunder (wefunder.com/my.car.concierge?utm_source=email&utm_medium=outreach&utm_campaign=followup) as a factual signal that the platform is in active growth mode — but do NOT claim or imply that investors have committed funds or that the platform is "backed by investors."';
    } else if (lead.source === 'Apollo') {
      contextNote = 'IMPORTANT: This person was discovered via Apollo.io. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and actively building its founding community. Mention the Wefunder campaign (wefunder.com/my.car.concierge?utm_source=email&utm_medium=outreach&utm_campaign=followup) as a credibility signal. Pitch based on their apparent role — if they are in the auto industry, invite them as a founding provider; if they appear to be an investor or in finance, direct them to the Wefunder investment opportunity.';
    }

    const prompt = `${BRAND_INFO}

You are writing a ${channel} outreach message to ${lead.name}${lead.company ? ` (${lead.company})` : ''} from ${lead.location || 'the target area'}.
They are ${audienceContext[lead.type] || audienceContext.member}.
${contextNote}

Lead type: ${lead.type}
Source: ${lead.source || 'discovery'}
Notes: ${lead.notes || 'none'}

${followUpNote}
${channelInstruction}

IMPORTANT RULES:
- Always use the full name "My Car Concierge" — NEVER abbreviate to MCC or any other shorthand
- The call to action should ALWAYS be to visit mycarconcierge.com — NEVER ask them to call, reply, or phone
- Write naturally and conversationally — not like a template
- Personalize based on their business name and type
- Keep it concise but informative

Email format:
Subject A: [subject line variant A]
Subject B: [subject line variant B]

[Body]

Best regards,
My Car Concierge Team

LEGAL COMPLIANCE (REQUIRED):
- The message MUST clearly identify it is from "My Car Concierge" (sender identification)
- Do NOT use deceptive subject lines that misrepresent the content
- Do NOT make false claims, fake urgency, or misleading promises
- Do NOT include any income claims, guaranteed results, or earnings projections
- For SMS: keep message truthful, non-deceptive, and under 160 characters (opt-out notice will be appended automatically — do NOT include one yourself)
- For email: do NOT include an unsubscribe link or physical address (those are appended automatically)
- The message must be truthful, non-deceptive, and clearly commercial in nature
- Never impersonate or imply endorsement by any third party

Write the message now:`;

    const aiResult = await callAI(prompt, 600);
    const text = aiResult.text;
    let subject = null;
    let body = text;

    if (channel === 'email') {
      const lines = text.split('\n');
      const subjectLines = lines.filter(l => l.startsWith('Subject:') || l.startsWith('Subject A:') || l.startsWith('Subject B:'));
      let subjectA = null;
      let subjectB = null;

      if (subjectLines.length >= 2) {
        subjectA = subjectLines[0].replace(/^Subject\s*[AB]?:/, '').trim();
        subjectB = subjectLines[1].replace(/^Subject\s*[AB]?:/, '').trim();
        const lastSubjectIdx = lines.indexOf(subjectLines[subjectLines.length - 1]);
        body = lines.slice(lastSubjectIdx + 1).join('\n').trim();
      } else if (subjectLines.length === 1) {
        subjectA = subjectLines[0].replace('Subject:', '').trim();
        const idx = lines.indexOf(subjectLines[0]);
        body = lines.slice(idx + 1).join('\n').trim();
      }

      subject = subjectA;
      return { subject, subjectB, body };
    }

    return { subject, body };
  } catch (err) {
    console.error('[OutreachEngine] Draft error:', err.message);
    return null;
  }
}

const MAX_DAILY_SENDS = 500;

function getWarmupLimit() {
  return MAX_DAILY_SENDS;
}

async function checkDailySendLimit(supabase) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: state } = await supabase.from('engine_state').select('warmup_start_date').eq('id', 1).single();
  const limit = getWarmupLimit(state?.warmup_start_date);
  const { count } = await supabase
    .from('outreach_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', todayStart.toISOString());
  const sentToday = count || 0;
  if (sentToday >= limit) {
    console.log(`[OutreachEngine] Warmup limit reached: ${sentToday}/${limit} sends today`);
  }
  return sentToday < limit;
}

async function sendMessage(supabase, messageId) {
  const { data: msg } = await supabase
    .from('outreach_messages')
    .select('*, outreach_leads(*)')
    .eq('id', messageId)
    .single();

  if (!msg || msg.status !== 'approved') {
    return { error: 'Message not found or not approved' };
  }

  const lead = msg.outreach_leads;
  if (!lead) return { error: 'Lead not found' };

  if (lead.status === 'unsubscribed' || lead.status === 'bounced') {
    return { error: `Lead has ${lead.status} — message blocked` };
  }

  const withinLimit = await checkDailySendLimit(supabase);
  if (!withinLimit) {
    console.log('[OutreachEngine] Daily send limit reached (' + MAX_DAILY_SENDS + '). Message queued for tomorrow.');
    return { error: 'Daily send limit reached. Message will be sent tomorrow.' };
  }

  const firstName = lead.name ? lead.name.split(' ')[0] : 'there';
  const bodyBase = msg.body
    .replace(/\[FIRST_NAME\]/g, firstName)
    .replace(/\[MCC_LINK\]/g, 'https://mycarconcierge.com')
    .replace(/\[LINK\]/g, 'https://mycarconcierge.com');

  let externalId = null;
  let error = null;

  if (msg.channel === 'email' && lead.email) {
    const resend = getResend();
    if (!resend) return { error: 'Email service not configured' };

    const unsubLink = `${UNSUBSCRIBE_URL}?email=${encodeURIComponent(lead.email)}&id=${lead.id}`;
    const textBody = bodyBase + `\n\n---\n${PHYSICAL_ADDRESS}\nTo stop receiving these emails: ${unsubLink}`;
    const trackingBase = BASE_URL;
    const openPixel = `<img src="${trackingBase}/t/o?m=${messageId}" width="1" height="1" style="display:none;" alt="">`;
    const clickUrl = `${trackingBase}/t/c?m=${messageId}&u=${encodeURIComponent('https://mycarconcierge.com')}`;
    const htmlBody = bodyBase
      .replace(/\n/g, '<br>')
      .replace(/https:\/\/mycarconcierge\.com/g, `<a href="${clickUrl}" style="color:#c9a84c;">mycarconcierge.com</a>`)
      + `<br><br><hr style="border-color:#333;"><p style="font-size:12px;color:#888;">${PHYSICAL_ADDRESS}<br><a href="${unsubLink}" style="color:#888;">Unsubscribe</a></p>${openPixel}`;

    try {
      const result = await resend.emails.send({
        from: 'My Car Concierge <jordan@mycarconcierge.com>',
        to: [lead.email],
        subject: msg.subject || 'My Car Concierge — Let\'s Connect',
        text: textBody,
        html: htmlBody,
        headers: {
          'List-Unsubscribe': `<${unsubLink}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        }
      });
      externalId = result.data?.id || result.id;
    } catch (err) {
      error = err.message;
    }
  } else if (msg.channel === 'sms' && lead.phone) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromPhone) {
      return { error: 'SMS service not configured' };
    }

    const body = bodyBase + SMS_OPT_OUT;

    try {
      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({ From: fromPhone, To: lead.phone, Body: body })
        }
      );
      const result = await twilioRes.json();
      if (twilioRes.ok) {
        externalId = result.sid;
      } else {
        error = result.message || 'SMS send failed';
      }
    } catch (err) {
      error = err.message;
    }
  } else {
    return { error: 'No valid contact method for this channel' };
  }

  await supabase.from('outreach_messages').update({
    status: error ? 'failed' : 'sent',
    sent_at: error ? null : new Date().toISOString(),
    resend_message_id: msg.channel === 'email' ? externalId : null,
    twilio_message_sid: msg.channel === 'sms' ? externalId : null
  }).eq('id', messageId);

  await supabase.from('outreach_activity_log').insert({
    lead_id: lead.id,
    message_id: msg.id,
    event_type: error ? 'send_failed' : 'sent',
    metadata: error ? { error } : { external_id: externalId }
  });

  if (!error) {
    await supabase.from('outreach_leads').update({ status: 'contacted' }).eq('id', lead.id);
    await supabase.from('opportunity_pipeline')
      .update({ stage: 'contacted', last_action_at: new Date().toISOString() })
      .eq('lead_id', lead.id);

    const { data: engineState } = await supabase.from('engine_state').select('total_messages_sent').eq('id', 1).single();
    await supabase.from('engine_state').update({
      total_messages_sent: (engineState?.total_messages_sent || 0) + 1
    }).eq('id', 1);
  }

  return { success: !error, error };
}

async function runEngineCycle(supabase) {
  try {
    const { data: state } = await supabase
      .from('engine_state')
      .select('*')
      .eq('id', 1)
      .single();

    if (!state || !state.is_running) return { skipped: true, reason: 'engine_paused' };
    if (state.auto_send === undefined) state.auto_send = true;

    const now = new Date();
    const lastDiscovery = state.last_discovery_run ? new Date(state.last_discovery_run) : null;
    const minutesSinceDiscovery = lastDiscovery
      ? (now.getTime() - lastDiscovery.getTime()) / 60000
      : Infinity;

    const results = { cycle_at: now.toISOString() };

    const { count: unscoredCount } = await supabase
      .from('outreach_leads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new');
    const { count: pipelineCount } = await supabase
      .from('opportunity_pipeline')
      .select('lead_id', { count: 'exact', head: true });
    const backlogSize = (unscoredCount || 0) - (pipelineCount || 0);

    if (backlogSize > 1000) {
      results.discovery = `skipped (backlog: ${backlogSize} unscored leads)`;
    } else if (minutesSinceDiscovery >= (state.discovery_interval_minutes || 360)) {
      let discovered = 0;
      if (process.env.GOOGLE_PLACES_API_KEY) {
        const allCities = state.target_cities || [];
        const cityIndex = (state.metadata?.city_rotation_index || 0) % allCities.length;
        const citiesToDiscover = allCities.slice(cityIndex, cityIndex + 3);
        if (citiesToDiscover.length < 3 && allCities.length > 3) {
          citiesToDiscover.push(...allCities.slice(0, 3 - citiesToDiscover.length));
        }
        const nextIndex = (cityIndex + citiesToDiscover.length) % allCities.length;

        for (const city of citiesToDiscover) {
          const providerCount = await importProviderLeadsFromPlaces(supabase, city, state.search_radius_meters || 15000);
          const memberCount = await importMemberLeadsFromPlaces(supabase, city, state.search_radius_meters || 15000);
          const communityCount = await discoverCarOwnerCommunities(supabase, city);
          discovered += providerCount + memberCount + communityCount;
        }

        await supabase.from('engine_state').update({
          metadata: { ...(state.metadata || {}), city_rotation_index: nextIndex }
        }).eq('id', 1);
        results.cities_searched = citiesToDiscover;
      }
      await supabase.from('engine_state').update({
        last_discovery_run: now.toISOString(),
        total_leads_discovered: (state.total_leads_discovered || 0) + discovered
      }).eq('id', 1);
      results.discovery = `ran (${discovered} new leads from ${(results.cities_searched || []).length} cities)`;
    } else {
      results.discovery = 'skipped (interval not reached)';
    }

    await syncReengagementLeads(supabase);

    const { data: alreadyScoredIds } = await supabase
      .from('opportunity_pipeline')
      .select('lead_id');
    const scoredArray = (alreadyScoredIds || []).map(r => r.lead_id);
    const scoredSet = new Set(scoredArray);

    let leadsQuery = supabase
      .from('outreach_leads')
      .select('id, type, name, location, metadata, notes')
      .eq('status', 'new');
    if (scoredArray.length > 0) {
      const filterChunks = [];
      for (let ci = 0; ci < scoredArray.length; ci += 200) {
        filterChunks.push(scoredArray.slice(ci, ci + 200));
      }
      leadsQuery = leadsQuery.not('id', 'in', `(${filterChunks[0].join(',')})`);
    }
    const { data: allNewLeads } = await leadsQuery.limit(500);

    const toScore = (allNewLeads || []).filter(l => !scoredSet.has(l.id)).slice(0, 200);
    if (toScore.length > 0) {
      const scored = await scoreLeadsWithAI(supabase, toScore);
      results.scored = scored;
    }

    if (state.instantly_auto_sync && process.env.INSTANTLY_API_KEY) {
      try {
        const { data: unsyncedLeads } = await supabase
          .from('outreach_leads')
          .select('*')
          .not('email', 'is', null)
          .not('score', 'is', null)
          .limit(500);
        const leadsToSync = (unsyncedLeads || []).filter(l => l.email && !l.metadata?.instantly_synced);
        if (leadsToSync.length > 0) {
          const syncResult = await pushLeadsToInstantly(supabase, leadsToSync, state.instantly_campaign_id || null);
          results.instantly_synced = syncResult.synced || 0;
        }
      } catch (syncErr) {
        results.instantly_sync_error = syncErr.message;
      }
    }

    const { data: draftTargets } = await supabase
      .from('opportunity_pipeline')
      .select('lead_id, recommended_channel, outreach_leads(*)')
      .in('stage', ['new', 'draft_ready'])
      .in('priority', ['high', 'medium', 'low'])
      .order('opportunity_score', { ascending: false })
      .limit(state.max_drafts_per_cycle || 20);

    let drafted = 0;
    let autoSent = 0;
    for (const opp of (draftTargets || [])) {
      const { data: freshState } = await supabase.from('engine_state').select('is_running').eq('id', 1).single();
      if (!freshState?.is_running) break;

      const lead = opp.outreach_leads;
      if (!lead?.email && !lead?.phone) continue;
      if (lead.crm_sync_status === 'duplicate') continue;
      if (lead.status === 'unsubscribed' || lead.status === 'contacted' || lead.status === 'converted' || lead.status === 'bounced' || lead.status === 'responded') continue;

      const { count } = await supabase
        .from('outreach_messages')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', opp.lead_id)
        .in('status', ['draft', 'approved', 'sent']);
      if (count && count > 0) continue;

      const result = await draftMessageWithAI(lead, opp.recommended_channel || 'email', 1);
      if (!result) break;
      {
        const isInvestor = lead.type === 'investor';
        const shouldAutoSend = state.auto_send && !isInvestor;
        const msgStatus = shouldAutoSend ? 'approved' : 'draft';

        const useVariantB = drafted % 2 === 1 && result.subjectB;
        const chosenSubject = useVariantB ? result.subjectB : result.subject;

        const { data: inserted } = await supabase.from('outreach_messages').insert({
          lead_id: opp.lead_id,
          channel: opp.recommended_channel || 'email',
          subject: chosenSubject,
          body: result.body,
          status: msgStatus,
          metadata: result.subjectB ? {
            ab_variant: useVariantB ? 'B' : 'A',
            subject_a: result.subject,
            subject_b: result.subjectB
          } : null
        }).select('id').single();

        await supabase.from('opportunity_pipeline')
          .update({ stage: 'message_queued', last_action_at: new Date().toISOString() })
          .eq('lead_id', opp.lead_id);
        drafted++;

        if (shouldAutoSend && inserted) {
          const sendResult = await sendMessage(supabase, inserted.id);
          if (sendResult.success) {
            autoSent++;
            await supabase.from('outreach_activity_log').insert({
              lead_id: opp.lead_id,
              message_id: inserted.id,
              event_type: 'auto_sent',
              metadata: { channel: opp.recommended_channel || 'email', lead_type: lead.type }
            });
          }
        }
      }
    }

    results.drafted = drafted;
    results.auto_sent = autoSent;

    // Flush approved queue — pick up any messages stuck in 'approved' status
    // (e.g. from previous cycles where sendMessage failed) and retry them.
    let queueFlushed = 0;
    let queueErrors = 0;
    if (state.auto_send) {
      try {
        const { data: approvedMsgs } = await supabase
          .from('outreach_messages')
          .select('id')
          .eq('status', 'approved')
          .order('created_at', { ascending: true })
          .limit(15);

        for (const msg of (approvedMsgs || [])) {
          try {
            const sr = await sendMessage(supabase, msg.id);
            if (sr.success) {
              queueFlushed++;
              console.log(`[OutreachEngine] Queue flush: sent message ${msg.id}`);
            } else {
              queueErrors++;
              console.log(`[OutreachEngine] Queue flush: skipped message ${msg.id} — ${sr.error}`);
              if (sr.error && sr.error.includes('Daily send limit')) break;
            }
          } catch (sendErr) {
            queueErrors++;
            console.error(`[OutreachEngine] Queue flush error for ${msg.id}:`, sendErr.message);
          }
          // Small pause between sends to avoid rate-limiting Resend
          await new Promise(r => setTimeout(r, 600));
        }
      } catch (flushErr) {
        console.error('[OutreachEngine] Queue flush step failed:', flushErr.message);
      }
    }
    results.queue_flushed = queueFlushed;
    results.queue_errors = queueErrors;

    await supabase.from('engine_state').update({
      last_draft_run: now.toISOString(),
      total_messages_drafted: (state.total_messages_drafted || 0) + drafted,
      total_messages_sent: (state.total_messages_sent || 0) + autoSent + queueFlushed,
      updated_at: now.toISOString()
    }).eq('id', 1);

    // Run AI decision layer after each outreach cycle
    try {
      const aiDecision = await runOutreachAiDecisionLayer(supabase);
      if (aiDecision) results.ai_decision = aiDecision;
    } catch (aiErr) {
      console.error('[OutreachEngine] AI decision layer error in cycle:', aiErr.message);
    }

    console.log('[OutreachEngine] Cycle complete:', JSON.stringify(results));
    return { success: true, ...results };
  } catch (err) {
    console.error('[OutreachEngine] Cycle error:', err.message);
    return { error: err.message };
  }
}

// ========== AI DECISION LAYER ==========
async function getAiOpsSettings(supabase) {
  const threshold = parseFloat(process.env.AI_CONFIDENCE_THRESHOLD || '1.0');
  const maxRefund = parseFloat(process.env.AI_MAX_AUTO_REFUND || '500');
  try {
    const { data: rows } = await supabase.from('ai_ops_settings').select('key,value');
    if (rows) {
      const settings = {};
      for (const r of rows) {
        if (r.key === 'confidence_threshold') settings.threshold = parseFloat(r.value);
        if (r.key === 'max_auto_refund') settings.maxRefund = parseFloat(r.value);
      }
      return { threshold: settings.threshold ?? threshold, maxRefund: settings.maxRefund ?? maxRefund };
    }
  } catch {}
  return { threshold, maxRefund };
}

async function sendOutreachSMS(toPhone, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from || !toPhone) return false;
  try {
    const clean = toPhone.replace(/\D/g, '');
    const to = clean.startsWith('1') ? `+${clean}` : `+1${clean}`;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const form = new URLSearchParams({ To: to, From: from, Body: body });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    return r.ok;
  } catch { return false; }
}

async function runOutreachAiDecisionLayer(supabase) {
  const { threshold } = await getAiOpsSettings(supabase);
  const shadowMode = threshold >= 1.0;

  const staleThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const inactiveThreshold = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { count: activeProviders } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'provider').eq('is_active', true);
  const { count: staleApplications } = await supabase.from('outreach_leads').select('id', { count: 'exact', head: true }).eq('type', 'provider').eq('status', 'new').lt('created_at', staleThreshold);
  const { count: inactiveProviders } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'provider').lt('updated_at', inactiveThreshold);

  const pipelineStats = { active_providers: activeProviders || 0, stale_applications: staleApplications || 0, inactive_providers: inactiveProviders || 0, pipeline_target: 5 };

  const prompt = `You are the AI Ops Outreach Coordinator for My Car Concierge.
PIPELINE STATS: active_providers=${pipelineStats.active_providers} stale_applications=${pipelineStats.stale_applications} inactive_providers=${pipelineStats.inactive_providers} target=5
Respond ONLY with valid JSON: {"provider_actions":["follow_up_sms"|"re_engagement"|"enroll_sequence"|"pipeline_alert"],"confidence":0.0-1.0,"priority":"high"|"medium"|"low","reasoning":"one sentence","sms_message":"brief SMS text (required if follow_up_sms or re_engagement)"}
Rules: pipeline_alert if active<3; follow_up_sms if stale>5; re_engagement if inactive>10; enroll_sequence if stale>0 and active<5; empty array if no issues.`;

  const response = await callAI(prompt, 512);
  let decision;
  try { const m = response.text.match(/\{[\s\S]*\}/); decision = JSON.parse(m ? m[0] : response.text); }
  catch { return null; }

  const actions = decision.provider_actions || [];
  const aiConfidence = decision.confidence || 0.8;
  const executedActions = [];
  const shadowedActions = [];

  for (const action of actions) {
    if (shadowMode) { shadowedActions.push(action); continue; }

    if (action === 'pipeline_alert') {
      await supabase.from('ai_escalations').insert({ module: 'outreach_engine', target_id: 'provider_pipeline', recommendation: { action, stats: pipelineStats, reasoning: decision.reasoning }, confidence: aiConfidence, status: 'pending', created_at: new Date().toISOString() });
      executedActions.push('pipeline_alert_escalated');
    }

    if ((action === 'follow_up_sms' || action === 're_engagement') && decision.sms_message) {
      let leadsQuery = supabase.from('outreach_leads').select('id, name, phone').eq('type', 'provider').not('phone', 'is', null).limit(10);
      if (action === 'follow_up_sms') { leadsQuery = leadsQuery.eq('status', 'new').lt('created_at', staleThreshold); }
      else { leadsQuery = leadsQuery.in('status', ['contacted', 'responded']); }
      const { data: leads } = await leadsQuery;
      let smsSent = 0;
      for (const lead of (leads || [])) {
        if (lead.phone && await sendOutreachSMS(lead.phone, `${decision.sms_message} Reply STOP to opt out.`)) smsSent++;
      }
      executedActions.push(`${action}:sms_sent=${smsSent}`);
    }

    if (action === 'enroll_sequence') {
      const { data: staleLeads } = await supabase.from('outreach_leads').select('id, name, email, location').eq('type', 'provider').eq('status', 'new').lt('created_at', staleThreshold).not('email', 'is', null).limit(20);
      const instantlyKey = process.env.INSTANTLY_API_KEY;
      let enrolled = 0;
      if (instantlyKey && staleLeads) {
        for (const lead of staleLeads) {
          if (!lead.email) continue;
          try {
            await fetch('https://api.instantly.ai/api/v2/leads', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${instantlyKey}` }, body: JSON.stringify({ email: lead.email, first_name: lead.name, personalization: `Provider opportunity in ${lead.location || 'your area'}` }) });
            enrolled++;
          } catch {}
        }
      }
      executedActions.push(`enroll_sequence:enrolled=${enrolled}`);
    }
  }

  const outcome = shadowMode ? 'shadow_logged' : (executedActions.length > 0 ? 'executed' : 'no_action');
  await supabase.from('ai_action_log').insert({ module: 'outreach_engine', action_type: 'ai_decision_layer', target_id: 'pipeline', decision: { ...decision, stats: pipelineStats, executed: executedActions, shadowed: shadowedActions }, confidence: aiConfidence, auto_executed: !shadowMode && executedActions.length > 0, escalated: actions.includes('pipeline_alert'), outcome, execution_time_ms: 0, created_at: new Date().toISOString() }).catch(() => {});

  console.log(`[OutreachEngine] AI decision layer (shadow=${shadowMode}):`, decision.reasoning, '| Actions:', (shadowMode ? shadowedActions : executedActions).join(', ') || 'none');
  return { actions: shadowMode ? shadowedActions : executedActions, reasoning: decision.reasoning, priority: decision.priority, shadow_mode: shadowMode };
}

async function runFollowUpDrafts(supabase) {
  try {
    const { data: state } = await supabase.from('engine_state').select('*').eq('id', 1).single();
    if (!state?.is_running) return { skipped: true };
    if (state.auto_send === undefined) state.auto_send = true;

    const { data: step2Candidates } = await supabase.rpc('get_followup_candidates');

    const { data: step3Candidates } = await supabase
      .from('outreach_leads')
      .select('id, name, email, phone, type, outreach_messages!inner(channel, sequence_step, sent_at, opened_at)')
      .eq('status', 'contacted')
      .eq('outreach_messages.status', 'sent')
      .eq('outreach_messages.sequence_step', 2)
      .is('outreach_messages.opened_at', null)
      .lt('outreach_messages.sent_at', new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString());

    const step3Filtered = [];
    for (const lead of (step3Candidates || [])) {
      const { data: respondedCheck } = await supabase
        .from('opportunity_pipeline')
        .select('stage')
        .eq('lead_id', lead.id)
        .eq('stage', 'responded')
        .maybeSingle();
      if (respondedCheck) continue;

      const { count } = await supabase
        .from('outreach_messages')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', lead.id)
        .eq('sequence_step', 3);
      if (!count || count === 0) {
        const msg = Array.isArray(lead.outreach_messages) ? lead.outreach_messages[0] : lead.outreach_messages;
        step3Filtered.push({ ...lead, last_channel: msg?.channel || 'email', next_step: 3 });
      }
    }

    const allCandidates = [
      ...(step2Candidates || []).map(c => ({ ...c, next_step: 2 })),
      ...step3Filtered
    ];

    let drafted = 0;
    let autoSent = 0;

    for (const lead of allCandidates) {
      const step = lead.next_step;
      const isInvestor = lead.type === 'investor';
      const shouldAutoSend = state.auto_send && !isInvestor;
      const msgStatus = shouldAutoSend ? 'approved' : 'draft';

      const result = await draftMessageWithAI(lead, lead.last_channel || 'email', step);
      if (result) {
        const { data: inserted } = await supabase.from('outreach_messages').insert({
          lead_id: lead.id,
          channel: lead.last_channel || 'email',
          sequence_step: step,
          subject: result.subject,
          body: result.body,
          status: msgStatus
        }).select('id').single();
        drafted++;

        if (shouldAutoSend && inserted) {
          const sendResult = await sendMessage(supabase, inserted.id);
          if (sendResult.success) {
            autoSent++;
            await supabase.from('outreach_activity_log').insert({
              lead_id: lead.id,
              message_id: inserted.id,
              event_type: 'auto_sent',
              metadata: { channel: lead.last_channel || 'email', lead_type: lead.type, sequence_step: step }
            });
          }
        }
      }
    }

    return { drafted, auto_sent: autoSent, step2: (step2Candidates || []).length, step3: step3Filtered.length };
  } catch (err) {
    console.error('[OutreachEngine] Follow-up draft error:', err.message);
    return { error: err.message };
  }
}

async function runPipelineCleanup(supabase) {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('opportunity_pipeline')
      .update({ stage: 'dead' })
      .in('stage', ['new', 'draft_ready', 'message_queued'])
      .lt('added_at', thirtyDaysAgo)
      .select('id');

    return { cleaned: data?.length || 0, error };
  } catch (err) {
    return { error: err.message };
  }
}

async function pushLeadsToInstantly(supabase, leads, campaignId) {
  const apiKey = process.env.INSTANTLY_API_KEY;
  if (!apiKey) return { error: 'INSTANTLY_API_KEY not configured', synced: 0 };

  const validLeads = (leads || []).filter(l => l.email && !l.metadata?.instantly_synced);
  if (validLeads.length === 0) return { synced: 0, skipped: leads?.length || 0 };

  const batchSize = 100;
  let totalSynced = 0;
  let errors = [];

  for (let i = 0; i < validLeads.length; i += batchSize) {
    const batch = validLeads.slice(i, i + batchSize);
    const instantlyLeads = batch.map(lead => {
      const nameParts = (lead.name || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      return {
        email: lead.email,
        first_name: firstName,
        last_name: lastName,
        company_name: lead.company || lead.name || '',
        website: lead.website || '',
        custom_variables: {
          lead_type: lead.type || '',
          source: lead.source || '',
          score: String(lead.score || ''),
          location: lead.location || '',
          mcc_lead_id: lead.id,
          search_category: lead.metadata?.search_category || ''
        }
      };
    });

    const body = { leads: instantlyLeads };
    if (campaignId) body.campaign_id = campaignId;

    try {
      const res = await fetch('https://api.instantly.ai/api/v2/leads/bulk-add', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errText = await res.text();
        errors.push(`Batch ${i / batchSize + 1}: ${res.status} - ${errText}`);
        continue;
      }

      const result = await res.json();
      totalSynced += batch.length;

      for (const lead of batch) {
        const existingMeta = lead.metadata || {};
        await supabase.from('outreach_leads').update({
          metadata: { ...existingMeta, instantly_synced: true, instantly_synced_at: new Date().toISOString(), instantly_campaign_id: campaignId || null }
        }).eq('id', lead.id);
      }
    } catch (err) {
      errors.push(`Batch ${i / batchSize + 1}: ${err.message}`);
    }
  }

  return { synced: totalSynced, total: validLeads.length, errors: errors.length > 0 ? errors : undefined };
}

async function generateSocialCalendar(weekStartDate) {
  const themes = [
    { day: 'Monday', theme: 'Tips & Maintenance Advice' },
    { day: 'Tuesday', theme: 'Testimonials & Social Proof' },
    { day: 'Wednesday', theme: 'Provider Spotlight' },
    { day: 'Thursday', theme: 'Industry News & Trends' },
    { day: 'Friday', theme: 'Fun Car Facts & Trivia' },
    { day: 'Saturday', theme: 'Weekend Deals & CTAs' },
    { day: 'Sunday', theme: 'Community Engagement' }
  ];

  const prompt = `${BRAND_INFO}

You are the social media manager for My Car Concierge. Generate a full week of social media content starting from ${weekStartDate || 'this coming Monday'}.

Create content for all 7 days with these daily themes:
${themes.map(t => `- ${t.day}: ${t.theme}`).join('\n')}

For EACH day, create 4 platform-specific posts:
1. X (formerly Twitter): Max 280 characters, 2-3 hashtags, punchy and engaging
2. Facebook: Conversational tone, include a clear CTA to visit mycarconcierge.com, 3-5 hashtags
3. Instagram: Storytelling format, 10-15 hashtags, use emojis naturally, engaging caption
4. LinkedIn: Professional thought leadership tone, 3-5 hashtags, industry-focused

IMPORTANT RULES:
- Always use "My Car Concierge" in full — NEVER abbreviate
- CTA should always direct to mycarconcierge.com
- Make content feel authentic, not corporate
- Reference real automotive topics and seasonal relevance
- Vary the tone and approach across platforms

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{"days":[{"day":"Monday","theme":"Tips & Maintenance Advice","posts":{"x":"tweet text here","facebook":"facebook post here","instagram":"instagram caption here","linkedin":"linkedin post here"}},{"day":"Tuesday","theme":"Testimonials & Social Proof","posts":{"x":"...","facebook":"...","instagram":"...","linkedin":"..."}}]}

Include all 7 days with all 4 platforms each.`;

  const response = await callAI(prompt, 6000);
  try {
    const text = typeof response === 'object' ? (response.text || '') : String(response);
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    return { raw: typeof response === 'object' ? response.text : response, parse_error: e.message };
  }
}

async function generateSocialProof(supabase) {
  const { count: providerCount } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'provider');
  const { count: memberCount } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'member');
  const { count: leadCount } = await supabase.from('outreach_leads').select('id', { count: 'exact', head: true });
  const { count: messageSentCount } = await supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('status', 'sent');
  const { data: engineState } = await supabase.from('engine_state').select('target_cities').eq('id', 1).single();
  const citiesCount = engineState?.target_cities?.length || 0;

  const stats = {
    providers: providerCount || 0,
    members: memberCount || 0,
    leads_discovered: leadCount || 0,
    messages_sent: messageSentCount || 0,
    cities_served: citiesCount
  };

  const prompt = `${BRAND_INFO}

You are the social media manager for My Car Concierge. Generate social proof content based on these REAL platform metrics:

- Service Providers on Platform: ${stats.providers}
- Members on Platform: ${stats.members}
- Business Leads Discovered: ${stats.leads_discovered}
- Outreach Messages Sent: ${stats.messages_sent}
- Cities Covered: ${stats.cities_served}

Create compelling social proof content in these categories:
1. Milestone/Growth Post — celebrate the numbers and momentum
2. Community Highlight — spotlight the growing network
3. "Join the Movement" CTA — urgency and FOMO to join now
4. Founder Story Update — share the journey and vision

For EACH category, create posts for:
- X (280 chars max, 2-3 hashtags)
- Facebook (conversational, CTA to mycarconcierge.com, 3-5 hashtags)
- Instagram (storytelling, 10-15 hashtags, emojis)
- LinkedIn (professional, 3-5 hashtags)
- Email Signature snippet (1-2 lines for email footers)

IMPORTANT:
- Always use "My Car Concierge" in full — NEVER abbreviate
- Use the real numbers provided — do not inflate or fabricate
- If numbers are small, frame them positively (early stage, founding community, ground floor)
- CTA should always direct to mycarconcierge.com

Return ONLY valid JSON (no markdown, no code blocks):
{"stats":${JSON.stringify(stats)},"content":[{"category":"Milestone/Growth Post","posts":{"x":"...","facebook":"...","instagram":"...","linkedin":"...","email_signature":"..."}},{"category":"Community Highlight","posts":{"x":"...","facebook":"...","instagram":"...","linkedin":"...","email_signature":"..."}}]}

Include all 4 categories.`;

  const response = await callAI(prompt, 5000);
  try {
    const text = typeof response === 'object' ? (response.text || '') : String(response);
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    return { stats, raw: typeof response === 'object' ? response.text : response, parse_error: e.message };
  }
}

function createSupabaseClient() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getAdminNotificationPhone(supabase) {
  try {
    const { data } = await supabase.from('engine_state').select('metadata').eq('id', 1).single();
    return data?.metadata?.admin_notification_phone || null;
  } catch (_) { return null; }
}

async function sendAdminSMS(supabase, message) {
  try {
    const phone = await getAdminNotificationPhone(supabase);
    if (!phone) return false;
    const ok = await sendOutreachSMS(phone, message);
    if (ok) console.log('[AdminSMS] Notification sent to admin phone');
    else console.warn('[AdminSMS] Failed to send notification (Twilio error)');
    return ok;
  } catch (err) {
    console.warn('[AdminSMS] Error:', err.message);
    return false;
  }
}

const DEFAULT_APOLLO_CONFIG = {
  enabled: false,
  interval_hours: 6,
  per_page: 25,
  auto_enrich: true,
  enrich_batch: 15,
  profile_rotation_index: 0,
  city_rotation_index: 0,
  page_rotation_index: 1,
  last_run: null,
  search_profiles: [
    {
      name: 'Providers',
      lead_type: 'provider',
      cities: [
        'Newark, NJ', 'Jersey City, NJ', 'East Rutherford, NJ', 'Paterson, NJ', 'Trenton, NJ',
        'New York, NY', 'Brooklyn, NY', 'Queens, NY', 'Bronx, NY', 'Staten Island, NY',
        'Philadelphia, PA', 'Stamford, CT', 'Bridgeport, CT', 'Hartford, CT',
        'Edison, NJ', 'Hoboken, NJ', 'Elizabeth, NJ', 'Woodbridge, NJ', 'Hackensack, NJ',
        'Long Island City, NY', 'White Plains, NY', 'Yonkers, NY'
      ],
      titles: ['owner', 'co-owner', 'founder', 'president', 'ceo', 'managing partner', 'general manager', 'operator', 'proprietor', 'shop foreman', 'service manager'],
      industries: ['auto repair', 'automotive', 'car repair', 'auto body', 'tire shop', 'oil change', 'vehicle maintenance', 'collision repair', 'auto detailing', 'car wash']
    },
    {
      name: 'Angel Investors',
      lead_type: 'investor',
      cities: [
        'New York, NY', 'Brooklyn, NY', 'Hoboken, NJ', 'Princeton, NJ', 'Short Hills, NJ',
        'San Francisco, CA', 'Palo Alto, CA', 'Menlo Park, CA', 'San Jose, CA',
        'Boston, MA', 'Cambridge, MA',
        'Austin, TX', 'Chicago, IL', 'Miami, FL', 'Los Angeles, CA',
        'Atlanta, GA', 'Seattle, WA', 'Denver, CO', 'Nashville, TN'
      ],
      titles: [
        'angel investor', 'active investor', 'general partner', 'managing partner', 'venture partner',
        'principal', 'investment director', 'managing director', 'chief investment officer',
        'portfolio manager', 'fund manager', 'founder', 'co-founder', 'partner',
        'limited partner', 'family office', 'startup advisor', 'board member'
      ],
      industries: [
        'venture capital', 'private equity', 'investment management', 'financial services',
        'angel investing', 'family office', 'startup', 'automotive', 'marketplace',
        'mobile applications', 'consumer technology', 'on-demand services'
      ]
    }
  ]
};

async function getApolloConfig(supabase) {
  try {
    const { data } = await supabase.from('engine_state').select('metadata').eq('id', 1).single();
    const cfg = data?.metadata?.apollo_config || {};
    return { ...DEFAULT_APOLLO_CONFIG, ...cfg };
  } catch (_) {
    return DEFAULT_APOLLO_CONFIG;
  }
}

async function saveApolloConfig(supabase, updates) {
  try {
    const { data } = await supabase.from('engine_state').select('metadata').eq('id', 1).single();
    const currentMeta = data?.metadata || {};
    const currentCfg = currentMeta.apollo_config || {};
    const newCfg = { ...DEFAULT_APOLLO_CONFIG, ...currentCfg, ...updates, last_saved: new Date().toISOString() };
    await supabase.from('engine_state').update({ metadata: { ...currentMeta, apollo_config: newCfg } }).eq('id', 1);
    return newCfg;
  } catch (err) {
    throw new Error('Failed to save Apollo config: ' + err.message);
  }
}

async function draftWefunderBlastEmail(lead) {
  const firstName = lead.name?.split(' ')[0] || 'there';
  const companyCtx = lead.company ? ` at ${lead.company}` : '';
  const wefunderUrl = `wefunder.com/my.car.concierge?utm_source=email&utm_medium=outreach&utm_campaign=apollo_blast&utm_content=${lead.id}`;
  const prompt = `You are writing a cold outreach email on behalf of My Car Concierge to ${firstName}${companyCtx} — a potential angel investor or financial professional.

${BRAND_INFO}

My Car Concierge has an active community fundraising campaign live on Wefunder at ${wefunderUrl} — open to everyday investors and professionals alike.

Write a short, direct, warm email introducing My Car Concierge and pointing them to the Wefunder campaign. Keep it to 3–4 short paragraphs:
1. A brief personalized intro (use their first name; reference their company if available)
2. What My Car Concierge actually is and what problem it solves for car owners and service providers
3. That there is an active community funding round on Wefunder they can review at their own pace
4. A clear, soft CTA — check it out at ${wefunderUrl}, and offer to answer any questions

STRICT RULES:
- Do NOT make ROI promises, earnings projections, or guaranteed return claims
- Do NOT imply that investors have already committed funds — you do not know this
- Stick only to factual descriptions of what the platform does
- Be concise and respectful — this is an introduction, not a pitch deck
- Write as Jordan from My Car Concierge
- Sign off warmly

Write TWO subject line variants on the first two lines:
Subject A: [subject]
Subject B: [subject]
Then a blank line, then the email body starting with "Hi ${firstName},"`;

  try {
    const anthropic = getAnthropic();
    if (!anthropic) return { error: 'AI not configured' };

    const resp = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = resp.content[0]?.text || '';

    const lines = text.trim().split('\n');
    let subject = '', subjectB = '', bodyLines = [], pastHeaders = false;
    for (const line of lines) {
      if (!pastHeaders && line.startsWith('Subject A:')) {
        subject = line.replace('Subject A:', '').trim();
      } else if (!pastHeaders && line.startsWith('Subject B:')) {
        subjectB = line.replace('Subject B:', '').trim();
      } else if (subject && subjectB && line.trim() === '') {
        pastHeaders = true;
      } else if (pastHeaders || (subject && line.trim() !== '')) {
        pastHeaders = true;
        bodyLines.push(line);
      }
    }

    const body = bodyLines.join('\n').trim();
    const urlPattern = /wefunder\.com\/my\.car\.concierge(?!\?)/g;
    const finalBody = body.replace(urlPattern, wefunderUrl);
    const finalSubject = (subject || 'My Car Concierge — Community Round Now Live on Wefunder').replace(urlPattern, wefunderUrl);
    const finalSubjectB = subjectB ? subjectB.replace(urlPattern, wefunderUrl) : null;

    return {
      subject: finalSubject,
      subjectB: finalSubjectB,
      body: finalBody
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function runWefunderBlastForEligible(supabase, { notify = true } = {}) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600000).toISOString();

  const { data: investorLeads } = await supabase
    .from('outreach_leads')
    .select('*')
    .eq('type', 'investor')
    .not('email', 'is', null)
    .neq('status', 'unsubscribed');

  const ids = (investorLeads || []).map(l => l.id);
  let recentLeadIds = new Set();
  if (ids.length > 0) {
    const { data: recent } = await supabase
      .from('outreach_messages')
      .select('lead_id')
      .eq('channel', 'email')
      .gte('created_at', thirtyDaysAgo)
      .in('lead_id', ids);
    recentLeadIds = new Set((recent || []).map(m => m.lead_id));
  }

  const eligible = (investorLeads || []).filter(l => !recentLeadIds.has(l.id));
  if (eligible.length === 0) return { drafted: 0, failed: 0, skipped: recentLeadIds.size, total: ids.length };

  let drafted = 0, failed = 0;
  for (const lead of eligible) {
    try {
      const result = await draftWefunderBlastEmail(lead);
      if (!result || result.error) { failed++; continue; }
      await supabase.from('outreach_messages').insert({
        lead_id: lead.id,
        channel: 'email',
        subject: result.subject,
        body: result.body,
        status: 'draft',
        metadata: {
          blast_type: 'wefunder',
          subject_a: result.subject,
          subject_b: result.subjectB || null,
          ab_variant: 'A',
          auto_drafted: true
        }
      });
      drafted++;
    } catch (_) { failed++; }
    await new Promise(r => setTimeout(r, 350));
  }

  if (notify && drafted > 0) {
    try {
      await sendAdminSMS(supabase, `MCC Weekly Blast: ${drafted} new Wefunder draft${drafted !== 1 ? 's' : ''} queued for ${eligible.length} eligible investor leads. Review & approve in the admin Messages tab.`);
    } catch (_) {}
  }

  console.log(`[Wefunder] Blast run complete — drafted:${drafted} failed:${failed} eligible:${eligible.length}`);
  return { drafted, failed, skipped: recentLeadIds.size, total: ids.length };
}

async function runApolloDiscoveryCycle(supabase) {
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) return { skipped: true, reason: 'no_api_key' };

  const cfg = await getApolloConfig(supabase);
  if (!cfg.enabled) return { skipped: true, reason: 'automation_disabled' };

  const now = new Date();
  const lastRun = cfg.last_run ? new Date(cfg.last_run) : null;
  const hoursSinceLast = lastRun ? (now - lastRun) / 3600000 : Infinity;
  if (hoursSinceLast < cfg.interval_hours) {
    return { skipped: true, reason: 'not_due', next_run_in_hours: (cfg.interval_hours - hoursSinceLast).toFixed(1) };
  }

  console.log('[Apollo] Starting automated discovery cycle...');
  const results = { started_at: now.toISOString(), search_results: 0, with_email: 0, added: 0, enriched: 0, wefunder_drafted: 0, errors: [] };

  const apolloHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': apolloKey };

  try {
    const profiles = cfg.search_profiles || DEFAULT_APOLLO_CONFIG.search_profiles;
    const profileIdx = (cfg.profile_rotation_index || 0) % profiles.length;
    const profile = profiles[profileIdx];
    const leadType = profile.lead_type || 'provider';

    const cities = profile.cities;
    const cityIdx = (cfg.city_rotation_index || 0) % cities.length;
    const city = cities[cityIdx];
    const page = cfg.page_rotation_index || 1;

    console.log(`[Apollo] Profile "${profile.name}" — city "${city}" page ${page}...`);

    const searchPayload = {
      page,
      per_page: Math.min(cfg.per_page || 25, 100),
      person_titles: profile.titles,
      q_organization_keyword_tags: profile.industries,
      person_locations: [city]
    };

    const searchResp = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
      method: 'POST', headers: apolloHeaders, body: JSON.stringify(searchPayload)
    });
    const searchData = await searchResp.json();
    const people = searchData.people || [];

    results.search_results = people.length;
    results.profile = profile.name;
    console.log(`[Apollo] Found ${people.length} ${leadType} contacts in "${city}"`);

    const totalPages = Math.ceil((searchData.pagination?.total_entries || 25) / (cfg.per_page || 25));
    const nextPage = page >= totalPages ? 1 : page + 1;
    const nextCityIdx = nextPage === 1 ? (cityIdx + 1) % cities.length : cityIdx;
    const nextProfileIdx = nextPage === 1 && nextCityIdx === 0 ? (profileIdx + 1) % profiles.length : profileIdx;

    for (const person of people) {
      try {
        const email = person.email || null;
        const phone = person.phone_numbers?.[0]?.sanitized_number || null;
        const org = person.organization || {};
        const name = person.name || `${person.first_name || ''} ${person.last_name || ''}`.trim() || null;
        const website = org.website_url || null;
        const domain = website ? website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null;
        const apolloPersonId = person.id || null;
        const metadata = { title: person.title, industry: org.industry, apollo_org_id: org.id, domain, apollo_id: apolloPersonId, apollo_profile: profile.name };

        const baseScore = leadType === 'investor' ? (email ? 85 : 40) : (email ? 72 : 32);

        const leadData = {
          name: name || org.name || 'Unknown',
          email: email || null,
          phone: phone || org.phone || null,
          company: org.name || null,
          type: leadType,
          source: 'Apollo',
          location: city,
          status: email ? 'new' : 'email_unknown',
          score: baseScore,
          apollo_id: apolloPersonId || null,
          linkedin_url: person.linkedin_url || null,
          website: website || null,
          metadata
        };

        let existing = null;
        if (apolloPersonId) {
          const { data: byId } = await supabase.from('outreach_leads').select('id,email').eq('apollo_id', apolloPersonId).maybeSingle();
          existing = byId;
        }
        if (!existing && email) {
          const { data: byEmail } = await supabase.from('outreach_leads').select('id,email').eq('email', email).maybeSingle();
          existing = byEmail;
        }

        if (!existing) {
          const { data: inserted } = await supabase.from('outreach_leads').insert(leadData).select('id').single();
          results.added++;
          if (email) {
            results.with_email++;
            if (leadType === 'investor' && inserted?.id) {
              try {
                const { count: existingDraft } = await supabase
                  .from('outreach_messages')
                  .select('id', { count: 'exact', head: true })
                  .eq('lead_id', inserted.id)
                  .eq('channel', 'email')
                  .in('status', ['draft', 'approved', 'sent'])
                  .filter('metadata->>blast_type', 'eq', 'wefunder');
                if (!existingDraft || existingDraft === 0) {
                  const draft = await draftWefunderBlastEmail({ ...leadData, id: inserted.id });
                  if (draft && !draft.error) {
                    await supabase.from('outreach_messages').insert({
                      lead_id: inserted.id,
                      channel: 'email',
                      subject: draft.subject,
                      body: draft.body,
                      status: 'draft',
                      metadata: { blast_type: 'wefunder', subject_a: draft.subject, subject_b: draft.subjectB || null, ab_variant: 'A', auto_drafted: true }
                    });
                    results.wefunder_drafted++;
                  }
                }
              } catch (_) {}
              await new Promise(r => setTimeout(r, 350));
            }
          }
        } else if (email && !existing.email) {
          await supabase.from('outreach_leads').update({ email, apollo_id: apolloPersonId || undefined, status: 'new', score: 72 }).eq('id', existing.id);
          results.with_email++;
        }
      } catch (personErr) {
        results.errors.push(personErr.message);
      }
    }

    if (cfg.auto_enrich) {
      console.log('[Apollo] Running enrichment on email-less leads...');
      const { data: toEnrich } = await supabase
        .from('outreach_leads')
        .select('id, name, email, company, website, phone, location, linkedin_url, metadata')
        .is('email', null)
        .not('company', 'is', null)
        .neq('status', 'unsubscribed')
        .neq('status', 'bounced')
        .order('score', { ascending: false })
        .limit(cfg.enrich_batch || 15);

      for (const lead of (toEnrich || [])) {
        try {
          const domain = lead.website ? lead.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null;
          const ap = lead.metadata?.apollo_id;
          const enrichPayload = { reveal_personal_emails: true };
          if (ap) enrichPayload.id = ap;
          if (lead.name) enrichPayload.name = lead.name;
          if (lead.company) enrichPayload.organization_name = lead.company;
          if (domain) enrichPayload.domain = domain;
          if (lead.linkedin_url) enrichPayload.linkedin_url = lead.linkedin_url;

          const er = await fetch('https://api.apollo.io/api/v1/people/match', {
            method: 'POST', headers: apolloHeaders, body: JSON.stringify(enrichPayload)
          });
          if (er.ok) {
            const ed = await er.json();
            const foundEmail = ed.person?.email;
            const foundPhone = ed.person?.phone_numbers?.[0]?.sanitized_number;
            if (foundEmail) {
              await supabase.from('outreach_leads').update({ email: foundEmail, phone: foundPhone || lead.phone, status: 'new', score: 75 }).eq('id', lead.id);
              results.enriched++;
            }
          }
          await new Promise(r => setTimeout(r, 250));
        } catch (_) {}
      }
    }

    await saveApolloConfig(supabase, { last_run: now.toISOString(), city_rotation_index: nextCityIdx, page_rotation_index: nextPage, profile_rotation_index: nextProfileIdx });

    try {
      await supabase.from('outreach_activity_log').insert({ event_type: 'apollo_discovery_cycle', metadata: { city, page, ...results } });
    } catch (_) {}

    console.log(`[Apollo] Cycle complete — found:${results.search_results} added:${results.added} enriched:${results.enriched} wefunder_drafted:${results.wefunder_drafted}`);

    try {
      const newInvestors = leadType === 'investor' ? results.added : 0;
      const newProviders = leadType === 'provider' ? results.added : 0;
      const parts = [
        `MCC Outreach (${profile.name} · ${city}):`,
        `+${newInvestors} investor${newInvestors !== 1 ? 's' : ''}`,
        `+${newProviders} provider${newProviders !== 1 ? 's' : ''}`
      ];
      if (results.enriched > 0) parts.push(`${results.enriched} enriched`);
      if (results.wefunder_drafted > 0) parts.push(`⚡ ${results.wefunder_drafted} Wefunder draft${results.wefunder_drafted !== 1 ? 's' : ''} queued`);
      if (results.added === 0 && results.enriched === 0) parts.push('no new leads this cycle');
      await sendAdminSMS(supabase, parts.join(' | '));
    } catch (_) {}

    return { success: true, city, page, ...results };

  } catch (err) {
    console.error('[Apollo] Discovery cycle error:', err.message);
    try { await supabase.from('outreach_activity_log').insert({ event_type: 'apollo_discovery_error', metadata: { error: err.message } }); } catch (_) {}
    return { success: false, error: err.message };
  }
}

module.exports = {
  createSupabaseClient,
  initEngineState,
  checkSchemaExists,
  runEngineCycle,
  runFollowUpDrafts,
  runPipelineCleanup,
  enrichAllLeads,
  sendMessage,
  draftMessageWithAI,
  scoreLeadsWithAI,
  syncReengagementLeads,
  importProviderLeadsFromPlaces,
  importMemberLeadsFromPlaces,
  discoverCarOwnerCommunities,
  checkDailySendLimit,
  getWarmupLimit,
  pushLeadsToInstantly,
  generateSocialCalendar,
  generateSocialProof,
  callAI,
  aiCircuitBreaker,
  BRAND_INFO,
  PHYSICAL_ADDRESS,
  BASE_URL,
  UNSUBSCRIBE_URL,
  EMAIL_FOOTER,
  SMS_OPT_OUT,
  getAdminNotificationPhone,
  sendAdminSMS,
  DEFAULT_APOLLO_CONFIG,
  getApolloConfig,
  saveApolloConfig,
  draftWefunderBlastEmail,
  runWefunderBlastForEligible,
  runApolloDiscoveryCycle
};
