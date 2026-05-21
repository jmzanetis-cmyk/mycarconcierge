// netlify/functions/admin-refunds.js
//
// Admin refunds list and approval/denial flow.
// Ported from server.js:
//   handleAdminGetRefunds    (line 27637)
//   handleAdminProcessRefund (line 27743)
//
// Routes (via _redirects):
//   GET  /api/admin/refunds              → list with member/package enrichment
//   POST /api/admin/refunds/:id/process  → approve (Stripe) or deny (DB only)
//
// Auth: Authorization: Bearer <supabase_token> → verify with getUser → profiles.role === 'admin'
//
// Note: split-payment refunds (package.split_payment_id present) return 501 — these
// require the processSplitPaymentRefund helper which has not been ported. Process those
// manually via the Stripe dashboard.

'use strict';

var utils = require('./utils');

function getStripe() {
  var key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    var { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
    return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
  } catch (e) {
    console.error('[admin-refunds] stripe init failed:', e.message);
    return null;
  }
}

async function authenticateBearerAdmin(event, supabase) {
  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return null;
  var token = authHeader.slice(7).trim();
  if (!token) return null;
  var authResult = await supabase.auth.getUser(token);
  var user = authResult.data && authResult.data.user;
  if (authResult.error || !user) return null;
  var profileResult = await supabase.from('profiles').select('role').eq('id', user.id).single();
  var profile = profileResult.data;
  if (!profile || profile.role !== 'admin') return null;
  return user;
}

