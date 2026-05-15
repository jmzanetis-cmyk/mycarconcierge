// ============================================================================
// provider-onboarding
//
// Task #235 — Server-side replacements for the post-application writes the
// browser was making directly against Supabase from www/signup-provider.js:
//
//   POST /api/provider/document         — provider_documents row (per upload)
//   POST /api/provider/external-review  — provider_external_reviews row
//   POST /api/provider/reference        — provider_references row
//   POST /api/provider/finalize         — promote profile to role='provider'
//
// Why this exists:
//   - The previous client-side inserts trusted RLS to keep one user from
//     attaching documents/reviews/references to ANOTHER user's application,
//     and trusted the browser to set free_trial_bids / is_founding_provider
//     / role on the profiles row at all. That same gap was already closed
//     for provider_applications in Task #127/#175 — this finishes the job.
//
// All four sub-routes:
//   1. Require a valid Supabase Bearer JWT; user_id always comes from the JWT.
//   2. For document/external-review/reference: verify the supplied
//      application_id actually belongs to the JWT user before inserting.
//   3. Validate field shapes/lengths and (for documents) MIME-type whitelist
//      and (for external reviews) URL host whitelist.
//   4. Finalize re-reads the user's most recent provider_applications row
//      to derive is_founding_provider/founding_agreement_id authoritatively
//      — the client cannot self-declare founding status here.
//
// Mounted at /.netlify/functions/provider-onboarding and reachable via
// www/_redirects:
//   /api/provider/document        → /.netlify/functions/provider-onboarding/document
//   /api/provider/external-review → /.netlify/functions/provider-onboarding/external-review
//   /api/provider/reference       → /.netlify/functions/provider-onboarding/reference
//   /api/provider/finalize        → /.netlify/functions/provider-onboarding/finalize
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

function getBearerToken(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function strLen(v, min, max) {
  return typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
}

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// Whitelisted document_type values. Mirrors what signup-provider.js sends
// (license/certs/portfolio normalised to business_license/certification/
// portfolio); 'insurance' is allowed because it's referenced by other
// provider flows that may eventually share this endpoint.
const ALLOWED_DOC_TYPES = new Set([
  'business_license', 'certification', 'portfolio', 'insurance'
]);

const ALLOWED_REVIEW_PLATFORMS = new Set(['google', 'yelp', 'facebook', 'bbb']);

// Mirrors the <select class="ref-relationship"> options in
// www/signup-provider.html. Plus a few defensive synonyms ('business_partner'
// alongside the form's 'partner', 'employee'/'vendor') in case future flows
// reuse this endpoint with slightly different copy.
const ALLOWED_RELATIONSHIPS = new Set([
  'customer', 'supplier', 'partner', 'other',
  'business_partner', 'employee', 'vendor', 'client', 'colleague'
]);

// Hosts we expect for each external-review platform. The user-supplied URL
// must parse and its host must end with one of these — defends against
// pasting arbitrary URLs into the platform-specific slot.
const PLATFORM_HOSTS = {
  google:   ['google.com', 'g.page', 'maps.google.com', 'maps.app.goo.gl'],
  yelp:     ['yelp.com', 'yelp.to'],
  facebook: ['facebook.com', 'fb.com', 'fb.me'],
  bbb:      ['bbb.org']
};

function isAllowedReviewUrl(platform, url) {
  if (typeof url !== 'string' || url.length > 2000) return false;
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  const allowed = PLATFORM_HOSTS[platform] || [];
  return allowed.some((h) => host === h || host.endsWith('.' + h));
}

// Verify the signed-in user owns the given application_id. The JWT user_id
// is always authoritative (we never trust a client-supplied user_id), so this
// is the line of defence between attaching docs to your own application and
// attaching them to someone else's.
async function _ownsApplication(supabase, appId, userId) {
  if (!isUuid(appId)) return false;
  const { data, error } = await supabase
    .from('provider_applications')
    .select('id, user_id')
    .eq('id', appId)
    .maybeSingle();
  if (error || !data) return false;
  return data.user_id === userId;
}

async function _authenticate(event) {
  const supabase = getServiceSupabase();
  if (!supabase) return { error: jsonResponse(500, { error: 'Database not configured' }) };
  const token = getBearerToken(event);
  if (!token) return { error: jsonResponse(401, { error: 'Authorization Bearer token required' }) };
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return { error: jsonResponse(401, { error: 'invalid or expired token' }) };
    return { supabase, user: data.user };
  } catch (e) {
    return { error: jsonResponse(401, { error: 'token validation failed' }) };
  }
}

function _parseBody(event) {
  if (!event.body) return {};
  try { return JSON.parse(event.body); } catch { return null; }
}

