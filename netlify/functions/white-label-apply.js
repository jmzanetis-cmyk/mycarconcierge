// netlify/functions/white-label-apply.js
//
// Self-serve "apply for tenancy" flow -- the piece that was missing after
// task #80 built tenant *management* (tenant-portal.js) and *joining*
// (white-label-join.js) but nothing actually created a white_label_tenants
// row. There was no INSERT into white_label_tenants anywhere in the
// codebase before this file.
//
// Routes:
//   GET  /api/white-label/apply?check_subdomain=acme   -- public, no auth.
//        Availability check for the live subdomain field on the signup form.
//   GET  /api/white-label/apply?application_id=<uuid>  -- auth required
//        (caller must own the application, or be admin/super_admin).
//        Used by white-label-welcome.html to poll status after a Stripe
//        redirect, since provisioning happens async in stripe-webhook.js.
//   POST /api/white-label/apply                         -- auth required.
//        Body: { business_name, subdomain, support_email?, support_phone?,
//                plan: starter|pro|business, billing?: monthly|annual }
//        Creates a white_label_applications row (status='pending_payment')
//        and a Stripe Checkout session (mode=subscription), returns
//        { url, application_id }. Actual tenant creation happens in
//        stripe-webhook.js's handleCheckoutComplete on successful payment
//        -- this function never writes to white_label_tenants itself.
//
// 2026-09-11: built at Jordan's request ("apply for tenancy via the
// platform") -- see the tenant/white-label backend (task #80) this builds on.
'use strict';

const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
const utils = require('./utils');

const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'admin', 'mail', 'ftp', 'support', 'help', 'blog',
  'status', 'dashboard', 'portal', 'staging', 'dev', 'test', 'mycarconcierge',
  'members', 'login', 'signup', 'assets', 'static', 'cdn', 'docs',
]);
const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
}

async function getUser(event, sb) {
  const authHeader = (event.headers || {})['authorization'] || (event.headers || {})['Authorization'];
  const m = authHeader ? String(authHeader).match(/^Bearer\s+(.+)$/i) : null;
  if (!m) return null;
  const { data, error } = await sb.auth.getUser(m[1].trim());
  if (error || !data || !data.user) return null;
  return data.user;
}

function validateSubdomain(raw) {
  const sub = String(raw || '').trim().toLowerCase();
  if (!sub) return { error: 'Subdomain is required' };
  if (sub.length < 3) return { error: 'Subdomain must be at least 3 characters' };
  if (!SUBDOMAIN_RE.test(sub)) return { error: 'Subdomain must be lowercase letters/numbers/hyphens, and cannot start or end with a hyphen' };
  if (RESERVED_SUBDOMAINS.has(sub)) return { error: 'That subdomain is reserved -- please choose another' };
  return { subdomain: sub };
}

async function checkSubdomainAvailable(sb, sub) {
  const validated = validateSubdomain(sub);
  if (validated.error) return { available: false, reason: validated.error };
  const { data } = await sb.from('white_label_tenants').select('id').eq('subdomain', validated.subdomain).maybeSingle();
  if (data) return { available: false, reason: 'That subdomain is already taken' };
  return { available: true };
}

async function ensureStripeCustomer(sb, st, user) {
  const { data: profile } = await sb.from('profiles').select('stripe_customer_id, email, full_name').eq('id', user.id).single();
  if (profile && profile.stripe_customer_id) return profile.stripe_customer_id;
  const customer = await st.customers.create({
    email: user.email || (profile && profile.email),
    name: (profile && profile.full_name) || undefined,
    metadata: { user_id: user.id },
  });
  await sb.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', user.id);
  return customer.id;
}