function parsePath(event) {
  var raw = event.path || '';
  return raw
    .replace(/^\/?\.netlify\/functions\/admin-refunds\/?/, '')
    .replace(/^\/api\/admin\/refunds\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

async function handleList(supabase, qs) {
  var page   = Math.max(1, parseInt(qs.page)  || 1);
  var limit  = Math.min(parseInt(qs.limit) || 25, 100);
  var filter = qs.filter || 'all';
  var offset = (page - 1) * limit;

  var query = supabase.from('refunds').select('*', { count: 'exact' });
  if (filter && filter !== 'all') query = query.eq('status', filter);

  var result = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (result.error) throw result.error;

  var refunds    = result.data || [];
  var memberIds  = [...new Set(refunds.map(function(r) { return r.requested_by; }).filter(Boolean))];
  var packageIds = [...new Set(refunds.map(function(r) { return r.package_id;   }).filter(Boolean))];

  var memberMap  = {};
  var packageMap = {};

  await Promise.all([
    memberIds.length > 0
      ? supabase.from('profiles').select('id, full_name, email').in('id', memberIds)
          .then(function(r) { (r.data || []).forEach(function(m) { memberMap[m.id] = m; }); })
      : Promise.resolve(),
    packageIds.length > 0
      ? supabase.from('maintenance_packages').select('id, title, status').in('id', packageIds)
          .then(function(r) { (r.data || []).forEach(function(p) { packageMap[p.id] = p; }); })
      : Promise.resolve()
  ]);

  return {
    success: true,
    data: refunds.map(function(r) {
      return Object.assign({}, r, {
        member:  memberMap[r.requested_by] || null,
        package: packageMap[r.package_id]  || null
      });
    }),
    total: result.count || 0,
    page,
    totalPages: Math.ceil((result.count || 0) / limit)
  };
}

async function handleProcess(supabase, refundId, userId, body) {
  var action      = body && body.action;
  var amountCents = body && body.amount_cents;

  if (!action || !['approve', 'deny'].includes(action)) {
    var err = new Error('Invalid action. Must be approve or deny.');
    err.statusCode = 400;
    throw err;
  }

  var refundResult = await supabase.from('refunds').select('*').eq('id', refundId).single();
  if (refundResult.error || !refundResult.data) {
    var notFound = new Error('Refund not found');
    notFound.statusCode = 404;
    throw notFound;
  }

  var refund = refundResult.data;

  if (refund.status !== 'requested') {
    var already = new Error('Refund is already ' + refund.status);
    already.statusCode = 400;
    throw already;
  }

  if (action === 'deny') {
    await supabase
      .from('refunds')
      .update({ status: 'cancelled', approved_by: userId, approved_at: new Date().toISOString() })
      .eq('id', refundId);

    if (refund.requested_by) {
      await supabase.from('notifications').insert({
        user_id:     refund.requested_by,
        type:        'refund_denied',
        title:       'Refund Request Denied',
        message:     'Your refund request has been reviewed and denied by an administrator.',
        entity_type: 'refund',
        entity_id:   refundId
      });
    }
    return { success: true, status: 'cancelled', message: 'Refund denied' };
  }

  // approve — check for split payment
  if (refund.package_id) {
    var pkgResult = await supabase
      .from('maintenance_packages')
      .select('split_payment_id')
      .eq('id', refund.package_id)
      .single();

    if (pkgResult.data && pkgResult.data.split_payment_id) {
      var splitErr = new Error('Split payment refunds must be processed manually via the Stripe dashboard. The split-payment refund helper has not been ported to serverless.');
      splitErr.statusCode = 501;
      throw splitErr;
    }
  }

  if (!refund.payment_intent_id) {
    var noIntent = new Error('No payment intent associated with this refund');
    noIntent.statusCode = 400;
    throw noIntent;
  }

  var stripe = getStripe();
  if (!stripe) {
    var stripeErr = new Error('Stripe not configured');
    stripeErr.statusCode = 503;
    throw stripeErr;
  }

  var refundAmountCents = amountCents || refund.amount_cents;
  var isPartial = refund.refund_type === 'partial' || (amountCents && amountCents < refund.amount_cents);

  var refundParams = { payment_intent: refund.payment_intent_id };
  if (isPartial && refundAmountCents) refundParams.amount = refundAmountCents;

  var stripeRefund = await stripe.refunds.create(refundParams);
  var newPaymentStatus = isPartial ? 'partially_refunded' : 'refunded';

  await supabase
    .from('refunds')
    .update({
      status:         'processed',
      stripe_refund_id: stripeRefund.id,
      amount_cents:   refundAmountCents,
      approved_by:    userId,
      approved_at:    new Date().toISOString(),
      processed_at:   new Date().toISOString()
    })
    .eq('id', refundId);

  if (refund.package_id) {
    await supabase
      .from('payments')
      .update({ status: newPaymentStatus, refunded_at: new Date().toISOString(), refund_amount: refundAmountCents / 100 })
      .eq('package_id', refund.package_id)
      .in('status', ['held', 'released']);

    if (!isPartial) {
      await supabase
        .from('maintenance_packages')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', refund.package_id);
    }
  }

  if (refund.requested_by) {
    await supabase.from('notifications').insert({
      user_id:     refund.requested_by,
      type:        'refund_processed',
      title:       'Refund Processed',
      message:     'Your refund of $' + (refundAmountCents / 100).toFixed(2) + ' has been processed and will be returned to your payment method.',
      entity_type: 'refund',
      entity_id:   refundId
    });
  }

  console.log('[admin-refunds] processed refund', refundId, 'amount:', refundAmountCents, 'stripe:', stripeRefund.id);

  return {
    success: true,
    status: 'processed',
    stripe_refund_id: stripeRefund.id,
    amount_cents: refundAmountCents,
    message: 'Refund of $' + (refundAmountCents / 100).toFixed(2) + ' processed successfully'
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  var user = await authenticateBearerAdmin(event, supabase);
  if (!user) return utils.errorResponse(401, 'Authentication required');

  var path   = parsePath(event);
  var method = event.httpMethod;
  var qs     = event.queryStringParameters || {};

  try {
    // GET /api/admin/refunds → list
    if (method === 'GET' && path === '') {
      return utils.successResponse(await handleList(supabase, qs));
    }

    // POST /api/admin/refunds/:id/process
    var processMatch = path.match(/^([^/]+)\/process$/);
    if (method === 'POST' && processMatch) {
      var refundId = processMatch[1];
      var body = {};
      try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) { return utils.errorResponse(400, 'Invalid JSON'); }
      return utils.successResponse(await handleProcess(supabase, refundId, user.id, body));
    }

    return utils.errorResponse(404, 'Unknown route');
  } catch (err) {
    if (err.statusCode) return utils.errorResponse(err.statusCode, err.message);
    console.error('[admin-refunds] error:', err.message);
    return utils.errorResponse(500, 'Something went wrong');
  }
};