// --- POST /document --------------------------------------------------------
async function handleDocument(event, supabase, user) {
  const body = _parseBody(event);
  if (body === null) return jsonResponse(400, { error: 'invalid JSON body' });

  const errors = [];
  if (!isUuid(body.application_id))                    errors.push('application_id (uuid) required');
  if (typeof body.document_type !== 'string' ||
      !ALLOWED_DOC_TYPES.has(body.document_type))      errors.push(`document_type must be one of ${[...ALLOWED_DOC_TYPES].join(', ')}`);
  if (!strLen(body.document_name, 1, 255))             errors.push('document_name (1-255 chars) required');
  if (typeof body.file_url !== 'string' ||
      body.file_url.length === 0 ||
      body.file_url.length > 2000)                     errors.push('file_url (1-2000 chars) required');
  // The file_url should be a Supabase storage URL inside our project — defend
  // against the client posting arbitrary external URLs into our docs table.
  if (!errors.length) {
    try {
      const u = new URL(body.file_url);
      const supabaseHost = (() => { try { return new URL(process.env.SUPABASE_URL || '').hostname; } catch { return ''; } })();
      if (supabaseHost && u.hostname !== supabaseHost) {
        errors.push('file_url must be on the configured Supabase storage host');
      }
    } catch { errors.push('file_url must be a valid URL'); }
  }
  if (errors.length) return jsonResponse(400, { error: 'validation failed', details: errors });

  if (!(await _ownsApplication(supabase, body.application_id, user.id))) {
    return jsonResponse(403, { error: 'application does not belong to this user' });
  }

  const { data, error } = await supabase
    .from('provider_documents')
    .insert({
      application_id: body.application_id,
      provider_id: user.id,
      document_type: body.document_type,
      document_name: body.document_name.trim(),
      file_url: body.file_url
    })
    .select('id').single();
  if (error) {
    console.error('[provider-onboarding] document insert failed:', error.message);
    return jsonResponse(500, { error: 'failed to save document', details: error.message });
  }
  return jsonResponse(200, { document_id: data.id });
}

// --- POST /external-review -------------------------------------------------
async function handleExternalReview(event, supabase, user) {
  const body = _parseBody(event);
  if (body === null) return jsonResponse(400, { error: 'invalid JSON body' });

  const errors = [];
  if (!isUuid(body.application_id))                                 errors.push('application_id (uuid) required');
  if (typeof body.platform !== 'string' ||
      !ALLOWED_REVIEW_PLATFORMS.has(body.platform))                 errors.push(`platform must be one of ${[...ALLOWED_REVIEW_PLATFORMS].join(', ')}`);
  if (!errors.length && !isAllowedReviewUrl(body.platform, body.profile_url)) {
    errors.push(`profile_url must be a valid http(s) URL on the ${body.platform} domain`);
  }
  if (errors.length) return jsonResponse(400, { error: 'validation failed', details: errors });

  if (!(await _ownsApplication(supabase, body.application_id, user.id))) {
    return jsonResponse(403, { error: 'application does not belong to this user' });
  }

  const { data, error } = await supabase
    .from('provider_external_reviews')
    .insert({
      application_id: body.application_id,
      provider_id: user.id,
      platform: body.platform,
      profile_url: body.profile_url
    })
    .select('id').single();
  if (error) {
    console.error('[provider-onboarding] external_review insert failed:', error.message);
    return jsonResponse(500, { error: 'failed to save external review', details: error.message });
  }
  return jsonResponse(200, { review_id: data.id });
}

// --- POST /reference -------------------------------------------------------
async function handleReference(event, supabase, user) {
  const body = _parseBody(event);
  if (body === null) return jsonResponse(400, { error: 'invalid JSON body' });

  const errors = [];
  if (!isUuid(body.application_id))                          errors.push('application_id (uuid) required');
  if (!strLen(body.reference_name, 1, 200))                  errors.push('reference_name (1-200 chars) required');
  if (body.reference_company != null &&
      !strLen(body.reference_company, 1, 200))               errors.push('reference_company must be 1-200 chars');
  if (body.reference_phone != null) {
    const phoneStr = String(body.reference_phone);
    if (phoneStr.length > 30 ||
        phoneStr.replaceAll(/\D/g, '').length < 7)           errors.push('reference_phone must be a valid phone (≥7 digits, ≤30 chars)');
  }
  if (typeof body.relationship !== 'string' ||
      !ALLOWED_RELATIONSHIPS.has(body.relationship))         errors.push(`relationship must be one of ${[...ALLOWED_RELATIONSHIPS].join(', ')}`);
  if (errors.length) return jsonResponse(400, { error: 'validation failed', details: errors });

  if (!(await _ownsApplication(supabase, body.application_id, user.id))) {
    return jsonResponse(403, { error: 'application does not belong to this user' });
  }

  const { data, error } = await supabase
    .from('provider_references')
    .insert({
      application_id: body.application_id,
      reference_name: body.reference_name.trim(),
      reference_company: body.reference_company ? body.reference_company.trim() : null,
      reference_phone: body.reference_phone ? String(body.reference_phone).trim() : null,
      relationship: body.relationship
    })
    .select('id').single();
  if (error) {
    console.error('[provider-onboarding] reference insert failed:', error.message);
    return jsonResponse(500, { error: 'failed to save reference', details: error.message });
  }
  return jsonResponse(200, { reference_id: data.id });
}

