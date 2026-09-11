// POST /api/shop/book
//
// Serves the embeddable www/booking-widget.js (third-party shop sites
// embed this script, data-mcc-shop="<slug>") -- previously dead-called
// (server.js's dev route was removed and never ported). Public, no auth
// -- rate-limited instead.
//
// Best-effort double-write: logs the raw request to shop_booking_requests
// (walk-in/widget log table, supabase/migrations/20250328_shop_saas.sql)
// AND bridges into maintenance_packages (status='open') so the provider
// sees it in their normal job queue -- both writes are non-fatal so a
// widget submission never hard-fails just because one insert errors.
'use strict';

var utils = require('./utils');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  var rl = utils.publicRateLimit('shop-book', utils.getClientIp(event));
  if (!rl.allowed) return utils.rateLimitedResponse(rl);

  var body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) { return utils.errorResponse(400, 'Invalid body'); }

  var provider_id = body.provider_id;
  var slug = body.slug;
  var name = body.name;
  var phone = body.phone;
  var vehicle = body.vehicle;
  var service = body.service;
  var details = body.details;
  var email = body.email;
  var source = body.source;

  if (!name || !phone || !vehicle || !service) {
    return utils.errorResponse(400, 'name, phone, vehicle, and service are required');
  }

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

  try {
    var resolvedProviderId = provider_id;
    var resolvedSlug = slug;

    if (!resolvedProviderId && slug) {
      var pRes = await supabase.from('profiles').select('id').eq('directory_slug', slug).single();
      if (pRes.data) resolvedProviderId = pRes.data.id;
    } else if (resolvedProviderId && !resolvedSlug) {
      var pRes2 = await supabase.from('profiles').select('directory_slug').eq('id', resolvedProviderId).single();
      if (pRes2.data) resolvedSlug = pRes2.data.directory_slug;
    }

    if (!resolvedProviderId) {
      return utils.errorResponse(400, 'Provider not found for the given slug or id');
    }

    try {
      var bookRes = await supabase.from('shop_booking_requests').insert({
        provider_id: resolvedProviderId || null,
        provider_slug: resolvedSlug || null,
        requester_name: name,
        requester_phone: phone,
        requester_email: email || null,
        vehicle_description: vehicle,
        service_type: service,
        details: details || null,
        source: source || 'profile',
        status: 'pending'
      });
      if (bookRes.error) console.warn('[shop-book] shop_booking_requests insert:', bookRes.error.message);
    } catch (e) {
      console.warn('[shop-book] shop_booking_requests error:', e.message);
    }

    try {
      var descParts = [
        'Walk-in/booking request from ' + name,
        'Phone: ' + phone,
        email ? 'Email: ' + email : null,
        'Vehicle: ' + vehicle,
        details ? 'Notes: ' + details : null
      ].filter(Boolean);
      var guestDesc = descParts.join('\n');
      var guestTitle = service + ' — Walk-in Request';

      await supabase.from('maintenance_packages').insert({
        provider_id: resolvedProviderId,
        member_id: null,
        title: guestTitle,
        description: guestDesc,
        status: 'open'
      });
    } catch (e) {
      console.warn('[shop-book] maintenance_packages bridge:', e.message);
    }

    return utils.successResponse({ success: true });
  } catch (err) {
    console.error('[shop-book]', err.message);
    return utils.errorResponse(500, 'Failed to submit booking request');
  }
};