async function handleGet(event, sb, user) {
  const qs = event.queryStringParameters || {};

  if (qs.check_subdomain) {
    const result = await checkSubdomainAvailable(sb, qs.check_subdomain);
    return utils.successResponse(result);
  }

  if (qs.application_id) {
    if (!user) return utils.errorResponse(401, 'Unauthorized');
    const { data: application, error } = await sb.from('white_label_applications').select('*').eq('id', qs.application_id).maybeSingle();
    if (error) return utils.errorResponse(500, error.message);
    if (!application) return utils.errorResponse(404, 'Application not found');
    if (application.user_id !== user.id) {
      const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
      const isAdmin = profile && (profile.role === 'admin' || profile.role === 'super_admin');
      if (!isAdmin) return utils.errorResponse(403, 'Forbidden');
    }
    return utils.successResponse({ application: application });
  }

  return utils.errorResponse(400, 'Provide check_subdomain or application_id');
}

async function handlePost(event, sb, user) {
  if (!user) return utils.errorResponse(401, 'Unauthorized');

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return utils.errorResponse(400, 'Invalid JSON body'); }

  const businessName = String(body.business_name || '').trim();
  if (!businessName) return utils.errorResponse(400, 'business_name is required');
  if (businessName.length > 120) return utils.errorResponse(400, 'business_name is too long');

  const subCheck = validateSubdomain(body.subdomain);
  if (subCheck.error) return utils.errorResponse(400, subCheck.error);
  const subdomain = subCheck.subdomain;

  const plan = body.plan;
  if (plan !== 'starter' && plan !== 'pro' && plan !== 'business') return utils.errorResponse(400, 'plan must be starter, pro, or business');

  const billing = body.billing === 'annual' ? 'annual' : 'monthly';

  const { data: existingTenant } = await sb.from('white_label_tenants').select('id').eq('subdomain', subdomain).maybeSingle();
  if (existingTenant) return utils.errorResponse(409, 'That subdomain is already taken');

  const { data: planRow } = await sb
    .from('saas_plans')
    .select('stripe_price_id, stripe_price_id_annual')
    .eq('product', 'white_label')
    .eq('plan', plan)
    .eq('is_active', true)
    .single();
  if (!planRow) return utils.errorResponse(404, 'Plan not found');

  const priceId = billing === 'annual' ? planRow.stripe_price_id_annual : planRow.stripe_price_id;
  if (!priceId) return utils.errorResponse(400, 'This plan is not currently available for self-serve checkout -- please contact us');

  const st = stripe();
  if (!st) return utils.errorResponse(500, 'Payment system unavailable');

  const { data: application, error: insErr } = await sb.from('white_label_applications').insert({
    user_id: user.id,
    business_name: businessName,
    subdomain: subdomain,
    support_email: body.support_email ? String(body.support_email).trim() : null,
    support_phone: body.support_phone ? String(body.support_phone).trim() : null,
    plan: plan,
    billing: billing,
    status: 'pending_payment',
  }).select().single();
  if (insErr) return utils.errorResponse(500, insErr.message);

  const customerId = await ensureStripeCustomer(sb, st, user);
  const origin = process.env.URL || 'https://mycarconcierge.com';

  let session;
  try {
    session = await st.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/white-label-welcome.html?application_id=${application.id}`,
      cancel_url: `${origin}/white-label-signup.html?canceled=1`,
      metadata: { application_id: application.id, product: 'white_label', plan: plan },
      subscription_data: {
        metadata: { application_id: application.id, product: 'white_label', plan: plan },
      },
    });
  } catch (e) {
    await sb.from('white_label_applications').update({ status: 'failed', failure_reason: e.message }).eq('id', application.id);
    return utils.errorResponse(500, 'Could not start checkout: ' + e.message);
  }

  await sb.from('white_label_applications').update({ stripe_session_id: session.id }).eq('id', application.id);

  return utils.successResponse({ url: session.url, application_id: application.id });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  const sb = utils.createSupabaseClient();
  if (!sb) return utils.errorResponse(503, 'Service temporarily unavailable');

  const user = await getUser(event, sb);

  if (event.httpMethod === 'GET') return handleGet(event, sb, user);
  if (event.httpMethod === 'POST') return handlePost(event, sb, user);
  return utils.errorResponse(405, 'Method not allowed');
};
