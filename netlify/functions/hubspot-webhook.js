// hubspot-webhook.js
//
// POST /api/webhooks/hubspot
//
// Receives HubSpot contact property-change events and syncs changes back to
// Supabase profiles. HubSpot sends batched arrays of events; we deduplicate
// by objectId, fetch current properties from the HubSpot API, then upsert
// the matching profile row.
//
// Mapped properties:
//   firstname + lastname → profiles.full_name
//   phone               → profiles.phone
//   lifecyclestage      → profiles.metadata.hs_lifecycle
//
// Auth: HMAC-SHA256 signature in X-HubSpot-Signature header, signed with
// HUBSPOT_WEBHOOK_SECRET (the app's client secret, separate from the private
// app token). If the env var is unset, the request is logged but NOT rejected
// so onboarding can test without yet having the secret configured.

'use strict';

let crypto = require('crypto');
let utils  = require('./utils');

let HS_BASE = 'https://api.hubapi.com';

// Properties to pull when fetching a contact after a change event.
let FETCH_PROPERTIES = ['email', 'firstname', 'lastname', 'phone', 'lifecyclestage'];

// ---------------------------------------------------------------------------
// Signature validation (HubSpot v1 scheme)
// ---------------------------------------------------------------------------
function verifySignature(event) {
  let secret = process.env.HUBSPOT_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[hubspot-webhook] HUBSPOT_WEBHOOK_SECRET not set — skipping signature check');
    return true;
  }
  let sig = (event.headers || {})['x-hubspot-signature'] || '';
  if (!sig) return false;
  // v1: SHA256(client_secret + request_body)
  let expected = crypto.createHash('sha256').update(secret + (event.body || '')).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
}

// ---------------------------------------------------------------------------
// Fetch a single contact's properties from HubSpot
// ---------------------------------------------------------------------------
async function fetchContact(objectId) {
  let token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) return null;
  let url = HS_BASE + '/crm/v3/objects/contacts/' + objectId + '?properties=' + FETCH_PROPERTIES.join(',');
  try {
    let r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
    if (!r.ok) return null;
    let data = await r.json();
    return data.properties || null;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sync a single HubSpot contact → Supabase profile
// Returns one of: 'updated' | 'not_found' | 'no_email' | 'error'
// ---------------------------------------------------------------------------
async function syncContact(supabase, objectId) {
  let props = await fetchContact(objectId);
  if (!props) return 'fetch_failed';

  let email = (props.email || '').toLowerCase().trim();
  if (!email) return 'no_email';

  let updates = {};

  let first = (props.firstname || '').trim();
  let last  = (props.lastname  || '').trim();
  let name  = [first, last].filter(Boolean).join(' ');
  if (name) updates.full_name = name;

  if (props.phone) updates.phone = props.phone.trim();

  // Persist lifecycle stage in metadata without clobbering other metadata keys
  if (props.lifecyclestage) {
    // Read current metadata first so we can merge
    let { data: existing } = await supabase
      .from('profiles')
      .select('metadata')
      .eq('email', email)
      .maybeSingle();
    if (existing) {
      updates.metadata = { ...(existing.metadata || {}), hs_lifecycle: props.lifecyclestage };
    }
  }

  if (Object.keys(updates).length === 0) return 'no_changes';

  let { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('email', email)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[hubspot-webhook] profile update error for', email, ':', error.message);
    return 'error';
  }
  if (!data) return 'not_found';
  return 'updated';
}

// ---------------------------------------------------------------------------
// handler
// ---------------------------------------------------------------------------
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  if (!verifySignature(event)) return utils.errorResponse(401, 'Invalid signature');

  let events;
  try {
    events = JSON.parse(event.body || '[]');
  } catch (_) {
    return utils.errorResponse(400, 'Invalid JSON');
  }
  if (!Array.isArray(events)) events = [events];

  // Only care about contact property changes; deduplicate by objectId
  let contactIds = [
    ...new Set(
      events
        .filter(function (e) { return e.subscriptionType && e.subscriptionType.startsWith('contact.'); })
        .map(function (e) { return e.objectId; })
        .filter(Boolean)
    )
  ];

  if (contactIds.length === 0) {
    return utils.successResponse({ processed: 0, skipped: events.length });
  }

  let supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  let results = { updated: 0, not_found: 0, no_email: 0, error: 0, other: 0 };
  for (let id of contactIds) {
    let outcome = await syncContact(supabase, id);
    if (results[outcome] !== undefined) results[outcome]++;
    else results.other++;
  }

  console.log('[hubspot-webhook] processed', contactIds.length, 'contacts:', JSON.stringify(results));
  return utils.successResponse({ processed: contactIds.length, results });
};