// --- POST /finalize --------------------------------------------------------
// Promotes the user's profile to role='provider' and seeds the bid-trial
// counters. We re-read the user's most recent provider_applications row to
// derive is_founding_provider authoritatively (the client cannot self-declare
// founding status here). The 1-hour window matches the signup flow (the form
// inserts the application then immediately calls finalize).
async function handleFinalize(event, supabase, user) {
  const body = _parseBody(event);
  if (body === null) return jsonResponse(400, { error: 'invalid JSON body' });

  const errors = [];
  if (!strLen(body.full_name, 2, 200))      errors.push('full_name (2-200 chars) required');
  if (!strLen(body.business_name, 2, 200))  errors.push('business_name (2-200 chars) required');
  if (!strLen(body.city, 1, 120))           errors.push('city required');
  if (!strLen(body.state, 1, 120))          errors.push('state required');
  if (!strLen(body.service_area, 1, 200))   errors.push('service_area required');
  if (!Array.isArray(body.services_offered) ||
      body.services_offered.length === 0 ||
      body.services_offered.length > 30)    errors.push('services_offered must be a non-empty array (≤30)');
  if (typeof body.sms_consent !== 'boolean') errors.push('sms_consent (boolean) required');
  if (errors.length) return jsonResponse(400, { error: 'validation failed', details: errors });

  // Look up the user's most recent application from the past hour. The
  // signup flow inserts the application immediately before calling finalize,
  // so anything older is almost certainly not the row we should be promoting
  // off of.
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: app, error: appErr } = await supabase
    .from('provider_applications')
    .select('id, is_founding_provider, founding_agreement_id, status')
    .eq('user_id', user.id)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (appErr) {
    console.error('[provider-onboarding] finalize app lookup failed:', appErr.message);
    return jsonResponse(500, { error: 'failed to look up application', details: appErr.message });
  }
  if (!app) {
    return jsonResponse(403, { error: 'no recent provider application — submit one first' });
  }

  const isFounding = !!app.is_founding_provider;
  const updateRow = {
    full_name: body.full_name.trim(),
    role: 'provider',
    business_name: body.business_name.trim(),
    city: body.city.trim(),
    state: body.state.trim(),
    service_area: body.service_area.trim(),
    services_offered: body.services_offered,
    free_trial_bids: isFounding ? 999999 : 3,
    bid_credits: 0,
    total_bids_purchased: 0,
    total_bids_used: 0,
    is_founding_provider: isFounding,
    sms_consent: !!body.sms_consent,
    sms_consent_date: body.sms_consent ? new Date().toISOString() : null
  };

  const { error: updErr } = await supabase
    .from('profiles')
    .update(updateRow)
    .eq('id', user.id);
  if (updErr) {
    console.error('[provider-onboarding] finalize profile update failed:', updErr.message);
    return jsonResponse(500, { error: 'failed to finalize profile', details: updErr.message });
  }

  return jsonResponse(200, {
    user_id: user.id,
    role: 'provider',
    is_founding_provider: isFounding,
    free_trial_bids: updateRow.free_trial_bids
  });
}

const ROUTES = {
  document:           handleDocument,
  'external-review':  handleExternalReview,
  reference:          handleReference,
  finalize:           handleFinalize
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'POST')    return jsonResponse(405, { error: 'POST only' });

  // Path can arrive as /api/provider/<sub> (dev mirror) or
  // /.netlify/functions/provider-onboarding/<sub> (prod).
  const rawPath = event.path || '';
  const sub = rawPath.replace(/^.*?\/(api\/provider|provider-onboarding)\//, '').replace(/\/+$/, '');
  const handler = ROUTES[sub];
  if (!handler) return jsonResponse(404, { error: `unknown sub-route: ${sub || '(root)'}` });

  const auth = await _authenticate(event);
  if (auth.error) return auth.error;
  return handler(event, auth.supabase, auth.user);
};

module.exports.ROUTES = ROUTES;
module.exports.ALLOWED_DOC_TYPES = ALLOWED_DOC_TYPES;
module.exports.ALLOWED_REVIEW_PLATFORMS = ALLOWED_REVIEW_PLATFORMS;
module.exports.ALLOWED_RELATIONSHIPS = ALLOWED_RELATIONSHIPS;
module.exports.isAllowedReviewUrl = isAllowedReviewUrl;
